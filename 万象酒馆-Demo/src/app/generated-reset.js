import { newLibrary } from '../ai/library.js';

const revision = '2026-10-16-requested-fresh-start';
const libraryKey = 'wanxiang.worldbooks.v1';
const markerKey = 'wanxiang.generated-reset.v1';
const recoveryKey = 'wanxiang.generated-recovery.v1';

/** One user-requested clean start per browser, leaving all service settings untouched. */
export function applyGeneratedReset(storage) {
  if (storage.getItem(markerKey) === revision) return false;
  const previous = storage.getItem(libraryKey);
  if (previous) storage.setItem(recoveryKey, previous);
  storage.setItem(libraryKey, JSON.stringify(newLibrary()));
  storage.setItem(markerKey, revision);
  return true;
}

export function hasGeneratedRecovery(storage) {
  return storage.getItem(recoveryKey) !== null;
}

/** Recovery is explicit; this inactive copy is never passed to any generation context. */
export function restoreGeneratedRecovery(storage) {
  const previous = storage.getItem(recoveryKey);
  if (!previous) return false;
  storage.setItem(libraryKey, previous);
  storage.setItem(markerKey, revision);
  storage.removeItem(recoveryKey);
  return true;
}
