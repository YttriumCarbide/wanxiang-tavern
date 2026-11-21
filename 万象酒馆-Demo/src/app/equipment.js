import { resourceText } from '../resource-text.js';
import { foodBonusText } from '../content/dining.js';
import { equipmentDescription } from '../skill-text.js';
import { createEquipmentPicker } from './equipment-picker.js';
import { createRawResponse } from './raw-response.js';
import { createForgeResults } from './forge-results.js';
import { createEquipmentFeedback } from './equipment-feedback.js';
import { EMBLEMS, equipEmblem } from '../emblems.js';
import { equipUniversalSkill } from '../learnable-skills.js';
import { emblemIconSvg, emblemVisual } from './emblem-icons.js';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_AFFIX_REGISTRY,
  EQUIPMENT_AFFIX_QUALITIES,
  EQUIPMENT_QUALITIES,
  EQUIPMENT_SLOT_ORDER,
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
  addEquipmentAffix,
  equipmentAffixCost,
  equipmentAffixProgress,
  equipmentAffixStatBonus,
  equipmentInstanceView,
  favoriteEquipment,
  grantEquipment,
  hasLegacyCategorizedEquipment,
  maxUnlockedEquipmentLevel,
  normalizeEquipment,
  reforgeCost,
  reforgeEquipment,
  refreshEquipmentAffixes,
  resolveEquipmentQuality,
  resolveEquipmentTemplate,
  rollVoucherEquipmentSpec,
  temperCost,
  temperEquipment,
} from '../equipment.js';
import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';

export { equipmentDescription };

function resolveInstanceView(template, instance, library) {
  return equipmentInstanceView(template, instance, library?.equipment?.affixesByTemplate);
}

