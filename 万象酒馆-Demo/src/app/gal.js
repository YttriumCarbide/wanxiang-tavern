import {
  galEnabled,
  parseGalText,
  paginateGalBeat,
  resolveGalActor,
  nextGalStage,
} from '../gal.js';
import { portraitUrl } from '../portraits.js';
import { createEventScope } from '../shared/events.js';

/** One application-owned visual-novel stage, shared by dialogue, story and both chat readers. */
export function createGalPlayer(context) {
  const events = createEventScope();
  const panel = document.createElement('section');
  panel.id = 'gal-stage';
  panel.className = 'gal-stage';
  panel.setAttribute('popover', 'manual');
  panel.setAttribute('aria-label', 'Gal剧情演出');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML = `<div class="gal-vignette"></div><div class="gal-cast" aria-hidden="true"></div>
    <nav class="gal-controls" aria-label="演出控制"><span class="gal-chapter"></span><button data-gal="auto" aria-pressed="false">自动</button><button data-gal="history">回看</button><button data-gal="close">收起</button></nav>
    <section class="gal-reading"><div class="gal-speaker"><img hidden alt=""/><span></span><small></small></div><div class="gal-bonuses"></div><button class="gal-page" type="button" aria-label="展开全文或继续"><span class="gal-text"></span><span class="gal-cursor" aria-hidden="true">◇</span></button><div class="gal-footer"><small class="gal-count"></small><span class="gal-hint">点击展开 · 再点继续</span></div></section>
    <section class="gal-history" hidden aria-label="已读内容"><header><strong>刚刚的故事</strong><button data-gal="history-close">返回演出</button></header><div></div></section>`;
  document.body.append(panel);
  const part = (name) => panel.querySelector(name);
  const pending = [];
  let current = null;
  let timer = null;
  let autoTimer = null;
  let stage = [];
  let auto = false;
  let typing = false;
  let pageIndex = 0;
  let cast = [];
  let read = [];
  function sceneVisibility(visible) {
    for (const frame of document.querySelectorAll('#inn-frame iframe'))
      frame.contentWindow?.postMessage({ type: 'gal-visibility', visible }, location.origin);
  }
  function actors() {
    const library = context.session.ai.library;
    const protagonistId = library.campaign?.protagonistId;
    const members = library.characters.map((member) => {
      const official = member.source === 'official';
      const key = member.combat?.id;
      const sprite = official ? { edith: 'edith', pandora: 'pandora', aegis: 'yuexi' }[key] : null;
      return {
        id: member.id,
        name: member.setting.name,
        avatar: portraitUrl(member.combat),
        user: member.id === protagonistId,
        sprite: sprite ? `./assets/gal/${sprite}-half.png` : null,
        aliases: official
          ? { edith: ['伊迪斯', '伊蒂丝'], pandora: ['潘多拉'], aegis: ['月汐', '长景月汐'] }[
              key
            ] || []
          : [],
      };
    });
    // Tutorial speakers can be present before their official library entry is recruited.
    for (const [key, name, aliases] of [
      ['edith', '伊蒂丝', ['伊迪斯']],
      ['pandora', '潘多拉', []],
      ['yuexi', '长景月汐', ['月汐']],
    ])
      if (!members.some((actor) => actor.name === name))
        members.push({ id: `gal-${key}`, name, aliases, sprite: `./assets/gal/${key}-half.png` });
    for (const npc of context.session.ai.activeScript?.npcs || [])
      if (!members.some((actor) => actor.id === npc.id || actor.name === npc.name))
        members.push({ id: npc.id || `npc:${npc.name}`, name: npc.name });
    return members;
  }
  function stop() {
    clearInterval(timer);
    clearTimeout(autoTimer);
    timer = autoTimer = null;
    typing = false;
  }
  function hide() {
    stop();
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.hidden = true;
    document.body.classList.remove('gal-playing');
    sceneVisibility(false);
    part('.gal-cast').replaceChildren();
    part('.gal-history').hidden = true;
    stage = [];
  }
  function finish(completed = true) {
    if (!current) return;
    const job = current;
    current = null;
    hide();
    job.resolve();
    document.dispatchEvent(
      new CustomEvent('gal-finished', { detail: { owner: job.owner, completed } }),
    );
    if (completed) job.onComplete?.();
    startNext();
  }
  function schedule() {
    clearTimeout(autoTimer);
    if (auto && current && part('.gal-history').hidden)
      autoTimer = setTimeout(advance, Math.max(1600, current.pages[pageIndex].text.length * 45));
  }
  function reveal() {
    if (!current) return;
    stop();
    part('.gal-text').textContent = current.pages[pageIndex].text;
    panel.dataset.typing = 'false';
    part('.gal-hint').textContent =
      pageIndex === current.pages.length - 1 ? '点击结束本段' : '点击继续';
    schedule();
  }
  function renderCast(active) {
    const container = part('.gal-cast');
    for (const image of [...container.children]) {
      if (stage.includes(image.dataset.actor) || image.dataset.leaving) continue;
      image.dataset.leaving = 'true';
      const fade = image.animate(
        [{ opacity: image.style.opacity || 1 }, { opacity: 0, transform: 'translateY(10px)' }],
        { duration: 200, fill: 'forwards' },
      );
      void fade.finished.catch(() => {}).then(() => image.remove());
    }
    stage.forEach((id, index) => {
      const actor = cast.find((entry) => entry.id === id);
      if (!actor?.sprite) return;
      let image = [...container.children].find((entry) => entry.dataset.actor === id);
      if (!image) {
        image = document.createElement('img');
        image.dataset.actor = id;
        image.src = actor.sprite;
        image.alt = actor.name;
        image.addEventListener('error', () => image.remove(), { once: true });
        container.append(image);
      }
      image.dataset.position = stage.length === 1 ? 'center' : index === 0 ? 'left' : 'right';
      image.classList.toggle('speaking', active === id);
    });
  }
  function render() {
    stop();
    if (!current || pageIndex >= current.pages.length) return finish();
    const beat = current.pages[pageIndex];
    const actor = resolveGalActor(
      beat.speaker,
      cast,
      context.session.ai.library.campaign?.protagonistId,
    );
    stage = nextGalStage(stage, beat, actor);
    if (!beat.text) {
      pageIndex++;
      render();
      return;
    }
    const narration = beat.type === 'narration';
    panel.dataset.kind = narration ? 'narration' : actor?.user ? 'user' : 'dialogue';
    panel.dataset.owner = current.owner;
    renderCast(narration ? null : actor?.id);
    const name = narration ? '旁白' : actor?.name || beat.speaker || '来客';
    part('.gal-speaker span').textContent = name;
    part('.gal-speaker small').textContent = actor?.user
      ? '你的视角'
      : narration
        ? 'STORY'
        : 'DIALOGUE';
    const avatar = part('.gal-speaker img');
    avatar.hidden = narration || !actor?.avatar || Boolean(actor?.sprite) || actor?.user;
    if (!avatar.hidden) avatar.src = actor.avatar;
    else avatar.removeAttribute('src');
    part('.gal-bonuses').replaceChildren(
      ...(beat.bonuses || []).map((bonus) => {
        const badge = document.createElement('span');
        badge.textContent = bonus;
        return badge;
      }),
    );
    part('.gal-count').textContent = `${pageIndex + 1} / ${current.pages.length}`;
    part('.gal-text').textContent = '';
    part('.gal-hint').textContent = '点击展开 · 再点继续';
    read.push({ name, text: beat.text });
    const characters = Array.from(beat.text);
    let count = 0;
    typing = true;
    panel.dataset.typing = 'true';
    timer = setInterval(() => {
      count += 3;
      part('.gal-text').textContent = characters.slice(0, count).join('');
      if (count >= characters.length) reveal();
    }, 22);
  }
  function advance() {
    if (!current || !part('.gal-history').hidden) return;
    if (typing) reveal();
    else {
      pageIndex++;
      render();
    }
  }
  function startNext() {
    if (current || !pending.length) return;
    current = pending.shift();
    cast = actors();
    stage = [];
    read = [];
    pageIndex = 0;
    const host =
      [...document.querySelectorAll('dialog[open]')]
        .filter((dialog) => dialog.matches(':modal'))
        .at(-1) || document.body;
    host.append(panel);
    panel.hidden = false;
    document.body.classList.add('gal-playing');
    sceneVisibility(true);
    part('.gal-chapter').textContent = current.title || '万象 · 片刻';
    part('[data-gal="close"]').hidden = current.mandatory === true;
    if (panel.showPopover) panel.showPopover();
    panel.focus({ preventScroll: true });
    render();
  }
  events.on(part('.gal-page'), 'click', advance);
  events.on(panel, 'pointerdown', (event) => event.stopPropagation());
  events.on(panel, 'click', (event) => {
    event.stopPropagation();
    const action = event.target.closest('[data-gal]')?.dataset.gal;
    if (action === 'close') finish();
    if (action === 'auto') {
      auto = !auto;
      part('[data-gal="auto"]').setAttribute('aria-pressed', String(auto));
      if (!typing) schedule();
    }
    if (action === 'history') {
      clearTimeout(autoTimer);
      part('.gal-history div').replaceChildren(
        ...read.map((line) => {
          const item = document.createElement('p');
          const name = document.createElement('strong');
          name.textContent = line.name;
          const text = document.createElement('span');
          text.textContent = line.text;
          item.append(name, text);
          return item;
        }),
      );
      part('.gal-history').hidden = false;
    }
    if (action === 'history-close') {
      part('.gal-history').hidden = true;
      if (!typing) schedule();
    }
  });
  events.on(
    window,
    'keydown',
    (event) => {
      if (!current || ![' ', 'Enter', 'ArrowRight', 'Escape'].includes(event.key)) return;
      if (event.target.closest?.('[data-gal]') && [' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape' && !part('.gal-history').hidden) {
        part('.gal-history').hidden = true;
        if (!typing) schedule();
      } else if (event.key === 'Escape' && !current.mandatory) finish();
      else advance();
    },
    { capture: true },
  );
  events.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(autoTimer);
      if (typing) reveal();
      clearTimeout(autoTimer);
    } else if (!typing) schedule();
  });
  events.on(window, 'resize', () => {
    if (!current) return;
    const capacity = innerHeight < 500 || innerWidth < 900 ? 76 : 155;
    if (capacity >= current.capacity) return;
    const remaining = current.pages
      .slice(pageIndex)
      .flatMap((beat) => paginateGalBeat(beat, capacity));
    current.pages = [...current.pages.slice(0, pageIndex), ...remaining];
    current.capacity = capacity;
    read.pop();
    render();
  });
  return {
    get enabled() {
      return galEnabled(context.session.ai.generationOptions);
    },
    get owner() {
      return current?.owner;
    },
    actors,
    play(content, options = {}) {
      return new Promise((resolve) => {
        const capacity = innerHeight < 500 || innerWidth < 900 ? 76 : 155;
        const beats =
          typeof content === 'string'
            ? parseGalText(content)
            : content.flatMap((line) => {
                if (typeof line === 'string')
                  return parseGalText(line, options.defaultSpeaker || '');
                return parseGalText(
                  line.text,
                  ['旁白', 'narrator'].includes(line.speaker) ? '' : line.speaker || '',
                ).map((beat) => ({ ...beat, bonuses: line.bonuses }));
              });
        pending.push({
          ...options,
          owner: options.owner || 'story',
          pages: beats.flatMap((beat) => paginateGalBeat(beat, capacity)),
          capacity,
          resolve,
        });
        startNext();
      });
    },
    cancel(owner) {
      for (let index = pending.length - 1; index >= 0; index--)
        if (!owner || pending[index].owner === owner) pending.splice(index, 1)[0].resolve();
      if (current && (!owner || current.owner === owner)) finish(false);
    },
    dispose() {
      pending.splice(0).forEach((job) => job.resolve());
      if (current) {
        const job = current;
        current = null;
        job.resolve();
      }
      hide();
      events.dispose();
      panel.remove();
    },
  };
}
