const STILL = 'translate(0)';
const HOP = [STILL, 'translateY(-20px)', STILL, 'translateY(-4px)', STILL];
const NUDGE = [STILL, 'translateX(-3px)', 'translateX(3px)', STILL];
const SYMBOL_TIME = 960;
const REACTIONS = Object.freeze({
  hop: { frames: HOP, duration: 420, symbol: '✨' },
  'hop:alert': { frames: HOP, duration: 420, symbol: '❗', nudge: true },
  'hop:note': { frames: HOP, duration: 420, symbol: '🎵' },
  shake: {
    frames: [
      STILL,
      'translateX(-6px)',
      'translateX(6px)',
      'translateX(-5px)',
      'translateX(4px)',
      STILL,
    ],
    duration: 380,
    symbol: '💢',
    nudge: true,
  },
  sweat: {
    frames: [
      { transform: STILL },
      { transform: 'translateY(18px)', offset: 0.32 },
      { transform: 'translateY(18px)', offset: 0.81 },
      { transform: STILL },
    ],
    duration: 1050,
    symbol: '💧',
  },
  lean: {
    frames: [STILL, 'translateY(-6px) scale(1.08)', 'translateY(-6px) scale(1.08)', STILL],
    duration: 650,
  },
  back: {
    frames: [STILL, 'translateY(5px) scale(0.95)', 'translateY(5px) scale(0.95)', STILL],
    duration: 560,
  },
  nod: {
    frames: [STILL, 'translateY(6px)', STILL, 'translateY(5px)', STILL],
    duration: 480,
  },
  sway: {
    frames: [STILL, 'translateX(-6px)', 'translateX(6px)', 'translateX(-4px)', STILL],
    duration: 840,
    symbol: '…',
  },
  question: {
    frames: [STILL, 'rotate(3deg)', 'rotate(3deg)', STILL],
    duration: 680,
    symbol: '❓',
  },
});

/** A line owns its portrait gesture and symbol until it expires or leaves the stage. */
export function createGalReactions(reading) {
  let activeSlot = null;
  let bubble = null;
  let timer = null;
  const animations = [];

  function stopMotion() {
    for (const animation of animations.splice(0)) animation.cancel();
    if (activeSlot) delete activeSlot.dataset.emote;
  }

  function clear() {
    clearTimeout(timer);
    timer = null;
    stopMotion();
    if (bubble) {
      bubble.hidden = true;
      bubble.textContent = '';
    }
    activeSlot = bubble = null;
  }

  function transform(element, frames, duration) {
    if (typeof element?.animate !== 'function') return;
    const keyframes = frames.map((frame) =>
      typeof frame === 'string' ? { transform: frame } : frame,
    );
    animations.push(element.animate(keyframes, { duration, easing: 'ease-in-out' }));
  }

  function play(slot, tag, reducedMotion = false) {
    clear();
    if (!slot || !Object.hasOwn(REACTIONS, tag)) return;
    const reaction = REACTIONS[tag];
    activeSlot = slot;
    if (!reducedMotion) {
      slot.dataset.emote = tag;
      transform(slot.querySelector('.gal-portrait-reaction'), reaction.frames, reaction.duration);
      if (reaction.nudge) transform(reading, NUDGE, 210);
    }
    if (reaction.symbol) {
      bubble = slot.querySelector('.gal-emote');
      bubble.hidden = false;
      bubble.textContent = reaction.symbol;
      if (!reducedMotion && typeof bubble.animate === 'function') {
        animations.push(
          bubble.animate(
            [
              { opacity: 0, translate: '0 5px', scale: 0.82 },
              { opacity: 1, translate: '0 0', scale: 1, offset: 0.16 },
              { opacity: 1, translate: '0 0', scale: 1, offset: 0.8 },
              { opacity: 0, translate: '0 -5px', scale: 0.96 },
            ],
            { duration: SYMBOL_TIME, easing: 'ease-out', fill: 'forwards' },
          ),
        );
      }
    }
    timer = setTimeout(clear, Math.max(reaction.duration, reaction.symbol ? SYMBOL_TIME : 0));
  }

  return { play, clear, stopMotion };
}
