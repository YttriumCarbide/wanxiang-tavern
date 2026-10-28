import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import { newBattle, preview, advance, makeAction, makeReposition } from '../src/engine.js';
import { EMBLEM_ID, OVERLOAD_EMBLEM_ID } from '../src/emblems.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { prepareCorridorRing, prepareBossEmblem } from '../src/emblem-progression.js';
import { compileRoster, restoreLibrary } from '../src/ai/library.js';
import { upgradeCombatControl } from '../src/ai/combat-control-upgrade.js';
import { playbackBeats } from '../src/playback-timing.js';

function fixture({ boss = false, speed = 4, bind = false, cycle = false } = {}) {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...structuredClone(hero),
        buffs: {},
        skills: [],
        attack: 20,
        limit: 3,
      },
    ]),
  );
  const move = {
    name: '试探',
    slot: 0,
    effects: bind ? [{ type: 'buff', buff: 'bind', value: 1 }] : [],
  };
  const enemy = {
    ...structuredClone(DEFINITIONS.hound),
    id: 'test-enemy',
    boss,
    hp: 100,
    buffs: {},
    speed,
    phaseThreshold: 0.5,
    intents: [move],
    enragedIntents: [move],
    ...(cycle ? { phaseMode: 'cycle' } : {}),
  };
  const state = newBattle([enemy.id], heroes, { [enemy.id]: enemy });
  state.phase = 'plan';
  state.round = 1;
  return state;
}

