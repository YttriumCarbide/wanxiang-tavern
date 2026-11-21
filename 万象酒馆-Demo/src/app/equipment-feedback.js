const KIND_TO_ANIMATION = Object.freeze({
  forge: 'eq-anim-forge-burst',
  temper: 'eq-anim-temper-shake',
  reforge: 'eq-anim-reforge-scramble',
  ascend: 'eq-anim-ascend-rise',
  affix: 'eq-anim-affix-reveal',
  reveal: 'eq-anim-affix-reveal',
  reroll: 'eq-anim-affix-reroll',
});

const KEYFRAMES = Object.freeze({
  'eq-anim-forge-burst': [
    { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
    { transform: 'scale(1.12)', filter: 'brightness(1.35)', opacity: 1, offset: 0.4 },
    { transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
  ],
  'eq-anim-temper-shake': [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-3px)', offset: 0.2 },
    { transform: 'translateX(3px)', offset: 0.4 },
    { transform: 'translateX(-2px)', offset: 0.6 },
    { transform: 'translateX(2px)', offset: 0.8 },
    { transform: 'translateX(0)' },
  ],
  'eq-anim-reforge-scramble': [
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    { transform: 'scale(0.96) rotate(-2deg)', opacity: 0.85, offset: 0.35 },
    { transform: 'scale(1.04) rotate(2deg)', opacity: 0.9, offset: 0.7 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ],
  'eq-anim-ascend-rise': [
    { transform: 'translateY(0) scale(1)', opacity: 1 },
    { transform: 'translateY(-6px) scale(1.06)', opacity: 1, offset: 0.5 },
    { transform: 'translateY(0) scale(1)', opacity: 1 },
  ],
  'eq-anim-affix-reveal': [
    { transform: 'scale(0.92)', opacity: 0.4 },
    { transform: 'scale(1.04)', opacity: 1, offset: 0.6 },
    { transform: 'scale(1)', opacity: 1 },
  ],
  'eq-anim-affix-reroll': [
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    { transform: 'scale(0.94) rotate(3deg)', opacity: 0.6, offset: 0.5 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ],
});

function animationDuration(animId) {
  switch (animId) {
    case 'eq-anim-forge-burst':
      return 700;
    case 'eq-anim-temper-shake':
      return 500;
    case 'eq-anim-reforge-scramble':
      return 650;
    case 'eq-anim-ascend-rise':
      return 800;
    case 'eq-anim-affix-reveal':
      return 600;
    case 'eq-anim-affix-reroll':
      return 550;
    default:
      return 600;
  }
}

export function createEquipmentFeedback(panel, events) {
  const doc = panel.ownerDocument;
  const win = doc.defaultView;

  const dialog = doc.createElement('dialog');
  dialog.className = 'equipment-feedback-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');

  const form = doc.createElement('form');
  form.method = 'dialog';
  form.className = 'equipment-feedback-form';

  const titleEl = doc.createElement('h2');
  titleEl.className = 'equipment-feedback-title';

  const costEl = doc.createElement('p');
  costEl.className = 'equipment-feedback-cost';

  const descEl = doc.createElement('p');
  descEl.className = 'equipment-feedback-description';

  const actions = doc.createElement('div');
  actions.className = 'equipment-feedback-actions';

  const cancelBtn = doc.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'equipment-feedback-cancel';
  cancelBtn.textContent = '取消';

  const confirmBtn = doc.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'equipment-feedback-confirm primary';
  confirmBtn.textContent = '确认';

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  form.appendChild(titleEl);
  form.appendChild(costEl);
  form.appendChild(descEl);
  form.appendChild(actions);
  dialog.appendChild(form);

  const overlay = doc.createElement('div');
  overlay.className = 'forge-operation-feedback';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;

  const labelEl = doc.createElement('div');
  labelEl.className = 'forge-operation-feedback-label';
  labelEl.setAttribute('aria-hidden', 'true');
  overlay.appendChild(labelEl);

  panel.appendChild(overlay);
  doc.body.appendChild(dialog);

  let pendingResolve = null;
  let disposed = false;
  let overlayTimer = null;
  let activeAnimation = null;

  const reduceMotionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');

  function cleanupPending(result) {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(result);
    }
  }

  function closeDialog() {
    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        // A closing or detached dialog has no further visual work.
      }
    }
  }

  function onClose() {
    cleanupPending(false);
  }

  function onCancel() {
    cleanupPending(false);
    closeDialog();
  }

  function onCancelClick() {
    cleanupPending(false);
    closeDialog();
  }

  function onConfirmClick() {
    cleanupPending(true);
    closeDialog();
  }

  events.on(dialog, 'close', onClose);
  events.on(dialog, 'cancel', onCancel);
  events.on(cancelBtn, 'click', onCancelClick);
  events.on(confirmBtn, 'click', onConfirmClick);

  function confirm(options) {
    const opts = options || {};
    if (disposed) {
      return Promise.resolve(false);
    }
    if (pendingResolve) {
      cleanupPending(false);
    }
    titleEl.textContent = opts.title != null ? String(opts.title) : '';
    costEl.textContent = opts.cost != null ? String(opts.cost) : '';
    descEl.textContent = opts.description != null ? String(opts.description) : '';

    return new Promise((resolve) => {
      pendingResolve = resolve;
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          cleanupPending(false);
        }
      }
    });
  }

  function cancelAnimation() {
    if (activeAnimation) {
      try {
        activeAnimation.cancel();
      } catch {
        // A finished animation may already have released its target.
      }
      activeAnimation = null;
    }
  }

  function play(kind, label, target) {
    if (disposed) return;
    const animId = KIND_TO_ANIMATION[kind];
    if (!animId) return;

    cancelAnimation();

    overlay.dataset.kind = String(kind);
    labelEl.textContent = label != null ? String(label) : '';
    overlay.hidden = false;

    if (overlayTimer) {
      win.clearTimeout(overlayTimer);
    }
    overlayTimer = win.setTimeout(() => {
      overlay.hidden = true;
      overlayTimer = null;
    }, 900);

    if (reduceMotionQuery.matches) {
      return;
    }

    const animTarget = target && typeof target.animate === 'function' ? target : overlay;
    if (typeof animTarget.animate !== 'function') {
      return;
    }

    const baseTransform = win.getComputedStyle(animTarget).transform;
    const keyframes = KEYFRAMES[animId].map((frame) => ({
      ...frame,
      transform: `${baseTransform === 'none' ? '' : baseTransform} ${frame.transform || ''}`.trim(),
    }));
    const duration = animationDuration(animId);
    try {
      activeAnimation = animTarget.animate(keyframes, {
        duration: Math.min(duration, 800),
        easing: 'ease-in-out',
        fill: 'none',
        iterations: 1,
      });
    } catch {
      // The saved result remains visible even if animation is unavailable.
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cleanupPending(false);
    cancelAnimation();
    if (overlayTimer) {
      win.clearTimeout(overlayTimer);
      overlayTimer = null;
    }
    closeDialog();
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  return { confirm, play, dispose };
}
