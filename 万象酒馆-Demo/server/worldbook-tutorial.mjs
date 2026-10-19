import { officialCharacter } from '../src/ai/library.js';
import { characterWorldEntry, newWorldEntry } from '../src/ai/worldbook.js';
import { OFFICIAL_DUNGEONS } from '../src/content/official-dungeons.js';

/** Replace only the requested official sheets and outlines; Pandora and user injection settings survive. */
export function migrateTutorialWorldbook(source, { includeOutlines = true } = {}) {
  const book = structuredClone(source);
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const id of ['aegis', 'edith']) {
    const member = officialCharacter(id);
    const entries = Object.values(book.entries).filter(
      (entry) => entry.extensions?.wanxiang?.characterId === member.id,
    );
    if (!entries.length && includeOutlines) {
      book.entries[uid] = characterWorldEntry(member, uid);
      entries.push(book.entries[uid++]);
    }
    for (const entry of entries) {
      entry.comment = `人物详情：${member.setting.name}`;
      entry.content = member.setting.worldbook;
      entry.key = [
        member.setting.name,
        ...(id === 'aegis'
          ? ['月汐', '霜月', '星月剑士']
          : ['Edith', '上一任酒馆主人', '坍缩过载']),
      ];
    }
  }
  for (const entry of Object.values(book.entries)) {
    if (
      entry.extensions?.wanxiang?.canon === 'tavern' ||
      entry.extensions?.wanxiangSource?.book === 'tavern-canon' ||
      entry.comment === '酒馆与召唤的公共设定（可编辑）'
    ) {
      entry.content = entry.content.replaceAll(
        '第一次进入副本，由驻守者潘多拉引导<user>。',
        '第一次进入副本，由上一任酒馆主人伊蒂丝引导<user>。',
      );
    }
  }
  if (!includeOutlines) return book;
  for (const dungeon of OFFICIAL_DUNGEONS) {
    const existing = Object.values(book.entries).find(
      (entry) => entry.extensions?.wanxiang?.officialDungeonId === dungeon.id,
    );
    const entry = existing || {
      ...newWorldEntry(uid),
      key: [dungeon.key],
      matchScenario: true,
      ignoreBudget: true,
      preventRecursion: true,
      excludeRecursion: true,
      order: 850,
      apiTargets: ['script'],
      extensions: { wanxiang: { officialDungeonId: dungeon.id } },
    };
    entry.comment = `官设副本：${dungeon.name}`;
    entry.content = existing ? existing.content.replaceAll('潘多拉', '伊蒂丝') : dungeon.outline;
    if (!existing) book.entries[uid++] = entry;
  }
  return book;
}
