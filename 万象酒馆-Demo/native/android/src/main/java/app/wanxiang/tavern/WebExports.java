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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.IntSupplier;

/**
 * 导出协议：临时文件 + 提交状态机。
 * UI 线程持有会话和选择器状态；单线程执行器独占文件与流。
 * CommitGate 是取消与提交之间唯一的跨线程仲裁点。
 */
final class WebExports implements AutoCloseable {

    private static final String TAG = "WebExports";
    private static final int NO_CHOOSER = -1;
    private static final int MAX_HEADER = 8192;
    private static final int MAX_CHUNK = 65536;
    private static final long MAX_TOTAL = 512L * 1024L * 1024L;
    private static final int MAX_MESSAGE = 4 + MAX_HEADER + MAX_CHUNK;

    private enum Phase { PREPARING, RECEIVING, WRITING, FLUSHING, CHOOSING, COPYING }
    private enum CommitState { OPEN, CANCELLED, COMMITTING }

    private final Activity activity;
    private final BackupFolders folders;
    private final BooleanSupplier openingFile;
    private final IntSupplier nextRequestCode;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean closed;
    private Session active;
    private int chooserRequestCode = NO_CHOOSER;
    private FolderSelection folderSelection;

    WebExports(Activity activity, BooleanSupplier openingFile, IntSupplier nextRequestCode) {
        this.activity = activity;
        this.openingFile = openingFile;
        this.nextRequestCode = nextRequestCode;
        folders = new BackupFolders(activity);
    }

