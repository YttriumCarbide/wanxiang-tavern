package app.wanxiang.tavern;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Process;
import android.provider.DocumentsContract;
import android.util.Log;

import androidx.webkit.JavaScriptReplyProxy;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;

/**
 * 导出协议：临时文件 + 提交状态机。
 * UI 线程独占 active/closed/session.phase/session.written/session.finishReply；
 * temp 与 FileOutputStream 仅由单线程执行器访问；cancelled 为 volatile。
 */
final class WebExports implements AutoCloseable {

    private static final String TAG = "WebExports";
    private static final int REQUEST_CODE = 1002;
    private static final int FOLDER_REQUEST_CODE = 1003;
    private static final int MAX_HEADER = 8192;
    private static final int MAX_CHUNK = 65536;
    private static final long MAX_TOTAL = 512L * 1024L * 1024L;
    private static final int MAX_MESSAGE = 4 + MAX_HEADER + MAX_CHUNK;

    private enum Phase { PREPARING, RECEIVING, WRITING, FLUSHING, CHOOSING, COPYING }

    private final Activity activity;
    private final BackupFolders folders;
    private final BooleanSupplier openingFile;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean closed;
    private Session active;
    private boolean choosingFolder;
    private String folderRequest;
    private JavaScriptReplyProxy folderReply;

    WebExports(Activity activity, BooleanSupplier openingFile) {
        this.activity = activity;
        this.openingFile = openingFile;
        folders = new BackupFolders(activity);
    }

    boolean isChoosing() {
        return choosingFolder || (active != null && active.phase == Phase.CHOOSING);
    }

    // ---------- 入口（UI 线程） ----------

    void receive(byte[] message, JavaScriptReplyProxy reply) {
        if (closed) return;
        Packet p = parse(message);
        if (p == null) {
            send(reply, errorJson("", "无效消息", "invalid"));
            return;
        }
        switch (p.op) {
            case "begin" -> begin(p, reply);
            case "chunk" -> chunk(p, reply);
            case "finish" -> finish(p, reply);
            case "cancel" -> {
                if (p.bodyLength == 0) cancel(p.id);
            }
            case "chooseFolder" -> chooseFolder(p, reply);
            case "folderStatus" -> runFolderTask(p.id, reply, folders::selectedTarget);
            default -> send(reply, errorJson(p.id, "无效消息", "invalid"));
        }
    }

    private void begin(Packet p, JavaScriptReplyProxy reply) {
        if (active != null || choosingFolder) {
            send(reply, errorJson(p.id, "已有导出进行中", "busy"));
            return;
        }
        if (p.bodyLength != 0) {
            send(reply, errorJson(p.id, "无效消息", "invalid"));
            return;
        }
        String name = p.json.optString("name", "");
        String folder = p.json.optString("folder", "");
        Long size = readLong(p.json, "size");
        if (!isValidName(name) || (!folder.isEmpty() && !BackupFolders.isBackupName(name))) {
            send(reply, errorJson(p.id, "文件名无效", "invalid_name"));
            return;
        }
        if (size == null || size < 1 || size > MAX_TOTAL) {
            send(reply, errorJson(p.id, "文件大小无效", "invalid_size"));
            return;
        }
        Session s = new Session(p.id, name, size, folder);
        s.phase = Phase.PREPARING;
        active = s;
        submit(s, () -> {
            s.temp = File.createTempFile("wanxiang-export-", ".tmp", activity.getCacheDir());
            s.out = new FileOutputStream(s.temp);
        }, () -> {
            s.phase = Phase.RECEIVING;
            send(reply, okJson(s.id, "offset", 0));
        }, reply);
    }

