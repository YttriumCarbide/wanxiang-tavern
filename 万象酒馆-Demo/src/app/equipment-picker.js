import { EMBLEMS } from '../emblems.js';
import { escapeText } from '../ui.js';

/** Styled picker delegates to the existing equipment change transaction. */
export function createEquipmentPicker(context, description) {
  const { events, session } = context;
  const panel = document.createElement('section');
  panel.id = 'equipment-picker';
  panel.innerHTML =
    '<header><div><small>PREPARATION / 装备</small><h2></h2></div><button data-picker-close aria-label="收起列表">收起</button></header><div class="equipment-picker-list"></div>';
  panel.hidden = true;
  panel.setAttribute('aria-label', '装备选择');
  let animation = null;
  function collapse() {
    animation?.cancel();
    animation = panel.animate(
      [
        { opacity: 1, height: panel.offsetHeight + 'px' },
        { opacity: 0, height: '0px' },
      ],
      { duration: 180, easing: 'ease-in' },
    );
    const closing = animation;
    void closing.finished
      .catch(() => {})
      .then(() => {
        if (closing === animation) panel.hidden = true;
      });
  }
  let source = null;
  function open(select) {
    if (source === select && panel.isConnected && !panel.hidden) return collapse();
    animation?.cancel();
    source = select;
    const ring = Boolean(select.dataset.emblemCharacter);
    const library = session.ai.library;
    panel.querySelector('h2').textContent = ring ? '选择纹章士戒指' : '选择装备';
    panel.querySelector('.equipment-picker-list').innerHTML = [...select.options]
      .map((option) => {
        const item = ring
          ? EMBLEMS[option.value]?.emblem
          : library.equipment.catalog.find(
              (entry) =>
                entry.id ===
                library.equipment.owned.find((owned) => owned.id === option.value)?.templateId,
            );
        const wearer =
          ring && option.value
            ? library.characters.find((member) => member.emblemId === option.value)
            : null;
        const selected = select.value === option.value;
        const note = wearer
          ? `✓ ${wearer.setting.name}正在装备${selected ? '' : ' · 点击转移'}`
          : selected
            ? '✓ 当前选择'
            : option.value
              ? '可装备'
              : '清空此位置';
        return `<button type="button" data-picker-value="${escapeText(option.value)}" aria-pressed="${selected}"><span class="picker-seal">${option.value ? (ring ? '◉' : '✧') : '－'}</span><span><strong>${escapeText(item?.name || option.textContent.trim() || '卸下')}</strong><small>${escapeText(note)}</small>${item ? `<p>${escapeText(ring ? item.text : description(item))}</p>` : ''}</span><b>${selected || wearer ? '✓' : '›'}</b></button>`;
      })
      .join('');
    select.closest('.prepare-gear-row,.prepare-emblem-row').after(panel);
    panel.hidden = false;
    animation = panel.animate(
      [
        { opacity: 0, height: '0px', translate: '0 -6px' },
        { opacity: 1, height: panel.scrollHeight + 'px', translate: '0 0' },
      ],
      { duration: 220, easing: 'ease-out' },
    );
  }
  events.on(document.querySelector('#party-panel'), 'click', (event) => {
    const row = event.target.closest('.prepare-gear-row,.prepare-emblem-row');
    if (!row) return;
    const select = row.querySelector('select');
    if (!select || event.target === select) return;
    event.preventDefault();
    open(select);
  });
  events.on(document.querySelector('#party-panel'), 'keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('.prepare-gear-row,.prepare-emblem-row');
    if (!row) return;
    event.preventDefault();
    open(row.querySelector('select'));
  });
  events.on(panel, 'click', (event) => {
    if (event.target.closest('[data-picker-close]')) return collapse();
    const choice = event.target.closest('[data-picker-value]');
    if (!choice || !source?.isConnected) return;
    source.value = choice.dataset.pickerValue;
    source.dispatchEvent(new Event('change', { bubbles: true }));
    collapse();
  });
  return {
    dispose() {
      animation?.cancel();
      panel.remove();
    },
  };
}
