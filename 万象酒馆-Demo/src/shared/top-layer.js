/** Older embedded browsers can expose dialog APIs without supporting their state selectors. */
export function activeModal(document) {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  try {
    return dialogs.filter((dialog) => dialog.matches(':modal')).at(-1) || null;
  } catch {
    return dialogs.at(-1) || null;
  }
}

/** Own the popover lifecycle without querying optional CSS pseudo-classes. */
export function createPopoverSurface(element) {
  const supported =
    typeof element.showPopover === 'function' && typeof element.hidePopover === 'function';
  if (supported) element.setAttribute('popover', 'manual');
  let open = false;
  return {
    show() {
      if (!supported || open) return;
      try {
        element.showPopover();
        open = true;
      } catch {
        element.removeAttribute('popover');
      }
    },
    hide() {
      if (!supported || !open) return;
      try {
        element.hidePopover();
      } catch {
        // Removing or reparenting an active surface may already have closed it.
      }
      open = false;
    },
  };
}