    private void chunk(Packet p, JavaScriptReplyProxy reply) {
        Session s = receivingSession(p.id, reply);
        if (s == null) return;
        Long offset = readLong(p.json, "offset");
        if (offset == null || offset < 0 || p.bodyLength < 1) {
            fail(s, reply, "数据块无效", "invalid_chunk");
            return;
        }
        if (offset != s.written || offset + p.bodyLength > s.size) {
            fail(s, reply, "数据块顺序错误", "invalid_chunk");
            return;
        }
        s.phase = Phase.WRITING;
        submit(s, () -> {
            s.out.write(p.bytes, p.bodyOffset, p.bodyLength);
        }, () -> {
            s.written += p.bodyLength;
            s.phase = Phase.RECEIVING;
            send(reply, okJson(s.id, "offset", s.written));
        }, reply);
    }

    private void finish(Packet p, JavaScriptReplyProxy reply) {
        Session s = receivingSession(p.id, reply);
        if (s == null) return;
        if (p.bodyLength != 0) {
            fail(s, reply, "无效消息", "invalid");
            return;
        }
        if (s.written != s.size) {
            fail(s, reply, "数据不完整", "incomplete");
            return;
        }
        s.phase = Phase.FLUSHING;
        submit(s, () -> {
            s.out.flush();
            s.out.close();
            s.out = null;
        }, () -> {
            if (s.folder.isEmpty()) {
                s.finishReply = reply;
                s.phase = Phase.CHOOSING;
                launchChooser(s);
            } else {
                s.phase = Phase.COPYING;
                submit(s, () -> {
                    if (s.cancelled) return;
                    var document = folders.createBackup(s.folder, s.name);
                    Uri uri = document.uri();
                    copyToTarget(s, uri);
                    if (s.cancelled) {
                        deleteDocumentQuietly(uri);
                        return;
                    }
                    if (document.needsRename()) {
                        try {
                            folders.finishBackup(uri, s.name);
                        } catch (IOException | RuntimeException failure) {
                            deleteDocumentQuietly(uri);
                            throw failure;
                        }
                    }
                    s.cleanupFailed = !folders.prune(s.folder);
                }, () -> {
                    release(s);
                    send(reply, okJson(s.id, "done", true, "cleanupFailed", s.cleanupFailed));
                }, reply);
            }
        }, reply);
    }

    private Session receivingSession(String id, JavaScriptReplyProxy reply) {
        Session session = active;
        if (session == null || !session.id.equals(id)) {
            send(reply, errorJson(id, "没有进行中的导出", "no_session"));
            return null;
        }
        if (session.phase != Phase.RECEIVING) {
            send(reply, errorJson(id, "正在处理导出，请稍候", "busy"));
            return null;
        }
        return session;
    }

    private void cancel(String id) {
        Session s = active;
        if (s == null || s.cancelled || !s.id.equals(id)) return;
        s.cancelled = true;
        if (s.phase == Phase.CHOOSING) {
            s.finishReply = null;
            executor.execute(() -> deleteTemp(s));
            activity.finishActivity(REQUEST_CODE);
            return;
        }
        release(s);
        executor.execute(() -> cleanup(s));
    }

    // ---------- 选择器（UI 线程） ----------

    private void launchChooser(Session s) {
        if (openingFile.getAsBoolean()) {
            fail(s, s.finishReply, "请先完成当前的文件选择", "busy");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, s.name);
        try {
            activity.startActivityForResult(intent, REQUEST_CODE);
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w(TAG, "chooser launch failed");
            fail(s, s.finishReply, "无法打开保存界面", "chooser");
        }
    }

