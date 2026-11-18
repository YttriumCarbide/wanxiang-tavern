import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMAGE_TYPE_IDS,
  SUPPORT_TYPE,
  damageTypeChip,
  damageTypeIcon,
  inferDamageType,
  resolveBasicAttackType,
  resolveDamagePixelFx,
} from '../src/damage-types.js';
import { EFFECT_REGISTRY, createPixelFxStage, renderEffectSample } from '../src/pixelfx-stage.js';
import { buildEnemyArchiveEntries } from '../src/archive-enemies.js';
import { resolveEnemyBreakProfile } from '../src/octopath.js';
import { advance, enemyTimeline, newBattle, newEncounter, preview } from '../src/engine.js';
import { DEFINITIONS, HEROES } from '../src/data.js';
import { LEARNABLE_SKILLS } from '../src/content/learnable-skills.js';
import { enemyToughnessBadge, enemyWeaknessRow, resourceBars } from '../src/ui.js';
import { characterOutputSchema } from '../src/ai/character-schema.js';
import { characterConstraintText, characterGenerationPlan } from '../src/character-generation.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { compactCharacterDocument } from './fixtures/ai.js';

function makeCanvasMockDocument() {
  const appended = [];
  const noopCtx = {
    imageSmoothingEnabled: true,
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {},
  };
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        dataset: {},
        style: {},
        width: 0,
        height: 0,
        getContext: () => noopCtx,
        remove() {},
      };
    },
  };
  const layer = {
    append(el) {
      appended.push(el);
    },
  };
  return {
    layer,
    appended,
    restore() {
      globalThis.document = prevDoc;
    },
  };
}

test('damage types cover exact 12 weapon/magic IDs, distinct SVG icons, and non-damage support tagging', () => {
  assert.equal(DAMAGE_TYPE_IDS.length, 12);
  assert.deepEqual(DAMAGE_TYPE_IDS, [
    'sword',
    'axe',
    'spear',
    'brawl',
    'special-weapon',
    'fire',
    'ice',
    'wind',
    'lightning',
    'light',
    'dark',
    'special-magic',
  ]);
  const svgs = new Set(DAMAGE_TYPE_IDS.map((id) => damageTypeIcon(id)));
  assert.equal(svgs.size, 12);
  assert(damageTypeIcon('unknown').includes('is-unknown'));
  assert(damageTypeChip(null).includes('增幅'));
  assert(!damageTypeChip('sword').includes('dmg-type-label'));
  assert.equal(resolveBasicAttackType(HEROES[0]), 'sword');
  assert.equal(
    inferDamageType({ name: '护盾祷言', effects: [{ type: 'shield', value: 10 }] }, HEROES[0]),
    null,
  );
  for (const sk of LEARNABLE_SKILLS) {
    const inferred = inferDamageType(sk);
    const hasDamage = sk.effects.some((ef) => ef.type === 'damage');
    if (hasDamage) assert(DAMAGE_TYPE_IDS.includes(inferred), `Expected damageType on ${sk.id}`);
    else assert.equal(inferred, null);
  }
});

test('PixelFX registry supports fire/ice palettes and rotates directional FX around card center', () => {
  for (const id of [
    'burning',
    'shadow-flames',
    'dissolve-burn',
    'frozen',
    'geyser',
    'shatter-death',
  ]) {
    assert(EFFECT_REGISTRY[id], `Missing registry effect: ${id}`);
    const sample = renderEffectSample(id);
    assert(sample.visiblePixels > 0, `${id} rendered no pixels`);
  }
  for (const typeId of DAMAGE_TYPE_IDS) {
    for (const opts of [{ basic: true }, { aoe: false }, { aoe: true }]) {
      const fx = resolveDamagePixelFx(typeId, opts);
      assert(EFFECT_REGISTRY[fx.id], `Unregistered fx ${fx.id} for ${typeId}`);
      const sample = renderEffectSample(fx.id, fx.palette ? { palette: fx.palette } : {});
      assert(sample.visiblePixels > 0, `${typeId} ${fx.id} rendered zero pixels`);
    }
  }
  const dom = makeCanvasMockDocument();
  try {
    const stage = createPixelFxStage(dom.layer);
    stage.spawn('sword-slash', { x: 240, y: 180, rotateDeg: -90, flipX: true, scale: 1.4 });
    assert.equal(dom.appended.length, 1);
    const canvas = dom.appended[0];
    assert.equal(canvas.dataset.effect, 'sword-slash');
    assert.equal(canvas.dataset.effectId, 'sword-slash');
    assert.equal(canvas.style.left, '240px');
    assert.equal(canvas.style.top, '180px');
    assert(canvas.style.transform.includes('translate(-50%, -50%)'));
    assert(canvas.style.transform.includes('rotate(-90deg)'));
    assert(canvas.style.transform.includes('scaleX(-1)'));
  } finally {
    dom.restore();
  }
});

