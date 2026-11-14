import { resourceText } from '../resource-text.js';
import { foodBonusText } from '../content/dining.js';
import { grownCombat } from '../growth.js';
import { equipmentDescription } from '../skill-text.js';
import { createEquipmentPicker } from './equipment-picker.js';
import { createRawResponse } from './raw-response.js';
import { createForgeResults } from './forge-results.js';
import { EMBLEMS, equipEmblem } from '../emblems.js';
import {
  EQUIPMENT_QUALITIES,
  EQUIPMENT_STATS,
  ascendCost,
  ascendEquipment,
  buyEquipment,
  clampEquipmentLevel,
  deleteEquipmentPlan,
  dismantleEquipment,
  dismantleEther,
  equip,
  equippedDefinitions,
  favoriteEquipment,
  maxUnlockedEquipmentLevel,
  normalizeEquipment,
  reforgeCost,
  reforgeEquipment,
  resolveEquipmentQuality,
  temperCost,
  temperEquipment,
} from '../equipment.js';
import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

export { equipmentDescription };

function resolveInstanceView(template, instance) {
  if (!template) return null;
  if (!instance) return template;
  return {
    ...template,
    ...instance,
    id: instance.id,
    templateId: template.id,
    name: template.name,
    flavor: template.flavor,
    price: template.price,
  };
}

function badgesHtml({ qualityKey, qualityName, level, rollPercent, levelLabel = 'Lv.' }) {
  return html`<div class="forge-badges">
    <span class="quality-pill" data-quality="${qualityKey}">${escapeText(qualityName)}</span>
    <span class="level-pill">${escapeText(levelLabel)}${level}</span>
    ${Number.isInteger(rollPercent) ? `<span class="roll-pill">极品度 ${rollPercent}%</span>` : ''}
  </div>`;
}

function statRangeBarsHtml(stats = {}, statRanges = {}) {
  const entries = Object.entries(statRanges || {}).filter(([, range]) => Array.isArray(range));
  if (!entries.length) return '';
  return html`<ul class="forge-stat-ranges">
    ${entries
      .map(([key, [min, max]]) => {
        const value = Number(stats[key]) || min;
        const pct =
          max > min
            ? Math.max(8, Math.min(100, Math.round(((value - min) / (max - min)) * 100)))
            : 100;
        const label = resourceText(EQUIPMENT_STATS[key] || key);
        return html`<li>
          <div class="stat-range-head">
            <span>${escapeText(label)}</span>
            <strong>+${value}</strong>
            <small>${min}~${max}</small>
          </div>
          <div class="stat-range-track"><span style="width:${pct}%"></span></div>
        </li>`;
      })
      .join('')}
  </ul>`;
}

function pendingPreviewHtml(item) {
  if (!item) return '';
  const qualityKey = resolveEquipmentQuality(item.quality, item.value);
  const quality = EQUIPMENT_QUALITIES[qualityKey];
  const level = clampEquipmentLevel(item.level || 1);
  return html`<div class="forge-pending-card" data-quality="${qualityKey}">
    ${badgesHtml({ qualityKey, qualityName: quality.name, level })}
    <strong>${escapeText(item.name)}</strong>
    <div class="forge-pending-desc">${escapeText(item.description || '待构筑战利品')}</div>
    <small
      >以太估值 ${item.value} · 按 Lv.${level} ${escapeText(quality.name)} 品质定型后即可打造</small
    >
  </div>`;
}

