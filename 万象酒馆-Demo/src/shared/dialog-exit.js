// Older browsers can paint the closing panel without keeping the native modal open.
export function createDialogExit(
  dialog,
  {
    skip = () => false,
    supportsNativeMotion = () =>
      CSS.supports('overlay: auto') &&
      CSS.supports('transition-behavior: allow-discrete') &&
      CSS.supports('interactivity: inert'),
  } = {},
) {
  let animation = null;

  function clear() {
    if (!dialog.hasAttribute('data-dialog-exiting')) return;
    const pending = animation;
    animation = null;
    pending?.cancel();
    dialog.removeAttribute('data-dialog-exiting');
    dialog.inert = false;
  }

  function show() {
    clear();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    if (
      dialog.open ||
      skip() ||
      dialog.inert ||
      !('inert' in dialog) ||
      typeof dialog.getAnimations !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      supportsNativeMotion()
    ) {
      return;
    }

    // Native close already restored focus. The remaining paint cannot take input.
    dialog.inert = true;
    dialog.setAttribute('data-dialog-exiting', '');
    const exit = dialog
      .getAnimations()
      .find((item) => item.animationName === 'dialog-fallback-exit');
    animation = exit;
    if (!exit) {
      clear();
      return;
    }
    const complete = () => {
      if (animation === exit) clear();
    };
    void exit.finished.then(complete, complete);
  }

  return { show, close, clear };
}
