import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../src/content/journey-rules.js';

/** Only project-owned script integration entries are migrated; community presets stay intact. */
export function migrateJourneyWorldbook(source) {
  const book = structuredClone(source);
  const replacements = [
    ['前五段', '前四段'],
    ['前五项', '前四项'],
    ['五场普通战斗', '四场普通战斗'],
    ['第一至第五场', '第一至第四场'],
    ['第二至第五段', '第二至第四段'],
    ['中间四段', '中间三段'],
    ['story[5]', 'story[4]'],
    ['2:1:1:1:1:2', '2:1:1:1:2'],
    ['第六', '第五'],
    ['六场', '五场'],
    ['六战', '五战'],
    ['六段', '五段'],
    ['六站', '五站'],
    ['六项', '五项'],
    ['六个自由小说', '五个自由小说'],
    ['六个字符串', '五个字符串'],
    ['0～5', '0～4'],
  ];
  for (const entry of Object.values(book.entries)) {
    const marker = entry.extensions?.wanxiang;
    if (
      !marker?.generationRule?.startsWith('script-') &&
      marker?.generationExample !== 'script' &&
      !marker?.officialDungeonId
    )
      continue;
    if (marker.generationExample === 'script') {
      try {
        const raw = JSON.parse(
          entry.content.replace(/^\s*<wanxiang_json>\s*|\s*<\/wanxiang_json>\s*$/g, ''),
        );
        if (raw.story?.length !== ENCOUNTER_COUNT + 1) continue;
        raw.story.splice(3, 2, raw.story[3] + '\n\n' + raw.story[4]);
        for (const list of [raw.data?.npcs, raw.data?.items])
          for (const item of list || [])
            if (item.encounter > 3) item.encounter = Math.min(FINAL_ENCOUNTER, item.encounter - 1);
        entry.content = '<wanxiang_json>\n' + JSON.stringify(raw, null, 2) + '\n</wanxiang_json>';
      } catch {
        /* Non-JSON user examples remain unchanged. */
      }
    } else {
      for (const [from, to] of replacements) entry.content = entry.content.replaceAll(from, to);
    }
  }
  return book;
}
