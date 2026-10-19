import { html } from '../shared/html.js';
import { HEROES, BOSSES } from '../data.js';
import { escapeText } from '../ui.js';
import { characterSheet } from './character-sheet.js';
import { query as $ } from './dom.js';
import { portraitUrl, saveCustomPortrait } from '../portraits.js';
import { preparationEquipment } from './equipment.js';
import { equippedDefinitions } from '../equipment.js';

/** @param {import('./context.js').AppContext} context */
export function createShell(context) {
  const { session } = context;
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
  function mountInn() {
    const frame = document.createElement('iframe');
    frame.src =
      session.ai.library.campaign?.tutorial === 'arrival'
        ? './tavern.html?arrival=1'
        : './tavern.html';
    frame.title = '第一人称万象酒馆';
    context.audio.attachFrame(frame);
    $('#inn-frame').replaceChildren(frame);
    $('#party-panel').close();
  }
  function setCustomPortrait(heroId, dataUrl) {
    const member = session.ai.library.characters.find((entry) => entry.id === heroId);
    const index = session.ai.library.party.indexOf(heroId);
    const slotId = index >= 0 ? HEROES[index].id : null;
    if (!member) return;
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
    const slot = session.ai.preparationSlot;
    $('#prepare-slots').innerHTML = library.party
      .map((id, index) => {
        const entry = library.characters.find((entry) => entry.id === id);
        if (!entry)
          return html`<button
            class="prepare-slot ${slot === index ? 'selected' : ''}"
            data-prepare-slot="${index}"
          >
            <small>${index < 3 ? '前场' : '后场'} · ${(index % 3) + 1}</small><span>＋</span
            ><strong>空位</strong>
          </button>`;
        return html`<button
          class="prepare-slot ${slot === index ? 'selected' : ''}"
          data-prepare-slot="${index}"
          aria-pressed="${slot === index}"
        >
          <small>${index < 3 ? '前场' : '后场'} · ${(index % 3) + 1}</small
          ><img src="${portraitUrl(entry.combat)}" alt="" /><strong
            >${escapeText(entry.setting.name)}</strong
          >${entry.id === library.campaign?.protagonistId ? '<small>主角 · 固定出战</small>' : ''}
        </button>`;
      })
      .join('');
    $('#prepare-count').textContent = `${library.characters.length} 位`;
    $('#prepare-pool').innerHTML = library.characters
      .map(
        (entry) =>
          html`<button
            class="prepare-member ${session.ai.preparationCharacter === entry.id ? 'selected' : ''}"
            data-prepare-view="${entry.id}"
          >
            <img src="${portraitUrl(entry.combat)}" alt="" /><strong
              >${escapeText(entry.setting.name)}</strong
            >
          </button>`,
      )
      .join('');
    const inspected =
      library.characters.find((entry) => entry.id === session.ai.preparationCharacter) ||
      library.characters.find((entry) => entry.id === library.party[slot]) ||
      library.characters[0];
    if (!inspected) {
      $('#prepare-detail').textContent = '尚无角色，请先创建主角。';
      return;
    }
    const equipped = library.party.indexOf(inspected.id);
    $('#prepare-detail').innerHTML =
      `<button class="prepare-assign primary" data-prepare-use="${inspected.id}">放入${slot < 3 ? '前场' : '后场'} ${(slot % 3) + 1}</button><button data-equipment-focus>调整装备</button>` +
      characterSheet(inspected, equippedDefinitions(library, inspected)) +
      preparationEquipment(library, inspected) +
      (equipped >= 0 && library.campaign && inspected.id !== library.campaign.protagonistId
        ? html`<button data-prepare-remove="${equipped}">留在酒馆</button>`
        : '') +
      html`<div class="portrait-tools">
        <button data-edit-portrait="${inspected.id}">本地立绘</button
        ><button data-portrait-url="${inspected.id}">图床链接</button
        ><button data-reset-portrait="${inspected.id}">恢复默认</button>
      </div>`;
    $('#prepare-status').textContent = session.ai.departureParty
      ? '正在生成剧本 · 出发名单已锁定，可交换站位与装备'
      : `阵容自动保存 · 剧本 ${library.scripts.length} 篇 · 历史 ${library.history.length} 条`;
    for (const button of document.querySelectorAll('[data-prepare-remove]'))
      button.disabled = !!session.ai.departureParty;
    for (const button of document.querySelectorAll('[data-prepare-use]'))
      button.disabled =
        !!session.ai.departureParty &&
        !session.ai.departureParty.includes(button.dataset.prepareUse);
    context.equipment?.refresh();
  }
  return { showRoute, toast, mountInn, renderParty, setCustomPortrait };
}
