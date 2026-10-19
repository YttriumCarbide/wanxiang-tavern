/** A disposable group of native listeners, used by application and tooltip lifecycles. */
export function createEventScope() {
  const listeners = [];
  return {
    on(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      listeners.push(() => target.removeEventListener(type, callback, options));
    },
    dispose() {
      for (const remove of listeners.splice(0)) remove();
    },
  };
}
