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
import {
  advance,
  enemyTimeline,
  newBattle,
  newEncounter,
  openBreakWindow,
  preview,
  syncEnemyBreakWindows,
} from '../src/engine.js';
import { DEFINITIONS, HEROES } from '../src/data.js';
import { LEARNABLE_SKILLS } from '../src/content/learnable-skills.js';
import { enemyBreakBar, resourceBars } from '../src/ui.js';
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

test('conditional Break Window: stratified tiers, major (-2)/minor (-1) open weaknesses, same-round break amplification, and post-move closure', () => {
  // Verify stratified tier distribution across authored DEFINITIONS
  const allEnemies = Object.values(DEFINITIONS).filter((entry) => entry.speed);
  const ordinary = allEnemies.filter((d) => !d.elite && !d.boss && !d.overlord && !d.standOnCard);
  const elites = allEnemies.filter((d) => d.elite && !d.boss && !d.overlord);
  const bosses = allEnemies.filter((d) => d.boss && !d.overlord);
  const overlords = allEnemies.filter((d) => d.overlord);
  const ordWithBreak = ordinary.filter((d) => resolveEnemyBreakProfile(d).hasBreak);
  const eliteWithBreak = elites.filter((d) => resolveEnemyBreakProfile(d).hasBreak);
  assert(
    ordWithBreak.length >= Math.floor(ordinary.length * 0.25) &&
      ordWithBreak.length <= Math.ceil(ordinary.length * 0.42),
    `Expected ~1/3 ordinary break profiles, got ${ordWithBreak.length}/${ordinary.length}`,
  );
  assert(
    ordWithBreak.every((d) => {
      const p = resolveEnemyBreakProfile(d);
      return p.mode === 'plain' && p.maxToughness >= 1 && p.maxToughness <= 2;
    }),
  );
  assert(
    eliteWithBreak.length >= Math.floor(elites.length * 0.55) &&
      eliteWithBreak.length <= Math.ceil(elites.length * 0.78),
    `Expected ~2/3 elite break profiles, got ${eliteWithBreak.length}/${elites.length}`,
  );
  assert(
    bosses.every(
      (d) => resolveEnemyBreakProfile(d).hasBreak && resolveEnemyBreakProfile(d).mode === 'special',
    ),
  );
  assert(
    overlords.every(
      (d) => resolveEnemyBreakProfile(d).hasBreak && resolveEnemyBreakProfile(d).mode === 'special',
    ),
  );

  // When a break window is not open, enemyBreakBar renders nothing (no permanent shield or ? pills).
  const closedState = newBattle(['millVoleAlpha']);
  closedState.phase = 'plan';
  closedState.round = 1;
  syncEnemyBreakWindows(closedState);
  assert.equal(closedState.units.millVoleAlpha.breakWindow, null);
  assert.equal(enemyBreakBar(DEFINITIONS.millVoleAlpha, closedState.units.millVoleAlpha), '');

  // Special break window: major weakness (-2) vs minor weakness (-1), zero '?' icons, +50% break damage, 1-round duration.
  const dummyEnemy = {
    id: 'puppetDummy',
    name: '试作魔偶',
    speed: 1,
    hp: 300,
    attack: 5,
    maxToughness: 3,
    weaknesses: ['fire', 'sword'],
    intents: [{ name: '重击', effects: [{ type: 'damage', value: 5 }] }],
  };
  const customHero = {
    ...HEROES[0],
    id: 'aegis',
    limit: 3,
    attackType: 'sword',
    skills: [
      {
        id: 'slash-minor',
        name: '小弱点剑击',
        ap: 1,
        mp: 0,
        target: 'enemy',
        damageType: 'sword',
        effects: [{ type: 'damage', value: 10 }],
      },
      {
        id: 'fire-major',
        name: '大弱点爆炎',
        ap: 1,
        mp: 0,
        target: 'enemy',
        damageType: 'fire',
        effects: [{ type: 'damage', value: 10 }],
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
  syncEnemyBreakWindows(state);

  // UI displays all weaknesses openly (no '?') and highlights the golden -2 major weakness.
  const openUi = enemyBreakBar(
    dummyEnemy,
    state.units.puppetDummy,
    state.units.puppetDummy,
    'fire',
  );
  assert(!openUi.includes('is-unknown') && !openUi.includes('data-weakness="unknown"'));
  assert(openUi.includes('data-weakness="fire"') && openUi.includes('data-weakness-tier="major"'));
  assert(openUi.includes('is-major') && openUi.includes('-2'));
  assert(openUi.includes('data-weakness="sword"') && openUi.includes('is-minor'));

  // Non-damage skill leaves breakWindow untouched.
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
  assert.equal(supportRes.events[0].after.units.puppetDummy.breakWindow.current, 3);
  assert.equal(supportRes.final.units.puppetDummy.breakWindow, null);

  // Minor weakness hit (-1: 3 -> 2), then Major weakness hit (-2: 2 -> 0 -> BREAK!) + follow-up hit deals +50% (10 -> 15).
  const slots = enemyTimeline(state);
  const s0 = slots.findIndex((x) => x === null);
  const s1 = slots.findIndex((x, idx) => x === null && idx > s0);
  const s2 = slots.findIndex((x, idx) => x === null && idx > s1);
  const breakRes = preview(state, [
    {
      id: 'hit-minor',
      actor: 'aegis',
      kind: 'skill',
      skill: 'slash-minor',
      target: 'puppetDummy',
      ap: 1,
      start: s0,
    },
    {
      id: 'hit-major',
      actor: 'aegis',
      kind: 'skill',
      skill: 'fire-major',
      target: 'puppetDummy',
      ap: 1,
      start: s1,
    },
    {
      id: 'hit-amp',
      actor: 'aegis',
      kind: 'skill',
      skill: 'slash-minor',
      target: 'puppetDummy',
      ap: 1,
      start: s2,
    },
  ]);

  assert(breakRes.valid, JSON.stringify(breakRes.invalid));
  assert.equal(breakRes.final.units.puppetDummy.broken, true);
  assert.equal(breakRes.final.units.puppetDummy.breakWindow, null);
  assert.equal(breakRes.final.units.puppetDummy.buffs.bind || 0, 0);
  assert.equal(breakRes.final.units.puppetDummy.hp, 300 - 10 - 10 - 15);
  assert(breakRes.events.some((ev) => ev.statusTriggers?.some((st) => st.type === 'break')));
  assert(
    breakRes.events.some(
      (ev) => ev.type === 'skip' && ev.actor === 'puppetDummy' && ev.broken === true,
    ),
  );
  const brokenUi = enemyBreakBar(dummyEnemy, breakRes.final.units.puppetDummy);
  assert(brokenUi.includes('is-broken') && brokenUi.includes('受伤+50%'));

  // Advancing into Round 2 immediately clears broken and lets enemy act again (no 2-round stun).
  const round2 = advance(breakRes);
  assert.equal(round2.units.puppetDummy.broken, false);
  const r2Preview = preview(round2, []);
  assert(r2Preview.events.some((ev) => ev.type === 'enemy' && ev.actor === 'puppetDummy'));

  // If the enemy acts before being broken, its breakWindow closes immediately on that move.
  const missedState = newBattle(
    ['puppetDummy'],
    { aegis: customHero },
    {
      puppetDummy: {
        ...dummyEnemy,
        speed: 4,
      },
    },
  );
  missedState.phase = 'plan';
  missedState.round = 1;
  syncEnemyBreakWindows(missedState);
  const missedSlots = enemyTimeline(missedState);
  const enemySlot = missedSlots.indexOf('puppetDummy');
  const postEnemySlot = missedSlots.findIndex((x, idx) => x === null && idx > enemySlot);
  const postRes = preview(missedState, [
    {
      id: 'late-hit',
      actor: 'aegis',
      kind: 'skill',
      skill: 'fire-major',
      target: 'puppetDummy',
      ap: 1,
      start: postEnemySlot,
    },
  ]);
  assert.equal(postRes.final.units.puppetDummy.broken, false);
  assert.equal(postRes.final.units.puppetDummy.breakWindow, null);

  // Plain ordinary monster break bar takes any damage type (-1) and renders without weakness icons.
  const houndState = newBattle(['hound']);
  houndState.phase = 'plan';
  houndState.round = 2;
  openBreakWindow(houndState, 'hound');
  assert.equal(houndState.units.hound.breakWindow.mode, 'plain');
  assert(houndState.units.hound.breakWindow.max <= 2);
  const houndUi = enemyBreakBar(DEFINITIONS.hound, houndState.units.hound);
  assert(houndUi.includes('is-plain') && !houndUi.includes('enemy-weakness-pill'));
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
    { enemyIds: ['bossGate'], map: 'ruins', revealedWeaknesses: { bossGate: ['lightning'] } },
    null,
    0,
  );
  assert.deepEqual(enc.revealedWeaknesses, { bossGate: ['lightning'] });
  assert(Array.isArray(enc.units.bossGate.weaknesses) && enc.units.bossGate.weaknesses.length >= 2);
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