test('enemy bind skips later player actions without spending sp or action counts; expires this round', () => {
  const state = fixture({ bind: true });
  state.heroDefinitions.aegis.skills = [
    {
      id: 'test',
      name: '消耗技',
      ap: 1,
      mp: 5,
      target: 'enemy',
      effects: [{ type: 'damage', value: 20 }],
    },
  ];
  const before = structuredClone(state);
  const action = makeAction(state, 'aegis', 'test', 'test-enemy', 1);
  const result = preview(state, [action]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert(result.events.some((event) => event.actionId === action.id && event.blockedBy === 'bind'));
  assert.equal(result.final.units.aegis.mp, state.units.aegis.mp);
  assert.equal(result.final.units.aegis.used, 0);
  assert.equal(result.final.units['test-enemy'].hp, state.units['test-enemy'].hp);
  assert(!result.final.units.aegis.buffs.bind);
  assert.deepEqual(state, before);
  assert(!advance(result).units.aegis.buffs.bind);
});

test('bind does not undo an earlier attack and prevents moving a bound participant', () => {
  const state = fixture({ bind: true, speed: 2 });
  const result = preview(state, [
    makeAction(state, 'aegis', 'attack', 'test-enemy', 0),
    makeReposition(0, 3, 3),
  ]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert(result.events.some((event) => event.type === 'hero'));
  assert(result.events.some((event) => event.type === 'skip' && event.blockedBy === 'bind'));
  assert.deepEqual(result.final.formation, state.formation);
  assert.equal(result.final.units['test-enemy'].hp, 80);
});

test('Boss phase is an isolated event, stops remaining output once and preserves immutable forecasts', () => {
  const state = fixture({ boss: true, speed: 1 });
  assert.equal(state.units['test-enemy'].maxHp, 100);
  state.units['test-enemy'].hp = 65;
  const snapshot = structuredClone(state);
  const actions = [0, 1].map((at) => makeAction(state, 'aegis', 'attack', 'test-enemy', at));
  const result = preview(state, actions);
  assert(result.valid, JSON.stringify(result.invalid));
  const phase = result.events.find((event) => event.type === 'bossPhase');
  assert(phase);
  assert(phase.targets.every((id) => phase.after.units[id].buffs.bind === 1));
  assert.equal(result.events.filter((event) => event.type === 'hero').length, 1);
  assert.equal(result.final.units['test-enemy'].hp, 45);
  assert(
    playbackBeats(result).some((beat) => beat.events.length === 1 && beat.events[0] === phase),
  );
  assert(!preview(advance(result), []).events.some((event) => event.type === 'bossPhase'));
  assert.deepEqual(state, snapshot);
});

test('initial threshold crossing has a playable phase event; cycle Boss and one-shot do not invent phases', () => {
  const low = fixture({ boss: true });
  low.units['test-enemy'].hp = 40;
  const result = preview(low, []);
  const phase = result.events.find((event) => event.type === 'bossPhase');
  assert.equal(phase.at, 0);
  assert(playbackBeats(result).some((beat) => beat.events.includes(phase)));
  const cycle = fixture({ boss: true, cycle: true });
  cycle.units['test-enemy'].hp = 40;
  assert(!preview(cycle, []).events.some((event) => event.type === 'bossPhase'));
  const killed = fixture({ boss: true, speed: 1 });
  killed.heroDefinitions.aegis.attack = 200;
  assert(
    !preview(killed, [makeAction(killed, 'aegis', 'attack', 'test-enemy', 0)]).events.some(
      (event) => event.type === 'bossPhase',
    ),
  );
});

test('phase bind cancels the second overloaded cast without replaying an attack animation', () => {
  const state = fixture({ boss: true, speed: 1 });
  state.units['test-enemy'].hp = 65;
  state.heroDefinitions.aegis.emblemId = OVERLOAD_EMBLEM_ID;
  state.heroDefinitions.aegis.skills = [
    {
      id: 'burst',
      name: '斩',
      ap: 1,
      mp: 2,
      target: 'enemy',
      effects: [{ type: 'damage', value: 20 }],
    },
  ];
  state.units.aegis.buffs.overload = 1;
  const result = preview(state, [makeAction(state, 'aegis', 'burst', 'test-enemy', 0)]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert.equal(result.events.filter((event) => event.type === 'hero').length, 1);
  assert(
    result.events.some(
      (event) => event.type === 'skip' && event.repeatIndex === 2 && event.blockedBy === 'bind',
    ),
  );
  assert.equal(result.final.units.aegis.mp, state.units.aegis.mp - 4);
});

test('story rings prefer actual front members without rings, save the recipient and never replace existing rings', () => {
  const library = newCampaign(defaultProtagonist());
  library.characters[0].emblemId = OVERLOAD_EMBLEM_ID;
  const expedition = {
    index: 4,
    exploration: { map: 'ruins', sequence: 1 },
    partyIds: [...library.party],
    heroDefinitions: compileRoster(library),
  };
  assert(prepareCorridorRing(library, expedition, () => 0));
  assert.equal(expedition.corridorRing.actor, 'lyria');
  assert.equal(expedition.corridorRing.name, '伊蒂丝');
  assert.equal(expedition.heroDefinitions.lyria.emblemId, EMBLEM_ID);
  assert.equal(library.characters[0].emblemId, OVERLOAD_EMBLEM_ID);
  assert.equal(
    restoreLibrary(library).characters.find(
      (member) => member.id === expedition.corridorRing.memberId,
    ).emblemId,
    EMBLEM_ID,
  );
  const snapshot = structuredClone(library);
  assert(!prepareCorridorRing(library, expedition, () => 0.9));
  assert.deepEqual(library, snapshot);
});

test('story ring randomness uses eligible candidates; fully occupied roster keeps reward in inventory', () => {
  for (const [random, actor] of [
    [0, 'aegis'],
    [0.99, 'lyria'],
  ]) {
    const library = newCampaign(defaultProtagonist());
    const expedition = {
      index: 4,
      exploration: { map: 'forest', sequence: 1 },
      partyIds: [...library.party],
    };
    assert(prepareBossEmblem(library, expedition, () => random));
    assert.equal(expedition.emblemArrival.recipient.actor, actor);
  }
  const library = newCampaign(defaultProtagonist());
  library.characters.forEach((member) => {
    member.emblemId = EMBLEM_ID;
  });
  const expedition = { index: 4, exploration: { map: 'ruins', sequence: 2 } };
  assert(prepareBossEmblem(library, expedition));
  assert(library.emblems.includes(OVERLOAD_EMBLEM_ID));
  assert.equal(expedition.emblemArrival.recipient, null);
  assert(library.characters.every((member) => member.emblemId === EMBLEM_ID));
});

test('combat worldbook upgrade preserves edits and remains idempotent with current numeric guidance', () => {
  const source = { entries: { 0: { content: '玩家设定', disable: true } } };
  const book = upgradeCombatControl(source);
  assert.deepEqual(book.entries[0], source.entries[0]);
  const content = book.entries[1].content;
  assert(content.includes('1 AP、18 sp'));
  assert(content.includes('优先前场'));
  assert(content.includes('对我方同样生效'));
  assert.deepEqual(upgradeCombatControl(book), book);
  assert.equal(Object.keys(source.entries).length, 1);
});
