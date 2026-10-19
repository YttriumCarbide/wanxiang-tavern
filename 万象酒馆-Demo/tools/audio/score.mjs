import { MUSIC } from '../../src/audio/config.js';

/** Original scores: one note list per track, independent of the synthesizer. */
export function musicScore(scene) {
  const config = MUSIC[scene],
    beat = 60 / config.bpm,
    notes = [];
  const add = (bar, at, midi, length, instrument, gain, pan = 0) => {
    notes.push({
      at: (bar * config.beats + at) * beat,
      midi,
      length: length * beat,
      instrument,
      gain,
      pan,
    });
  };
  if (scene === 'inn') {
    const chords = [
      [43, 55, 59, 62],
      [48, 55, 60, 64],
      [50, 57, 62, 66],
      [40, 55, 59, 64],
      [48, 55, 60, 64],
      [50, 57, 62, 66],
      [43, 55, 59, 62],
      [50, 57, 60, 66],
    ];
    const melody = [
      [67, 71, 74, 71, 69, 67],
      [64, 67, 72, 71, 67, 64],
      [66, 69, 74, 76, 74, 69],
      [67, 71, 76, 74, 71, 67],
      [72, 71, 67, 64, 67, 69],
      [69, 74, 72, 69, 66, 62],
      [67, 69, 71, 74, 71, 67],
      [66, 69, 67, 66, 62, null],
    ];
    for (let bar = 0; bar < config.bars; bar++) {
      const chord = chords[bar % 8],
        phrase = melody[bar % 8];
      add(bar, 0, chord[0], 1.2, 'bass', 0.22, -0.05);
      add(bar, 2, chord[0] + 7, 0.65, 'bass', 0.12, -0.05);
      for (let step = 0; step < 6; step++) {
        add(bar, step / 2, chord[1 + (step % 3)], 0.8, 'lute', 0.16, -0.32);
        if (phrase[step] !== null && (bar % 4 !== 3 || step % 2 === 0))
          add(
            bar,
            step / 2 + 0.05,
            phrase[step] + (bar >= 16 && bar < 24 ? 12 : 0),
            step === 5 ? 0.42 : 0.46,
            'flute',
            0.115,
            0.25,
          );
      }
      for (const time of [1, 2]) {
        add(bar, time, 52, 0.13, 'brush', 0.045, 0.35);
        add(bar, time, chord[2], 0.55, 'lute', 0.09, 0.35);
      }
      if (bar % 8 === 7) add(bar, 2.5, 78, 0.65, 'bell', 0.035, 0.4);
    }
  } else {
    const chords = [
      [38, 50, 53, 57],
      [34, 46, 50, 53],
      [36, 48, 52, 55],
      [33, 45, 49, 52],
      [38, 50, 53, 57],
      [41, 53, 57, 60],
      [31, 43, 46, 50],
      [33, 45, 49, 52],
    ];
    const melody = [
      [74, 69, 72, 74],
      [77, 74, 70, 69],
      [72, 67, 76, 74],
      [73, 69, 64, 69],
      [74, 77, 81, 77],
      [76, 72, 69, 72],
      [70, 74, 77, 74],
      [73, 76, 69, 73],
    ];
    const ostinato = [0, 2, 1, 2, 0, 2, 1, 3];
    for (let bar = 0; bar < config.bars; bar++) {
      const chord = chords[bar % 8];
      for (let step = 0; step < 8; step++) {
        add(bar, step / 2, chord[ostinato[step]], 0.42, 'strings', 0.1, step % 2 ? 0.35 : -0.35);
        add(bar, step / 2, chord[0] - 12, 0.34, 'bass', step % 2 ? 0.12 : 0.2, 0);
        add(bar, step / 2, 80, 0.09, 'brush', 0.035, step % 2 ? 0.45 : -0.45);
      }
      if (bar % 8 < 6)
        for (let time = 0; time < 4; time++)
          add(bar, time + 0.02, melody[bar % 8][time], 0.78, 'horn', bar < 8 ? 0.075 : 0.11, 0.12);
      for (const time of [0, 2]) add(bar, time, 36, 0.6, 'kick', 0.34);
      for (const time of [1, 3]) add(bar, time, 50, 0.24, 'snare', 0.15, -0.12);
      if (bar % 4 === 3)
        for (let step = 0; step < 3; step++)
          add(bar, 3 + step / 3, 45 - step * 2, 0.25, 'tom', 0.13, (step - 1) * 0.3);
      for (const midi of chord.slice(1)) add(bar, 0, midi, 3.7, 'pad', 0.038, -0.2);
    }
  }
  return { ...config, duration: config.bars * config.beats * beat, notes };
}
