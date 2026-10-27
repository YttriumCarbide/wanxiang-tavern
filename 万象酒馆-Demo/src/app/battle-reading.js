/** A presentation switch; neither timeline actions nor battle state are changed. */
export function createBattleReading(context) {
  const { session, events } = context;
  const battle = document.querySelector('#battle');
  const timeline = document.querySelector('.turn-column');
  const button = document.createElement('button');
  button.id = 'battle-reading-toggle';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', '切换剧情与闲聊');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'gal-dungeon-menu');
  button.innerHTML =
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 12h30M30 5l9 7-9 7M39 36H9m9-7-9 7 9 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><small>切换</small>';
  const menu = document.createElement('nav');
  menu.id = 'gal-dungeon-menu';
  menu.setAttribute('aria-label', '剧情与同行闲聊');
  menu.inert = true;
  menu.innerHTML =
    '<button data-dungeon-gal="story">剧情</button><button data-dungeon-gal="quick">闲聊</button>';
  battle.append(button, menu);
  let expanded = false;
  function setExpanded(value) {
    expanded = value;
    battle.classList.toggle('show-reading-controls', value);
    button.setAttribute('aria-expanded', String(value));
    timeline.inert = value;
    menu.inert = !value;
  }
  function render() {
    button.hidden =
      !context.gal?.enabled || session.runtime.mode !== 'battle' || !session.ai.activeScript;
    button.disabled = session.battle.playing;
    if (button.hidden) setExpanded(false);
    const orb = document.querySelector('#ap-orb').getBoundingClientRect();
    const bag = document.querySelector('#backpack-open');
    const anchor = bag && !bag.hidden ? bag.getBoundingClientRect() : orb;
    const gap = orb.width < 70 ? 8 : 12;
    button.style.left = `${anchor.right + gap}px`;
    button.style.bottom = `${innerHeight - orb.bottom}px`;
    button.style.setProperty('--reading-size', `${orb.width}px`);
    const bounds = timeline.getBoundingClientRect();
    menu.style.left = `${bounds.left + bounds.width / 2}px`;
    menu.style.bottom = `${Math.max(8, parseFloat(getComputedStyle(timeline).bottom) || 0)}px`;
  }
  events.on(button, 'click', () => {
    if (!button.disabled) setExpanded(!expanded);
  });
  events.on(menu, 'click', (event) => {
    const kind = event.target.closest('[data-dungeon-gal]')?.dataset.dungeonGal;
    if (kind === 'story') document.dispatchEvent(new CustomEvent('gal-open-script'));
    if (kind === 'quick') document.dispatchEvent(new CustomEvent('gal-open-quick'));
  });
  events.on(window, 'resize', render);
  return {
    render,
    dispose() {
      setExpanded(false);
      button.remove();
      menu.remove();
    },
  };
}
