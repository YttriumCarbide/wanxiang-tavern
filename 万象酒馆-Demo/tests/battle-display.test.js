import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceText } from '../src/resource-text.js';
import { finalSkillText } from '../src/skill-text.js';
import { upgradeBattleDisplayRules } from '../src/ai/battle-display-rules.js';
import { newExploration, explorationSpec } from '../src/exploration.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { newLibrary } from '../src/ai/library.js';

test('skill resource notation is uniform, including saved Chinese descriptions and MP abbreviations', () => {
  assert.equal(
    resourceText('消耗5法力，回复7生命；血量+2，蓝量+3，MP12，8HP。'),
    '消耗5sp，回复7hp；hp+2，sp+3，sp12，8hp。',
  );
  const skill = { hp: 6, target: 'self', effects: [{ type: 'selfMana', value: 8 }] };
  const original = structuredClone(skill);
  assert.equal(finalSkillText(skill), '消耗6hp，自身回复8sp。');
  assert.deepEqual(skill, original);
});

test('every battle shares its selected dungeon location, and AI receives no per-battle location name', () => {
  const routes = newExploration(817);
  for (const map of ['ruins', 'forest', 'frost', 'forge', 'tide']) {
    const entry = routes[map].frontier[0];
    assert.equal(
      new Set(Array.from({ length: 5 }, (_, i) => explorationSpec(entry, i).name)).size,
      1,
    );
    const library = newLibrary();
    const input = generationInput('script', {
      brief: '继续本次探索',
      boss: 'bossGate',
      exploration: entry,
      party: library.characters.map((member) => ({
        id: member.id,
        name: member.setting.name,
        worldbook: member.setting.worldbook,
      })),
    });
    assert(input.request.location);
    assert(input.encounters.every((encounter) => !Object.hasOwn(encounter, 'name')));
  }
});

test('display guidance migrates once without overwriting edits or re-enabling disabled rules', () => {
  const source = {
    entries: {
      1: {
        content: '用户自定义',
        disable: true,
        extensions: { wanxiang: { generationRule: 'script-output' } },
      },
    },
  };
  const guidance = '【战斗说明用语与地点】\nhp/sp';
  const updated = upgradeBattleDisplayRules(source, guidance);
  assert(updated.entries[1].content.startsWith('用户自定义'));
  assert.equal(updated.entries[1].disable, true);
  assert.deepEqual(upgradeBattleDisplayRules(updated, guidance), updated);
  assert.equal(source.entries[1].content, '用户自定义');
});
