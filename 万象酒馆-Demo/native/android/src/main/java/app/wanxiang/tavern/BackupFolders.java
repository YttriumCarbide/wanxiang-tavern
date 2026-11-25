package app.wanxiang.tavern;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.util.Log;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;

final class BackupFolders {
    private static final Object SELECTION_LOCK = new Object();
    private static final String KEY = "tree";
    private static final String FOLDER_NAME = "万象酒馆自动备份";
    private static final int GRANT = Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    private static final int RETAINED = 12;
    private static final Pattern BACKUP_NAME = Pattern.compile(
            "wanxiang-auto-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z-[a-f0-9-]{36}\\.json");

    private final ContentResolver resolver;
    private final SharedPreferences settings;

    BackupFolders(Context context) {
        resolver = context.getContentResolver();
        settings = context.getSharedPreferences("backup-folder", Context.MODE_PRIVATE);
    }

    String selectedTarget() {
        String target = settings.getString("target", "");
        String stored = settings.getString(KEY, "");
        if (stored.isEmpty()) return "";
        Uri tree = Uri.parse(stored);
        for (var permission : resolver.getPersistedUriPermissions()) {
            if (tree.equals(permission.getUri()) && permission.isReadPermission()
                    && permission.isWritePermission()) return target;
        }
        return "";
    }

    String select(Intent result, BooleanSupplier beginCommit) throws IOException {
        Uri tree = result == null ? null : result.getData();
        if (tree == null || !"content".equals(tree.getScheme()) || !DocumentsContract.isTreeUri(tree)
                || (result.getFlags() & GRANT) != GRANT) {
            throw new IOException("The directory does not grant read and write access");
        }
        // The picker grant is enough to probe. Do not replace a working selection on failure.
        verifyRenameSupport(tree);
        synchronized (SELECTION_LOCK) {
            if (!beginCommit.getAsBoolean()) return "";
            String oldTree = settings.getString(KEY, "");
            String oldTarget = settings.getString("target", "");
            String target = UUID.randomUUID().toString();
            String selected = tree.toString();
            resolver.takePersistableUriPermission(tree, GRANT);
            if (!settings.edit().putString(KEY, selected).putString("target", target).commit()) {
                // A failed commit can still have updated the in-memory preferences.
                settings.edit().putString(KEY, oldTree).putString("target", oldTarget).commit();
                if (!selected.equals(oldTree)) release(tree);
                throw new IOException("Could not keep the backup folder selection");
            }
            if (!oldTree.isEmpty() && !selected.equals(oldTree)) release(Uri.parse(oldTree));
            return target;
        }
    }

    private void release(Uri tree) {
        try {
            resolver.releasePersistableUriPermission(tree, GRANT);
        } catch (SecurityException ignored) {
            // The provider may already have revoked the old grant.
        }
    }

    static boolean isBackupName(String name) {
        return BACKUP_NAME.matcher(name).matches();
    }

    Destination createBackup(String target, String name) throws IOException {
        if (target.isEmpty() || !target.equals(selectedTarget())) {
            throw new IOException("Backup folder access was lost");
        }
        Uri tree = Uri.parse(settings.getString(KEY, ""));
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri folder = findOrCreateFolder(root);
        String temporaryName = name + ".partial";
        requireUnusedName(folder, name);
        requireUnusedName(folder, temporaryName);
        Uri document = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", temporaryName);
        if (document == null) throw new IOException("Could not create a backup");
        try {
            if (!supportsSafeStaging(document)) throw new UnsupportedRenameException();
        } catch (IOException | RuntimeException failure) {
            boolean cleanupFailed = false;
            try {
                deleteCreatedDocument(document, "未能删除未完成的备份文件，请检查文件夹。");
            } catch (IOException cleanupFailure) {
                failure.addSuppressed(cleanupFailure);
                cleanupFailed = true;
            }
            if (cleanupFailed) {
                throw new FolderProbeException(
                        "无法验证自动备份能力，且新建的临时备份文件可能仍留在文件夹中，请检查后改选文件夹。", failure);
            }
            if (failure instanceof UnsupportedRenameException unsupported) throw unsupported;
            throw new UnsupportedRenameException(failure);
        }
        // Only a completed rename publishes a JSON backup.
        return new Destination(folder, document, temporaryName);
    }

    private void verifyRenameSupport(Uri tree) throws IOException {
        String finalName = "wanxiang-rename-check-" + UUID.randomUUID() + ".json";
        String temporaryName = finalName + ".partial";
        Uri probe = null;
        IOException failure = null;
        try {
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri folder = findOrCreateFolder(root);
            requireUnusedName(folder, finalName);
            requireUnusedName(folder, temporaryName);
            probe = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", temporaryName);
            if (probe == null || !supportsSafeStaging(probe)) throw new UnsupportedRenameException();
            requireUnusedName(folder, finalName);
            Uri renamed = DocumentsContract.renameDocument(resolver, probe, finalName);
            if (renamed == null) throw new UnsupportedRenameException();
            // Providers may assign a new document ID on rename.
            probe = renamed;
        } catch (UnsupportedRenameException error) {
            failure = error;
        } catch (IOException | RuntimeException error) {
            failure = new UnsupportedRenameException(error);
        }
        if (probe != null) {
            try {
                deleteCreatedDocument(probe, "自动备份检测文件未能删除，请检查文件夹或改选其他文件夹。");
            } catch (IOException cleanupFailure) {
                if (failure != null) cleanupFailure.addSuppressed(failure);
                throw new FolderProbeException(cleanupFailure.getMessage(), cleanupFailure);
            }
        }
        if (failure != null) throw failure;
    }

