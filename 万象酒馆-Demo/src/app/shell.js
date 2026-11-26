import { rearUnlocked } from '../formation-access.js';
import { html } from '../shared/html.js';
import { HEROES, BOSSES } from '../data.js';
import { escapeText, shortCharacterName } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl, saveCustomPortrait, UNKNOWN_STANDING } from '../portraits.js';
import { prepDetailMarkup } from './prep-view.js';
import { TAVERN_VISITORS } from '../content/tavern-visitors.js';
import { explorationHref } from '../exploration/scenes.js';
import { tavernTime } from '../daily.js';
import { grownCombat } from '../growth.js';

/** @param {import('./context.js').AppContext} context */
export function createShell(context) {
  const visitorRefresh = document.createElement('button');
  visitorRefresh.id = 'scene-visitors-refresh';
  visitorRefresh.textContent = '换位 ↻';
  visitorRefresh.title = '重新分布当前场景中的角色';
  visitorRefresh.hidden = true;
  document.querySelector('#ai-open').before(visitorRefresh);
  const returnTavern = document.createElement('button');
  returnTavern.id = 'scene-return-tavern';
  returnTavern.textContent = '返回酒馆';
  returnTavern.hidden = true;
  document.querySelector('#ai-open').before(returnTavern);
  context.events.on(returnTavern, 'click', () => {
    if (session.runtime.mode !== 'inn') return;
    if (context.daily?.onInvitation()) return context.shell.toast('请先在约见中结束本次同行。');
    if (context.daily?.returnOuting()) return;
    context.chat?.leave();
    context.daily?.goHome();
  });
  context.events.on(visitorRefresh, 'click', () => {
    document
      .querySelector('#inn-frame iframe')
      ?.contentWindow?.postMessage({ type: 'tavern-visitors-refresh' }, location.origin);
  });
  const { session } = context;
  let innLoadingTimer = null;
  function setInnSceneLoading(active) {
    clearTimeout(innLoadingTimer);
    innLoadingTimer = null;
    const shouldHide = Boolean(active && !session.runtime.needsStart);
    document.body.classList.toggle('inn-scene-loading', shouldHide);
    if (shouldHide) {
      innLoadingTimer = setTimeout(() => {
        document.body.classList.remove('inn-scene-loading');
        context.ledger?.sync?.();
      }, 6000);
    }
    context.ledger?.sync?.();
  }
  function showRoute() {
    const container = $('#boss-options');
    container.innerHTML = BOSSES.map(
      (b) =>
        html`<button
          class="boss-option ${session.journey.bossChoice === b.id ? 'selected' : ''}"
          data-boss="${b.id}"
          aria-pressed="${session.journey.bossChoice === b.id}"
        >
          <img src="${portraitUrl(b)}" alt="" /><span
            ><strong>${b.name}</strong
            ><small
              >${b.id === 'bossGate' ? '遗迹终点 · 铁皮、护盾与多位置震击' : b.id === 'bossTide' ? '星殿终点 · 潮灯、星环与潮汐震荡' : '古林终点 · 再生、中毒与根系束缚'}<br />半血后进入第二阶段
              · ${b.hp}生命</small
            ></span
          >
        </button>`,
    ).join('');
    container.querySelectorAll('[data-boss]').forEach(
      (b) =>
        (b.onclick = () => {
          session.journey.bossChoice = b.dataset.boss;
          showRoute();
        }),
    );
    if (!$('#route').open) $('#route').showModal();
  }
  function toast(text) {
    $('#toast').textContent = text;
    $('#toast').classList.add('visible');
    clearTimeout(session.runtime.toastTimer);
    session.runtime.toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
  }
  function mountInn(returnTo = null) {
    document.body.classList.remove('street-atlas-open');
    const innFrame = $('#inn-frame');
    const hadFrame = Boolean(innFrame?.firstElementChild);
    setInnSceneLoading(hadFrame);
    const frame = document.createElement('iframe');
    frame.src =
      returnTo && !['gate', 'tavern'].includes(returnTo)
        ? explorationHref(returnTo, tavernTime(session.ai.library.daily))
        : session.ai.library.campaign?.tutorial === 'arrival'
          ? './tavern.html?arrival=1'
          : returnTo === 'gate'
            ? './tavern.html?return=gate'
            : './tavern.html';
    frame.title = '第一人称万象酒馆';
    context.audio.attachFrame(frame);
    context.events.on(frame, 'load', syncInnVisitors);
    context.events.on(frame, 'error', () => setInnSceneLoading(false));
    innFrame.replaceChildren(frame);
    $('#party-panel').close();
  }
  function canShowVisitorRefresh() {
    return (
      session.runtime.mode === 'inn' &&
      !session.runtime.needsStart &&
      session.ai.generationOptions?.developerMode === true
    );
  }
  function syncInnVisitors() {
    const frame = $('#inn-frame iframe');
    const available =
      session.runtime.mode === 'inn' &&
      !session.runtime.needsStart &&
      frame?.contentDocument?.querySelector('#visitor-refresh')?.hidden === false;
    visitorRefresh.dataset.available = String(available);
    visitorRefresh.hidden = !available || !canShowVisitorRefresh();
    context.ledger?.sync?.();
    if (!frame) return;
    const characters = TAVERN_VISITORS.flatMap((definition) => {
      const member =
        session.ai.library.characters.find(
          (entry) => entry.source === 'official' && entry.combat.id === definition.combatId,
        ) ||
        context.daily
          ?.chatCharacters()
          .find((entry) => entry.source === 'town' && entry.combat.id === definition.combatId);
      return member
        ? [{ key: definition.id, id: member.id, image: member.combat.customStanding || null }]
        : [];
    });
    for (const member of session.ai.library.characters) {
      const image = member.combat.customStanding || (member.questRecruit ? UNKNOWN_STANDING : null);
      if (!image || characters.some((entry) => entry.id === member.id)) continue;
      characters.push({
        key: member.id,
        id: member.id,
        name: member.setting.name,
        image,
      });
    }
    frame.contentWindow?.postMessage(
      {
        type: 'tavern-visitors',
        enabled: true,
        characters,
      },
      location.origin,
    );
  }
  context.events.on(window, 'message', (event) => {
    const innWin = $('#inn-frame iframe')?.contentWindow;
    const atlasWin = $('#daily-atlas-frame')?.contentWindow;
    if (event.origin !== location.origin || (event.source !== innWin && event.source !== atlasWin))
      return;
    if (event.data?.type === 'tavern-workshop') void context.workshop.open();
    if (event.data?.type === 'tavern-vending') context.shop.open({ vendingMachine: true });
    if (['street-map-state', 'scene-ready'].includes(event.data?.type)) {
      const innOpen = Boolean(
        $('#inn-frame iframe')?.contentDocument?.getElementById('street-map')?.open,
      );
      const atlasEl = $('#daily-atlas-frame');
      const atlasOpen = Boolean(
        atlasEl && !atlasEl.hidden && atlasEl.contentDocument?.getElementById('street-map')?.open,
      );
      document.body.classList.toggle('street-atlas-open', innOpen || atlasOpen);
      context.ledger?.syncTopLayer?.();
    }
    if (event.source !== innWin) return;
    if (event.data?.type === 'tavern-visitors-request') syncInnVisitors();
    if (event.data?.type === 'scene-ready') {
      setInnSceneLoading(false);
      const upstairs = ['corridor', 'guest-room', 'master-bedroom'].includes(event.data.scene);
      returnTavern.textContent = upstairs ? '回到大厅' : '返回酒馆';
      returnTavern.hidden =
        !upstairs || session.runtime.mode !== 'inn' || session.runtime.needsStart;
      context.ledger?.sync?.();
    }
    if (event.data?.type === 'tavern-visitors-availability') {
      const available =
        event.data.available === true &&
        session.runtime.mode === 'inn' &&
        !session.runtime.needsStart;
      visitorRefresh.dataset.available = String(available);
      visitorRefresh.hidden = !available || !canShowVisitorRefresh();
      context.ledger?.sync?.();
    }
  });
  function setCustomPortrait(heroId, dataUrl, kind = 'card') {
    const member = session.ai.library.characters.find((entry) => entry.id === heroId);
    const index = session.ai.library.party.indexOf(heroId);
    const slotId = index >= 0 ? HEROES[index].id : null;
    if (!member) return;
    if (kind === 'standing') {
      saveCustomPortrait(member.id + ':standing', dataUrl);
      if (dataUrl) member.combat.customStanding = dataUrl;
      else delete member.combat.customStanding;
      context.generation.save();
      syncInnVisitors();
      renderParty();
      return;
    }
    saveCustomPortrait(member.id, dataUrl);
    if (member?.combat) {
      if (dataUrl) member.combat.customPortrait = dataUrl;
      else delete member.combat.customPortrait;
    }
    context.generation.save();
    if (!slotId) {
      renderParty();
      return;
    }
    if (!session.battle.state.heroDefinitions) {
      session.battle.state.heroDefinitions = {};
    }
    const current = session.battle.state.heroDefinitions[slotId] || context.roster.get(slotId);
    if (current) {
      session.battle.state.heroDefinitions[slotId] = {
        ...structuredClone(current),
        customPortrait: dataUrl || undefined,
      };
      if (!dataUrl) delete session.battle.state.heroDefinitions[slotId].customPortrait;
    }
    if (session.journey.expedition?.heroDefinitions) {
      const expDef = session.journey.expedition.heroDefinitions[slotId] || member.combat;
      if (expDef) {
        session.journey.expedition.heroDefinitions[slotId] = {
          ...structuredClone(expDef),
          customPortrait: dataUrl || undefined,
        };
        if (!dataUrl) delete session.journey.expedition.heroDefinitions[slotId].customPortrait;
      }
    }
    renderParty();
    if (session.runtime.mode === 'battle') {
      context.renderer?.render?.();
      context.details?.render?.();
    }
    const hero = member.combat;
    toast(
      dataUrl ? `${hero?.name || '角色'} 立绘已更新` : `${hero?.name || '角色'} 已恢复默认立绘`,
    );
    context.saves?.autoSave?.('更新角色立绘');
  }
  function renderParty() {
    const library = session.ai.library;
    const panel = $('#party-panel');
    const previous = new Map();
    if (panel.open)
      for (const element of panel.querySelectorAll('[data-prepare-hero]'))
        previous.set(element.dataset.prepareHero, element.getBoundingClientRect());
    const slot = session.ai.preparationSlot;
    panel.classList.toggle('formation-locked', session.ai.formationLocked === true);
    panel.classList.toggle('rear-locked', !rearUnlocked(library));
    const maxSlots = rearUnlocked(library) ? 6 : 3;
    const deployedMembers = library.party
      .slice(0, maxSlots)
      .map((id) => (id ? library.characters.find((member) => member.id === id) : null))
      .filter(Boolean);
    const deployedStats = deployedMembers.map((member) => grownCombat(member));
    const frontHp = library.party.slice(0, 3).reduce((sum, id) => {
      const m = id ? library.characters.find((member) => member.id === id) : null;
      return sum + (m ? grownCombat(m).hp : 0);
    }, 0);
    const teamPower = deployedStats.reduce(
      (sum, s) => sum + s.hp + Math.round(s.mp / 2) + s.attack * 8 + s.level * 10,
      0,
    );
    const avgLv = deployedStats.length
      ? (deployedStats.reduce((sum, s) => sum + s.level, 0) / deployedStats.length).toFixed(1)
      : '0';
    const deployedCountEl = $('#prepare-deployed-count');
    if (deployedCountEl)
      deployedCountEl.textContent = `DEPLOY ${deployedMembers.length}/${maxSlots}`;
    const metricsEl = $('#prepare-team-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `<div><small>队伍战力</small><b>${teamPower.toLocaleString()}</b></div>
        <div><small>前场生命</small><b>${frontHp}</b></div>
        <div><small>平均等级</small><b>${avgLv}</b></div>`;
    }
    const etherEl = $('#prepare-ether-amt');
    if (etherEl) etherEl.textContent = `以太 ${library.inventory?.ether || 0}`;
    const goldEl = $('#prepare-gold-amt');
    if (goldEl) goldEl.textContent = `金币 ${library.inventory?.gold || 0}`;

    $('#prepare-slots').innerHTML = library.party
      .slice(0, maxSlots)
      .map((id, index) => {
        const entry = library.characters.find((member) => member.id === id);
        const row =
          index % 3 === 0
            ? `<span class="formation-row-label ${index < 3 ? 'front' : 'back'}">${index < 3 ? '前场' : '后场'}</span>`
            : '';
        const tone = entry?.combat?.color || (index < 3 ? '#c99b4a' : '#5b8def');
        return (
          row +
          html`<button
            class="prepare-slot ${slot === index ? 'selected' : ''}"
            data-prepare-slot="${index}"
            ${entry ? `data-prepare-hero="${entry.id}"` : ''}
            style="--c:${escapeText(tone)}"
            draggable="${!!entry && !session.ai.formationLocked}"
            aria-pressed="${slot === index}"
            aria-label="${index < 3 ? '前场' : '后场'}${(index % 3) + 1}：${escapeText(entry?.setting.name || '空位')}"
          >
            ${
              entry
                ? html`<span class="prepare-drag-handle" aria-label="拖拽角色">⠿</span
                    ><span class="prepare-slot-lv">Lv.${grownCombat(entry).level}</span
                    ><img src="${portraitUrl(entry.combat)}" alt="" /><span class="pp-tile-name"
                      ><strong>${escapeText(shortCharacterName(entry.setting.name))}</strong></span
                    >${entry.id === library.campaign?.protagonistId ? '<span class="member-crown" title="主角">主</span>' : ''}`
                : '<span class="slot-plus"><i>＋</i><small>空位</small></span>'
            }
          </button>`
        );
      })
      .join('');
    const reserve = library.characters.filter((entry) => !library.party.includes(entry.id));
    $('#prepare-count').textContent = `${reserve.length}`;
    $('#prepare-pool').innerHTML =
      reserve
        .map((entry) => {
          const tone = entry.combat?.color || '#5b8def';
          return html`<button
            class="prepare-member ${session.ai.preparationCharacter === entry.id ? 'selected' : ''}"
            data-prepare-view="${entry.id}"
            data-prepare-hero="${entry.id}"
            aria-label="${escapeText(entry.setting.name)}"
            style="--c:${escapeText(tone)}"
            draggable="true"
          >
            <span class="prepare-drag-handle" aria-label="拖拽角色">⠿</span>
            <span class="prepare-slot-lv">Lv.${grownCombat(entry).level}</span>
            <img src="${portraitUrl(entry.combat)}" alt="" />
            <span class="pp-tile-name"
              ><strong>${escapeText(shortCharacterName(entry.setting.name))}</strong></span
            >
          </button>`;
        })
        .join('') || '<p class="prepare-empty">所有成员都已加入阵容</p>';
    const inspected =
      library.characters.find((entry) => entry.id === session.ai.preparationCharacter) ||
      library.characters.find((entry) => entry.id === library.party[slot]) ||
      library.characters[0];
    if (!inspected) {
      $('#prepare-detail').textContent = '尚无角色';
      $('#prepare-status').textContent = '尚无可用角色';
      return;
    }
    session.ai.preparationCharacter = inspected.id;
    $('#prepare-detail').innerHTML = prepDetailMarkup(
      library,
      inspected,
      session.ai.preparationTab || 'status',
    );
    $('#prepare-status').textContent = session.ai.formationLocked
      ? '本场编队已锁定 · 点击角色调整装备'
      : session.ai.departureParty
        ? '生成剧本中 · 名单锁定，可调整位置与装备'
        : `${library.party.filter(Boolean).length} / ${rearUnlocked(library) ? 6 : 3} 位出发 · 自动保存`;
    if (
      panel.open &&
      !matchMedia('(prefers-reduced-motion: reduce), (orientation: portrait)').matches
    ) {
      for (const element of panel.querySelectorAll('[data-prepare-hero]')) {
        const before = previous.get(element.dataset.prepareHero);
        const after = element.getBoundingClientRect();
        if (!before?.width || !after.width) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) + Math.abs(dy) < 2) continue;
        element.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px) scale(${before.width / after.width}, ${before.height / after.height})`,
            },
            { transform: 'none' },
          ],
          { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
    }
    context.equipment?.refresh();
  }
  return {
    showRoute,
    toast,
    mountInn,
    renderParty,
    setCustomPortrait,
    syncInnVisitors,
    dispose() {
      visitorRefresh.remove();
      returnTavern.remove();
    },
  };
}