test('resourceBars overlays blue shield directly on HP bar with blue bracketed value', () => {
  const htmlWithShield = resourceBars({ hp: 69, maxHp: 72, mp: 10, maxMp: 20, block: 15 });
  assert(htmlWithShield.includes('69/72<span class="bar-shield-text">（15）</span>'));
  assert(htmlWithShield.includes('bar-shield-fill'));
  assert(!htmlWithShield.includes('resource-shield'));

  const htmlForecast = resourceBars(
    { hp: 50, maxHp: 60, mp: 0, maxMp: 0, block: 0 },
    { hp: 50, maxHp: 60, mp: 0, maxMp: 0, block: 12 },
  );
  assert(htmlForecast.includes('50/60<span class="bar-shield-text is-forecast">（+12）</span>'));
  assert(htmlForecast.includes('bar-shield-forecast active'));
});

test('Octopath break reveals weaknesses on hit, skips remaining & full next round, then recovers', () => {
  const dummyEnemy = {
    id: 'puppetDummy',
    name: '试作魔偶',
    speed: [2],
    hp: 300,
    attack: 5,
    maxToughness: 2,
    weaknesses: ['sword', 'fire'],
    intents: [{ name: '重击', slot: 0, effects: [{ type: 'damage', value: 5 }] }],
  };
  const customHero = {
    ...HEROES[0],
    id: 'aegis',
    limit: 2,
    attackType: 'sword',
    skills: [
      {
        id: 'slash-twice',
        name: '破韧剑击',
        ap: 1,
        mp: 0,
        target: 'enemy',
        damageType: 'sword',
        effects: [{ type: 'damage', value: 8 }],
      },
      {
        id: 'guard-up',
        name: '整备盾',
        ap: 1,
        mp: 0,
        target: 'self',
        damageType: null,
        effects: [{ type: 'shield', value: 5 }],
      },
    ],
  };

  let state = newBattle(['puppetDummy'], { aegis: customHero }, { puppetDummy: dummyEnemy });
  state.phase = 'plan';
  state.round = 1;

  // Before true hit, true revealedWeaknesses stays empty -> enemyWeaknessRow shows all unknowns.
  const preRow = enemyWeaknessRow(dummyEnemy, state.units.puppetDummy, state.revealedWeaknesses);
  assert(!preRow.includes('data-weakness="sword"'));
  assert(preRow.includes('data-weakness="unknown"'));

  // Non-damage skill keeps toughness untouched.
  const supportRes = preview(state, [
    {
      id: 'act-sup',
      actor: 'aegis',
      kind: 'skill',
      skill: 'guard-up',
      target: 'aegis',
      ap: 1,
      start: 0,
    },
  ]);
  assert.equal(supportRes.final.units.puppetDummy.toughness, 2);

  // Two sword hits break toughness (2 -> 0) and unlock sword weakness while fire stays unknown.
  const slots = enemyTimeline(state);
  const firstHeroSlot = slots.findIndex((x) => x === null);
  const secondHeroSlot = slots.findIndex((x, idx) => x === null && idx > firstHeroSlot);
  const breakRes = preview(state, [
    {
      id: 'act-1',
      actor: 'aegis',
      kind: 'skill',
      skill: 'slash-twice',
      target: 'puppetDummy',
      ap: 1,
      start: firstHeroSlot,
    },
    {
      id: 'act-2',
      actor: 'aegis',
      kind: 'skill',
      skill: 'slash-twice',
      target: 'puppetDummy',
      ap: 1,
      start: secondHeroSlot,
    },
  ]);

  assert(breakRes.valid);
  assert.equal(breakRes.final.units.puppetDummy.toughness, 0);
  assert.equal(breakRes.final.units.puppetDummy.broken, true);
  assert.equal(breakRes.final.units.puppetDummy.brokenNextRound, true);
  assert.deepEqual(breakRes.final.revealedWeaknesses.puppetDummy, ['sword']);
  assert(breakRes.events.some((ev) => ev.statusTriggers?.some((st) => st.type === 'break')));

  // UI row shows sword unlocked and fire still unknown.
  const unlockedRow = enemyWeaknessRow(
    dummyEnemy,
    breakRes.final.units.puppetDummy,
    breakRes.final.revealedWeaknesses,
    'sword',
  );
  assert(unlockedRow.includes('data-weakness="sword"'));
  assert(unlockedRow.includes('is-matched'));
  assert(unlockedRow.includes('data-weakness="unknown"'));
  assert(enemyToughnessBadge(breakRes.final.units.puppetDummy).includes('is-broken'));

  // Advancing into Round 2 keeps bind active for the whole round, skipping enemy action.
  const round2 = advance(breakRes);
  assert.equal(round2.units.puppetDummy.broken, true);
  assert.equal(round2.units.puppetDummy.brokenNextRound, false);
  assert.equal(round2.units.puppetDummy.buffs.bind, 1);

  const round2Res = preview(round2, []);
  const round2Skip = round2Res.events.find(
    (ev) => ev.type === 'skip' && ev.actor === 'puppetDummy',
  );
  assert(round2Skip && round2Skip.blockedBy === 'bind' && round2Skip.broken === true);

  // Advancing into Round 3 clears broken and restores maxToughness.
  const round3 = advance(round2Res);
  assert.equal(round3.units.puppetDummy.broken, false);
  assert.equal(round3.units.puppetDummy.toughness, 2);

  // Explicit alchemicalPuppet break profile matches specification.
  const puppetProfile = resolveEnemyBreakProfile({ id: 'alchemicalPuppet', overlord: true });
  assert.equal(puppetProfile.maxToughness, 8);
  assert.deepEqual(puppetProfile.weaknesses, ['fire', 'brawl', 'axe', 'lightning']);
});

