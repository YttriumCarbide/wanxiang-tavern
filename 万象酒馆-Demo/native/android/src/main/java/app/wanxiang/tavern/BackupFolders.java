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
import java.util.regex.Pattern;

final class BackupFolders {
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

    String select(Intent result) throws IOException {
        Uri tree = result == null ? null : result.getData();
        if (tree == null || !"content".equals(tree.getScheme()) || !DocumentsContract.isTreeUri(tree)
                || (result.getFlags() & GRANT) != GRANT) {
            throw new IOException("The directory does not grant read and write access");
        }
        String oldTree = settings.getString(KEY, "");
        String target = UUID.randomUUID().toString();
        resolver.takePersistableUriPermission(tree, GRANT);
        if (!settings.edit().putString(KEY, tree.toString()).putString("target", target).commit()) {
            if (!tree.toString().equals(oldTree)) release(tree);
            throw new IOException("Could not keep the backup folder selection");
        }
        if (!oldTree.isEmpty() && !tree.toString().equals(oldTree)) release(Uri.parse(oldTree));
        return target;
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
        Uri document = DocumentsContract.createDocument(resolver, folder, "application/octet-stream", name + ".partial");
        if (document == null) throw new IOException("Could not create a backup");
        if (canRename(document)) return new Destination(document, true);
        if (!DocumentsContract.deleteDocument(resolver, document)) {
            throw new IOException("Could not remove the temporary backup");
        }
        document = DocumentsContract.createDocument(resolver, folder, "application/json", name);
        if (document == null) throw new IOException("Could not create a backup");
        return new Destination(document, false);
    }

    private boolean canRename(Uri document) {
        try (Cursor cursor = resolver.query(document, new String[] { Document.COLUMN_FLAGS }, null, null, null)) {
            return cursor != null && cursor.moveToFirst()
                    && (cursor.getInt(0) & Document.FLAG_SUPPORTS_RENAME) != 0;
        }
    }

    void finishBackup(Uri temporary, String name) throws IOException {
        if (DocumentsContract.renameDocument(resolver, temporary, name) == null) {
            throw new IOException("Could not finish writing the backup");
        }
    }

    boolean prune(String target) {
        if (!target.equals(selectedTarget())) return false;
        Uri tree = Uri.parse(settings.getString(KEY, ""));
        Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try {
            ArrayList<Backup> backups = new ArrayList<>();
            try (Cursor children = queryChildren(findOrCreateFolder(root))) {
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
                Uri old = DocumentsContract.buildDocumentUriUsingTree(tree, backups.get(index).id());
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

    private record Backup(String name, String id) {}
    record Destination(Uri uri, boolean needsRename) {}
}
