import { parseGalText } from '../gal.js';

export function bossLines(prose) {
  return parseGalText(prose)
    .filter((beat) => beat.text)
    .map((beat, index) => ({
      id: `boss-${String(index + 1).padStart(3, '0')}`,
      speaker: beat.speaker || '旁白',
      text: beat.text,
    }));
}

export function linesProse(lines) {
  return lines
    .map(
      (line) => `${line.speaker === '旁白' ? '【旁白】' : `【对白:${line.speaker}】`}${line.text}`,
    )
    .join('\n\n');
}

function validLine(line) {
  return (
    line &&
    typeof line.speaker === 'string' &&
    line.speaker.trim() &&
    line.speaker.length <= 80 &&
    typeof line.text === 'string' &&
    line.text.trim() &&
    line.text.length <= 2000 &&
    !/[<>【】]/u.test(line.speaker) &&
    !/<\/?wanxiang_/iu.test(line.text)
  );
}

/** Invalid operations are isolated; no patch can touch enemies or erase accepted history. */
export function applyBossPatches(boss, patches, revision, responseId) {
  const warnings = [];
  if (!Array.isArray(patches) || patches.length > 12) return ['剧情补丁列表无效，保留原剧情'];
  if (!patches.length) return warnings;
  if (boss.locked || revision !== boss.revision) return ['剧情版本已变化，忽略过期补丁'];
  const lines = structuredClone(boss.lines);
  const accepted = [];
  for (const [index, patch] of patches.entries()) {
    if (!patch || !validLine(patch) || !['replace', 'insert'].includes(patch.op)) {
      warnings.push('忽略格式无效的剧情补丁');
      continue;
    }
    const keys =
      patch.op === 'replace'
        ? ['op', 'id', 'speaker', 'text']
        : ['op', 'after', 'before', 'speaker', 'text'];
    if (Object.keys(patch).some((key) => !keys.includes(key))) {
      warnings.push('忽略含非剧情字段的补丁');
      continue;
    }
    if (patch.op === 'replace') {
      const target = lines.find((line) => line.id === patch.id);
      if (!target) {
        warnings.push('忽略未知台词ID');
        continue;
      }
      target.speaker = patch.speaker.trim();
      target.text = patch.text.trim();
    } else {
      const after = lines.findIndex((line) => line.id === patch.after);
      const before = lines.findIndex((line) => line.id === patch.before);
      // Multiple insertions in the same original gap preserve response order.
      if (
        after < 0 ||
        before <= after ||
        lines.slice(after + 1, before).some((line) => line.gap !== `${patch.after}:${patch.before}`)
      ) {
        warnings.push('忽略不相邻或不存在的插入位置');
        continue;
      }
      const id = `boss-insert-${boss.revision + 1}-${index + 1}-${responseId}`;
      lines.splice(before, 0, {
        id,
        speaker: patch.speaker.trim(),
        text: patch.text.trim(),
        gap: `${patch.after}:${patch.before}`,
      });
    }
    accepted.push(structuredClone(patch));
  }
  if (lines.length > 200 || linesProse(lines).length > 24000) return ['剧情补丁过长，保留当前剧情'];
  if (accepted.length) {
    boss.lines = lines;
    boss.revision++;
    boss.patches.push({ revision: boss.revision, responseId, operations: accepted });
  }
  return warnings;
}
