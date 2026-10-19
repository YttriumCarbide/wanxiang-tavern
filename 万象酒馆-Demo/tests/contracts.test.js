import { parseTimelineDrop } from '../src/app/drag-payload.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, ENEMIES, BOSSES, BUFFS, ENCOUNTERS } from '../src/data.js';
import { validateGameData, assertGameData } from '../src/validation.js';
import { newBattle, preview, makeAction } from '../src/engine.js';
import { createEventScope } from '../src/shared/events.js';
import { createResourceScope } from '../src/shared/resources.js';
import { portraitUrl } from '../src/portraits.js';
import { newLibrary, compileRoster } from '../src/ai/library.js';

test('shipped configuration validates and reports conflicting definitions together', () => {
  assertGameData();
  const config = structuredClone({
    heroes: HEROES,
    enemies: ENEMIES,
    bosses: BOSSES,
    buffs: BUFFS,
    encounters: ENCOUNTERS,
  });
  config.heroes[0].id = config.heroes[1].id;
  config.heroes[0].skills[0].effects[0].type = 'missing-effect';
  const errors = validateGameData(config);
  assert(errors.some((error) => error.includes('unique')));
  assert(errors.some((error) => error.includes('missing-effect')));
});

test('duplicate commands and invalid target sides produce invalid plans', () => {
  const state = newBattle();
  const action = makeAction(state, 'morrow', 'attack', 'mossSlime', 0);
  assert.equal(preview(state, [action, { ...action }]).valid, false);
  assert.equal(preview(state, [{ ...action, target: 'aegis' }]).valid, false);
});

test('disposing event ownership prevents remounted listeners from accumulating', () => {
  const target = new EventTarget();
  const scope = createEventScope();
  let calls = 0;
  scope.on(target, 'refresh', () => calls++);
  target.dispatchEvent(new Event('refresh'));
  scope.dispose();
  scope.dispose();
  target.dispatchEvent(new Event('refresh'));
  assert.equal(calls, 1);
});

test('GPU ownership is idempotent and disposes late async resources', () => {
  const scope = createResourceScope();
  let releases = 0;
  const resource = { dispose: () => releases++ };
  scope.track(resource);
  scope.track(resource);
  scope.dispose();
  scope.dispose();
  assert.equal(releases, 1);
  scope.track({ dispose: () => releases++ });
  assert.equal(releases, 2);
});

test('malformed external drags are rejected before they can arm a skill', () => {
  assert.equal(parseTimelineDrop('{bad json'), null);
  assert.equal(
    parseTimelineDrop(JSON.stringify({ kind: 'new-skill', actor: 'missing', skill: 'attack' })),
    null,
  );
  assert.deepEqual(
    parseTimelineDrop(
      JSON.stringify({
        kind: 'new-skill',
        actor: 'morrow',
        skill: 'attack',
        target: { unexpected: true },
      }),
    ),
    { kind: 'new-skill', actor: 'morrow', skill: 'attack' },
  );
});

test('custom portrait contract resolves fallback and custom URLs cleanly', () => {
  assert.equal(portraitUrl({ portrait: 'guardian' }), './assets/portraits/guardian.svg');
  assert.equal(
    portraitUrl({ portrait: 'guardian', customPortrait: 'data:image/png;base64,custom' }),
    'data:image/png;base64,custom',
  );
  const lib = newLibrary();
  lib.characters[0].combat.customPortrait = 'data:image/webp;base64,custom-aegis';
  const roster = compileRoster(lib);
  assert.equal(roster.aegis.customPortrait, 'data:image/webp;base64,custom-aegis');
});
