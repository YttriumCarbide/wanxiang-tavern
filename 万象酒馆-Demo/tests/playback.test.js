import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../src/app/playback.js';
import { newBattle, preview, advance, makeAction } from '../src/engine.js';
import { playbackBeats, PLAYBACK_BEAT_MS } from '../src/playback-timing.js';

test('2 AP occupied slots retain their beat and end-of-round effects share one beat', () => {
  const result = {
    slots: [null, null, 'enemy'],
    events: [{ at: 0 }, { at: 2 }, { at: 3, type: 'regen' }, { at: 3, type: 'poison' }],
  };
  const beats = playbackBeats(result);
  assert.equal(beats.length, 4);
  assert.deepEqual(
    beats.map((beat) => beat.events.length),
    [1, 0, 1, 2],
  );
});

test('repeated casts occupy separate visual beats in the same timeline slot', () => {
  const events = [
    { at: 0, type: 'hero', actionId: 'one', repeatCount: 2, repeatIndex: 1 },
    { at: 0, type: 'hero', actionId: 'one', repeatCount: 2, repeatIndex: 2 },
    { at: 1, type: 'enemy' },
  ];
  const beats = playbackBeats({ slots: [null, 'enemy'], events });
  assert.deepEqual(
    beats.map((beat) => beat.at),
    [0, 0, 1],
  );
  assert.deepEqual(
    beats.map((beat) => beat.events),
    events.map((event) => [event]),
  );
});

test('actual playback uses identical beat durations when an attack kills, ignoring corpse lifetime', async (t) => {
  const previousDocument = globalThis.document;
  const element = {
    hidden: true,
    textContent: '',
    getAnimations: () => [],
    querySelector() {
      return this;
    },
    animate: () => ({ finished: Promise.resolve() }),
  };
  globalThis.document = { querySelector: () => element, querySelectorAll: () => [] };
  const waits = [];
  t.mock.method(globalThis, 'setTimeout', (callback, duration) => {
    waits.push(duration);
    queueMicrotask(callback);
    return 0;
  });
  async function play(kill) {
    let state = advance(preview(newBattle(['mossSlime', 'sprout']), []));
    if (kill) state.units.mossSlime.hp = 1;
    const plan = [makeAction(state, 'aegis', 'attack', 'mossSlime', 0)];
    const session = {
      ai: { library: { inventory: {}, characters: [], party: [] } },
      journey: { expedition: { id: 'playback-test', partyIds: [], levelUps: [] } },
      battle: {
        state,
        plan,
        forecast: preview(state, plan),
        speed: 2,
        history: [],
        playing: false,
      },
      runtime: {
        mode: 'battle',
        disposed: false,
        view: { snapFormationOnNextDraw() {}, playEvent: () => (kill ? 999999 : 640) },
      },
    };
    const context = {
      session,
      selection: { clearSelection() {} },
      renderer: { render() {} },
      audio: { play() {}, combat() {} },
      generation: { recordRound() {}, save() {} },
      planning: {
        recompute() {
          session.battle.forecast = preview(session.battle.state, session.battle.plan);
        },
      },
    };
    const from = waits.length;
    await createPlayback(context).commit();
    assert.equal(session.battle.playing, false);
    assert.equal(session.battle.state.phase, 'plan');
    return waits.slice(from);
  }
  try {
    const alive = await play(false);
    const killed = await play(true);
    assert.deepEqual(killed, alive);
    assert(alive.every((duration) => duration === PLAYBACK_BEAT_MS / 2));
    assert.equal(alive.length, 6);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
