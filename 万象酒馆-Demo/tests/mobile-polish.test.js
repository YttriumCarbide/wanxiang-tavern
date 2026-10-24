import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resourceText } from '../src/resource-text.js';
import { renderQuality, createFrameBudget } from '../src/shared/render-budget.js';
import { createMacroExpander } from '../src/ai/prompt-macros.js';
import { normalizePromptPreset, composePromptPreset } from '../src/ai/presets.js';
import { presetRegexScripts } from '../src/ai/regex.js';
import { presetHelperScripts } from '../src/ai/helper-scripts.js';
import { adviceBinding } from '../src/ai/advice.js';

test('equipment vocabulary translates program names while keeping resource abbreviations and values', () => {
  assert.equal(
    resourceText('佩戴后提升2点skillDamage与2点hp，buff恢复1sp。'),
    '佩戴后提升2点技能伤害与2点hp，状态恢复1sp。',
  );
  assert.equal(
    resourceText('maxHp+3、maxMp+2、manaCost+1、attack+2、debuff'),
    'hp上限+3、sp上限+2、sp消耗降低+1、普攻伤害+2、负面状态',
  );
  assert.equal(resourceText('技能伤害+2；hp+5；sp+3'), '技能伤害+2；hp+5；sp+3');
});

test('touch devices bound framebuffer area and produce thirty frames per second without changing desktop quality', () => {
  for (const [width, height] of [
    [844, 390],
    [667, 375],
    [390, 844],
  ]) {
    const q = renderQuality({ width, height, pixelRatio: 3, touch: true });
    assert.equal(q.mobile, true);
    assert.equal(q.fps, 30);
    assert.equal(q.shadows, false);
    assert(q.pixelRatio <= 1.25 && q.pixelRatio * q.pixelRatio * width * height <= 900001);
  }
  assert.equal(renderQuality({ width: 1440, height: 900, pixelRatio: 2 }).shadows, true);
  const pacing = createFrameBudget(30);
  let frames = 0;
  for (let now = 0; now < 1000; now += 1000 / 120) if (pacing.accepts(now)) frames++;
  assert(frames >= 29 && frames <= 31);
  assert(pacing.accepts(10000), 'Resuming after inactivity renders immediately');
});

test('latest-chat and latest-character macros have distinct meanings and compose under ordinary message order', () => {
  const expand = createMacroExpander({
    lastchatmessage: '玩家刚刚输入',
    lastcharmessage: '同伴上一条回复',
  });
  assert.equal(
    expand('{{lastChatMessage}} / {{lastcharmessage}}'),
    '玩家刚刚输入 / 同伴上一条回复',
  );
  assert.equal(
    createMacroExpander({ lastcharmessage: '旧上下文' })('{{lastChatMessage}}'),
    '旧上下文',
  );
  assert(
    adviceBinding({
      extensions: {
        tavern_helper: {
          scripts: [
            {
              id: '3e6591ac-a852-4a94-8d9f-062da0539167',
              type: 'script',
              content: '/* neutral test fixture */',
              enabled: true,
            },
          ],
        },
      },
    }),
  );
});

test('provided presets import their structure and neutral macro fixtures without publishing private prompt bodies', async (t) => {
  const paths = [
    'C:/Users/Lenovo/Downloads/Izumi 1022.json',
    'C:/Users/Lenovo/Downloads/V2_Beta_1.0.json',
  ];
  for (const file of paths) {
    try {
      await access(file);
    } catch {
      t.diagnostic('Local preset unavailable: ' + file.split('/').at(-1));
      continue;
    }
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const { preset } = normalizePromptPreset(raw, 'compatibility-fixture');
    assert.equal(preset.prompts.length, raw.prompts.length);
    assert(preset.prompts.every((p) => ['system', 'user', 'assistant'].includes(p.role)));
    assert.equal(presetRegexScripts(preset).length, raw.extensions.regex_scripts.length);
    assert.deepEqual(preset.extensions, raw.extensions);
    for (const script of presetHelperScripts(preset)) assert(script.content.length > 0);
    // Retain identifiers, ordering, role aliases and switches; substitute neutral prose for this test.
    const clean = {
      ...preset,
      prompts: preset.prompts.map((p) => ({
        ...p,
        content: p.marker
          ? p.content
          : '{{setvar::label::青色灯火}}{{getvar::label}} {{lastChatMessage}}',
      })),
    };
    const messages = composePromptPreset(
      clean,
      { lastchatmessage: '在酒馆休息', char: '同行者', user: '玩家' },
      { taskContext: [{ role: 'user', content: '在酒馆休息' }] },
    );
    assert(messages.length > 0);
    assert(messages.every((m) => !m.content.includes('{{')));
  }
});
