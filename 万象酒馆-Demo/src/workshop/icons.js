import {
  WORKSHOP_ICON_DEFAULTS,
  WORKSHOP_ICON_GROUPS,
  WORKSHOP_ICON_MAP,
  WORKSHOP_ICONS,
  WORKSHOP_TINTS,
} from '../content/workshop-icons/index.js';

export {
  WORKSHOP_ICON_DEFAULTS,
  WORKSHOP_ICON_GROUPS,
  WORKSHOP_ICON_MAP,
  WORKSHOP_ICONS,
  WORKSHOP_TINTS,
};

/** 条目的图标与色调；缺省或失效时退回该类别的默认图标。 */
export function workshopIconOf(type, entry) {
  const fallback = WORKSHOP_ICON_DEFAULTS[type] || WORKSHOP_ICON_DEFAULTS.items;
  const icon = WORKSHOP_ICON_MAP.get(entry?.icon) || WORKSHOP_ICON_MAP.get(fallback.icon);
  const tint = Object.hasOwn(WORKSHOP_TINTS, entry?.tint ?? '')
    ? entry.tint
    : icon?.tint || fallback.tint;
  return { icon, tint };
}

/** 生成内联 SVG 字符串。图标数据是项目自带的静态内容，不包含用户文本。 */
export function workshopIconSvg(iconId, tintId, className = '') {
  const icon = WORKSHOP_ICON_MAP.get(iconId);
  if (!icon) return '';
  const tint = [tintId, icon.tint, 'gold']
    .filter((id) => Object.hasOwn(WORKSHOP_TINTS, id ?? ''))
    .map((id) => WORKSHOP_TINTS[id])[0];
  const [light, main, dark] = tint.colors;
  const style = `--ws-l:${light};--ws-m:${main};--ws-d:${dark}`;
  const classes = ['ws-icon', className].filter(Boolean).join(' ');
  return `<svg class="${classes}" viewBox="0 0 64 64" style="${style}" aria-hidden="true" focusable="false"><g>${icon.art}</g></svg>`;
}

export function workshopEntryIcon(type, entry, className = '') {
  const { icon, tint } = workshopIconOf(type, entry);
  return icon ? workshopIconSvg(icon.id, tint, className) : '';
}

/** 根据条目名称与类别自动推荐可复用的图标与色调。 */
export function suggestWorkshopIcon(type, name = '', index = 0) {
  const text = String(name || '').trim();
  const preferredGroups =
    type === 'stations'
      ? new Set(['station'])
      : type === 'research'
        ? new Set(['research'])
        : new Set(['nature', 'mineral', 'crafted', 'tool', 'vessel', 'food', 'arcane']);
  const pool = WORKSHOP_ICONS.filter((icon) => preferredGroups.has(icon.group));
  if (text) {
    let best = null;
    let bestScore = 0;
    for (const icon of [...pool, ...WORKSHOP_ICONS]) {
      const bonus = preferredGroups.has(icon.group) ? 2 : 0;
      const words = [icon.name, ...(icon.tags || [])];
      for (const word of words) {
        if (word && text.includes(word)) {
          const score = word.length * 3 + bonus;
          if (score > bestScore) {
            bestScore = score;
            best = icon;
          }
        }
      }
    }
    if (best) return { icon: best.id, tint: best.tint };
  }
  const choice = (pool.length ? pool : WORKSHOP_ICONS)[
    index % (pool.length || WORKSHOP_ICONS.length)
  ];
  return { icon: choice.id, tint: choice.tint };
}
