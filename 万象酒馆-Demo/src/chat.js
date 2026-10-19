import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from './content/journey-rules.js';
import { CHAT_PLACES } from './chat-places.js';
export { CHAT_PLACES, roomChatPlace } from './chat-places.js';

/** A visit draws its activities once. Rendering and sending reuse the same selection. */
export function tavernActivities(characters, place, random = Math.random) {
  const location = CHAT_PLACES[place];
  if (!location) throw Error('请先在酒馆坐下');
  return characters.map((character) => ({
    id: character.id,
    text: `${character.setting.name}在${location.name}${location.actions[Math.floor(random() * location.actions.length) % location.actions.length]}。`,
  }));
}

export function scriptProse(book, transform = (text) => text) {
  if (!book) return '';
  if (book.schemaVersion >= 3) return book.story.map(transform).join('\n\n');
  return [
    book.opening,
    ...(book.scenes || []).flatMap((scene) => [
      scene.opening,
      ...(scene.before || []).map((line) => line.text),
      ...(scene.after || []).map((line) => line.text),
    ]),
  ]
    .filter(Boolean)
    .flat()
    .map(transform)
    .join('\n\n');
}

/** Preserve every visited chapter and all mechanical/identity metadata. */
export function mergeFutureScript(current, replacement, encountered) {
  if (!Number.isInteger(encountered) || encountered < 0 || encountered >= ENCOUNTER_COUNT)
    throw Error('当前战斗序号无效');
  if (
    current.schemaVersion !== replacement.schemaVersion &&
    !(current.schemaVersion === 3 && replacement.schemaVersion === 4)
  )
    throw Error('重置剧本需要沿用原剧本版本');
  const result = structuredClone(current);
  if (encountered === FINAL_ENCOUNTER) return result;
  for (let index = encountered + 1; index < ENCOUNTER_COUNT; index++) {
    if (current.schemaVersion >= 3) {
      result.story[index] = replacement.story[index];
      if (result.display) {
        result.display.story ||= [...current.story];
        result.display.story[index] =
          replacement.display?.story?.[index] ?? replacement.story[index];
      }
    } else {
      result.scenes[index] = structuredClone(replacement.scenes[index]);
      if (result.display?.scenes)
        result.display.scenes[index] = structuredClone(
          replacement.display?.scenes?.[index] || replacement.scenes[index],
        );
    }
  }
  if (replacement.schemaVersion >= 4) {
    result.schemaVersion = 4;
    for (const field of ['npcs', 'items'])
      result[field] = [
        ...(current[field] || []).filter((entry) => (entry.encounter ?? 0) <= encountered),
        ...(replacement[field] || []).filter((entry) => entry.encounter > encountered),
      ];
  } else
    result.npcs = [
      ...current.npcs,
      ...replacement.npcs.filter((npc) => !current.npcs.some((old) => old.id === npc.id)),
    ];
  result.nextHook = structuredClone(replacement.nextHook);
  return result;
}