    boolean isChoosing() {
        return chooserRequestCode != NO_CHOOSER;
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
            case "folderStatus" -> executor.execute(() -> send(reply, folderResponse(p.id, folders::selectedTarget)));
            default -> send(reply, errorJson(p.id, "无效消息", "invalid"));
        }
    }

    private void begin(Packet p, JavaScriptReplyProxy reply) {
        if (active != null || folderSelection != null) {
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
                submit(s, () -> writeBackup(s), () -> {
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
        FolderSelection selection = folderSelection;
        if (selection != null && selection.id().equals(id) && selection.gate().cancel()) {
            folderSelection = null;
            dismissTreeChooser();
            return;
        }
        Session s = active;
        if (s == null || !s.id.equals(id) || !s.gate.cancel()) return;
        release(s);
        s.finishReply = null;
        if (s.phase == Phase.CHOOSING) dismissTreeChooser();
        executor.execute(() -> cleanup(s));
    }

    // ---------- 选择器（UI 线程） ----------

    private void openTreeChooser() {
        // A directory result only grants access; it never creates the destination file.
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        int requestCode = nextRequestCode.getAsInt();
        activity.startActivityForResult(intent, requestCode);
        chooserRequestCode = requestCode;
    }

    private void dismissTreeChooser() {
        int requestCode = chooserRequestCode;
        chooserRequestCode = NO_CHOOSER;
        if (requestCode == NO_CHOOSER) return;
        try {
            activity.finishActivity(requestCode);
        } catch (RuntimeException error) {
            Log.w(TAG, "chooser cancellation failed", error);
        }
    }

    private void launchChooser(Session s) {
        if (openingFile.getAsBoolean()) {
            fail(s, s.finishReply, "请先完成当前的文件选择", "busy");
            return;
        }
        try {
            openTreeChooser();
        } catch (ActivityNotFoundException | SecurityException error) {
            fail(s, s.finishReply, "无法打开保存文件夹选择器", "chooser");
        }
    }

    private void chooseFolder(Packet p, JavaScriptReplyProxy reply) {
        if (active != null || folderSelection != null || openingFile.getAsBoolean()) {
            send(reply, errorJson(p.id, "请先完成当前的文件操作", "busy"));
            return;
        }
        try {
            openTreeChooser();
            folderSelection = new FolderSelection(p.id, reply, new CommitGate());
        } catch (ActivityNotFoundException | SecurityException error) {
            send(reply, errorJson(p.id, "系统无法打开备份文件夹选择器", "chooser"));
        }
    }

    private void onFolderResult(FolderSelection selection, int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK) {
            folderSelection = null;
            send(selection.reply(), errorJson(selection.id(), "已取消", "cancelled"));
            return;
        }
        executor.execute(() -> {
            if (selection.gate().isCancelled()) return;
            String response = folderResponse(selection.id(), () -> folders.select(data, selection.gate()::beginCommit));
            activity.runOnUiThread(() -> {
                if (closed || folderSelection != selection) return;
                folderSelection = null;
                send(selection.reply(), response);
            });
        });
    }

    private interface FolderTask { String run() throws IOException; }

    private String folderResponse(String id, FolderTask task) {
        try {
            return okJson(id, "target", task.run());
        } catch (IOException | RuntimeException error) {
            Log.w(TAG, "Backup folder unavailable", error);
            String message = error instanceof BackupFolders.FolderProbeException
                    ? error.getMessage() : "无法访问或保存备份文件夹，请重新选择";
            return errorJson(id, message, "folder");
        }
    }

    boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (closed || chooserRequestCode == NO_CHOOSER || requestCode != chooserRequestCode) return false;
        chooserRequestCode = NO_CHOOSER;
        if (folderSelection != null) {
            onFolderResult(folderSelection, resultCode, data);
            return true;
        }
        Session s = active;
        if (s == null || s.phase != Phase.CHOOSING || s.gate.isCancelled()) return true;
        JavaScriptReplyProxy reply = s.finishReply;
        s.finishReply = null;
        if (resultCode != Activity.RESULT_OK) {
            fail(s, reply, "已取消", "cancelled");
            return true;
        }
        Uri tree = data == null ? null : data.getData();
        if (!isWritableTree(tree)) {
            fail(s, reply, "保存文件夹无效或不可写", "invalid_uri");
            return true;
        }
        s.phase = Phase.COPYING;
        submit(s, () -> writeExport(s, tree), () -> {
            release(s);
            send(reply, okJson(s.id, "done", true));
        }, reply);
        return true;
    }

    private boolean isWritableTree(Uri tree) {
        if (tree == null || !"content".equals(tree.getScheme()) || !DocumentsContract.isTreeUri(tree)) return false;
        int permissions = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        return activity.checkUriPermission(tree, Process.myPid(), Process.myUid(), permissions)
                == PackageManager.PERMISSION_GRANTED;
    }

    private ExportDestination createExportDocument(Uri tree, String name) throws IOException {
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String temporaryName = "wanxiang-export-" + UUID.randomUUID() + ".partial";
        try {
            folders.requireUnusedName(parent, name);
            folders.requireUnusedName(parent, temporaryName);
        } catch (IOException failure) {
            throw new ManualExportException("目标名称已被占用或无法确认未被占用，未覆盖任何文件。", failure);
        }
        Uri document = DocumentsContract.createDocument(activity.getContentResolver(), parent,
                "application/json", temporaryName);
        if (document == null) throw new ManualExportException("无法在所选文件夹创建临时导出文档。");
        try {
            if (!folders.supportsSafeStaging(document)) {
                throw new ManualExportException("该文件夹不支持安全导出（需支持写入、重命名和删除）；尚未写入内容，请改选文件夹。");
            }
        } catch (IOException | RuntimeException failure) {
            boolean removed = deleteDocumentQuietly(document);
            String message = "该文件夹无法验证安全导出能力（需支持写入、重命名和删除）；尚未写入导出内容，请改选文件夹。";
            if (!removed) message += "新建的空临时文档“" + temporaryName + "”未能清理，请检查文件夹。";
            throw new ManualExportException(message, failure);
        }
        return new ExportDestination(parent, document, temporaryName);
    }

    private void writeExport(Session s, Uri tree) throws IOException {
        if (s.gate.isCancelled()) return;
        ExportDestination destination = createExportDocument(tree, s.name);
        boolean published = false;
        boolean renameAttempted = false;
        Throwable pendingFailure = null;
        try {
            if (!copyToTarget(s, destination.document())) return;
            try {
                folders.requireUnusedName(destination.parent(), s.name);
            } catch (IOException failure) {
                throw new ManualExportException("导出目标已存在或无法确认未被占用，未覆盖任何文件。", failure);
            }
            if (!s.gate.beginCommit()) return;
            renameAttempted = true;
            Uri renamed;
            try {
                renamed = DocumentsContract.renameDocument(activity.getContentResolver(), destination.document(), s.name);
            } catch (IOException | RuntimeException failure) {
                throw new ManualExportException("导出已进入发布阶段但结果无法确认；请检查“" + s.name + "”和临时文档“"
                        + destination.temporaryName() + "”，确认后再重试。", failure);
            }
            if (renamed == null) {
                throw new ManualExportException("导出已进入发布阶段但结果无法确认；请检查“" + s.name + "”和临时文档“"
                        + destination.temporaryName() + "”，确认后再重试。");
            }
            published = true;
        } catch (IOException | RuntimeException failure) {
            pendingFailure = failure;
            throw failure;
        } finally {
            boolean cleanupFailed = false;
            if (!published && !renameAttempted) cleanupFailed = !deleteDocumentQuietly(destination.document());
            deleteTemp(s);
            if (cleanupFailed && !s.gate.isCancelled()) {
                throw new ManualExportException("导出未完成；临时文档“" + destination.temporaryName()
                        + "”未能清理，请检查所选文件夹。", pendingFailure);
            }
            if (cleanupFailed) Log.w(TAG, "Cancelled export temporary document could not be removed: "
                    + destination.temporaryName());
        }
    }

    private void writeBackup(Session s) throws IOException {
        if (s.gate.isCancelled()) return;
        BackupFolders.Destination destination = folders.createBackup(s.folder, s.name);
        boolean published = false;
        try {
            if (copyToTarget(s, destination.temporary())) {
                published = folders.finishBackup(destination, s.name, s.gate::beginCommit);
            }
        } finally {
            boolean cleanupFailed = !published && !destination.renameAttempted()
                    && !deleteDocumentQuietly(destination.temporary());
            deleteTemp(s);
            if (cleanupFailed && !s.gate.isCancelled()) {
                throw new BackupFolders.FolderProbeException("备份未完成；临时文档“" + destination.temporaryName()
                        + "”未能清理，请检查所选文件夹。", null);
            }
            if (cleanupFailed) Log.w(TAG, "Cancelled backup temporary document could not be removed: "
                    + destination.temporaryName());
        }
        if (published) s.cleanupFailed = !folders.prune(s.folder, destination.folder());
    }

    private boolean copyToTarget(Session s, Uri uri) throws IOException {
        if (s.gate.isCancelled()) return false;
        ContentResolver resolver = activity.getContentResolver();
        try (InputStream in = new FileInputStream(s.temp);
             OutputStream out = resolver.openOutputStream(uri, "wt")) {
            if (out == null) throw new IOException("open target failed");
            byte[] buf = new byte[MAX_CHUNK];
            long copied = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                if (s.gate.isCancelled()) return false;
                out.write(buf, 0, n);
                copied += n;
            }
            if (copied != s.size) throw new IOException("export interrupted");
            out.flush();
        }
        return !s.gate.isCancelled();
    }

    // ---------- 后台任务与清理 ----------

    private interface IoTask { void run() throws IOException; }

    private void submit(Session s, IoTask task, Runnable onSuccess, JavaScriptReplyProxy reply) {
        executor.execute(() -> {
            try {
                task.run();
            } catch (IOException | RuntimeException e) {
                if (s.gate.isCancelled()) return;
                Log.w(TAG, "io failed", e);
                String message = e instanceof ManualExportException manual ? manual.getMessage()
                        : e instanceof BackupFolders.PublicationException publication ? publication.getMessage()
                        : e instanceof BackupFolders.FolderProbeException probe ? probe.getMessage()
                        : s.folder.isEmpty() ? "写入失败"
                        : "备份未完成，请选择可写且支持重命名的文件夹，或手动导出";
                activity.runOnUiThread(() -> {
                    if (isCurrent(s)) fail(s, reply, message, "io");
                });
                return;
            }
            activity.runOnUiThread(() -> {
                if (isCurrent(s)) onSuccess.run();
            });
        });
    }

    private boolean isCurrent(Session s) {
        return !closed && active == s && !s.gate.isCancelled();
    }

    private void fail(Session s, JavaScriptReplyProxy reply, String message, String code) {
        s.gate.cancel();
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

    private boolean deleteDocumentQuietly(Uri uri) {
        try {
            if (!DocumentsContract.deleteDocument(activity.getContentResolver(), uri)) {
                Log.w(TAG, "delete document failed");
                return false;
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "delete document failed", e);
            return false;
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
        if (folderSelection != null) {
            folderSelection.gate().cancel();
            folderSelection = null;
        }
        Session s = active;
        active = null;
        if (s != null) {
            s.gate.cancel();
            s.finishReply = null;
            executor.execute(() -> cleanup(s));
        }
        dismissTreeChooser();
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

    private record ExportDestination(Uri parent, Uri document, String temporaryName) {}

    private static final class ManualExportException extends IOException {
        ManualExportException(String message) {
            super(message);
        }

        ManualExportException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private record FolderSelection(String id, JavaScriptReplyProxy reply, CommitGate gate) {}

    private static final class CommitGate {
        private final AtomicReference<CommitState> state = new AtomicReference<>(CommitState.OPEN);

        boolean cancel() {
            return state.compareAndSet(CommitState.OPEN, CommitState.CANCELLED);
        }

        boolean beginCommit() {
            // After commit starts, cancellation cannot roll it back.
            return state.compareAndSet(CommitState.OPEN, CommitState.COMMITTING);
        }

        boolean isCancelled() {
            return state.get() == CommitState.CANCELLED;
        }
    }

    private static final class Session {
        final String id;
        final String name;
        final long size;
        final String folder;
        final CommitGate gate = new CommitGate();
        File temp;
        FileOutputStream out;
        long written;
        JavaScriptReplyProxy finishReply;
        Phase phase;
        boolean cleanupFailed;

        Session(String id, String name, long size, String folder) {
            this.id = id;
            this.name = name;
            this.size = size;
            this.folder = folder;
        }
    }
}
