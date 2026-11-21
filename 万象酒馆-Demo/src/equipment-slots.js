import { hashSeed } from './equipment-scale.js';
import { findGemById } from './content/gems.js';
export const EQUIPMENT_CATEGORIES = Object.freeze({
  weapon: Object.freeze({ id: 'weapon', label: '武器', slot: 0, icon: '⚔' }),
  armor: Object.freeze({ id: 'armor', label: '护甲', slot: 1, icon: '🛡' }),
  pendant: Object.freeze({ id: 'pendant', label: '挂坠', slot: 2, icon: '◈' }),
  gem: Object.freeze({ id: 'gem', label: '宝石', slot: 3, icon: '❖' }),
});

export const EQUIPMENT_SLOT_ORDER = Object.freeze(['weapon', 'armor', 'pendant', 'gem']);
export const EQUIPMENT_CRAFT_CATEGORIES = Object.freeze(['weapon', 'armor', 'pendant']);

const CATEGORY_ALIASES = Object.freeze({
  weapon: 'weapon',
  武器: 'weapon',
  armor: 'armor',
  护甲: 'armor',
  防具: 'armor',
  pendant: 'pendant',
  挂坠: 'pendant',
  饰品: 'pendant',
  gem: 'gem',
  宝石: 'gem',
});

export function normalizeEquipmentCategory(rawCategory) {
  if (typeof rawCategory !== 'string') return null;
  const trimmed = rawCategory.trim();
  return CATEGORY_ALIASES[trimmed.toLowerCase()] || CATEGORY_ALIASES[trimmed] || null;
}

export function inferLegacyEquipmentCategory(name, id = '') {
  const text = String(name || '');
  if (/[甲铠盾袍衣衫靴帽冠篷皮胸护腕臂腿肩]/.test(text)) return 'armor';
  if (/[剑刀斧枪矛戟锤弓弩杖镰匕刃矢棍爪鞭枪]/.test(text)) return 'weapon';
  if (/[戒环佩坠链印符徽钟铃镜珠角羽]/.test(text)) return 'pendant';
  return EQUIPMENT_CRAFT_CATEGORIES[hashSeed(`${id}:${text}`) % EQUIPMENT_CRAFT_CATEGORIES.length];
}

export function resolveEquipmentTemplate(library, templateId) {
  if (!templateId) return null;
  return (
    library?.equipment?.catalog?.find((item) => item.id === templateId) ||
    findGemById(templateId) ||
    null
  );
}

export function hasLegacyCategorizedEquipment(library) {
  const hidden = new Set(library?.equipment?.hidden || []);
  return (library?.equipment?.catalog || []).some(
    (item) => item.legacyCategorized && !hidden.has(item.id),
  );
}