    void requireUnusedName(Uri folder, String name) throws IOException {
        try (Cursor children = queryChildren(folder)) {
            var extras = children.getExtras();
            if (extras != null && (extras.getBoolean(DocumentsContract.EXTRA_LOADING, false)
                    || extras.containsKey(DocumentsContract.EXTRA_ERROR))) {
                throw new FolderProbeException("无法确认文件夹内容是否完整，请稍后重试或改选其他文件夹。", null);
            }
            while (children.moveToNext()) {
                if (name.equalsIgnoreCase(children.getString(1))) {
                    throw new FolderProbeException("目标文件已存在，未覆盖该文件。", null);
                }
            }
        }
    }

    boolean supportsSafeStaging(Uri document) throws IOException {
        int required = Document.FLAG_SUPPORTS_WRITE | Document.FLAG_SUPPORTS_RENAME
                | Document.FLAG_SUPPORTS_DELETE;
        try (Cursor cursor = resolver.query(document, new String[] { Document.COLUMN_FLAGS }, null, null, null)) {
            return cursor != null && cursor.moveToFirst() && (cursor.getInt(0) & required) == required;
        }
    }

    private void deleteCreatedDocument(Uri document, String message) throws IOException {
        try {
            if (!DocumentsContract.deleteDocument(resolver, document)) throw new IOException(message);
        } catch (RuntimeException failure) {
            throw new IOException(message, failure);
        }
    }

    boolean finishBackup(Destination destination, String name, BooleanSupplier beginCommit) throws IOException {
        requireUnusedName(destination.folder(), name);
        // Gate the provider call, not the earlier copy or directory lookup.
        if (!beginCommit.getAsBoolean()) return false;
        destination.markRenameAttempted();
        try {
            if (DocumentsContract.renameDocument(resolver, destination.temporary(), name) == null) {
                throw new PublicationException(name, destination.temporaryName(), null);
            }
            return true;
        } catch (PublicationException failure) {
            throw failure;
        } catch (IOException | RuntimeException failure) {
            throw new PublicationException(name, destination.temporaryName(), failure);
        }
    }

    boolean prune(String target, Uri folder) {
        try {
            if (!target.equals(selectedTarget())) return false;
            ArrayList<Backup> backups = new ArrayList<>();
            try (Cursor children = queryChildren(folder)) {
                while (children.moveToNext()) {
                    String name = children.getString(1);
                    if (name == null || !isBackupName(name) || children.getLong(3) <= 0
                            || Document.MIME_TYPE_DIR.equals(children.getString(2))) continue;
                    backups.add(new Backup(name, children.getString(0)));
                }
            }
            backups.sort(Comparator.comparing(Backup::name).reversed());
            boolean complete = true;
            for (int index = RETAINED; index < backups.size(); index++) {
                Uri old = DocumentsContract.buildDocumentUriUsingTree(folder, backups.get(index).id());
                if (!DocumentsContract.deleteDocument(resolver, old)) complete = false;
            }
            return complete;
        } catch (IOException | RuntimeException error) {
            Log.w("BackupFolders", "Could not remove old backups", error);
            return false;
        }
    }

    private Uri findOrCreateFolder(Uri root) throws IOException {
        try (Cursor children = queryChildren(root)) {
            while (children.moveToNext()) {
                if (FOLDER_NAME.equals(children.getString(1)) && Document.MIME_TYPE_DIR.equals(children.getString(2))) {
                    return DocumentsContract.buildDocumentUriUsingTree(root, children.getString(0));
                }
            }
        }
        Uri folder = DocumentsContract.createDocument(resolver, root, Document.MIME_TYPE_DIR, FOLDER_NAME);
        if (folder == null) throw new IOException("Could not create the backup directory");
        return folder;
    }

    private Cursor queryChildren(Uri folder) throws IOException {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(folder, DocumentsContract.getDocumentId(folder));
        Cursor cursor = resolver.query(children, new String[] {
                Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE
        }, null, null, null);
        if (cursor == null) throw new IOException("Could not read the backup directory");
        return cursor;
    }

    static class FolderProbeException extends IOException {
        FolderProbeException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    static final class PublicationException extends IOException {
        PublicationException(String name, String temporaryName, Throwable cause) {
            super("备份已进入发布阶段但重命名结果无法确认；请检查文件夹中的“" + name + "”和“"
                    + temporaryName + "”，确认后再重试。", cause);
        }
    }

    private static final class UnsupportedRenameException extends FolderProbeException {
        private static final String MESSAGE = "自动备份需要文件夹支持写入、重命名和删除；未能验证，请改选文件夹或手动导出。";

        UnsupportedRenameException() {
            this(null);
        }

        UnsupportedRenameException(Throwable cause) {
            super(MESSAGE, cause);
        }
    }

    static final class Destination {
        private final Uri folder;
        private final Uri temporary;
        private final String temporaryName;
        private boolean renameAttempted;

        Destination(Uri folder, Uri temporary, String temporaryName) {
            this.folder = folder;
            this.temporary = temporary;
            this.temporaryName = temporaryName;
        }

        Uri folder() { return folder; }
        Uri temporary() { return temporary; }
        String temporaryName() { return temporaryName; }
        boolean renameAttempted() { return renameAttempted; }
        void markRenameAttempted() { renameAttempted = true; }
    }

    private record Backup(String name, String id) {}
}