test('character schema, compiler, and library preserve compatibility and discoveredWeaknesses', () => {
  const plan = characterGenerationPlan({ complexity: 4 });
  const schema = characterOutputSchema({ plan });
  assert(schema.properties.data.properties.attackType.enum.includes('fire'));
  assert(
    schema.properties.data.properties.skills.items.anyOf[0].properties.damageType.enum.includes(
      SUPPORT_TYPE,
    ),
  );
  assert(characterConstraintText(plan).includes('attackType'));

  const v4 = compactCharacterDocument();
  v4.schemaVersion = 4;
  v4.setting.skills[0] = { name: '烈焰斩击', description: '挥出火焰剑弧重创目标。' };
  v4.setting.skills[1] = { name: '净域祈护', description: '赐予友方护盾。' };
  v4.data = {
    archetype: 'lyria',
    weapon: 'sword',
    profile: 'striker',
    skills: [
      {
        kind: 'active',
        ap: 1,
        cost: 'standard',
        target: 'enemy',
        effects: [{ type: 'damage', power: 'high' }],
      },
      {
        kind: 'active',
        ap: 1,
        cost: 'low',
        target: 'ally',
        effects: [{ type: 'shield', power: 'standard' }],
      },
    ],
    entrySkill: { target: 'opposite', effects: [{ type: 'damage', power: 'standard' }] },
  };
  const compiled = normalizeCharacter(v4, 'character-compat-test', { complexity: 4 });
  assert.equal(compiled.combat.skills[0].damageType, 'fire');
  assert.equal(compiled.combat.skills[1].damageType, null);
  assert(DAMAGE_TYPE_IDS.includes(compiled.combat.attackType));

  const lib = newLibrary();
  lib.discoveredWeaknesses = { alchemicalPuppet: ['fire', 'brawl'] };
  const restored = restoreLibrary(structuredClone(lib));
  assert.deepEqual(restored.discoveredWeaknesses, { alchemicalPuppet: ['fire', 'brawl'] });

  const enc = newEncounter(
    { enemyIds: ['mossSlime'], map: 'forest', revealedWeaknesses: { mossSlime: ['fire'] } },
    null,
    0,
  );
  assert.deepEqual(enc.revealedWeaknesses, { mossSlime: ['fire'] });
  assert(
    Array.isArray(enc.units.mossSlime.weaknesses) && enc.units.mossSlime.weaknesses.length >= 2,
  );
});

test('archive-enemies places alchemicalPuppet in canonical overlord order when defined', () => {
  const withPuppet = {
    ...DEFINITIONS,
    alchemicalPuppet: {
      id: 'alchemicalPuppet',
      name: '失败的炼金傀偶',
      speed: [2, 5],
      hp: 360,
      overlord: true,
      boss: true,
      model: 'alchemical-puppet.glb',
    },
  };
  const buckets = buildEnemyArchiveEntries(withPuppet);
  assert.deepEqual(
    buckets.overlord.map((entry) => entry.id),
    ['apepLamb', 'moonTree', 'ares', 'radiantWyvern', 'alchemicalPuppet'],
  );
});
