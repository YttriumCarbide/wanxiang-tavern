import {
  parseGalText,
  paginateGalBeat,
  resolveGalActor,
  nextGalStage,
  selectedGalStage,
  galActorsForBeats,
} from '../gal.js';
import { portraitUrl, UNKNOWN_STANDING } from '../portraits.js';
import { TAVERN_VISITORS, standingSprite } from '../content/tavern-visitors.js';
import { galNpcPortrait } from '../content/gal-npc-portraits.js';
import { createEventScope } from '../shared/events.js';
import { createGalWorkspace } from './gal-workspace.js';
import { decorateGalButtons } from './gal-icons.js';
import { activeModal, createPopoverSurface } from '../shared/top-layer.js';

/** One application-owned visual-novel stage, shared by dialogue, story and both chat readers. */
export function createGalPlayer(context) {
  const events = createEventScope();
  const panel = document.createElement('section');
  panel.id = 'gal-stage';
  panel.className = 'gal-stage';
  const surface = createPopoverSurface(panel);
  panel.setAttribute('aria-label', 'Gal剧情演出');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML = `<div class="gal-vignette"></div><div class="gal-cast" aria-hidden="true"></div>
    <nav class="gal-controls" aria-label="演出控制"><span class="gal-chapter"></span></nav>
    <section class="gal-reading"><div class="gal-speaker"><img hidden alt=""/><span></span><small></small></div><div class="gal-bonuses"></div><button class="gal-page" type="button" aria-label="展开全文或继续"><span class="gal-text"></span><span class="gal-cursor" aria-hidden="true">◇</span></button><div class="gal-footer"><small class="gal-count"></small><span class="gal-hint">点击展开 · 再点继续</span></div></section>
    <div class="gal-actionbar"><nav class="gal-quick-menu" aria-label="阅读控制"><button data-gal="back">‹ 回退</button><button data-gal="next">继续 ›</button><button data-gal="skip" aria-pressed="false">快进</button><button data-gal="auto" aria-pressed="false">自动</button><button data-gal="history">本次对话</button><button data-gal="hide">隐藏</button><button data-gal="journal">剧情</button><button data-gal="compose">交流</button><button data-gal="close">退出</button></nav></div>
    <section class="gal-history" hidden aria-label="本次对话"><header><h2>本次对话</h2><button data-gal="history-close">返回演出</button></header><ol class="gal-dialogue-list" tabindex="0"></ol><p class="gal-dialogue-empty" hidden>还没有可以回看的对话。</p></section>`;
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
  let readOwner;
  let skip = false;
  let finishing = false;
  let transitionEpoch = 0;
  let exitAnimations = [];
  let suspendedModal = null;
  const workspace = createGalWorkspace(panel, events, {
    show: showPanel,
    exit: () => part('[data-gal="close"]').click(),
    pause() {
      auto = skip = false;
      clearTimeout(autoTimer);
    },
  });
  decorateGalButtons(panel);
  function showPanel(title) {
    transitionEpoch++;
    for (const animation of exitAnimations) animation.cancel();
    exitAnimations = [];
    delete panel.dataset.leaving;
    // A body-owned popover has no inherited dialog filter/backdrop rectangle.
    surface.hide();
    const modal = suspendedModal ? null : activeModal(document);
    (modal || document.body).append(panel);
    panel.hidden = Boolean(suspendedModal);
    document.body.classList.toggle('gal-playing', !suspendedModal);
    sceneVisibility(true);
    part('.gal-chapter').textContent = title || '万象 · 片刻';
    const history = part('[data-gal="history"]');
    const label = workspace.active?.history?.length ? '交流记录' : '本次对话';
    history.title = label;
    history.setAttribute('aria-label', label);
    history.querySelector('.gal-control-label').textContent = label;
    if (!suspendedModal) surface.show();
  }
  function sceneVisibility(visible) {
    for (const frame of document.querySelectorAll('#inn-frame iframe')) {
      frame.contentDocument?.body?.classList.toggle('gal-covered', visible);
      frame.contentWindow?.postMessage({ type: 'gal-visibility', visible }, location.origin);
    }
  }
  function actors() {
    const library = context.session.ai.library;
    const protagonistId = library.campaign?.protagonistId;
    const members = library.characters.map((member) => {
      const official = member.source === 'official';
      const key = member.combat?.id;
      const sprite = official ? TAVERN_VISITORS.find((entry) => entry.combatId === key) : null;
      return {
        id: member.id,
        name: member.setting.name,
        avatar: portraitUrl(member.combat),
        user: member.id === protagonistId,
        sprite:
          member.combat?.customStanding ||
          (member.questRecruit
            ? UNKNOWN_STANDING
            : sprite
              ? standingSprite(sprite)
              : galNpcPortrait({
                  id: member.id,
                  name: member.setting.name,
                  setting: member.setting.worldbook,
                })),
        fullSprite: true,
        aliases: official
          ? { edith: ['伊迪斯', '伊蒂丝'], pandora: ['潘多拉'], aegis: ['月汐', '长景月汐'] }[
              key
            ] || []
          : [],
      };
    });
    members.push(...(context.quests?.actors() || []));
    // Tutorial speakers can be present before their official library entry is recruited.
    for (const [key, name, aliases] of [
      ['edith', '伊蒂丝', ['伊迪斯']],
      ['pandora', '潘多拉', []],
      ['yuexi', '长景月汐', ['月汐']],
    ])
      if (!members.some((actor) => actor.name === name))
        members.push({
          id: `gal-${key}`,
          name,
          aliases,
          sprite: standingSprite(TAVERN_VISITORS.find((entry) => entry.id === key)),
          fullSprite: true,
        });
    for (const npc of context.session.ai.activeScript?.npcs || [])
      if (!members.some((actor) => actor.id === npc.id || actor.name === npc.name))
        members.push({
          id: npc.id || `npc:${npc.name}`,
          name: npc.name,
          npc: true,
          sprite: galNpcPortrait(npc),
          fullSprite: true,
        });
    const invited = context.daily?.invitedMember();
    for (const person of [
      ...(context.daily?.chatCharacters() || []),
      ...(invited ? [invited] : []),
    ])
      if (!members.some((actor) => actor.id === person.id || actor.name === person.setting.name))
        members.push({
          id: person.id,
          name: person.setting.name,
          sprite: person.combat.customStanding || galNpcPortrait(person.setting),
          fullSprite: true,
        });
    return members;
  }
  function stop() {
    clearInterval(timer);
    clearTimeout(autoTimer);
    timer = autoTimer = null;
    typing = false;
  }
  function hide() {
    transitionEpoch++;
    for (const animation of exitAnimations) animation.cancel();
    exitAnimations = [];
    delete panel.dataset.leaving;
    stop();
    panel.dataset.playing = 'false';
    panel.classList.remove('gal-ui-hidden');
    surface.hide();
    panel.hidden = true;
    document.body.classList.remove('gal-playing');
    sceneVisibility(false);
    part('.gal-cast').replaceChildren();
    part('.gal-history').hidden = true;
    stage = [];
  }
  async function animateExit() {
    stop();
    if (panel.hidden) return true;
    const epoch = ++transitionEpoch;
    panel.dataset.leaving = 'true';
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 360;
    exitAnimations = [];
    for (const [index, image] of [...part('.gal-cast').children].entries()) {
      const direction =
        image.dataset.position === 'left'
          ? -1
          : image.dataset.position === 'right'
            ? 1
            : index % 2
              ? 1
              : -1;
      exitAnimations.push(
        image.animate(
          [
            { opacity: 1, translate: '0 0' },
            { opacity: 0, translate: direction * 110 + 'vw 0' },
          ],
          { duration, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
        ),
      );
    }
    for (const node of panel.querySelectorAll(
      '.gal-reading,.gal-composer,.gal-actionbar,.gal-side,.gal-archive',
    )) {
      if (node.hidden) continue;
      exitAnimations.push(
        node.animate(
          [
            { opacity: 1, translate: '0 0' },
            { opacity: 0, translate: '0 110%' },
          ],
          { duration, easing: 'ease-in', fill: 'forwards' },
        ),
      );
    }
    await Promise.all(exitAnimations.map((animation) => animation.finished.catch(() => {})));
    if (epoch !== transitionEpoch) return false;
    for (const animation of exitAnimations) animation.cancel();
    exitAnimations = [];
    delete panel.dataset.leaving;
    part('.gal-cast').replaceChildren();
    stage = [];
    return true;
  }
  async function finish(completed = true, closeWorkspace = false) {
    if (!current) return;
    const job = current;
    current = null;
    finishing = true;
    const exited = completed ? await animateExit() : true;
    if (exited) {
      if (closeWorkspace) workspace.close();
      if (workspace.active) {
        stop();
        workspace.playing(false);
      } else hide();
    }
    finishing = false;
    job.resolve();
    document.dispatchEvent(
      new CustomEvent('gal-finished', { detail: { owner: job.owner, completed } }),
    );
    if (completed) job.onComplete?.();
    startNext();
  }
  function schedule() {
    clearTimeout(autoTimer);
    if (
      !suspendedModal &&
      (auto || skip) &&
      current &&
      !document.hidden &&
      part('.gal-history').hidden
    )
      autoTimer = setTimeout(
        advance,
        skip ? 160 : Math.max(1600, current.pages[pageIndex].text.length * 45),
      );
  }
  function reveal() {
    if (!current) return;
    stop();
    part('.gal-text').textContent = current.pages[pageIndex].text
      .trim()
      .replace(/\n[ \t]*\n+/gu, '\n');
    panel.dataset.typing = 'false';
    current.onRead?.(current.pages[pageIndex]);
    part('.gal-hint').textContent =
      pageIndex === current.pages.length - 1 ? '点击结束本段' : '点击继续';
    schedule();
  }
  function paginate(beat, capacity) {
    let offset = beat.offset || 0;
    return paginateGalBeat(beat, capacity).map((page) => {
      const result = { ...page, offset };
      offset += page.text.length;
      return result;
    });
  }
  function speakerName(beat, actor) {
    if (beat.type === 'narration') return '旁白';
    const level = beat.speaker?.match(/\s*·\s*Lv\.\d+$/u)?.[0] || '';
    return actor ? actor.name + level : beat.speaker || '来客';
  }
  function showHistory() {
    const source =
      !current || current.owner === workspace.active?.owner ? workspace.active?.transcript : null;
    if (!source && workspace.active?.history?.length) return workspace.history();
    clearTimeout(autoTimer);
    const known = cast.length ? cast : actors();
    const playerId = context.session.ai.library.campaign?.protagonistId;
    const completed = (source?.() || [])
      .filter((beat) => beat.text)
      .map((beat) => ({
        name: speakerName(beat, resolveGalActor(beat.speaker, known, playerId)),
        text: beat.text,
      }));
    const visible =
      current || (!source && workspace.active?.owner === readOwner) ? read.filter(Boolean) : [];
    const rows = [...completed, ...visible];
    const list = part('.gal-dialogue-list');
    list.replaceChildren(
      ...rows.map((line) => {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = line.name;
        const text = document.createElement('p');
        text.textContent = line.text;
        item.append(name, text);
        return item;
      }),
    );
    list.hidden = !rows.length;
    part('.gal-dialogue-empty').hidden = !!rows.length;
    part('.gal-history').hidden = false;
    list.scrollTop = 0;
    part('[data-gal="history-close"]').focus({ preventScroll: true });
  }
  function closeHistory() {
    part('.gal-history').hidden = true;
    part('[data-gal="history"]').focus({ preventScroll: true });
    if (!typing) schedule();
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
      void fade.finished
        .catch(() => {})
        .then(() => {
          if (image.dataset.leaving) image.remove();
        });
    }
    stage.forEach((id, index) => {
      const actor = cast.find((entry) => entry.id === id);
      if (!actor?.sprite) return;
      let image = [...container.children].find((entry) => entry.dataset.actor === id);
      if (!image) {
        image = document.createElement('img');
        image.dataset.actor = id;
        image.dataset.full = String(actor.fullSprite === true);
        void context.assets.attach(image, actor.sprite).catch(() => image.remove());
        image.alt = actor.name;
        image.addEventListener('error', () => image.remove(), { once: true });
        container.append(image);
      }
      if (image.dataset.leaving) {
        delete image.dataset.leaving;
        image.getAnimations().forEach((animation) => animation.cancel());
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
    stage = [];
    for (const previous of current.pages.slice(0, pageIndex + 1)) {
      const person = resolveGalActor(
        previous.speaker,
        cast,
        context.session.ai.library.campaign?.protagonistId,
      );
      stage = nextGalStage(stage, previous, person);
    }
    if (
      workspace.active?.owner === current.owner &&
      current.owner !== 'quick-chat' &&
      !workspace.active.followSpeakers &&
      Array.isArray(workspace.active.actors)
    )
      stage = selectedGalStage(
        workspace.active.actors || [],
        cast,
        context.session.ai.library.campaign?.protagonistId,
      );
    if (!beat.text.trim()) {
      pageIndex++;
      render();
      return;
    }
    const narration = beat.type === 'narration';
    panel.dataset.kind = narration ? 'narration' : actor?.user ? 'user' : 'dialogue';
    panel.dataset.owner = current.owner;
    panel.dataset.automatic = String(current.automatic === true);
    part('[data-gal="compose"]').hidden = current.mandatory === true || Boolean(workspace.active);
    part('[data-gal="journal"]').hidden =
      current.mandatory === true || !context.session.ai.activeScript || Boolean(workspace.active);
    renderCast(narration ? null : actor?.id);
    const name = speakerName(beat, actor);
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
    const end = beat.offset + beat.text.length;
    if (!read[beat.beatIndex] || read[beat.beatIndex].end < end)
      read[beat.beatIndex] = { name, text: current.beats[beat.beatIndex].text.slice(0, end), end };
    part('[data-gal="back"]').disabled = pageIndex === 0;
    const characters = Array.from(beat.text.trim().replace(/\n[ \t]*\n+/gu, '\n'));
    let count = 0;
    typing = true;
    panel.dataset.typing = 'true';
    if (skip) return reveal();
    if (suspendedModal) return;
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
    if (current || finishing || !pending.length) return;
    current = pending.shift();
    skip = false;
    part('[data-gal="skip"]').setAttribute('aria-pressed', 'false');
    cast = galActorsForBeats(actors(), current.pages);
    stage = [];
    read = [];
    readOwner = current.owner;
    pageIndex = 0;
    showPanel(current.title);
    workspace.playing(true);
    part('[data-gal="close"]').hidden = current.mandatory === true;
    if (!suspendedModal) panel.focus({ preventScroll: true });
    render();
  }
  events.on(part('.gal-page'), 'click', advance);
  events.on(panel, 'pointerdown', (event) => event.stopPropagation());
  events.on(panel, 'click', (event) => {
    event.stopPropagation();
    if (
      !panel.classList.contains('gal-ui-hidden') &&
      !event.target.closest(
        'button, input, textarea, select, a, summary, .gal-side, .gal-composer, .gal-archive, .gal-tools, .gal-history, .gal-controls, .gal-actionbar',
      ) &&
      event.clientY > innerHeight * 0.12 &&
      event.clientY < innerHeight * 0.74
    ) {
      if (current) advance();
      else if (workspace.active) part('[data-gal="close"]').click();
      return;
    }
    const action = event.target.closest('[data-gal]')?.dataset.gal;
    if (action === 'close') {
      if (workspace.active?.persistent) {
        if (current) void finish(true).then(() => workspace.collapse(true));
        else workspace.collapse(true);
      } else if (current) void finish(true, true);
      else if (panel.dataset.leaving !== 'true')
        void animateExit().then((exited) => {
          if (exited) {
            workspace.close();
            hide();
          }
        });
    }
    if (action === 'back' && current) {
      auto = skip = false;
      do {
        pageIndex--;
      } while (pageIndex > 0 && !current.pages[pageIndex].text);
      pageIndex = Math.max(0, pageIndex);
      render();
      reveal();
    }
    if (action === 'next') advance();
    if (action === 'skip') {
      skip = !skip;
      auto = false;
      part('[data-gal="skip"]').setAttribute('aria-pressed', String(skip));
      if (typing) reveal();
      else schedule();
    }
    if (action === 'hide') panel.classList.add('gal-ui-hidden');
    if (action === 'compose') document.dispatchEvent(new CustomEvent('gal-compose'));
    if (action === 'journal') document.dispatchEvent(new CustomEvent('gal-open-script'));
    if (action === 'auto') {
      auto = !auto;
      skip = false;
      part('[data-gal="auto"]').setAttribute('aria-pressed', String(auto));
      if (!typing) schedule();
    }
    if (action === 'history') showHistory();
    if (action === 'history-close') closeHistory();
  });
  events.on(panel, 'click', (event) => {
    if (panel.classList.contains('gal-ui-hidden') && !event.target.closest('[data-gal="hide"]')) {
      panel.classList.remove('gal-ui-hidden');
      event.preventDefault();
    }
  });
  events.on(
    window,
    'keydown',
    (event) => {
      if (event.target.closest?.('dialog[open]') && !panel.contains(event.target)) return;
      if (!part('.gal-history').hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeHistory();
        }
        return;
      }
      if (event.target.closest?.('textarea,input,select')) return;
      if (!current || ![' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key))
        return;
      if (event.target.closest?.('[data-gal]') && [' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'ArrowLeft') part('[data-gal="back"]').click();
      else if (event.key === 'Escape' && !current.mandatory) part('[data-gal="close"]').click();
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
    const remaining = current.pages.slice(pageIndex).flatMap((beat) => paginate(beat, capacity));
    current.pages = [...current.pages.slice(0, pageIndex), ...remaining];
    current.capacity = capacity;
    render();
  });
  return {
    get enabled() {
      return true;
    },
    get owner() {
      return current?.owner;
    },
    actors,
    suspendForModal(dialog) {
      if (panel.hidden || suspendedModal === dialog) return;
      suspendedModal = dialog;
      stop();
      surface.hide();
      panel.hidden = true;
      document.body.append(panel);
      document.body.classList.remove('gal-playing');
      events.on(
        dialog,
        'close',
        () => {
          if (suspendedModal !== dialog) return;
          suspendedModal = null;
          if (!current && !workspace.active) return;
          showPanel(current?.title || workspace.active?.title);
          if (current) render();
        },
        { once: true },
      );
    },
    workspace(options) {
      if (current) finish(false);
      workspace.open(options);
      part('[data-gal="close"]').hidden = false;
      part('[data-gal="journal"]').hidden = true;
      part('[data-gal="compose"]').hidden = true;
      part('.gal-text').textContent = '';
      part('.gal-cast').replaceChildren();
      cast = actors();
      stage = selectedGalStage(
        options.actors || [],
        cast,
        context.session.ai.library.campaign?.protagonistId,
      );
      renderCast(null);
    },
    selection(ids) {
      if (!workspace.active) return;
      workspace.active.actors = [...ids];
      cast = actors();
      stage = selectedGalStage(ids, cast, context.session.ai.library.campaign?.protagonistId);
      renderCast(null);
    },
    collapseComposer(value) {
      workspace.collapse(value);
    },
    waiting() {
      if (current) void finish(false);
      stop();
      workspace.feedback(workspace.active?.owner, '');
      workspace.playing(true);
      panel.dataset.kind = 'narration';
      panel.dataset.typing = 'false';
      part('.gal-speaker span').textContent = '提示';
      part('.gal-speaker small').textContent = 'WAIT';
      part('.gal-speaker img').hidden = true;
      part('.gal-speaker img').removeAttribute('src');
      part('.gal-bonuses').replaceChildren();
      part('.gal-cast')
        .querySelectorAll('.speaking')
        .forEach((actor) => actor.classList.remove('speaking'));
      part('.gal-text').textContent = '正在生成回复……';
      part('.gal-count').textContent = '';
      part('.gal-hint').textContent = '请稍候';
    },
    settled(owner) {
      if (workspace.active?.owner === owner && !current) workspace.playing(false);
    },
    feedback(owner, text) {
      workspace.feedback(owner, text);
    },
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
          beats,
          pages: beats.flatMap((beat, beatIndex) => paginate({ ...beat, beatIndex }, capacity)),
          capacity,
          resolve,
        });
        startNext();
      });
    },
    cancel(owner) {
      for (let index = pending.length - 1; index >= 0; index--)
        if (!owner || pending[index].owner === owner) pending.splice(index, 1)[0].resolve();
      if (workspace.active && (!owner || workspace.active.owner === owner)) workspace.close();
      if (current && (!owner || current.owner === owner)) finish(false);
      if (!current && !workspace.active) hide();
    },
    dispose() {
      workspace.clear();
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
