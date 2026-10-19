import { extractGenerationEnvelope, OUTPUT_OPEN } from './output-envelope.js';
import { characterInputSchema } from '../character-schema.js';
import { scriptInputSchema } from '../script-schema.js';
import { outputSchemaIssues } from '../schema-check.js';
import { presetOutputWarnings } from '../preset-output.js';

/** Warn about contradictory editable presets; do not silently replace the user's prose. */
export function auditPromptPreset(kind, preset) {
  const warnings = presetOutputWarnings(preset);
  for (const item of preset.prompt_order[0].order.filter((entry) => entry.enabled)) {
    const entry = preset.prompts.find((message) => message.identifier === item.identifier);
    if (!entry || entry.marker) continue;
    if (kind === 'character' && /<game_data>|schemaVersion["\s:]+[12]\b/.test(entry.content))
      warnings.push(`${entry.name}含旧角色协议，可能与v3冲突。请改用setting/data完整JSON。`);
    if (entry.role !== 'assistant') continue;
    try {
      const text = entry.content.trim().startsWith(OUTPUT_OPEN)
        ? extractGenerationEnvelope(kind, entry.content).candidateText
        : entry.content;
      const example = JSON.parse(text);
      const ids =
        kind === 'script'
          ? [
              ...new Set(
                (example.scenes || []).flatMap((scene) =>
                  [...(scene.before || []), ...(scene.after || []), ...(scene.interlude || [])].map(
                    (line) => line.speaker,
                  ),
                ),
              ),
            ].filter((id) => id !== 'narrator')
          : [];
      const issues = outputSchemaIssues(
        example,
        kind === 'character' ? characterInputSchema() : scriptInputSchema(ids),
        kind,
      );
      if (issues.length)
        warnings.push(
          `${entry.name}的示例不符合当前协议：${issues
            .slice(0, 3)
            .map((issue) => `${issue.path} ${issue.message}`)
            .join('；')}`,
        );
    } catch {
      warnings.push(
        `${entry.name}不是完整JSON示例；用普通聊天或半截JSON做ASSISTANT示例可能增加格式错误。`,
      );
    }
  }
  return warnings;
}
