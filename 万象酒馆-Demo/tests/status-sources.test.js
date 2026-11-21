import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINITIONS } from '../src/data.js';
import { newBattle, makeAction, preview } from '../src/engine.js';
import { statusIcons } from '../src/ui.js';
import { equippedUniversalSkills } from '../src/learnable-skills.js';

function makeHero() {
  const hero = structuredClone(DEFINITIONS.aegis);
  hero.equippedSkills = ['uni-serrated-cut'];
  hero.skills = [...(hero.skills ?? []), ...equippedUniversalSkills(hero)];
  return hero;
}

function makeState(hero) {
  return newBattle(
    ['mossSlime'],
    { aegis: hero },
    {
      mossSlime: { ...DEFINITIONS.mossSlime, hp: 500 },
    },
  );
}

test('普通攻击不能凭空挂流血', () => {
  const state = makeState(makeHero());
  const action = makeAction(state, 'aegis', 'attack', 'mossSlime', 0);
  const result = preview(state, [action]);
  assert.equal(result.valid, true);
  const attack = result.events.find((event) => event.skill === 'attack');
  assert.ok(attack, '普攻事件应存在');
  assert.equal(attack.after?.units?.mossSlime?.buffs?.bleed, undefined);
  assert.equal(
    (attack.statusApplications || []).some((entry) => entry.buff === 'bleed'),
    false,
  );
});

test('裂甲斩挂流血并记录角色与技能来源', () => {
  const state = makeState(makeHero());
  const action = makeAction(state, 'aegis', 'uni-serrated-cut', 'mossSlime', 0);
  const result = preview(state, [action]);
  assert.equal(result.valid, true);
  const skill = result.events.find((event) => event.skill === 'uni-serrated-cut');
  assert.ok(skill, '裂甲斩事件应存在');
  assert.ok(skill.after?.units?.mossSlime?.buffs?.bleed > 0);
  const applied = (skill.statusApplications || []).find((entry) => entry.buff === 'bleed');
  assert.ok(applied, '裂甲斩应记录流血来源');
  assert.equal(applied.actor, 'aegis');
  assert.equal(applied.target, 'mossSlime');
  assert.equal(applied.source, '裂甲斩');
  assert.ok(
    skill.logs.some((log) => log.includes('裂甲斩') && log.includes('流血')),
    '裂甲斩日志应包含来源与实际层数',
  );
  const icons = statusIcons(state, 'mossSlime', result.final, result.events);
  assert.match(icons, /来源：.*裂甲斩/u);
  assert.match(icons, /data-buff="bleed"/u);
});

test('装备触发的流血显示装备名而非普攻来源', () => {
  const hero = makeHero();
  hero.equipment = [
    {
      id: 'status-test',
      name: '试炼刀',
      rules: [
        {
          mode: 'event',
          event: 'afterAttack',
          target: 'target',
          limit: 1,
          scope: 'battle',
          effects: [{ type: 'buff', buff: 'bleed', value: 3 }],
        },
      ],
    },
  ];
  const state = makeState(hero);
  const action = makeAction(state, 'aegis', 'attack', 'mossSlime', 0);
  const result = preview(state, [action]);
  assert.equal(result.valid, true);
  const attack = result.events.find((event) => event.skill === 'attack');
  assert.ok(attack, '普攻事件应存在');
  const applied = (attack.statusApplications || []).find((entry) => entry.buff === 'bleed');
  assert.ok(applied, '试炼刀应记录流血来源');
  assert.equal(applied.source, '试炼刀');
  assert.ok(
    attack.logs.some((log) => log.includes('试炼刀') && log.includes('流血')),
    '试炼刀日志应包含来源与实际层数',
  );
  const icons = statusIcons(state, 'mossSlime', result.final, result.events);
  assert.match(icons, /来源：.*试炼刀/u);
  assert.match(icons, /data-buff="bleed"/u);
  assert.doesNotMatch(icons, /来源：.*普通攻击/u);
});

test('人工制品抵消裂甲斩的流血与易伤且不记录来源', () => {
  const state = makeState(makeHero());
  state.units.mossSlime.buffs.artifact = 2;
  const action = makeAction(state, 'aegis', 'uni-serrated-cut', 'mossSlime', 0);
  const result = preview(state, [action]);
  assert.equal(result.valid, true);
  const skill = result.events.find((event) => event.skill === 'uni-serrated-cut');
  assert.ok(skill, '裂甲斩事件应存在');
  assert.equal(skill.after?.units?.mossSlime?.buffs?.bleed, undefined);
  assert.equal(
    (skill.statusApplications || []).some((entry) => entry.buff === 'bleed'),
    false,
  );
  assert.equal(
    (skill.statusApplications || []).some((entry) => entry.buff === 'vulnerable'),
    false,
  );
});
