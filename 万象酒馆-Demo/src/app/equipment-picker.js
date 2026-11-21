import { EMBLEMS } from '../emblems.js';
import {
  clampEquipmentLevel,
  EQUIPMENT_QUALITIES,
  EQUIPMENT_STATS,
  equipmentInstanceView,
  resolveEquipmentQuality,
  resolveEquipmentTemplate,
} from '../equipment.js';
import { escapeText } from '../ui.js';
import { emblemIconSvg, emblemVisual } from './emblem-icons.js';

function buildEntry(option, library, ring, selectedValue, description) {
  const instance =
    !ring && option.value
      ? (library.equipment?.owned || []).find((owned) => owned.id === option.value)
      : null;
  const template =
    !ring && instance ? resolveEquipmentTemplate(library, instance.templateId) : null;
  const item = ring
    ? EMBLEMS[option.value]?.emblem
    : equipmentInstanceView(template, instance, library.equipment?.affixesByTemplate);
  const emblemEntry = ring && option.value ? EMBLEMS[option.value] || null : null;
  const qualityKey = !ring && item ? resolveEquipmentQuality(item.quality, item.price) : '';
  const qualityName = qualityKey ? EQUIPMENT_QUALITIES[qualityKey]?.name || '' : '';
  const level = !ring && item ? clampEquipmentLevel(item.level || 1) : 0;
  const wearer =
    ring && option.value
      ? (library.characters || []).find((member) => member.emblemId === option.value)
      : null;
  const selected = selectedValue === option.value;
  const badgeText = qualityKey ? `${qualityName} · Lv.${level}` : '';
  const note = wearer
    ? `${wearer.setting?.name || wearer.name || ''}正在佩戴${selected ? '' : ' · 确认后将转移'}`
    : selected
      ? badgeText
        ? `当前已装备 · ${badgeText}`
        : '当前选择'
      : option.value
        ? badgeText || (ring ? emblemEntry?.emblem?.title || '纹章士' : '可装备')
        : ring
          ? '不佩戴纹章戒指'
          : '空出当前槽位';
  const summaryText = item ? (ring ? item.text : description(item)) : '';
  return {
    value: option.value,
    label: option.textContent.trim(),
    ring,
    item,
    emblemEntry,
    qualityKey,
    qualityName,
    level,
    wearer,
    selected,
    note,
    summaryText,
  };
}

function previewMarkup(entry) {
  if (!entry) return '';
  if (!entry.value || !entry.item) {
    return `
      <div class="px-preview-empty">
        <div class="px-preview-crest is-none" aria-hidden="true">－</div>
        <h3>${entry.ring ? '卸下纹章戒指' : '卸下当前装备'}</h3>
        <p>${entry.ring ? '解除与该角色的纹章共鸣，将戒指归还行囊。' : '移除当前栏位的装备，将其放回行囊备用。'}</p>
      </div>
      <footer class="px-actions">
        <button type="button" class="px-btn-secondary" data-picker-close>取消</button>
        <button type="button" class="px-btn-primary" data-picker-confirm>${entry.selected ? '保持空置' : '确认卸下'}</button>
      </footer>`;
  }
  const colorStyle = entry.ring ? `style="--emblem-c:${emblemVisual(entry.value).color}"` : '';
  const icon = entry.ring ? emblemIconSvg(entry.value) : '✧';
  const stats = !entry.ring
    ? Object.entries(entry.item.stats || {})
        .filter(([, value]) => Number(value) !== 0)
        .map(([key, value]) => {
          const numeric = Number(value);
          return `<div class="px-stat-chip"><span>${escapeText(EQUIPMENT_STATS[key] || key)}</span><b>${numeric > 0 ? `+${numeric}` : numeric}</b></div>`;
        })
        .join('')
    : '';
  const skill = entry.emblemEntry?.skill;
  return `
    <div class="px-preview-body" data-quality="${entry.qualityKey || 'none'}" ${colorStyle}>
      <div class="px-preview-top">
        <div class="px-preview-crest" aria-hidden="true">${icon}</div>
        <div>
          <div class="px-preview-tags">
            ${entry.qualityName ? `<em data-quality="${entry.qualityKey}">${escapeText(entry.qualityName)}</em>` : ''}
            ${entry.level ? `<em>Lv.${entry.level}</em>` : ''}
            ${entry.ring && entry.emblemEntry?.emblem?.title ? `<em>${escapeText(entry.emblemEntry.emblem.title)}</em>` : ''}
          </div>
          <h3>${escapeText(entry.item.name)}</h3>
        </div>
      </div>
      ${
        entry.wearer && !entry.selected
          ? `<p class="px-wearer-note">当前正由 <strong>${escapeText(entry.wearer.setting?.name || entry.wearer.name || '')}</strong> 佩戴，确认后将直接转移。</p>`
          : ''
      }
      ${stats ? `<div class="px-stat-grid">${stats}</div>` : ''}
      <div class="px-effect-box">
        <small>${entry.ring ? '纹章共鸣效果' : '装备词条与规则'}</small>
        <p>${escapeText(entry.summaryText || '暂无额外说明。')}</p>
      </div>
      ${
        skill
          ? `<div class="px-effect-box is-skill">
              <small>结合奥义 · ${escapeText(skill.name || '纹章奥义')}</small>
              <p>${escapeText(skill.text || '')}</p>
            </div>`
          : ''
      }
      ${entry.item.flavor ? `<p class="px-flavor">${escapeText(entry.item.flavor)}</p>` : ''}
    </div>
    <footer class="px-actions">
      <button type="button" class="px-btn-secondary" data-picker-close>取消</button>
      <button type="button" class="px-btn-primary" data-picker-confirm>${entry.selected ? '保持当前' : '确认装备'}</button>
    </footer>`;
}