    private void chooseFolder(Packet p, JavaScriptReplyProxy reply) {
        if (active != null || choosingFolder || openingFile.getAsBoolean()) {
            send(reply, errorJson(p.id, "请先完成当前的文件操作", "busy"));
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        try {
            activity.startActivityForResult(intent, FOLDER_REQUEST_CODE);
            choosingFolder = true;
            folderRequest = p.id;
            folderReply = reply;
        } catch (ActivityNotFoundException | SecurityException e) {
            send(reply, errorJson(p.id, "系统无法打开备份文件夹选择器", "chooser"));
        }
    }

    private boolean onFolderResult(int resultCode, Intent data) {
        if (closed || !choosingFolder) return true;
        String id = folderRequest;
        JavaScriptReplyProxy reply = folderReply;
        choosingFolder = false;
        folderRequest = null;
        folderReply = null;
        if (resultCode == Activity.RESULT_OK) {
            runFolderTask(id, reply, () -> folders.select(data));
        } else {
            send(reply, errorJson(id, "已取消", "cancelled"));
        }
        return true;
    }

    private interface FolderTask { String run() throws IOException; }

    private void runFolderTask(String id, JavaScriptReplyProxy reply, FolderTask task) {
        executor.execute(() -> {
            try {
                send(reply, okJson(id, "target", task.run()));
            } catch (IOException | RuntimeException error) {
                Log.w(TAG, "Backup folder unavailable", error);
                send(reply, errorJson(id, "无法访问备份文件夹，请重新选择", "folder"));
            }
        });
    }

    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FOLDER_REQUEST_CODE) return onFolderResult(resultCode, data);
        if (requestCode != REQUEST_CODE) return false;
        if (closed) return true;
        Session s = active;
        if (s == null || s.phase != Phase.CHOOSING) return true;
        JavaScriptReplyProxy reply = s.finishReply;
        s.finishReply = null;
        if (s.cancelled) {
            Uri uri = data != null && resultCode == Activity.RESULT_OK ? data.getData() : null;
            release(s);
            executor.execute(() -> {
                if (uri != null && isWritableDocument(uri)) deleteDocumentQuietly(uri);
                cleanup(s);
            });
            return true;
        }
        if (resultCode != Activity.RESULT_OK) {
            release(s);
            executor.execute(() -> cleanup(s));
            send(reply, errorJson(s.id, "已取消", "cancelled"));
            return true;
        }
        Uri uri = data == null ? null : data.getData();
        if (!isWritableDocument(uri)) {
            fail(s, reply, "保存位置无效", "invalid_uri");
            return true;
        }
        s.phase = Phase.COPYING;
        submit(s, () -> copyToTarget(s, uri), () -> {
            release(s);
            send(reply, okJson(s.id, "done", true));
        }, reply);
        return true;
    }

    private boolean isWritableDocument(Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme())) return false;
        if (!DocumentsContract.isDocumentUri(activity, uri)) return false;
        return activity.checkUriPermission(uri, Process.myPid(), Process.myUid(),
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }

    private void copyToTarget(Session s, Uri uri) throws IOException {
        if (s.cancelled) {
            deleteDocumentQuietly(uri);
            return;
        }
        ContentResolver resolver = activity.getContentResolver();
        try (InputStream in = new FileInputStream(s.temp);
             OutputStream out = resolver.openOutputStream(uri, "wt")) {
            if (out == null) throw new IOException("open target failed");
            byte[] buf = new byte[MAX_CHUNK];
            long copied = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                if (s.cancelled) throw new IOException("cancelled");
                out.write(buf, 0, n);
                copied += n;
            }
            if (s.cancelled || copied != s.size) throw new IOException("export interrupted");
            out.flush();
        } catch (IOException | RuntimeException failure) {
            deleteDocumentQuietly(uri);
            throw failure;
        }
        s.temp.delete();
    }

    // ---------- 后台任务与清理 ----------

    private interface IoTask { void run() throws IOException; }

    private void submit(Session s, IoTask task, Runnable onSuccess, JavaScriptReplyProxy reply) {
        executor.execute(() -> {
            try {
                task.run();
            } catch (IOException | RuntimeException e) {
                Log.w(TAG, "io failed");
                activity.runOnUiThread(() -> {
                    if (isCurrent(s)) fail(s, reply, "写入失败", "io");
                });
                return;
            }
            activity.runOnUiThread(() -> {
                if (isCurrent(s)) onSuccess.run();
            });
        });
    }

    private boolean isCurrent(Session s) {
        return !closed && active == s && !s.cancelled;
    }

    private void fail(Session s, JavaScriptReplyProxy reply, String message, String code) {
        s.cancelled = true;
        s.finishReply = null;
        release(s);
        executor.execute(() -> cleanup(s));
        send(reply, errorJson(s.id, message, code));
    }

    private void release(Session s) {
        if (active == s) active = null;
    }

    private void cleanup(Session s) {
        closeQuietly(s.out);
        s.out = null;
        deleteTemp(s);
    }

    private void deleteTemp(Session s) {
        if (s.temp != null && s.temp.exists()) s.temp.delete();
    }

    private void deleteDocumentQuietly(Uri uri) {
        try {
            DocumentsContract.deleteDocument(activity.getContentResolver(), uri);
        } catch (Exception e) {
            Log.w(TAG, "delete document failed");
        }
    }

    private void send(JavaScriptReplyProxy reply, String json) {
        if (reply == null) return;
        activity.runOnUiThread(() -> {
            if (closed) return;
            try { reply.postMessage(json); } catch (Exception e) { Log.w(TAG, "postMessage failed"); }
        });
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        folderReply = null;
        Session s = active;
        active = null;
        if (s != null) {
            s.cancelled = true;
            s.finishReply = null;
            executor.execute(() -> cleanup(s));
        }
        executor.shutdown();
    }

    // ---------- 工具 ----------

    private static void closeQuietly(java.io.Closeable stream) {
        if (stream == null) return;
        try {
            stream.close();
        } catch (IOException ignored) {
            // The temporary file is discarded even if closing its stream fails.
        }
    }

    private static String okJson(String id, String key, Object value) {
        return okJson(id, key, value, null, null);
    }

    private static String okJson(String id, String key, Object value, String extra, Object extraValue) {
        JSONObject response = new JSONObject();
        try {
            response.put("id", id).put("ok", true).put(key, value);
            if (extra != null) response.put(extra, extraValue);
        } catch (JSONException failure) {
            throw new IllegalStateException("Invalid export response", failure);
        }
        return response.toString();
    }

    private static String errorJson(String id, String message, String code) {
        JSONObject response = new JSONObject();
        try {
            response.put("id", id).put("ok", false).put("error", message).put("code", code);
        } catch (JSONException failure) {
            throw new IllegalStateException("Invalid export error response", failure);
        }
        return response.toString();
    }

    private static Long readLong(JSONObject json, String key) {
        Object v = json.opt(key);
        if (!(v instanceof Number)) return null;
        long r = ((Number) v).longValue();
        if (((Number) v).doubleValue() != (double) r) return null;
        return r;
    }

    private static boolean isValidName(String name) {
        if (name == null || name.length() < 1 || name.length() > 120 || !name.endsWith(".json")) return false;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '.' || c == '_' || c == '-';
            if (!ok) return false;
        }
        return true;
    }

    private static Packet parse(byte[] message) {
        if (message == null || message.length < 4 || message.length > MAX_MESSAGE) return null;
        ByteBuffer buf = ByteBuffer.wrap(message);
        int headerLen = buf.getInt();
        if (headerLen < 1 || headerLen > MAX_HEADER || 4 + headerLen > message.length) return null;
        int bodyLen = message.length - 4 - headerLen;
        if (bodyLen > MAX_CHUNK) return null;
        String text = new String(message, 4, headerLen, StandardCharsets.UTF_8);
        JSONObject json;
        try {
            json = new JSONObject(text);
        } catch (JSONException failure) {
            return null;
        }
        Object idObj = json.opt("id");
        if (!(idObj instanceof String)) return null;
        String id = (String) idObj;
        if (id.isEmpty() || id.length() > 128) return null;
        Object opObj = json.opt("op");
        if (!(opObj instanceof String)) return null;
        return new Packet(id, (String) opObj, json, message, 4 + headerLen, bodyLen);
    }

    private record Packet(String id, String op, JSONObject json, byte[] bytes, int bodyOffset, int bodyLength) {}

    private static final class Session {
        final String id;
        final String name;
        final long size;
        final String folder;
        File temp;
        FileOutputStream out;
        long written;
        JavaScriptReplyProxy finishReply;
        Phase phase;
        boolean cleanupFailed;
        volatile boolean cancelled;

        Session(String id, String name, long size, String folder) {
            this.id = id;
            this.name = name;
            this.size = size;
            this.folder = folder;
        }
    }
}
