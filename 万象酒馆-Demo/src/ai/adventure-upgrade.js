import { newWorldEntry } from './worldbook.js';
import { ADVENTURE_SCRIPT_RULES } from './adventure-prompt.js';
import { RUINS_DUNGEONS } from '../content/official-dungeons.js';
import { FOREST_DUNGEONS } from '../content/forest-dungeons.js';
import { FROST_DUNGEONS } from '../content/frost-dungeons.js';
import { rpChapterDirection } from '../content/rp-outlines.js';

/** Migrate only owned rules; keep the previous text outside prompt-scanned entries. */
export function upgradeAdventureWorldbook(source, outputRule) {
  const book = structuredClone(source);
  if (book.extensions?.wanxiang?.adventureRevision >= 50) return book;
  book.extensions ||= {};
  book.extensions.wanxiang ||= {};
  const archive = (book.extensions.wanxiang.retiredPromptArchive ||= []);
  for (const entry of Object.values(book.entries || {})) {
    const marker = entry.extensions?.wanxiang || {};
    if (marker.generationRule === 'script-output' && outputRule) {
      archive.push({ reason: '五节点升级前输出格式', entry: structuredClone(entry) });
      entry.content = outputRule;
    }
    // Authored outlines remain intact. Retire only the old generated five-battle appendix.
    if (marker.officialDungeonId || marker.dungeonId) {
      entry.content = entry.content.replace(
        /\n*【(?:遗迹|古林|霜晶矿窟|矿窟)?固定战斗阵容(?: v\d+)?】[\s\S]*$/u,
        '',
      );
      entry.content = entry.content.replace(/\n*【第四节点RP改编 v\d+】[\s\S]*$/u, '');
      for (const [map, chapters] of Object.entries({
        ruins: RUINS_DUNGEONS,
        forest: FOREST_DUNGEONS,
        frost: FROST_DUNGEONS,
      })) {
        const sequence = chapters.findIndex(
          (chapter) => chapter.id === (marker.officialDungeonId || marker.dungeonId),
        );
        if (sequence < 0) continue;
        entry.content = entry.content
          .replace('每关对应五场程序战斗', '每关对应三战与两次RP的五节点')
          .replace('每关为一趟五场战斗', '每关为一趟三战与两次RP的五节点冒险');
        entry.content += '\n\n' + rpChapterDirection({ map, sequence });
      }
    }
  }
  const existing = Object.values(book.entries || {}).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'adventure-nodes',
  );
  const uid = existing?.uid ?? Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '五节点冒险 · 三战与两次RP',
    constant: true,
    ignoreBudget: true,
    preventRecursion: true,
    apiTargets: ['script'],
    position: 4,
    depth: 0,
    role: 0,
    order: 9998,
    content: ADVENTURE_SCRIPT_RULES,
    extensions: { wanxiang: { generationRule: 'adventure-nodes' } },
  };
  book.extensions.wanxiang.adventureRevision = 50;
  return book;
}
