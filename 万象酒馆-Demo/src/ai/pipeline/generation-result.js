import { isEndless, validateEncounters } from '../../worlds.js';
import { arcFor } from '../../story-arc.js';
import { generationDiagnostic } from '../diagnostic.js';
export { generationDiagnostic, redactDiagnostic } from '../diagnostic.js';
import { generationNumbers, restoreGrowth } from '../../growth.js';
import { resolveItemReferences } from '../../archives.js';
import { stripRetiredFields } from '../retired-abilities.js';
import { normalizeCharacter, normalizeScript, parseCharacterOutput } from '../contracts.js';
import { characterOutputSchema, characterInputSchema } from '../character-schema.js';
import { scriptInputSchema } from '../script-schema.js';
import { scriptProseReport } from '../script-prose.js';
import { outputSchemaIssues } from '../schema-check.js';
import { normalizeCharacterPersonality } from '../character-setting.js';

function location(text, offset) {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

/** Only remove wrappers and trailing commas outside strings; never invent missing content. */
export function repairJSONText(rawText) {
  let candidateText = rawText.trim().replace(/^\uFEFF/, '');
  const repairs = [];
  if (candidateText !== rawText) repairs.push({ message: '移除正文首尾空白或BOM' });
  const fence = candidateText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) {
    candidateText = fence[1].trim();
    repairs.push({ message: '移除包在JSON外层的Markdown代码围栏' });
  }
  let quoted = false,
    escaped = false,
    repaired = '';
  for (let i = 0; i < candidateText.length; i++) {
    const char = candidateText[i];
    if (!quoted && char === ',' && /^\s*[}\]]/.test(candidateText.slice(i + 1))) {
      repairs.push({ message: '移除对象或数组末尾多余逗号', ...location(candidateText, i) });
      continue;
    }
    repaired += char;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
  }
  return { candidateText: repaired, repairs };
}

/** Ignore only clearly labelled design annotations; executable data and unknown fields stay strict. */
function removeSettingAnnotations(value, schema, path, repairs) {
  if (!value || typeof value !== 'object') return false;
  let changed = false;
  if (Array.isArray(value) && schema.type === 'array') {
    value.forEach((item, index) => {
      changed =
        removeSettingAnnotations(item, schema.items, `${path}[${index}]`, repairs) || changed;
    });
  } else if (schema.type === 'object') {
    for (const key of Object.keys(value)) {
      const child = schema.properties[key];
      if (child)
        changed = removeSettingAnnotations(value[key], child, `${path}.${key}`, repairs) || changed;
      else if (/(?:_notes?|_comments?|备注|说明)$/.test(key)) {
        const before = JSON.stringify(value[key]);
        repairs.push({
          path: `${path}.${key}`,
          before,
          message: `忽略非协议备注字段 ${path}.${key}（原值：${before.slice(0, 180)}）`,
        });
        delete value[key];
        changed = true;
      }
    }
  }
  return changed;
}

/** A single path for upstream responses and user-edited local revalidation. */
export function readGenerationResult(kind, rawText, input, readCharacter = parseCharacterOutput) {
  const diagnostic = {
    ...generationDiagnostic(kind, rawText),
    ...repairJSONText(rawText),
    stage: 'json',
  };
  try {
    let raw;
    try {
      raw = JSON.parse(diagnostic.candidateText);
    } catch (failure) {
      const position = failure.message.match(/position (\d+)/);
      const line = failure.message.match(/line (\d+) column (\d+)/);
      const at = position
        ? location(diagnostic.candidateText, Number(position[1]))
        : line
          ? { line: Number(line[1]), column: Number(line[2]) }
          : /end of JSON|unterminated/i.test(failure.message)
            ? location(diagnostic.candidateText, diagnostic.candidateText.length)
            : {};
      diagnostic.issues = [{ path: 'JSON', message: failure.message, ...at }];
      throw Error('JSON格式错误：' + failure.message, { cause: failure });
    }
    diagnostic.stage = 'schema';
    if (
      kind === 'character' &&
      raw?.setting &&
      removeSettingAnnotations(
        raw.setting,
        characterOutputSchema().properties.setting,
        'character.setting',
        diagnostic.repairs,
      )
    )
      diagnostic.candidateText = JSON.stringify(raw, null, 2);
    const ids = (input.party || []).map((item) => item.id);
    diagnostic.issues = outputSchemaIssues(
      kind === 'character' ? stripRetiredFields(raw) : raw,
      kind === 'character' ? characterInputSchema() : scriptInputSchema(ids),
      kind,
    );
    if (diagnostic.issues.length)
      throw Error(`生成格式不符：${diagnostic.issues[0].path} ${diagnostic.issues[0].message}`);
    diagnostic.stage = 'rules';
    if (kind === 'character' && typeof raw.setting.personality !== 'string') {
      const before = JSON.stringify(raw.setting.personality);
      raw.setting.personality = normalizeCharacterPersonality(raw.setting.personality);
      diagnostic.repairs.push({
        path: 'character.setting.personality',
        before,
        message: '将性格的name/description对象合并为文字，保留名称与完整描述',
      });
      diagnostic.candidateText = JSON.stringify(raw, null, 2);
    }
    const id = `${kind}-${crypto.randomUUID()}`;
    const entry =
      kind === 'character'
        ? normalizeCharacter(readCharacter(diagnostic.candidateText), id)
        : normalizeScript(raw, id, ids);
    if (kind === 'character') {
      const seed = restoreGrowth(null, input.rollId || input.brief || entry.setting.name).seed;
      entry.growth = restoreGrowth({ rarity: generationNumbers(input).rarity, seed }, entry.id);
      if (input.purpose === 'protagonist') entry.combat.limit = 2;
    }
    if (kind === 'script') {
      if (isEndless(input.exploration))
        entry.encounters = validateEncounters(entry.encounters, input.exploration);
      const phase = arcFor(input).phase;
      entry.nextHook.phase = phase;
    }
    if (kind === 'script')
      entry.items = resolveItemReferences(entry.items || [], input.archiveContext?.items || []);
    if (kind === 'script') diagnostic.prose = scriptProseReport(entry);
    if (
      kind === 'script' &&
      raw.schemaVersion === 4 &&
      entry.npcs.some((npc) =>
        (input.party || []).some(
          (member) =>
            String(member.name || '')
              .normalize('NFKC')
              .trim() === npc.name.normalize('NFKC').trim(),
        ),
      )
    )
      throw Error('归档NPC不能是本趟队伍成员');
    diagnostic.stage = 'complete';
    if (kind === 'character' && input.purpose === 'npc' && entry.setting.name !== input.npc?.name)
      throw Error('NPC细化必须保留原姓名');
    if (kind === 'character' && input.purpose !== 'protagonist' && entry.setting.name === '潘多拉')
      throw Error('潘多拉不可通过召唤获得');
    return {
      entry,
      diagnostic,
      ...(kind === 'character' && raw.arrivalDialogue
        ? { arrivalDialogue: raw.arrivalDialogue }
        : {}),
    };
  } catch (failure) {
    if (!diagnostic.issues.length)
      diagnostic.issues = [
        {
          path: failure.path || (kind === 'character' ? 'character.setting / data' : 'script'),
          message: failure.message,
        },
      ];
    failure.diagnostic = diagnostic;
    throw failure;
  }
}

/** Responses may echo a configured secret; diagnostic exports must never disclose it. */
