package app.wanxiang.tavern;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class WebFiles {
    private static final String UPDATE_PREFIX = "/__wanxiang_native/v1/";
    private static final Pattern RANGE = Pattern.compile("bytes=([0-9]*)-([0-9]*)");
    private final AssetManager bundled;
    private final File updates;
    private final Map<String, Entry> entries = new HashMap<>();

    private record Entry(String path, long bytes, String hash, boolean deferred) {}
    private record Location(String area, Entry entry) {}

    WebFiles(AssetManager bundled, File updates) throws Exception {
        this.bundled = bundled;
        this.updates = updates;
        JSONObject index;
        try (InputStream stream = bundled.open("chunks.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int count; (count = stream.read(buffer)) != -1;) bytes.write(buffer, 0, count);
            index = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        }
        JSONArray chunks = index.getJSONArray("chunks");
        for (int i = 0; i < chunks.length(); i++) {
            JSONObject chunk = chunks.getJSONObject(i);
            boolean deferred = !chunk.getString("delivery").equals("initial");
            JSONArray files = chunk.getJSONArray("files");
            for (int j = 0; j < files.length(); j++) {
                JSONObject file = files.getJSONObject(j);
                String path = file.getString("path");
                entries.put(path,
                        new Entry(path, file.getLong("bytes"), file.getString("sha256"), deferred));
            }
        }
    }

    private Location location(String path) {
        String[] parts = path.substring(UPDATE_PREFIX.length()).split("/", 3);
        if (parts.length != 3 || !("partial".equals(parts[0]) || "verified".equals(parts[0])))
            return null;
        Entry entry = entries.get(parts[2]);
        return entry != null && entry.deferred() && entry.hash().equals(parts[1])
                ? new Location(parts[0], entry) : null;
    }

    private File diskFile(Location location) {
        return new File(new File(updates, location.area()), location.entry().hash());
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private static boolean matches(MessageDigest digest, Entry entry) {
        return entry.hash().equals(hex(digest.digest()));
    }

    private static String hex(byte[] bytes) {
        StringBuilder text = new StringBuilder(2 * bytes.length);
        for (byte value : bytes) {
            text.append(Character.forDigit((value & 0xff) >> 4, 16));
            text.append(Character.forDigit(value & 0x0f, 16));
        }
        return text.toString();
    }

    private FileInputStream openStored(Location location) throws IOException {
        File file = diskFile(location);
        if (!file.isFile()) return null;
        FileInputStream stream = new FileInputStream(file);
        if (location.area().equals("partial")) return stream;
        try {
            if (stream.getChannel().size() == location.entry().bytes()) {
                MessageDigest digest = sha256();
                byte[] buffer = new byte[65536];
                for (int count; (count = stream.read(buffer)) != -1;) digest.update(buffer, 0, count);
                if (matches(digest, location.entry())) {
                    stream.getChannel().position(0);
                    return stream;
                }
            }
        } catch (IOException error) {
            stream.close();
            throw error;
        }
        stream.close();
        return null;
    }

    String change(byte[] message) {
        long id = 0;
        try {
            ByteBuffer buffer = ByteBuffer.wrap(message);
            int headerLength = buffer.getInt();
            if (headerLength <= 0 || headerLength > Math.min(8192, buffer.remaining()))
                throw new IOException("Invalid header length");
            JSONObject header = new JSONObject(new String(message, 4, headerLength, StandardCharsets.UTF_8));
            id = header.getLong("id");
            String path = Uri.decode(header.getString("path"));
            Location location = path.startsWith(UPDATE_PREFIX) ? location(path) : null;
            if (location == null) throw new IOException("Unknown update asset");
            Path target = diskFile(location).toPath();
            int body = 4 + headerLength;
            switch (header.getString("method")) {
                case "DELETE" -> Files.deleteIfExists(target);
                case "PUT" -> write(target, location, message, body);
                default -> throw new IOException("Unknown storage operation");
            }
            return "{\"id\":" + id + ",\"ok\":true}";
        } catch (Exception error) {
            android.util.Log.w("WanxiangTavern", "Update storage operation failed", error);
            return "{\"id\":" + id + ",\"ok\":false}";
        }
    }

    private static void write(Path target, Location location, byte[] bytes, int offset)
            throws IOException {
        int length = bytes.length - offset;
        Entry entry = location.entry();
        if (length > entry.bytes()) throw new IOException("Update exceeds declared size");
        if (location.area().equals("verified")) {
            MessageDigest digest = sha256();
            digest.update(bytes, offset, length);
            if (length != entry.bytes() || !matches(digest, entry))
                throw new IOException("Update integrity mismatch");
        }
        Files.createDirectories(target.getParent());
        Path temporary = Files.createTempFile(target.getParent(), "download-", ".tmp");
        try {
            try (var stream = Files.newOutputStream(temporary)) {
                stream.write(bytes, offset, length);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    WebResourceResponse serve(WebResourceRequest request) {
        String path = request.getUrl().getPath();
        String method = request.getMethod();
        if (path == null || !path.startsWith("/") || !("GET".equals(method) || "HEAD".equals(method)))
            return missing();
        String name = path.equals("/") ? "index.html" : path.substring(1);
        try {
            if (path.startsWith(UPDATE_PREFIX)) {
                Location location = location(path);
                if (location == null) return missing();
                FileInputStream stream = openStored(location);
                return stream == null ? missing()
                        : send(request, location.entry().path(), stream, stream.getChannel().size());
            }
            Entry entry = entries.get(name);
            if (entry != null && entry.deferred()) {
                FileInputStream stream;
                try {
                    stream = openStored(new Location("verified", entry));
                } catch (IOException unavailable) {
                    stream = null;
                }
                if (stream != null) return send(request, name, stream, entry.bytes());
            }
            if (entry == null && !"manifest.json".equals(name) && !"chunks.json".equals(name))
                return missing();
            InputStream stream = bundled.open(name);
            return send(request, name, stream, entry != null ? entry.bytes() : stream.available());
        } catch (IOException error) {
            return missing();
        }
    }

    private static WebResourceResponse send(WebResourceRequest request, String name, InputStream stream,
                                            long size) throws IOException {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Accept-Ranges", "bytes");
        String range = null;
        for (var field : request.getRequestHeaders().entrySet())
            if ("range".equalsIgnoreCase(field.getKey())) range = field.getValue();
        long length = size;
        int status = 200;
        if (range != null) {
            Matcher parts = RANGE.matcher(range);
            long first;
            long last = size - 1;
            try {
                if (!parts.matches()) throw new NumberFormatException();
                first = parts.group(1).isEmpty()
                        ? Math.max(0, size - Long.parseLong(parts.group(2))) : Long.parseLong(parts.group(1));
                if (!parts.group(1).isEmpty() && !parts.group(2).isEmpty())
                    last = Math.min(last, Long.parseLong(parts.group(2)));
                if (first > last) throw new NumberFormatException();
            } catch (NumberFormatException invalid) {
                stream.close();
                headers.put("Content-Range", "bytes */" + size);
                return new WebResourceResponse("text/plain", "UTF-8", 416, "Range Not Satisfiable", headers, null);
            }
            status = 206;
            length = last - first + 1;
            headers.put("Content-Range", "bytes " + first + "-" + last + "/" + size);
            try {
                while (first > 0) {
                    long skipped = stream.skip(first);
                    if (skipped <= 0) throw new IOException("Cannot seek asset");
                    first -= skipped;
                }
            } catch (IOException error) {
                stream.close();
                throw error;
            }
            stream = new BoundedStream(stream, length);
        }
        headers.put("Content-Length", Long.toString(length));
        if ("HEAD".equals(request.getMethod())) {
            stream.close();
            stream = null;
        }
        String mime = mime(name);
        return new WebResourceResponse(mime, mime.startsWith("text/") || mime.equals("application/json")
                ? "UTF-8" : null, status, status == 200 ? "OK" : "Partial Content", headers, stream);
    }

    private static String mime(String name) {
        String extension = name.substring(name.lastIndexOf('.') + 1);
        return switch (extension) {
            case "js", "mjs" -> "text/javascript";
            case "json" -> "application/json";
            case "glb" -> "model/gltf-binary";
            case "m4a" -> "audio/mp4";
            case "wav" -> "audio/wav";
            default -> {
                String type = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                yield type == null ? "application/octet-stream" : type;
            }
        };
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.singletonMap("Cache-Control", "no-store"), null);
    }

    private static final class BoundedStream extends FilterInputStream {
        private long remaining;

        BoundedStream(InputStream stream, long length) {
            super(stream);
            remaining = length;
        }

        @Override
        public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = in.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int size) throws IOException {
            if (size == 0) return 0;
            if (remaining == 0) return -1;
            int count = in.read(bytes, offset, (int) Math.min(size, remaining));
            if (count > 0) remaining -= count;
            return count;
        }
    }
}
