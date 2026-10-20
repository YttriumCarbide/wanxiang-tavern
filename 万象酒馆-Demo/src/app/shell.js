import { html } from '../shared/html.js';
import { HEROES, BOSSES } from '../data.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl, saveCustomPortrait } from '../portraits.js';
import { preparationEquipment } from './equipment.js';

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
  function mountInn(returnTo = null) {
    const frame = document.createElement('iframe');
    frame.src =
      session.ai.library.campaign?.tutorial === 'arrival'
        ? './tavern.html?arrival=1'
        : returnTo === 'gate'
          ? './tavern.html?return=gate'
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
    const panel = $('#party-panel');
    const previous = new Map();
    if (panel.open)
      for (const element of panel.querySelectorAll('[data-prepare-hero]'))
        previous.set(element.dataset.prepareHero, element.getBoundingClientRect());
    const slot = session.ai.preparationSlot;
    $('#prepare-slots').innerHTML = library.party
      .map((id, index) => {
        const entry = library.characters.find((member) => member.id === id);
        const row =
          index % 3 === 0
            ? `<span class="formation-row-label">${index < 3 ? '前场' : '后场'}</span>`
            : '';
        return (
          row +
          html`<button
            class="prepare-slot ${slot === index ? 'selected' : ''}"
            data-prepare-slot="${index}"
            ${entry ? `data-prepare-hero="${entry.id}"` : ''}
            draggable="${!!entry}"
            aria-pressed="${slot === index}"
            aria-label="${index < 3 ? '前场' : '后场'}${(index % 3) + 1}：${escapeText(entry?.setting.name || '空位')}"
          >
            ${entry ? html`<span class="prepare-drag-handle" aria-label="拖拽角色">⠿</span><img src="${portraitUrl(entry.combat)}" alt="" /><strong>${escapeText(entry.setting.name)}</strong>${entry.id === library.campaign?.protagonistId ? '<span class="member-crown" title="主角">主</span>' : ''}` : '<span class="slot-plus">＋</span><small>空位</small>'}
          </button>`
        );
      })
      .join('');
    const reserve = library.characters.filter((entry) => !library.party.includes(entry.id));
    const query = (session.ai.preparationSearch || '').trim().toLocaleLowerCase();
    const visible = reserve.filter((entry) =>
      entry.setting.name.toLocaleLowerCase().includes(query),
    );
    $('#prepare-count').textContent = `${reserve.length}`;
    $('#prepare-pool').innerHTML =
      visible
        .map(
          (entry) =>
            html`<button
              class="prepare-member ${session.ai.preparationCharacter === entry.id ? 'selected' : ''}"
              data-prepare-view="${entry.id}"
              data-prepare-hero="${entry.id}"
              draggable="true"
            >
              <span class="prepare-drag-handle" aria-label="拖拽角色">⠿</span
              ><img src="${portraitUrl(entry.combat)}" alt="" /><strong
                >${escapeText(entry.setting.name)}</strong
              >
            </button>`,
        )
        .join('') ||
      `<p class="prepare-empty">${query ? '没有找到这位角色' : '所有成员都已加入阵容'}</p>`;
    const inspected =
      library.characters.find((entry) => entry.id === session.ai.preparationCharacter) ||
      library.characters.find((entry) => entry.id === library.party[slot]) ||
      library.characters[0];
    if (!inspected) {
      $('#prepare-detail').textContent = '尚无角色';
      return;
    }
    $('#prepare-character-title').textContent = inspected.setting.name;
    $('#prepare-detail').innerHTML = html`<section class="prepare-portrait">
        <img
          src="${portraitUrl(inspected.combat)}"
          alt="${escapeText(inspected.setting.name)}的立绘"
        />
        <details class="prepare-portrait-tools">
          <summary>更换立绘</summary>
          <div>
            <button data-edit-portrait="${inspected.id}">本地图片</button>
            <button data-portrait-url="${inspected.id}">图床链接</button>
            <button data-reset-portrait="${inspected.id}">恢复默认</button>
          </div>
        </details>
      </section>
      <section class="prepare-character-controls">
        ${preparationEquipment(library, inspected)}
      </section>`;
    $('#prepare-status').textContent = session.ai.departureParty
      ? '生成剧本中 · 名单锁定，可调整位置与装备'
      : `${library.party.filter(Boolean).length} / 6 位出发 · 自动保存`;
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
  return { showRoute, toast, mountInn, renderParty, setCustomPortrait };
}
