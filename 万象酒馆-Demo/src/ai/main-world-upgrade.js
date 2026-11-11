import { MAIN_WORLD_LORE, NEW_WORLD_LORE } from '../content/main-world-lore.js';
import { tavernCanonText } from '../content/world.js';
import { newWorldEntry } from './worldbook.js';
import { ADVENTURE_SCRIPT_RULES } from './adventure-prompt.js';

/** Only authored canon/rules are replaced; unrelated entries and their triggers stay intact. */
export function upgradeMainWorld(source, outputRule) {
  const book = structuredClone(source);
  book.entries ||= {};
  book.extensions ||= {};
  book.extensions.wanxiang ||= {};
  const revision = Number(book.extensions.wanxiang.mainWorldRevision) || 0;
  if (revision >= 63) return book;
  if (revision === 62) {
    const originalText = new Map(
      NEW_WORLD_LORE.filter((lore) => lore.id !== 'three-realms-crossings').map((lore) => [
        lore.id,
        lore.content,
      ]),
    );
    for (const entry of Object.values(book.entries)) {
      const content = originalText.get(entry.extensions?.wanxiang?.mainWorld);
      if (content !== undefined) entry.content = content;
    }
    book.extensions.wanxiang.mainWorldRevision = 63;
    return book;
  }
  if (revision < 54) {
    for (const entry of Object.values(book.entries)) {
      if (entry.comment === '万象酒馆 · 基础设定') entry.content = tavernCanonText();
      const rule = entry.extensions?.wanxiang?.generationRule;
      if (rule === 'adventure-nodes') entry.content = ADVENTURE_SCRIPT_RULES;
      if (rule === 'script-output' && outputRule) entry.content = outputRule;
    }
  }
  const loreToUpdate = revision < 54 ? MAIN_WORLD_LORE : NEW_WORLD_LORE;
  for (const lore of loreToUpdate) {
    const existing = Object.values(book.entries).find(
      (entry) => entry.extensions?.wanxiang?.mainWorld === lore.id,
    );
    const uid = existing?.uid ?? Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    book.entries[uid] = {
      ...(existing || { ...newWorldEntry(uid), matchWholeWords: false }),
      comment: lore.title,
      key: lore.keys,
      content: lore.content,
      constant: false,
      preventRecursion: true,
      excludeRecursion: true,
      matchScenario: true,
      disable: false,
      apiTargets: ['script', 'chat', 'map', 'character'],
      extensions: {
        ...existing?.extensions,
        wanxiang: { ...existing?.extensions?.wanxiang, mainWorld: lore.id },
      },
    };
  }
  for (const entry of Object.values(book.entries)) {
    const marker = entry.extensions?.wanxiang;
    if ((marker?.officialDungeonId || marker?.dungeonId) === 'ruins-curse') {
      entry.content = entry.content.replace(
        '而这片区域也因为没有人能够造出远洋的大型航船，是个无人岛。',
        '遗迹所在的偏远地带也因此少有人迹。',
      );
    }
    if (revision >= 54) {
      const id = marker?.mainWorld;
      if (id === 'eras') entry.key = entry.key.map((key) => (key === '混沌' ? '混沌时期' : key));
      if (id === 'peoples') {
        entry.content = entry.content.replace(
          '修行者往往不过百年，古血脉或至强者可达二百五十至三百年。',
          '多数修行者也往往不过百年。古血脉或少数强者可达二百五十至三百年，极罕见的高阶生命还能活得更久。',
        );
      }
    }
  }
  book.extensions.wanxiang.mainWorldRevision = 63;
  return book;
}
