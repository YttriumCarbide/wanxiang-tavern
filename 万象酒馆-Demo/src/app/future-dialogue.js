import {
  applyDialoguePatches,
  bossLines,
  galSceneLines,
  linesProse,
} from '../adventure/patches.js';
import { memoryHash } from '../memory.js';

export function dialogueTargets(scenes) {
  return scenes.map(({ id, text }) => ({
    id,
    revision: memoryHash(text),
    lines: galSceneLines(text, id),
  }));
}

export function applyFutureDialogue(scenes, changes, responseId, player) {
  if (!Array.isArray(changes)) return;
  const lockedSpeakers = new Set(['玩家', 'user', player?.id, player?.name]);
  for (const scene of scenes) {
    const revision = memoryHash(scene.text);
    const change = changes.find((item) => item?.id === scene.id && item.revision === revision);
    if (!Array.isArray(change?.patches)) continue;
    const lines = galSceneLines(scene.text, scene.id);
    const editable = new Map(lines.filter((line) => !line.cue).map((line) => [line.id, line]));
    const patches = change.patches.filter(
      (patch) =>
        patch?.op === 'replace' &&
        editable.has(patch.id) &&
        editable.get(patch.id).speaker === patch.speaker &&
        !lockedSpeakers.has(patch.speaker) &&
        typeof patch.text === 'string' &&
        !/[<>【】]/u.test(patch.text) &&
        editable.get(patch.id).text !== patch.text.trim(),
    );
    const draft = { lines, revision: 0, patches: [] };
    applyDialoguePatches(draft, patches, 0, responseId, scene.id, 200);
    if (draft.revision) {
      const text = linesProse(draft.lines);
      if (text.length <= (scene.limit ?? 24000)) scene.write(text);
    }
  }
}

export function dungeonDialogueScenes(book, expedition, index) {
  if (!Array.isArray(book?.story) || book.recollection) return [];
  const boss = expedition?.adventure?.boss;
  return book.story.flatMap((text, part) => {
    if (part <= index || !text?.trim() || (part === 4 && boss?.locked)) return [];
    return [
      {
        id: `dungeon-${part + 1}`,
        text,
        write(prose) {
          book.story[part] = prose;
          if (book.display?.story) book.display.story[part] = prose;
          if (part === 4 && boss) {
            boss.lines = bossLines(prose);
            boss.revision++;
          }
        },
      },
    ];
  });
}