/** Centered two-column preparation picker modal delegating to existing change handlers. */
export function createEquipmentPicker(context, description) {
  const { events, session } = context;
  const panel = document.createElement('dialog');
  panel.id = 'equipment-picker';
  panel.className = 'px-mask';
  panel.setAttribute('aria-label', '装备配置');
  panel.innerHTML =
    '<div class="px-dialog"><header class="px-head"><div><small class="px-kicker">PREPARATION / 行囊配置</small><h2></h2></div><button type="button" class="px-close" data-picker-close aria-label="关闭窗口">×</button></header><div class="px-body"><div class="equipment-picker-list"></div><aside class="px-preview"></aside></div></div>';

  let source = null;
  let focusedValue = '';
  let entries = [];
  let animation = null;

  function renderEntries() {
    panel.querySelector('.equipment-picker-list').innerHTML = entries
      .map((entry) => {
        const isFocused = entry.value === focusedValue;
        const colorStyle =
          entry.ring && entry.value ? `style="--emblem-c:${emblemVisual(entry.value).color}"` : '';
        return `<button type="button" data-picker-value="${escapeText(entry.value)}" data-quality="${entry.qualityKey || 'none'}" ${colorStyle} aria-pressed="${isFocused}"><span class="picker-seal">${entry.value ? (entry.ring ? emblemIconSvg(entry.value) : '✧') : '－'}</span><span class="px-card-copy"><strong>${escapeText(entry.item?.name || entry.label || '卸下')}</strong><small>${escapeText(entry.note)}</small>${entry.summaryText ? `<p>${escapeText(entry.summaryText)}</p>` : ''}</span><b>${entry.selected ? '已装备' : entry.wearer ? '转移' : '›'}</b></button>`;
      })
      .join('');
    const currentEntry = entries.find((entry) => entry.value === focusedValue) || entries[0];
    panel.querySelector('.px-preview').innerHTML = previewMarkup(currentEntry);
  }

  function collapse() {
    if (!panel.open) return;
    animation?.cancel();
    const dialog = panel.querySelector('.px-dialog');
    const closing = dialog?.animate?.(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
      ],
      { duration: 150, easing: 'ease-out', fill: 'forwards' },
    );
    animation = closing || null;
    const done = () => {
      if (animation !== closing && closing) return;
      if (panel.open) panel.close();
      source = null;
      entries = [];
    };
    if (closing) closing.onfinish = closing.oncancel = done;
    else done();
  }

  function commitSelection(value = focusedValue) {
    if (!source) return collapse();
    source.value = value;
    source.dispatchEvent(new Event('change', { bubbles: true }));
    collapse();
  }

  function open(select) {
    if (source === select && panel.open) return collapse();
    animation?.cancel();
    source = select;
    const ring = Boolean(select.dataset.emblemCharacter);
    const library = session.ai.library;
    panel.querySelector('.px-kicker').textContent = ring
      ? 'PREPARATION / 纹章共鸣'
      : 'PREPARATION / 行囊配置';
    panel.querySelector('h2').textContent = ring ? '选择纹章士戒指' : '选择装备';
    entries = [...select.options].map((option) =>
      buildEntry(option, library, ring, select.value, description),
    );
    focusedValue = select.value;
    if (!panel.isConnected) document.body.append(panel);
    if (!panel.open) panel.showModal();
    renderEntries();
    const dialog = panel.querySelector('.px-dialog');
    animation =
      dialog?.animate?.(
        [
          { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      ) || null;
    if (animation) {
      animation.onfinish = animation.oncancel = () => {
        animation = null;
      };
    }
  }

  events.on(document.querySelector('#party-panel'), 'click', (event) => {
    const row = event.target.closest('.prepare-gear-row,.prepare-emblem-row');
    if (!row || event.target.closest('#equipment-picker')) return;
    const select = row.querySelector('select');
    if (!select || event.target === select) return;
    event.preventDefault();
    open(select);
  });

  events.on(document.querySelector('#party-panel'), 'keydown', (event) => {
    const row = event.target.closest('.prepare-gear-row,.prepare-emblem-row');
    if (!row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const select = row.querySelector('select');
    if (select) open(select);
  });

  events.on(panel, 'click', (event) => {
    if (event.target === panel || event.target.closest('[data-picker-close]')) {
      collapse();
      return;
    }
    if (event.target.closest('[data-picker-confirm]')) {
      commitSelection(focusedValue);
      return;
    }
    const choice = event.target.closest('[data-picker-value]');
    if (!choice || !source) return;
    focusedValue = choice.dataset.pickerValue;
    renderEntries();
  });

  events.on(panel, 'dblclick', (event) => {
    const choice = event.target.closest('[data-picker-value]');
    if (!choice || !source) return;
    commitSelection(choice.dataset.pickerValue);
  });

  events.on(panel, 'cancel', (event) => {
    event.preventDefault();
    collapse();
  });

  events.on(window, 'keydown', (event) => {
    if (event.key === 'Escape' && panel.open) collapse();
  });

  return {
    dispose() {
      animation?.cancel();
      panel.remove();
    },
  };
}
