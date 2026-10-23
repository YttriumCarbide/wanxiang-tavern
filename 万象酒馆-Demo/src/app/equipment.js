import { resourceText } from '../resource-text.js';
import { createRawResponse } from './raw-response.js';
import { EMBLEMS, equipEmblem } from '../emblems.js';
import { equip, buyEquipment, normalizeEquipment, EQUIPMENT_STATS } from '../equipment.js';
import { ITEMS } from '../content/items.js';
import { BUFFS } from '../data.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS } from '../triggers.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

export function equipmentDescription(item) {
  const effectText = (effect) =>
    effect.type === 'buff'
      ? `${BUFFS[effect.buff].name}+${effect.value}`
      : effect.type === 'cleanse'
        ? '净化' + effect.buffs.map((key) => BUFFS[key].name).join('、')
        : `${{ damage: '伤害', heal: '治疗', mana: '回蓝', shield: '护盾' }[effect.type]}${effect.value}`;
  const conditionText = (condition) => {
    const simple = {
      front: '在前场',
      rear: '在后场',
      hasPositive: '有正面状态',
      hasNegative: '有负面状态',
      hasBuff: '有状态',
      noBuff: '无状态',
      hasShield: '有护盾',
    };
    if (simple[condition.type]) return simple[condition.type];
    if (condition.type === 'buff') return `${BUFFS[condition.buff].name}≥${condition.value}层`;
    if (condition.type === 'roundAtLeast') return `第${condition.value}回合起`;
    return `${condition.type.startsWith('hp') ? '生命' : '法力'}${condition.type.endsWith('Below') ? '≤' : '≥'}${condition.value}%`;
  };
  return resourceText(
    [
      ...Object.entries(item.stats).map(([key, value]) => EQUIPMENT_STATS[key] + '+' + value),
      ...item.rules.map(
        (rule) =>
          `${rule.mode === 'continuous' ? '持续生效' : TRIGGER_EVENTS[rule.event] + '，每趟' + rule.limit + '次'}${rule.conditions.length ? '（' + rule.conditions.map(conditionText).join('，') + '）' : ''} → ${TRIGGER_TARGETS[rule.target]}：${rule.effects.map(effectText).join('、')}`,
      ),
    ].join('；'),
  );
}
export function preparationEquipment(library, member) {
  const currentEmblem = EMBLEMS[member.emblemId]?.emblem;
  return html`<section class="equipment-slots">
    <h3>角色装备</h3>
    <label class="prepare-emblem-row"
      ><span>纹章士</span
      ><select data-emblem-character="${member.id}" aria-label="装备纹章士">
        <option value="">未装备</option>
        ${(library.emblems || [])
          .map((id) => {
            const item = EMBLEMS[id]?.emblem;
            if (!item) return '';
            return `<option value="${item.id}" ${member.emblemId === item.id ? 'selected' : ''}>${item.title} · ${item.name}</option>`;
          })
          .join('')}</select
      ><small
        >${escapeText(resourceText(currentEmblem ? currentEmblem.text : '在各地Boss战中获得纹章士'))}</small
      ></label
    >
    <div class="prepare-gear-list">
      ${Array.from({ length: 3 }, (_, slot) => {
        const current = member.equipment?.[slot];
        const instance = library.equipment.owned.find((item) => item.id === current);
        const template = library.equipment.catalog.find((item) => item.id === instance?.templateId);
        return html`<label
          class="prepare-gear-row"
          data-tooltip="${escapeText(template ? equipmentDescription(template) : '点击选择装备')}"
        >
          <span class="prepare-gear-icon">${template ? '✧' : '＋'}</span>
          <span
            ><strong>装备 ${slot + 1}</strong
            ><small>${escapeText(template?.name || '未装备')}</small></span
          ><b>›</b>
          <select
            data-equipment-character="${member.id}"
            data-equipment-slot="${slot}"
            aria-label="装备 ${slot + 1}"
          >
            <option value="">未装备</option>
            ${library.equipment.owned
              .filter(
                (item) =>
                  item.id === current ||
                  !library.characters.some((entry) => entry.equipment?.includes(item.id)),
              )
              .map(
                (item) =>
                  html`<option value="${item.id}" ${item.id === current ? 'selected' : ''}>
                    ${escapeText(library.equipment.catalog.find((entry) => entry.id === item.templateId)?.name || '装备')}
                  </option>`,
              )
              .join('')}
          </select></label
        >`;
      }).join('')}
    </div>
    <section class="prepare-abilities-preview">
      <h3>技能与实际效果</h3>
      <div class="prepare-ability-category">
        <div class="prepare-ability-label">普通攻击</div>
        <div class="prepare-ability-item">
          <div><strong>普通攻击</strong><small>1 AP · 0 sp</small></div>
          <p>造成 ${member.combat?.attack || member.attack || 6} 点基础伤害。</p>
        </div>
      </div>
      <div class="prepare-ability-category">
        <div class="prepare-ability-label">角色技能</div>
        ${(member.combat?.skills || member.skills || [])
          .filter((s) => !s.passive)
          .map(
            (s) =>
              html`<div class="prepare-ability-item">
                <div>
                  <strong>${escapeText(s.name)}</strong
                  ><small
                    >${s.ap} AP${s.mp ? ` · ${s.mp} sp` : ''}${s.hp ? ` · ${s.hp} hp` : ''}</small
                  >
                </div>
                <p>${escapeText(resourceText(s.text || ''))}</p>
              </div>`,
          )
          .join('')}
      </div>
      ${
        currentEmblem
          ? html`<div class="prepare-ability-category">
              <div class="prepare-ability-label">结合技 · ${escapeText(currentEmblem.name)}</div>
              ${
                EMBLEMS[member.emblemId]?.skill
                  ? html`<div class="prepare-ability-item">
                      <div>
                        <strong>${escapeText(EMBLEMS[member.emblemId].skill.name)}</strong
                        ><small
                          >${EMBLEMS[member.emblemId].skill.ap} AP ·
                          ${EMBLEMS[member.emblemId].skill.mp} sp</small
                        >
                      </div>
                      <p>${escapeText(resourceText(EMBLEMS[member.emblemId].skill.text || ''))}</p>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }
      <div class="prepare-ability-category">
        <div class="prepare-ability-label">入场技</div>
        ${(() => {
          const entry =
            member.setting?.entrySkill || member.entrySkill || member.combat?.entrySkill;
          if (!entry) return html`<p class="prepare-empty-ability">无入场技</p>`;
          return html`<div class="prepare-ability-item">
            <div>
              <strong>${escapeText(entry.name || '入场技')}</strong
              ><small>后排满回合换入自动触发</small>
            </div>
            <p>${escapeText(resourceText(entry.description || entry.text || ''))}</p>
          </div>`;
        })()}
      </div>

      <div class="prepare-ability-category">
        <div class="prepare-ability-label">被动特质</div>
        ${(member.combat?.skills || member.skills || [])
          .filter((s) => s.passive)
          .map(
            (s) =>
              html`<div class="prepare-ability-item">
                <div>
                  <strong>${escapeText(s.name)}</strong
                  ><small>被动 · ${escapeText(s.location)}</small>
                </div>
                <p>${escapeText(resourceText(s.text || ''))}</p>
              </div>`,
          )
          .join('')}
        ${
          currentEmblem
            ? html`<div class="prepare-ability-item">
                <div>
                  <strong>${escapeText(currentEmblem.title)}</strong><small>纹章被动</small>
                </div>
                <p>${escapeText(resourceText(currentEmblem.text || ''))}</p>
              </div>`
            : ''
        }
      </div>
    </section>
  </section>`;
}

export function createEquipment(context) {
  const { session, events } = context;
  const library = () => session.ai.library;
  const rawResponse = createRawResponse(events, 'creation-raw-response', '以太 API 原始回复');
  const panel = document.createElement('dialog');
  panel.id = 'ether-forge';
  panel.innerHTML =
    '<header><div><small>ETHER / ATELIER</small><h2>以太凝聚器</h2></div><nav><button data-forge-page="construct" aria-pressed="true">凝聚</button><button data-forge-page="exchange">兑换</button></nav><button data-forge-close aria-label="关闭凝聚器">×</button></header><div class="forge-toolbar"><button id="forge-config">造物 API</button><button id="forge-refine" class="primary">构筑未构筑道具</button><button id="forge-cancel" hidden>取消</button><strong id="forge-ether"></strong></div><div class="forge-layout"><nav id="forge-list"></nav><section id="forge-workspace"><div id="forge-animation" class="condenser-stage"><i class="condenser-ring"></i><i class="condenser-ring ring-two"></i><i class="condenser-ring ring-three"></i><span class="condenser-core">✧</span><div class="condenser-beam"></div><small id="forge-animation-label">以太凝聚 · 等待构筑</small></div><div id="forge-catalog" hidden></div></section></div><p id="forge-status" role="status"></p>';
  document.body.append(panel);
  const lesson = document.createElement('section');
  lesson.id = 'forge-lesson';
  lesson.hidden = true;
  lesson.setAttribute('aria-live', 'polite');
  lesson.innerHTML =
    '<div><small>伊蒂丝 · 以太构筑</small><strong id="forge-lesson-title"></strong><p id="forge-lesson-text"></p></div><button id="forge-lesson-next" class="primary"></button>';
  panel.querySelector('.forge-toolbar').after(lesson);
  const bag = document.createElement('details');
  bag.id = 'prepare-bag';
  bag.innerHTML = '<summary>查看背包</summary><div></div>';
  document.querySelector('#party-panel > footer').prepend(bag);
  let request = null;
  let page = 'construct';
  let selected = null;
  let teaching = false;
  function explainForge() {
    lesson.hidden = !teaching;
    for (const target of panel.querySelectorAll('.tutorial-focus'))
      target.classList.remove('tutorial-focus');
    if (!teaching) return;
    const constructing = page === 'construct';
    panel.querySelector('#forge-lesson-title').textContent = constructing
      ? '先构筑，再兑换'
      : '支付以太，把装备带走';
    panel.querySelector('#forge-lesson-text').textContent = constructing
      ? '左侧列出尚未构筑的归档物品。点击“构筑未构筑道具”会调用造物 API，将它们转成有属性和被动效果的装备。现在先看页面，不需要调用 API。'
      : '这里展示已构筑的装备，选择左侧物品就能查看效果和价格。支付对应以太后装备进入背包，出发前在整备中分配给角色，每人最多三件。现在不用购买。';
    panel.querySelector('#forge-lesson-next').textContent = constructing
      ? '查看兑换页面 →'
      : '明白了';
    panel
      .querySelector(constructing ? '#forge-refine' : '[data-forge-page="exchange"]')
      .classList.add('tutorial-focus');
  }
  function pendingItems() {
    const keyOf = (map, name, description, value) =>
      JSON.stringify([map, name, description, value]);
    const known = new Set(
      library().equipment.catalog.map((item) =>
        keyOf(item.map, item.sourceName, item.sourceDescription, item.price),
      ),
    );
    const items = [];
    for (const item of library().archives.items) {
      const key = keyOf(item.map, item.name, item.description, item.value);
      if (item.refinedTemplateId || item.conflictWith || item.superseded || known.has(key))
        continue;
      known.add(key);
      const book = library().scripts.find((entry) => entry.id === item.source?.scriptId);
      const record = library().history.find((entry) => entry.runId === item.source?.runId);
      items.push({
        ...item,
        script: (
          book?.story ||
          record?.lines?.filter((line) => line.stage !== 'combat').map((line) => line.text) ||
          []
        ).join('\n\n'),
      });
    }
    return items;
  }
  function refresh() {
    panel.querySelector('#forge-ether').textContent = '以太 ' + library().inventory.ether;
    panel.querySelector('#forge-refine').disabled = !!request || !pendingItems().length;
    panel.querySelector('#forge-cancel').hidden = !request;
    panel.dataset.busy = String(!!request);
    panel.querySelector('#forge-animation').hidden = page !== 'construct';
    panel.querySelector('#forge-catalog').hidden = page !== 'exchange';
    panel.querySelector('#forge-refine').hidden = page !== 'construct';
    panel.querySelector('#forge-animation-label').textContent = request
      ? '正在构筑…'
      : '以太凝聚 · 等待构筑';
    panel
      .querySelectorAll('[data-forge-page]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.forgePage === page)),
      );
    explainForge();
    const entries = page === 'construct' ? pendingItems() : library().equipment.catalog;
    if (!entries.some((item) => item.id === selected)) selected = entries[0]?.id || null;
    panel.querySelector('#forge-list').innerHTML =
      entries
        .map(
          (item) =>
            html`<button data-forge-select="${item.id}" aria-pressed="${item.id === selected}">
              <span>✧</span><strong>${escapeText(item.name)}</strong>
            </button>`,
        )
        .join('') || '<p class="forge-empty">暂无道具</p>';
    const item = library().equipment.catalog.find((item) => item.id === selected);
    panel.querySelector('#forge-catalog').innerHTML = item
      ? html`<article class="forge-item">
          <span class="equipment-emblem">✧</span>
          <h3>${escapeText(item.name)}</h3>
          <p>${escapeText(item.description)}</p>
          <div class="forge-effects">${escapeText(equipmentDescription(item))}</div>
          <button
            class="primary"
            data-buy-equipment="${escapeText(item.id)}"
            ${request || library().inventory.ether < item.price ? 'disabled' : ''}
          >
            兑换 ${item.price}<img src="./assets/icons/ether.svg" alt="以太" />
          </button>
        </article>`
      : '<p class="forge-empty">构筑道具后，可在这里兑换装备。</p>';
    bag.querySelector('div').innerHTML =
      Object.values(ITEMS)
        .filter((item) => library().inventory.items[item.id] > 0)
        .map(
          (item) =>
            html`<p tabindex="0" data-tooltip="${escapeText(item.text)}">
              <img width="64" height="64" src="${item.icon}" alt="" /><span
                >${item.name} × ${library().inventory.items[item.id]}</span
              >
            </p>`,
        )
        .join('') +
      library()
        .equipment.owned.map((instance) => {
          const item = library().equipment.catalog.find((item) => item.id === instance.templateId);
          const wearer = library().characters.find((member) =>
            member.equipment?.includes(instance.id),
          );
          return html`<p>
            ✧ ${escapeText(item.name)} ·
            ${wearer ? escapeText(wearer.setting.name) + '装备中' : '未装备'}
          </p>`;
        })
        .join('');
  }
  const api = (path, data, signal) => context.apiClient.request(path, data, { signal });
  events.on(panel.querySelector('#forge-refine'), 'click', async () => {
    if (request || session.ai.busy || session.runtime.mode !== 'inn') return;
    const items = pendingItems();
    if (!items.length) return;
    const original = library();
    request = new AbortController();
    session.ai.busy = true;
    refresh();
    const status = panel.querySelector('#forge-status');
    try {
      const scripts = Object.fromEntries(
        items.map((item) => [item.source?.scriptId || item.id, item.script]),
      );
      const plan = await api(
        'creation/plan',
        {
          items: items.map(({ script: _script, ...item }) => ({
            ...item,
            scriptId: item.source?.scriptId || item.id,
          })),
          scripts,
        },
        request.signal,
      );
      const result = [];
      for (const [index, ids] of plan.batches.entries()) {
        status.textContent = `正在凝聚 ${index + 1}/${plan.batches.length} 批 · 共 ${items.length} 件`;
        const batch = items.filter((item) => ids.includes(item.id));
        const generated = await api('generate/creation', { items: batch }, request.signal);
        for (const item of generated.items) {
          const source = batch.find((entry) => entry.id === item.id);
          if (!source) throw Error('造物来源已变化');
          result.push(normalizeEquipment(item, source));
        }
        status.textContent += ` · 输入约 ${generated.request?.tokens?.inputEstimate || 0} TK`;
      }
      if (session.runtime.disposed || original !== library()) return;
      if (
        result.length !== items.length ||
        new Set(result.map((item) => item.id)).size !== items.length
      )
        throw Error('造物条目不完整');
      library().equipment.catalog.push(...result);
      for (const template of result)
        for (const item of library().archives.items)
          if (
            item.name === template.sourceName &&
            item.map === template.map &&
            item.description === template.sourceDescription &&
            item.value === template.price &&
            !item.conflictWith &&
            !item.superseded
          )
            item.refinedTemplateId = template.id;
      context.generation.save();
      status.textContent = `已凝聚 ${result.length} 件装备；按原物品价值支付以太即可构造。`;
    } catch (failure) {
      status.textContent =
        failure.name === 'AbortError' ? '已取消，没有保存装备或扣除以太。' : failure.message;
      rawResponse.show(failure);
    } finally {
      request = null;
      session.ai.busy = false;
      if (!session.runtime.disposed) refresh();
    }
  });
  events.on(panel.querySelector('#forge-cancel'), 'click', () => request?.abort());
  events.on(panel.querySelector('#forge-lesson-next'), 'click', () => {
    if (page === 'construct') {
      page = 'exchange';
      selected = null;
      refresh();
      return;
    }
    teaching = false;
    explainForge();
    context.onboarding?.condenserLearned();
  });
  events.on(panel.querySelector('[data-forge-close]'), 'click', () => {
    request?.abort();
    panel.close();
  });
  events.on(panel, 'cancel', () => request?.abort());
  events.on(panel.querySelector('#forge-config'), 'click', () => {
    panel.close();
    void context.generation.open('', 'creation');
  });
  events.on(panel, 'click', (event) => {
    const tab = event.target.closest('[data-forge-page]');
    if (tab) {
      page = tab.dataset.forgePage;
      selected = null;
      refresh();
      return;
    }
    const pick = event.target.closest('[data-forge-select]');
    if (pick) {
      selected = pick.dataset.forgeSelect;
      refresh();
      context.audio.play('select');
      return;
    }
    const button = event.target.closest('[data-buy-equipment]');
    if (!button || request || session.runtime.mode !== 'inn') return;
    try {
      buyEquipment(library(), button.dataset.buyEquipment, crypto.randomUUID());
      context.generation.save();
      refresh();
      context.audio.play('exchange');
      panel.querySelector('#forge-status').textContent = '装备已加入背包。';
      panel
        .querySelector('.equipment-emblem')
        ?.animate([{ scale: '.7', opacity: 0.4 }, { scale: '1.15', opacity: 1 }, { scale: '1' }], {
          duration: 600,
        });
    } catch (failure) {
      panel.querySelector('#forge-status').textContent = failure.message;
    }
  });
  events.on(document.querySelector('#party-panel'), 'change', async (event) => {
    const emblem = event.target.closest('[data-emblem-character]');
    if (emblem) {
      try {
        if (session.runtime.mode === 'battle') throw Error('战斗中不能更换纹章士');
        equipEmblem(library(), emblem.dataset.emblemCharacter, emblem.value);
        if (context.generation.save() === false) throw Error('纹章未能保存，请先整理存储空间');
        await context.storage.flush?.();
        context.shell.renderParty();
        context.emblems?.equipped();
      } catch (failure) {
        context.shell.toast(failure.message);
        context.shell.renderParty();
      }
      return;
    }
    const select = event.target.closest('[data-equipment-character]');
    if (!select) return;
    try {
      if (session.runtime.mode === 'battle') throw Error('副本中不能更换装备');
      equip(
        library(),
        select.dataset.equipmentCharacter,
        Number(select.dataset.equipmentSlot),
        select.value,
      );
      if (context.generation.save() === false) throw Error('装备未能保存，请先整理存储空间');
      await context.storage.flush?.();
      context.shell.renderParty();
    } catch (failure) {
      context.shell.toast(failure.message);
      context.shell.renderParty();
    }
  });
  events.on(document.querySelector('#party-panel'), 'click', (event) => {
    if (event.target.closest('[data-equipment-focus]'))
      document
        .querySelector('#prepare-detail .equipment-slots')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== document.querySelector('#inn-frame iframe')?.contentWindow ||
      event.data?.type !== 'tavern-condenser' ||
      session.runtime.mode !== 'inn' ||
      session.ai.busy
    )
      return;
    teaching = context.onboarding?.condenserOpened() === true;
    if (teaching) page = 'construct';
    refresh();
    panel.showModal();
  });
  return {
    refresh,
    dispose() {
      request?.abort();
      panel.remove();
      rawResponse.dispose();
      bag.remove();
    },
  };
}
