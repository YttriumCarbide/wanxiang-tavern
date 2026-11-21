import assert from 'node:assert/strict';
import test from 'node:test';
import { pruneBackups } from '../src/storage/folder-backup.js';

function backupName(minutes) {
  const stamp = new Date(Date.UTC(2026, 10, 6, 8, minutes)).toISOString().replace(/[:.]/g, '-');
  return 'wanxiang-auto-' + stamp + '-00000000-0000-4000-8000-000000000000.json';
}

function backupFile(size) {
  return { kind: 'file', getFile: async () => ({ size }) };
}

test('incomplete and unreadable files do not displace any of the twelve retained backups', async () => {
  const completed = Array.from({ length: 13 }, (_, index) => backupName(index + 1));
  const files = new Map(completed.map((name) => [name, backupFile(10)]));
  const empty = backupName(14);
  const unreadable = backupName(15);
  files.set(empty, backupFile(0));
  files.set(unreadable, {
    kind: 'file',
    async getFile() {
      throw Error('File temporarily unavailable');
    },
  });
  files.set('notes.json', backupFile(11));
  await pruneBackups({
    entries: () => files.entries(),
    async removeEntry(name) {
      assert.ok(files.delete(name));
    },
  });
  assert.deepEqual([...files.keys()], [...completed.slice(1), empty, unreadable, 'notes.json']);
});
