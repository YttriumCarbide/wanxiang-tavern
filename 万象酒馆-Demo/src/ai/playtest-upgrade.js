import { stripRetiredLore } from './retired-abilities.js';

/** Retire inactive project migration copies; keep an audit archive outside prompt-scanned entries. */
export function upgradePlaytestWorldbook(source, rules = {}) {
  const book = structuredClone(source);
  book.extensions ||= {};
  book.extensions.wanxiang ||= {};
  const archive = (book.extensions.wanxiang.retiredPromptArchive ||= []);
  for (const [uid, entry] of Object.entries(book.entries || {})) {
    const marker = entry.extensions?.wanxiang || {};
    const obsolete =
      entry.disable &&
      (entry.extensions?.wanxiangMigration?.preserved ||
        marker.generationExample ||
        (/迁移前留存|构筑前留存/u.test(entry.comment || '') && entry.apiTargets?.length === 0));
    if (obsolete) {
      archive.push({ uid, entry });
      delete book.entries[uid];
      continue;
    }
    const rule = marker.generationRule;
    if (rule === 'enemy-base-values') entry.order = Math.min(entry.order || 9999, 9998);
    if (rule === 'combat-control')
      entry.content = entry.content.replaceAll('2 AP、15 sp', '1 AP、18 sp');
    const key = rule === 'character-numbers' ? 'growth-numbers' : rule;
    if (rules[key]) entry.content = rules[key];
    if (marker.characterId && typeof entry.content === 'string') {
      entry.content = stripRetiredLore(entry.content);
      if (marker.characterId === 'official-pandora' && !entry.content.includes('不反复强调'))
        entry.content +=
          '\n\n叙事提示：服装颜色只在首次出场或确有必要时简短交代，不反复强调裙子是黑白紫相间的。后续描写应服务于当前动作和人物互动。';
    }
  }
  book.extensions.wanxiang.playtestRevision = 46;
  return book;
}
