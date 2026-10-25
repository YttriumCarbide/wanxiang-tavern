import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MUSIC, encounterMusic, audioPreferences, DEFAULT_AUDIO } from '../src/audio/config.js';
import { REGIONS } from '../src/content/regions.js';
import { SOUND_CUES, combatCues, combatSoundStyle } from '../src/audio/cues.js';
import { SFX, SFX_NAMES } from '../src/audio/sfx.js';
import { HEROES, ENEMIES, BOSSES } from '../src/data.js';
import { newBattle, advance, preview, makeAction } from '../src/engine.js';

test('audio preferences clamp invalid input and preserve independent mute switches', () => {
  assert.deepEqual(audioPreferences(null), DEFAULT_AUDIO);
  assert.deepEqual(
    audioPreferences({ music: 8, effects: -5, musicMuted: true, effectsMuted: 'yes' }),
    { music: 1, effects: 0, musicMuted: true, effectsMuted: false },
  );
  assert.equal(audioPreferences({ music: NaN, effects: Infinity }).music, DEFAULT_AUDIO.music);
});

test('game music tracks exist, load properly and are valid audio files', async () => {
  assert.ok(MUSIC.inn && MUSIC.battle && MUSIC.boss);
  for (const [scene, track] of Object.entries(MUSIC)) {
    const file = await readFile(new URL('../' + track.file, import.meta.url));
    assert(file.length > 500000, `${scene}: file too small`);
    assert.equal(typeof track.name, 'string');
    assert(track.name.length > 0);
  }
});

test('all battle and interface cues have original layered WAV samples', async () => {
  assert.equal(SFX_NAMES.length, Object.keys(SOUND_CUES).length);
  for (const name of Object.keys(SOUND_CUES)) {
    assert(SFX[name], `${name}: missing sample mapping`);
    const file = await readFile(
      new URL('../' + SFX[name].file.replace(/^\.\//, ''), import.meta.url),
    );
    assert(file.length > 4000, `${name}: sample too small`);
    assert.equal(file.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(file.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.equal(file.readUInt16LE(20), 1, `${name}: PCM expected`);
    assert.equal(file.readUInt16LE(22), 1, `${name}: mono expected`);
    assert.equal(file.readUInt32LE(24), 44100, `${name}: sample rate`);
    assert(SFX[name].gain > 0 && SFX[name].gain <= 1);
    assert(SFX[name].jitter >= 0 && SFX[name].jitter <= 0.1);
  }
});

test('map encounters use their assigned tracks and keep Boss music', () => {
  for (const map of Object.keys(REGIONS)) {
    const normal = MUSIC[encounterMusic({ map, boss: false })];
    const boss = MUSIC[encounterMusic({ map, boss: true })];
    assert.equal(
      normal.file,
      map === 'forge'
        ? './assets/audio/forge-encounter.mp3'
        : map === 'frost'
          ? './assets/audio/xueyuan.mp3'
          : './assets/audio/encounter.mp3',
    );
    assert.equal(
      boss.file,
      map === 'ruins' ? './assets/audio/battle.m4a' : './assets/audio/boss.m4a',
    );
  }
});

test('every weapon and enemy has startup and impact cues, synchronized with attack speed', () => {
  for (const def of [...HEROES, ...ENEMIES, ...BOSSES]) {
    const style = combatSoundStyle(def.weapon || def.attackStyle);
    assert(SOUND_CUES[style]?.length > 0, style);
    assert(SOUND_CUES[`${style}-hit`]?.length > 0, style);
  }
  const state = newBattle();
  const event = preview(state, [makeAction(state, 'morrow', 'attack', 'mossSlime', 0)]).events[0];
  const normal = combatCues(event, state, 1),
    fast = combatCues(event, state, 2);
  assert.equal(normal[0].name, 'staff');
  assert.equal(normal[1].name, 'staff-hit');
  assert.equal(normal[1].delay, fast[1].delay * 2);
  assert.deepEqual(combatCues({ type: 'wait' }, state), []);
  const next = advance(preview(state, []));
  assert(
    combatCues(
      preview(next, []).events.find((item) => item.type === 'enemy'),
      next,
    ).length > 0,
  );
});

test('a confirmed Boss death schedules charge, fracture and lingering tones with playback speed', () => {
  const state = newBattle(['bossGate']);
  state.units.bossGate.hp = 1;
  state.units.bossGate.buffs = {};
  const event = preview(state, [makeAction(state, 'aegis', 'attack', 'bossGate', 0)]).events[0];
  const cues = combatCues(event, state).filter((cue) => cue.name.startsWith('boss-death'));
  assert.deepEqual(
    cues.map((cue) => cue.name),
    ['boss-death-charge', 'boss-death-break', 'boss-death-tail'],
  );
  assert(cues.every((cue) => SOUND_CUES[cue.name].length >= 3));
  const fast = combatCues(event, state, 2).filter((cue) => cue.name.startsWith('boss-death'));
  cues.forEach((cue, index) => assert.equal(cue.delay, fast[index].delay * 2));
  const alive = structuredClone(event);
  alive.after.units.bossGate.hp = 1;
  assert(!combatCues(alive, state).some((cue) => cue.name.startsWith('boss-death')));
  assert(!combatCues(event, event.after).some((cue) => cue.name.startsWith('boss-death')));
});