function affixSummary(item) {
  const affix = item?.affixes?.[0];
  if (!affix) return '未赋词';
  const family = EQUIPMENT_AFFIX_REGISTRY[affix.id];
  const quality = EQUIPMENT_QUALITIES[affix.quality]?.name || affix.quality;
  return `${quality} ${family?.label || affix.id}`;
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

function affixCardsHtml(template, library) {
  const affix = library.equipment.affixesByTemplate?.[template.id];
  if (!affix) return '<div class="forge-affix-empty">未赋词 · 新生成装备默认不带词条</div>';
  const definition = EQUIPMENT_AFFIX_REGISTRY[affix.id];
  const quality = EQUIPMENT_AFFIX_QUALITIES[affix.quality] || EQUIPMENT_AFFIX_QUALITIES.common;
  const bonus = equipmentAffixStatBonus({ ...template, affixes: [affix] });
  return html`<div class="forge-affix-list">
    <article class="forge-affix-card" data-quality="${affix.quality}">
      <div class="forge-affix-card-head">
        <strong>${escapeText(definition?.label || definition?.id || affix.id)}</strong>
        <span class="quality-pill" data-quality="${affix.quality}"
          >${escapeText(EQUIPMENT_QUALITIES[affix.quality]?.name || affix.quality)}</span
        >
      </div>
      <p>
        设计 Lv.${clampEquipmentLevel(template.level || 1)}
        参考：${escapeText(equipmentDescription({ stats: bonus, rules: [] }))}
      </p>
      <small>同款全部装备共享此词条，品质贡献 ${quality.points} 点</small>
      ${(definition?.passives || [])
        .map(
          (passive) =>
            html`<details class="forge-affix-passive">
              <summary>同角色同族 ${passive.required} 点 · 专属被动</summary>
              <p>${escapeText(equipmentDescription({ stats: {}, rules: passive.rules }))}</p>
            </details>`,
        )
        .join('')}
    </article>
  </div>`;
}

function pendingPreviewHtml(item, compiled = false, ownedCount = 0) {
  if (!item) return '';
  const qualityKey = resolveEquipmentQuality(item.quality, item.value);
  const quality = EQUIPMENT_QUALITIES[qualityKey];
  const level = clampEquipmentLevel(item.level || 1);
  return html`<div class="forge-pending-card" data-quality="${qualityKey}">
    ${badgesHtml({ qualityKey, qualityName: quality.name, level })}
    <strong>${escapeText(item.name)}</strong>
    ${compiled ? '' : `<div class="forge-pending-desc">${escapeText(item.description || '待构筑战利品')}</div>`}
    <small
      >${
        compiled
          ? `${escapeText(EQUIPMENT_CATEGORIES[item.category]?.label || '装备')} · 已拥有 ${ownedCount} 件`
          : `以太估值 ${item.value} · 按 Lv.${level} ${escapeText(quality.name)} 品质定型后即可打造`
      }</small
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
        尚未打造此装备；打造后可重铸基础属性、淬炼至 Lv.${maxLevel}、升阶品质或分解回收以太。
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
          const resolved = resolveInstanceView(template, owned, library);
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
          const isGem = template.category === 'gem';
          return html`<div
            class="forge-instance-card"
            data-quality="${qKey}"
            data-forge-instance="${escapeText(owned.id)}"
          >
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
            <small>${escapeText(affixSummary(resolved))}</small>
            ${statRangeBarsHtml(owned.stats, owned.statRanges)}
            <div class="forge-instance-actions">
              ${
                !isGem
                  ? html`
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
                    `
                  : ''
              }
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
  const currentEmblem = EMBLEMS[member.emblemId]?.emblem;
  return html`<section class="equipment-slots">
    <div class="prepare-subhead">
      装备与纹章
      ${
        hasLegacyCategorizedEquipment(library)
          ? '<small class="prepare-gear-note" title="新版已启用四分类（武器/护甲/挂坠/宝石），旧装备已自动归类（可在以太凝聚器用「删除此方案」清理）。">旧装已归类</small>'
          : '<span>EQUIPMENT</span>'
      }
    </div>
    ${library.dining?.pending?.[member.id] ? html`<p class="meal-pending-bonus">下一次参战 · ${escapeText(foodBonusText(library.dining.pending[member.id].bonus))}</p>` : ''}
    <label
      class="prepare-emblem-row"
      data-emblem-id="${escapeText(currentEmblem?.id || '')}"
      style="--emblem-c:${emblemVisual(currentEmblem?.id).color}"
      role="button"
      tabindex="0"
      title="${escapeText(resourceText(currentEmblem ? currentEmblem.text : '在各地 Boss 战中获得纹章戒指'))}"
    >
      <div class="pp-ring-ico" aria-hidden="true">
        <span>${emblemIconSvg(currentEmblem?.id)}</span>
      </div>
      <div class="pp-ring-body">
        <small>纹章戒指</small>
        <h4 class="emblem-choice-label">
          ${escapeText(currentEmblem ? `${currentEmblem.title} · ${currentEmblem.name}` : '未装备 · 点击选择')}
        </h4>
        <p>
          ${escapeText(resourceText(currentEmblem ? currentEmblem.text : '在各地 Boss 战中获得纹章戒指'))}
        </p>
      </div>
      <select data-emblem-character="${member.id}" aria-label="装备纹章士">
        <option value="">未装备</option>
        ${(library.emblems || [])
          .map((id) => {
            const item = EMBLEMS[id]?.emblem;
            if (!item) return '';
            return `<option value="${item.id}" ${member.emblemId === item.id ? 'selected' : ''}>${item.title} · ${item.name}</option>`;
          })
          .join('')}
      </select>
    </label>
    <div class="prepare-gear-list">
      ${EQUIPMENT_SLOT_ORDER.map((categoryKey, slot) => {
        const category = EQUIPMENT_CATEGORIES[categoryKey];
        const current = member.equipment?.[slot];
        const instance = library.equipment.owned.find((item) => item.id === current);
        const template = resolveEquipmentTemplate(library, instance?.templateId);
        const resolved = resolveInstanceView(template, instance, library);
        const qualityKey = resolved
          ? resolveEquipmentQuality(resolved.quality, resolved.price)
          : '';
        const qualityName = qualityKey ? EQUIPMENT_QUALITIES[qualityKey].name : '';
        const level = resolved ? clampEquipmentLevel(resolved.level || 1) : 1;
        return html`<label
          class="prepare-gear-row ${resolved ? '' : 'empty'}"
          role="button"
          tabindex="0"
          data-quality="${qualityKey || 'empty'}"
          data-category="${categoryKey}"
          data-tooltip="${escapeText(resolved ? equipmentDescription(resolved) : `点击选择${category.label}`)}"
        >
          <span class="prepare-gear-icon">${category.icon}</span>
          <span class="prepare-gear-copy">
            <small>槽位 ${slot + 1} · ${category.label}</small>
            <strong>${escapeText(resolved ? resolved.name : `— 未装备${category.label} —`)}</strong>
            <em
              >${escapeText(
                resolved
                  ? categoryKey === 'gem'
                    ? `${qualityName} · ${affixSummary(resolved)} · ${equipmentDescription(resolved)}`
                    : `Lv.${level} ${qualityName} · ${affixSummary(resolved)} · ${equipmentDescription(resolved)}`
                  : '点击更换 / 装备',
              )}</em
            >
          </span>
          <b>${resolved ? '更换 ›' : '装备 ›'}</b>
          <select
            data-equipment-character="${member.id}"
            data-equipment-slot="${slot}"
            aria-label="${category.label}"
          >
            <option value="">未装备</option>
            ${library.equipment.owned
              .filter((item) => {
                const tpl = resolveEquipmentTemplate(library, item.templateId);
                if (!tpl || tpl.category !== categoryKey) return false;
                if (item.id === current) return true;
                return (
                  !library.characters.some((entry) => entry.equipment?.includes(item.id)) &&
                  !equippedDefinitions(library, member).some(
                    (equipped) => equipped.id !== current && equipped.name === tpl.name,
                  )
                );
              })
              .map((item) => {
                const entry = resolveEquipmentTemplate(library, item.templateId);
                const view = resolveInstanceView(entry, item, library);
                const qName = view
                  ? EQUIPMENT_QUALITIES[resolveEquipmentQuality(view.quality, view.price)].name
                  : '';
                const lv = view ? clampEquipmentLevel(view.level || 1) : 1;
                return html`<option value="${item.id}" ${item.id === current ? 'selected' : ''}>
                  ${
                    view
                      ? escapeText(
                          categoryKey === 'gem'
                            ? `[${qName}] ${view.name}`
                            : `[Lv.${lv} ${qName}] ${view.name}`,
                        )
                      : '装备'
                  }
                </option>`;
              })
              .join('')}
          </select>
        </label>`;
      }).join('')}
    </div>
    <div class="prepare-affix-progress">
      ${equipmentAffixProgress(equippedDefinitions(library, member))
        .map(
          (family) =>
            html`<details>
              <summary>
                ${escapeText(EQUIPMENT_AFFIX_REGISTRY[family.id]?.label || family.id)} ·
                ${family.points} 点
              </summary>
              ${family.thresholds
                .map(
                  (threshold) =>
                    html`<p data-unlocked="${threshold.unlocked}">
                      ${threshold.unlocked ? '已解锁' : '未解锁'} · ${threshold.required}
                      点：${escapeText(equipmentDescription({ stats: {}, rules: threshold.rules }))}
                    </p>`,
                )
                .join('')}
            </details>`,
        )
        .join('')}
    </div>
  </section>`;
}

export function createEquipment(context) {
  const { session, events } = context;
  const picker = createEquipmentPicker(context, equipmentDescription);
  const library = () => session.ai.library;
  const rawResponse = createRawResponse(events, 'creation-raw-response', '以太 API 原始回复');
  const panel = document.createElement('dialog');
  panel.id = 'ether-forge';
  panel.innerHTML = html`<header>
      <h2>以太凝聚器</h2>
      <nav aria-label="凝聚器页面">
        <button data-forge-page="construct" aria-pressed="true">凝聚</button>
        <button data-forge-page="exchange">兑换</button>
      </nav>
      <div class="forge-wallet">
        <strong id="forge-vouchers"></strong><strong id="forge-ether"></strong>
      </div>
      <button data-forge-close aria-label="关闭凝聚器">×</button>
    </header>
    <div class="forge-toolbar">
      <button data-forge-drawer="list" aria-expanded="false">装备清单</button>
      <button id="forge-config">造物 API</button>
      <button id="forge-refine" class="primary">构筑未构筑道具</button>
      <button id="forge-voucher-btn">兑换券凝聚装备</button>
      <button id="forge-cancel" hidden>取消</button>
      <button data-forge-drawer="details" aria-expanded="false">装备详情</button>
    </div>
    <div class="forge-layout">
      <nav id="forge-list" aria-label="装备清单"></nav>
      <section id="forge-workspace">
        <div id="forge-animation" class="condenser-stage">
          <div class="condenser-visual" aria-hidden="true">
            <i class="condenser-ring"></i><i class="condenser-ring ring-two"></i
            ><i class="condenser-ring ring-three"></i> <span class="condenser-core">✧</span>
            <div class="condenser-beam"></div>
          </div>
          <small id="forge-animation-label">等待构筑</small>
          <div id="forge-pending-preview"></div>
        </div>
      </section>
      <aside id="forge-catalog" hidden aria-label="装备详情"></aside>
    </div>
    <div id="forge-operation-dock" class="forge-operation-dock"></div>
    <p id="forge-status" role="status"></p>`;
  document.body.append(panel);
  const feedback = createEquipmentFeedback(panel, events);
  const lesson = document.createElement('section');
  lesson.id = 'forge-lesson';
  lesson.hidden = true;
  lesson.setAttribute('aria-live', 'polite');
  lesson.innerHTML =
    '<div><small>伊蒂丝 · 以太构筑</small><strong id="forge-lesson-title"></strong><p id="forge-lesson-text"></p></div><button id="forge-lesson-next" class="primary"></button>';
  panel.querySelector('.forge-toolbar').after(lesson);
  const bag = document.createElement('details');
  bag.id = 'prepare-bag';
  bag.hidden = true;
  bag.innerHTML = '<summary>查看背包</summary><div></div>';
  document.querySelector('#party-panel > footer').prepend(bag);
  let request = null;
  let page = 'construct';
  let selected = null;
  let teaching = false;
  let exchangeOnly = false;
  let confirming = false;
  let commitPending = false;
  const batchResults = createForgeResults(
    context,
    equipmentDescription,
    () => {
      page = 'exchange';
      selected = null;
      refresh();
    },
    {
      commit: commitEquipment,
      onCraft: (target) =>
        feedback.play('forge', '打造完成', target || panel.querySelector('.condenser-core')),
    },
  );
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
      : '选择装备查看效果和价格。打造后进入背包，出发前在整备中分配；武器、护甲、挂坠各一件，宝石单独装备。现在不用购买。';
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
    panel.dataset.page = page;
    panel.querySelectorAll('[data-forge-drawer]').forEach((control) => {
      control.setAttribute(
        'aria-expanded',
        String(control.dataset.forgeDrawer === panel.dataset.drawer),
      );
    });
    panel.querySelector('#forge-config').disabled = exchangeOnly || session.ai.busy;
    panel.querySelector('[data-forge-page="construct"]').disabled = exchangeOnly;
    const vouchers = library().inventory.equipmentVouchers || 0;
    panel.querySelector('#forge-vouchers').textContent = '兑换券 ' + vouchers;
    panel.querySelector('#forge-ether').textContent = '以太 ' + library().inventory.ether;
    panel.querySelector('#forge-voucher-btn').disabled =
      Boolean(request || session.ai.busy) || vouchers < 1;
    panel.querySelector('#forge-voucher-btn').hidden = page !== 'construct';
    panel.querySelector('#forge-refine').disabled =
      exchangeOnly || session.ai.busy || !!request || !pendingItems().length;
    panel.querySelector('#forge-cancel').hidden = !request;
    panel.dataset.busy = String(!!request);
    panel.querySelector('#forge-animation').hidden = false;
    panel.querySelector('#forge-catalog').hidden = page !== 'exchange';
    panel.querySelector('#forge-refine').hidden = page !== 'construct';
    panel.querySelector('#forge-animation-label').textContent = request
      ? '正在构筑…'
      : page === 'construct'
        ? '等待构筑'
        : '选择装备进行打造与养成';
    panel
      .querySelectorAll('[data-forge-page]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.forgePage === page)),
      );
    explainForge();
    const ownedGems = [...new Set(library().equipment.owned.map((entry) => entry.templateId))]
      .map((id) => resolveEquipmentTemplate(library(), id))
      .filter((entry) => entry?.category === 'gem');
    const entries =
      page === 'construct'
        ? pendingItems()
        : [...library().equipment.catalog, ...ownedGems]
            .filter(
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
          const categoryLabel = EQUIPMENT_CATEGORIES[item.category]?.label;
          return html`<button
            data-forge-select="${item.id}"
            data-quality="${qualityKey}"
            aria-pressed="${item.id === selected}"
          >
            <span>${library().equipment.favorites?.includes(item.id) ? '★' : '✧'}</span>
            <div class="forge-list-meta">
              <strong>${escapeText(item.name)}</strong>
              <small
                >${categoryLabel ? `${categoryLabel} · ` : ''}Lv.${level} ·
                ${escapeText(qualityName)}</small
              >
            </div>
          </button>`;
        })
        .join('') || '<p class="forge-empty">暂无道具</p>';
    const pendingItem = entries.find((item) => item.id === selected);
    panel.querySelector('#forge-pending-preview').innerHTML = request
      ? ''
      : pendingPreviewHtml(
          pendingItem && { ...pendingItem, value: pendingItem.value ?? pendingItem.price },
          page === 'exchange',
          library().equipment.owned.filter((entry) => entry.templateId === pendingItem?.id).length,
        );
    const item = resolveEquipmentTemplate(library(), selected);
    const itemQualityKey = item ? resolveEquipmentQuality(item.quality, item.price) : 'common';
    const itemQuality = EQUIPMENT_QUALITIES[itemQualityKey];
    const itemLevel = item ? clampEquipmentLevel(item.level || 1) : 1;
    panel.querySelector('#forge-catalog').innerHTML = item
      ? html`${
            item.legacyCategorized
              ? '<p class="forge-migration-note">提示：旧存档未区分武器/护甲/挂坠，已自动随机分配分类；若想重新整理，可使用右侧「删除此方案」。</p>'
              : ''
          }
          <article class="forge-item" data-quality="${itemQualityKey}">
            <div class="forge-item-head">
              <span class="equipment-emblem"
                >${EQUIPMENT_CATEGORIES[item.category]?.icon || '✧'}</span
              >
              <div class="forge-item-title">
                <h3>
                  ${escapeText(item.name)}
                  ${
                    EQUIPMENT_CATEGORIES[item.category]
                      ? html`<small class="forge-cat-tag"
                          >[${EQUIPMENT_CATEGORIES[item.category].label}]</small
                        >`
                      : ''
                  }
                </h3>
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
            ${
              item.category !== 'gem'
                ? html`<div class="forge-primary-row">
                    <div class="forge-item-actions">
                      <button
                        data-forge-favorite="${item.id}"
                        aria-pressed="${!!library().equipment.favorites?.includes(item.id)}"
                      >
                        ${library().equipment.favorites?.includes(item.id) ? '★ 已收藏' : '☆ 收藏'}</button
                      ><button data-forge-delete="${item.id}">删除此方案</button>
                    </div>
                  </div>`
                : ''
            }
            ${statRangeBarsHtml(item.stats, item.statRanges)}
            <div class="forge-source-line">
              来源：${escapeText(item.sourceName || item.name)}${
                item.sourceDescription ? ` · ${escapeText(item.sourceDescription)}` : ''
              }
            </div>
            ${affixCardsHtml(item, library())}
            ${forgeWorkshopHtml(item, library(), Boolean(request))}
          </article>`
      : '<p class="forge-empty">构筑道具后，可在这里兑换装备。</p>';
    const affix = item && library().equipment.affixesByTemplate?.[item.id];
    const affixCost = item ? equipmentAffixCost(item) : 0;
    panel.querySelector('#forge-operation-dock').innerHTML =
      page === 'exchange' && item
        ? html`${
              item.category !== 'gem'
                ? html`<button
                    class="primary"
                    data-buy-equipment="${escapeText(item.id)}"
                    ${request || library().inventory.ether < item.price ? 'disabled' : ''}
                  >
                    打造 · ${item.price} 以太
                  </button>`
                : ''
            }
            <button
              data-${affix ? 'refresh' : 'add'}-affix="${escapeText(item.id)}"
              ${request || library().inventory.ether < affixCost ? 'disabled' : ''}
            >
              ${affix ? '洗词' : '赋词'} · ${affixCost} 以太
            </button>
            <span>${affix ? '替换同款全部装备的共享词条' : '为同款全部装备赋予共享词条'}</span>`
        : '';
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
          const entry = resolveEquipmentTemplate(library(), instance.templateId);
          const wearer = library().characters.find((member) =>
            member.equipment?.includes(instance.id),
          );
          const view = resolveInstanceView(entry, instance, library());
          const qKey = view ? resolveEquipmentQuality(view.quality, view.price) : 'common';
          const qName = EQUIPMENT_QUALITIES[qKey].name;
          const lv = view ? clampEquipmentLevel(view.level || 1) : 1;
          return html`<p
            data-quality="${qKey}"
            data-tooltip="${escapeText(view ? equipmentDescription(view) : '')}"
          >
            ✧ [Lv.${lv} ${escapeText(qName)}] ${escapeText(entry?.name || '装备')} ·
            ${escapeText(affixSummary(view))} ·
            ${wearer ? escapeText(wearer.setting.name) + '装备中' : '未装备'}
          </p>`;
        })
        .join('');
  }
  const api = (path, data, signal) => context.apiClient.request(path, data, { signal });
  async function commitEquipment(change) {
    if (commitPending) throw Error('正在保存装备，请稍候');
    commitPending = true;
    try {
      const current = library();
      const before = {
        equipment: structuredClone(current.equipment),
        inventory: structuredClone(current.inventory),
      };
      const draft = structuredClone(current);
      const result = change(draft);
      current.equipment = draft.equipment;
      current.inventory = draft.inventory;
      try {
        if (context.generation.save() === false) throw Error('装备未能保存，请先整理存储空间');
        await context.storage.flush?.();
      } catch (failure) {
        current.equipment = before.equipment;
        current.inventory = before.inventory;
        context.generation.save();
        throw failure;
      }
      return result;
    } finally {
      commitPending = false;
    }
  }
  events.on(panel.querySelector('#forge-voucher-btn'), 'click', async () => {
    if (request || commitPending || session.ai.busy || session.runtime.mode !== 'inn') return;
    if ((library().inventory.equipmentVouchers || 0) < 1) {
      panel.querySelector('#forge-status').textContent = '没有可用的装备兑换券。';
      return;
    }
    const original = library();
    request = new AbortController();
    session.ai.busy = true;
    refresh();
    const status = panel.querySelector('#forge-status');
    status.textContent = '正在消耗 1 张装备兑换券凝聚随机新装备…';
    try {
      const spec = rollVoucherEquipmentSpec(library());
      const generated = await api('generate/creation', { items: [spec] }, request.signal);
      const result = (generated?.items || []).map((item) => normalizeEquipment(item, spec));
      if (session.runtime.disposed || original !== library()) return;
      if (!result.length) throw Error('造物 API 未返回可用装备');
      await commitEquipment((draft) => {
        draft.inventory.equipmentVouchers -= 1;
        for (const template of result) {
          draft.equipment.catalog.push(template);
          grantEquipment(draft, template.id, `voucher-eq-${crypto.randomUUID()}`, {
            level: template.level,
            quality: template.quality,
          });
        }
      });
      if (session.runtime.disposed || original !== library()) return;
      context.summoning?.refresh?.();
      context.shell.renderParty?.();
      status.textContent = `已凝聚兑换券装备「${result[0].name}」并放入背包。`;
      batchResults.open(result);
      feedback.play('forge', '打造完成', panel.querySelector('.condenser-core'));
    } catch (failure) {
      if (session.runtime.disposed || original !== library()) return;
      status.textContent =
        failure.name === 'AbortError' ? '已取消，没有消耗装备兑换券。' : failure.message;
      rawResponse.show(failure);
    } finally {
      request = null;
      session.ai.busy = false;
      if (!session.runtime.disposed) refresh();
    }
  });
  events.on(panel.querySelector('#forge-refine'), 'click', async () => {
    if (request || commitPending || session.ai.busy || session.runtime.mode !== 'inn') return;
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
      if (session.runtime.disposed || original !== library()) return;
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
  events.on(panel, 'click', async (event) => {
    const drawer = event.target.closest('[data-forge-drawer]');
    if (drawer) {
      const next =
        panel.dataset.drawer === drawer.dataset.forgeDrawer ? '' : drawer.dataset.forgeDrawer;
      panel.dataset.drawer = next;
      panel.querySelectorAll('[data-forge-drawer]').forEach((control) => {
        control.setAttribute('aria-expanded', String(control.dataset.forgeDrawer === next));
      });
      return;
    }
    const favorite = event.target.closest('[data-forge-favorite]');
    const remove = event.target.closest('[data-forge-delete]');
    if (favorite || remove) {
      if (request || confirming) return;
      confirming = true;
      const originalLibrary = library();
      try {
        await commitEquipment((draft) => {
          if (favorite) favoriteEquipment(draft, favorite.dataset.forgeFavorite);
          else deleteEquipmentPlan(draft, remove.dataset.forgeDelete);
        });
        if (session.runtime.disposed || originalLibrary !== library()) return;
        refresh();
        panel.querySelector('#forge-status').textContent = remove
          ? '已删除兑换方案，背包和已穿戴装备保留。'
          : '收藏已保存';
      } catch (failure) {
        if (!session.runtime.disposed)
          panel.querySelector('#forge-status').textContent = failure.message;
      } finally {
        confirming = false;
      }
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
      panel.dataset.drawer = '';
      refresh();
      context.audio.play('select');
      return;
    }
    const button = event.target.closest('[data-buy-equipment]');
    const reforge = event.target.closest('[data-reforge-instance]');
    const temper = event.target.closest('[data-temper-instance]');
    const ascend = event.target.closest('[data-ascend-instance]');
    const dismantle = event.target.closest('[data-dismantle-instance]');
    const addAffix = event.target.closest('[data-add-affix]');
    const refreshAffix = event.target.closest('[data-refresh-affix]');
    if (!button && !reforge && !temper && !ascend && !dismantle && !addAffix && !refreshAffix)
      return;
    if (
      request ||
      confirming ||
      (session.runtime.mode !== 'inn' &&
        !(exchangeOnly && document.querySelector('#party-panel').open))
    )
      return;
    let animation = '';
    let message = '';
    const originalLibrary = library();
    try {
      if (reforge || refreshAffix || dismantle) {
        const instanceId =
          reforge?.dataset.reforgeInstance ||
          ascend?.dataset.ascendInstance ||
          dismantle?.dataset.dismantleInstance;
        const instance = library().equipment.owned.find((entry) => entry.id === instanceId);
        const templateId =
          addAffix?.dataset.addAffix || refreshAffix?.dataset.refreshAffix || instance?.templateId;
        const template = resolveEquipmentTemplate(library(), templateId);
        const label = reforge
          ? '重铸'
          : ascend
            ? '升阶'
            : addAffix
              ? '赋词'
              : refreshAffix
                ? '洗词'
                : '分解';
        const cost = reforge
          ? reforgeCost(template, instance)
          : ascend
            ? ascendCost(template, instance)
            : dismantle
              ? dismantleEther(template, instance)
              : equipmentAffixCost(template);
        confirming = true;
        const approved = await feedback.confirm({
          title: `${label} · ${template.name}`,
          cost: dismantle ? `回收 ${cost} 以太` : `消耗 ${cost} 以太`,
          description:
            addAffix || refreshAffix
              ? `${refreshAffix ? '随机替换当前词条。' : '随机获得一个词条。'}同款全部装备共同生效，已有与后续打造的装备都受影响。`
              : reforge
                ? '重新随机基础属性数值，结果可能提高或降低。'
                : ascend
                  ? '提升此件装备品质并重新计算基础属性。'
                  : '分解后此件装备会被消耗。',
        });
        confirming = false;
        if (!approved || originalLibrary !== library() || session.runtime.disposed) return;
      }
      confirming = true;
      panel.dataset.operationState = 'resolving';
      if (button) {
        const owned = await commitEquipment((draft) =>
          buyEquipment(draft, button.dataset.buyEquipment, crypto.randomUUID()),
        );
        message = `已打造 Lv.${owned.level} ${EQUIPMENT_QUALITIES[owned.quality].name}装备（极品度 ${owned.rollPercent ?? 100}%），已加入背包。`;
        animation = 'forge';
      } else if (reforge) {
        const owned = await commitEquipment((draft) =>
          reforgeEquipment(draft, reforge.dataset.reforgeInstance),
        );
        message = `属性重铸完成，当前极品度 ${owned.rollPercent ?? 100}%。`;
        animation = 'reforge';
      } else if (temper) {
        const owned = await commitEquipment((draft) =>
          temperEquipment(draft, temper.dataset.temperInstance),
        );
        message = `淬炼成功，已强化至 Lv.${owned.level}。`;
        animation = 'temper';
      } else if (ascend) {
        const owned = await commitEquipment((draft) =>
          ascendEquipment(draft, ascend.dataset.ascendInstance),
        );
        message = `升阶成功，品质晋升为 ${EQUIPMENT_QUALITIES[owned.quality].name}。`;
        animation = 'ascend';
      } else if (dismantle) {
        const refund = await commitEquipment((draft) =>
          dismantleEquipment(draft, dismantle.dataset.dismantleInstance),
        );
        message = `已分解装备，回收 ${refund} 点以太。`;
      } else if (addAffix) {
        await commitEquipment((draft) => addEquipmentAffix(draft, addAffix.dataset.addAffix));
        message = '赋词完成，同款全部装备已生效。';
        animation = 'affix';
      } else if (refreshAffix) {
        await commitEquipment((draft) =>
          refreshEquipmentAffixes(draft, refreshAffix.dataset.refreshAffix),
        );
        message = '洗词完成，同款全部装备已更新。';
        animation = 'reroll';
      }
      if (session.runtime.disposed || originalLibrary !== library()) return;
      context.shell.renderParty?.();
      refresh();
      panel.querySelector('#forge-status').textContent = message;
      panel.dataset.operationState = 'success';
      context.audio.play(dismantle ? 'select' : 'exchange');
      if (animation) feedback.play(animation, message, panel.querySelector('.condenser-core'));
    } catch (failure) {
      if (!session.runtime.disposed) {
        panel.querySelector('#forge-status').textContent = failure.message;
        panel.dataset.operationState = 'failure';
      }
    } finally {
      confirming = false;
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
    const skillSelect = event.target.closest('[data-universal-skill-character]');
    if (skillSelect) {
      try {
        if (session.runtime.mode === 'battle') throw Error('战斗中不能更换通用战技');
        equipUniversalSkill(
          library(),
          skillSelect.dataset.universalSkillCharacter,
          Number(skillSelect.dataset.universalSkillSlot),
          skillSelect.value,
        );
        if (context.generation.save() === false) throw Error('战技未能保存，请先整理存储空间');
        await context.storage.flush?.();
        context.shell.renderParty();
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
    if (event.target.closest('[data-equipment-focus]')) {
      session.ai.preparationTab = 'status';
      context.shell.renderParty();
      document
        .querySelector('#prepare-detail .equipment-slots')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  function openCondenser() {
    if (session.runtime.mode !== 'inn' || session.ai.busy) return;
    teaching = context.onboarding?.condenserOpened() === true;
    exchangeOnly = false;
    if (teaching) page = 'construct';
    refresh();
    if (!panel.open) panel.showModal();
  }
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== document.querySelector('#inn-frame iframe')?.contentWindow ||
      event.data?.type !== 'tavern-condenser'
    )
      return;
    openCondenser();
  });
  return {
    openCondenser,
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
      feedback.dispose();
    },
  };
}