function forgeWorkshopHtml(template, library, busy) {
  const maxLevel = maxUnlockedEquipmentLevel(library);
  const ether = library.inventory.ether || 0;
  const instances = library.equipment.owned.filter((item) => item.templateId === template.id);
  if (!instances.length) {
    return html`<section class="forge-workshop" aria-label="拥有实例工坊">
      <div class="forge-workshop-head">
        <strong>工坊淬炼</strong>
        <small>当前解锁上限 Lv.${maxLevel}</small>
      </div>
      <div class="forge-workshop-empty">
        尚未打造此装备；打造后可重铸词条极品度、淬炼至 Lv.${maxLevel}、升阶品质或分解回收以太。
      </div>
    </section>`;
  }
  return html`<section class="forge-workshop" aria-label="拥有实例工坊">
    <div class="forge-workshop-head">
      <strong>已拥有装备 (${instances.length})</strong>
      <small>当前淬炼上限 Lv.${maxLevel}</small>
    </div>
    <div class="forge-instance-list">
      ${instances
        .map((owned, index) => {
          const resolved = resolveInstanceView(template, owned);
          const qKey = resolveEquipmentQuality(resolved.quality, template.price);
          const qMeta = EQUIPMENT_QUALITIES[qKey];
          const lv = clampEquipmentLevel(resolved.level || 1);
          const wearer = library.characters.find((member) => member.equipment?.includes(owned.id));
          const rCost = reforgeCost(template, owned);
          const tCost = temperCost(template, owned);
          const aCost = ascendCost(template, owned);
          const refund = dismantleEther(template, owned);
          const canTemper = lv < maxLevel;
          const canAscend = Boolean(qMeta.ascendTo);
          return html`<div class="forge-instance-card" data-quality="${qKey}">
            <div class="forge-instance-top">
              <span class="forge-instance-index">#${index + 1}</span>
              ${badgesHtml({
                qualityKey: qKey,
                qualityName: qMeta.name,
                level: lv,
                rollPercent: owned.rollPercent,
              })}
              <span class="forge-wearer-tag" data-equipped="${Boolean(wearer)}"
                >${wearer ? escapeText(wearer.setting.name) + '穿戴中' : '背包中'}</span
              >
            </div>
            <div class="forge-instance-desc">${escapeText(equipmentDescription(resolved))}</div>
            ${statRangeBarsHtml(owned.stats, owned.statRanges)}
            <div class="forge-instance-actions">
              <button
                type="button"
                data-reforge-instance="${owned.id}"
                ${busy || ether < rCost ? 'disabled' : ''}
              >
                重铸 · ${rCost} 以太
              </button>
              <button
                type="button"
                data-temper-instance="${owned.id}"
                ${busy || !canTemper || ether < tCost ? 'disabled' : ''}
              >
                ${canTemper ? `淬炼→Lv.${lv + 1} · ${tCost} 以太` : `已满 Lv.${maxLevel}`}
              </button>
              <button
                type="button"
                data-ascend-instance="${owned.id}"
                ${busy || !canAscend || ether < aCost ? 'disabled' : ''}
              >
                ${
                  canAscend
                    ? `升阶→${EQUIPMENT_QUALITIES[qMeta.ascendTo].name} · ${aCost} 以太`
                    : '已达传说'
                }
              </button>
              <button
                type="button"
                data-dismantle-instance="${owned.id}"
                ${busy || wearer ? 'disabled' : ''}
              >
                ${wearer ? '穿戴中' : `分解 +${refund} 以太`}
              </button>
            </div>
          </div>`;
        })
        .join('')}
    </div>
  </section>`;
}
export function preparationEquipment(library, member) {
  const definition = grownCombat(member);
  const currentEmblem = EMBLEMS[member.emblemId]?.emblem;
  return html`<section class="equipment-slots">
    <h3>角色装备</h3>
    ${library.dining?.pending?.[member.id] ? html`<p class="meal-pending-bonus">下一次参战 · ${escapeText(foodBonusText(library.dining.pending[member.id].bonus))}</p>` : ''}
    <label class="prepare-emblem-row" role="button" tabindex="0"
      ><span>纹章士</span
      ><strong class="emblem-choice-label"
        >${escapeText(currentEmblem ? currentEmblem.title + ' · ' + currentEmblem.name : '选择戒指')}</strong
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
        const resolved = resolveInstanceView(template, instance);
        const qualityKey = resolved
          ? resolveEquipmentQuality(resolved.quality, resolved.price)
          : '';
        const qualityName = qualityKey ? EQUIPMENT_QUALITIES[qualityKey].name : '';
        const level = resolved ? clampEquipmentLevel(resolved.level || 1) : 1;
        return html`<label
          class="prepare-gear-row"
          role="button"
          tabindex="0"
          data-quality="${qualityKey || 'empty'}"
          data-tooltip="${escapeText(resolved ? equipmentDescription(resolved) : '点击选择装备')}"
        >
          <span class="prepare-gear-icon">${resolved ? '✧' : '＋'}</span>
          <span
            ><strong>装备 ${slot + 1}</strong
            ><small
              >${
                resolved ? escapeText(`Lv.${level} ${qualityName} · ${resolved.name}`) : '未装备'
              }</small
            ></span
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
                  (!library.characters.some((entry) => entry.equipment?.includes(item.id)) &&
                    !equippedDefinitions(library, member).some(
                      (equipped) =>
                        equipped.id !== current &&
                        equipped.name ===
                          library.equipment.catalog.find((entry) => entry.id === item.templateId)
                            ?.name,
                    )),
              )
              .map((item) => {
                const entry = library.equipment.catalog.find((tpl) => tpl.id === item.templateId);
                const view = resolveInstanceView(entry, item);
                const qName = view
                  ? EQUIPMENT_QUALITIES[resolveEquipmentQuality(view.quality, view.price)].name
                  : '';
                const lv = view ? clampEquipmentLevel(view.level || 1) : 1;
                return html`<option value="${item.id}" ${item.id === current ? 'selected' : ''}>
                  ${view ? escapeText(`[Lv.${lv} ${qName}] ${view.name}`) : '装备'}
                </option>`;
              })
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
          <p>
            造成 ${definition.attack || member.combat?.attack || member.attack || 6} 点基础伤害。
          </p>
        </div>
      </div>
      <div class="prepare-ability-category">
        <div class="prepare-ability-label">角色技能</div>
        ${(definition.skills || [])
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
        ${(definition.skills || [])
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
  const picker = createEquipmentPicker(context, equipmentDescription);
  const library = () => session.ai.library;
  const rawResponse = createRawResponse(events, 'creation-raw-response', '以太 API 原始回复');
  const panel = document.createElement('dialog');
  panel.id = 'ether-forge';
  panel.innerHTML =
    '<header><div><small>ETHER / ATELIER</small><h2>以太凝聚器</h2></div><nav><button data-forge-page="construct" aria-pressed="true">凝聚</button><button data-forge-page="exchange">兑换</button></nav><button data-forge-close aria-label="关闭凝聚器">×</button></header><div class="forge-toolbar"><button id="forge-config">造物 API</button><button id="forge-refine" class="primary">构筑未构筑道具</button><button id="forge-cancel" hidden>取消</button><strong id="forge-ether"></strong></div><div class="forge-layout"><nav id="forge-list"></nav><section id="forge-workspace"><div id="forge-animation" class="condenser-stage"><i class="condenser-ring"></i><i class="condenser-ring ring-two"></i><i class="condenser-ring ring-three"></i><span class="condenser-core">✧</span><div class="condenser-beam"></div><small id="forge-animation-label">以太凝聚 · 等待构筑</small><div id="forge-pending-preview"></div></div><div id="forge-catalog" hidden></div></section></div><p id="forge-status" role="status"></p>';
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
  let exchangeOnly = false;
  const batchResults = createForgeResults(context, equipmentDescription, () => {
    page = 'exchange';
    selected = null;
    refresh();
  });
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
    const keyOf = (map, name, description, value, level, quality) =>
      JSON.stringify([
        map,
        name,
        description,
        value,
        clampEquipmentLevel(level || 1),
        resolveEquipmentQuality(quality, value),
      ]);
    const known = new Set(
      library().equipment.catalog.map((item) =>
        keyOf(
          item.map,
          item.sourceName,
          item.sourceDescription,
          item.price,
          item.level,
          item.quality,
        ),
      ),
    );
    const items = [];
    for (const item of library().archives.items) {
      const key = keyOf(
        item.map,
        item.name,
        item.description,
        item.value,
        item.level,
        item.quality,
      );
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
    panel.querySelector('#forge-config').disabled = exchangeOnly || session.ai.busy;
    panel.querySelector('[data-forge-page="construct"]').disabled = exchangeOnly;
    panel.querySelector('#forge-ether').textContent = '以太 ' + library().inventory.ether;
    panel.querySelector('#forge-refine').disabled =
      exchangeOnly || session.ai.busy || !!request || !pendingItems().length;
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
    const entries =
      page === 'construct'
        ? pendingItems()
        : library()
            .equipment.catalog.filter(
              (item) =>
                !library().equipment.hidden?.includes(item.id) && !batchResults.contains(item.id),
            )
            .sort(
              (a, b) =>
                Number(library().equipment.favorites?.includes(b.id)) -
                Number(library().equipment.favorites?.includes(a.id)),
            );
    if (!entries.some((item) => item.id === selected)) selected = entries[0]?.id || null;
    panel.querySelector('#forge-list').innerHTML =
      entries
        .map((item) => {
          const qualityKey = resolveEquipmentQuality(item.quality, item.price ?? item.value ?? 10);
          const qualityName = EQUIPMENT_QUALITIES[qualityKey].name;
          const level = clampEquipmentLevel(item.level || 1);
          return html`<button
            data-forge-select="${item.id}"
            data-quality="${qualityKey}"
            aria-pressed="${item.id === selected}"
          >
            <span>${library().equipment.favorites?.includes(item.id) ? '★' : '✧'}</span>
            <div class="forge-list-meta">
              <strong>${escapeText(item.name)}</strong>
              <small>Lv.${level} · ${escapeText(qualityName)}</small>
            </div>
          </button>`;
        })
        .join('') || '<p class="forge-empty">暂无道具</p>';
    const pendingItem = page === 'construct' ? entries.find((item) => item.id === selected) : null;
    panel.querySelector('#forge-pending-preview').innerHTML = request
      ? ''
      : pendingPreviewHtml(pendingItem);
    const item = library().equipment.catalog.find((entry) => entry.id === selected);
    const itemQualityKey = item ? resolveEquipmentQuality(item.quality, item.price) : 'common';
    const itemQuality = EQUIPMENT_QUALITIES[itemQualityKey];
    const itemLevel = item ? clampEquipmentLevel(item.level || 1) : 1;
    panel.querySelector('#forge-catalog').innerHTML = item
      ? html`<article class="forge-item" data-quality="${itemQualityKey}">
          <div class="forge-item-head">
            <span class="equipment-emblem">✧</span>
            <div class="forge-item-title">
              <h3>${escapeText(item.name)}</h3>
              ${badgesHtml({
                qualityKey: itemQualityKey,
                qualityName: itemQuality.name,
                level: itemLevel,
                rollPercent: item.rollPercent,
                levelLabel: '设计 Lv.',
              })}
            </div>
          </div>
          ${item.flavor ? `<blockquote class="forge-flavor">${escapeText(item.flavor)}</blockquote>` : ''}
          <div class="forge-effects">${escapeText(equipmentDescription(item))}</div>
          <div class="forge-primary-row">
            <button
              class="primary"
              data-buy-equipment="${escapeText(item.id)}"
              ${request || library().inventory.ether < item.price ? 'disabled' : ''}
            >
              兑换 · 打造 ${item.price}<img src="./assets/icons/ether.svg" alt="以太" />
            </button>
            <div class="forge-item-actions">
              <button
                data-forge-favorite="${item.id}"
                aria-pressed="${!!library().equipment.favorites?.includes(item.id)}"
              >
                ${library().equipment.favorites?.includes(item.id) ? '★ 已收藏' : '☆ 收藏'}</button
              ><button data-forge-delete="${item.id}">删除此方案</button>
            </div>
          </div>
          ${statRangeBarsHtml(item.stats, item.statRanges)}
          <div class="forge-source-line">
            来源：${escapeText(item.sourceName)}${
              item.sourceDescription ? ` · ${escapeText(item.sourceDescription)}` : ''
            }
          </div>
          ${forgeWorkshopHtml(item, library(), Boolean(request))}
        </article>`
      : '<p class="forge-empty">构筑道具后，可在这里兑换装备。</p>';
    bag.querySelector('div').innerHTML =
      Object.values(ITEMS)
        .filter((entry) => library().inventory.items[entry.id] > 0)
        .map(
          (entry) =>
            html`<p tabindex="0" data-tooltip="${escapeText(entry.text)}">
              <img width="64" height="64" src="${entry.icon}" alt="" /><span
                >${entry.name} × ${library().inventory.items[entry.id]}</span
              >
            </p>`,
        )
        .join('') +
      library()
        .equipment.owned.map((instance) => {
          const entry = library().equipment.catalog.find((tpl) => tpl.id === instance.templateId);
          const wearer = library().characters.find((member) =>
            member.equipment?.includes(instance.id),
          );
          const view = resolveInstanceView(entry, instance);
          const qKey = view ? resolveEquipmentQuality(view.quality, view.price) : 'common';
          const qName = EQUIPMENT_QUALITIES[qKey].name;
          const lv = view ? clampEquipmentLevel(view.level || 1) : 1;
          return html`<p data-quality="${qKey}">
            ✧ [Lv.${lv} ${escapeText(qName)}] ${escapeText(entry?.name || '装备')} ·
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
            clampEquipmentLevel(item.level || 1) === clampEquipmentLevel(template.level || 1) &&
            resolveEquipmentQuality(item.quality, item.value) === template.quality &&
            !item.conflictWith &&
            !item.superseded
          )
            item.refinedTemplateId = template.id;
      context.generation.save();
      status.textContent = `已凝聚 ${result.length} 件装备；按原物品价值支付以太即可构造。`;
      batchResults.open(result);
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
    const favorite = event.target.closest('[data-forge-favorite]');
    const remove = event.target.closest('[data-forge-delete]');
    if (favorite || remove) {
      if (request) return;
      if (favorite) favoriteEquipment(library(), favorite.dataset.forgeFavorite);
      else deleteEquipmentPlan(library(), remove.dataset.forgeDelete);
      context.generation.save();
      refresh();
      panel.querySelector('#forge-status').textContent = remove
        ? '已删除兑换方案，背包和已穿戴装备保留。'
        : '收藏已保存';
      return;
    }
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
    const reforge = event.target.closest('[data-reforge-instance]');
    const temper = event.target.closest('[data-temper-instance]');
    const ascend = event.target.closest('[data-ascend-instance]');
    const dismantle = event.target.closest('[data-dismantle-instance]');
    if (!button && !reforge && !temper && !ascend && !dismantle) return;
    if (
      request ||
      (session.runtime.mode !== 'inn' &&
        !(exchangeOnly && document.querySelector('#party-panel').open))
    )
      return;
    try {
      if (button) {
        const owned = buyEquipment(library(), button.dataset.buyEquipment, crypto.randomUUID());
        panel.querySelector('#forge-status').textContent =
          `已打造 Lv.${owned.level} ${EQUIPMENT_QUALITIES[owned.quality].name}装备（极品度 ${owned.rollPercent ?? 100}%），已加入背包。`;
      } else if (reforge) {
        const owned = reforgeEquipment(library(), reforge.dataset.reforgeInstance);
        panel.querySelector('#forge-status').textContent =
          `属性重铸完成，当前极品度 ${owned.rollPercent ?? 100}%。`;
      } else if (temper) {
        const owned = temperEquipment(library(), temper.dataset.temperInstance);
        panel.querySelector('#forge-status').textContent = `淬炼成功，已强化至 Lv.${owned.level}。`;
      } else if (ascend) {
        const owned = ascendEquipment(library(), ascend.dataset.ascendInstance);
        panel.querySelector('#forge-status').textContent =
          `升阶成功，品质晋升为 ${EQUIPMENT_QUALITIES[owned.quality].name}。`;
      } else if (dismantle) {
        const refund = dismantleEquipment(library(), dismantle.dataset.dismantleInstance);
        panel.querySelector('#forge-status').textContent = `已分解装备，回收 ${refund} 点以太。`;
      }
      context.generation.save();
      context.shell.renderParty?.();
      refresh();
      context.audio.play(dismantle ? 'select' : 'exchange');
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
    exchangeOnly = false;
    if (teaching) page = 'construct';
    refresh();
    panel.showModal();
  });
  return {
    openExchange() {
      if (!document.querySelector('#party-panel').open) return;
      exchangeOnly = true;
      page = 'exchange';
      selected = null;
      teaching = false;
      refresh();
      if (!panel.open) panel.showModal();
    },
    refresh,
    dispose() {
      request?.abort();
      panel.remove();
      rawResponse.dispose();
      batchResults.dispose();
      bag.remove();
      picker.dispose();
    },
  };
}
