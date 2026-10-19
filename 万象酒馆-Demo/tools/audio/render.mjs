const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const tau = 2 * Math.PI;

export function renderScore(score, sampleRate = 22050) {
  const frames = Math.round(score.duration * sampleRate),
    left = new Float32Array(frames),
    right = new Float32Array(frames);
  let seed = 71371;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (const note of score.notes) {
    const hz = frequency(note.midi),
      start = Math.round(note.at * sampleRate),
      duration = note.length + 0.15,
      count = Math.ceil(duration * sampleRate),
      l = Math.sqrt((1 - note.pan) / 2) * note.gain,
      r = Math.sqrt((1 + note.pan) / 2) * note.gain;
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate,
        phase = tau * hz * t,
        attack = Math.min(1, t / (note.instrument === 'lute' ? 0.004 : 0.025)),
        release = Math.max(0, Math.min(1, (duration - t) / 0.14));
      let value = 0;
      switch (note.instrument) {
        case 'lute':
          value =
            (Math.sin(phase) +
              0.42 * Math.sin(phase * 2) * Math.exp(-t * 5) +
              0.22 * Math.sin(phase * 3) * Math.exp(-t * 9) +
              0.09 * Math.sin(phase * 5)) *
            Math.exp(-t * 4.8);
          break;
        case 'flute': {
          const breath = phase + 0.55 * Math.sin(tau * 4.8 * t) * Math.min(1, t * 8);
          value =
            (Math.sin(breath) + 0.13 * Math.sin(breath * 2) + 0.035 * Math.sin(breath * 3)) * 0.75;
          break;
        }
        case 'strings':
          for (let h = 1; h <= 6; h++)
            value += (Math.sin(phase * h) + 0.45 * Math.sin(phase * h * 1.003)) / h ** 1.7;
          value *= 0.55 * Math.exp(-t * 3.5);
          break;
        case 'horn':
          value =
            (Math.sin(phase) +
              0.32 * Math.sin(phase * 2) +
              0.19 * Math.sin(phase * 3) +
              0.08 * Math.sin(phase * 4)) *
            0.6;
          break;
        case 'pad':
          value =
            (Math.sin(phase) + 0.3 * Math.sin(phase * 1.004) + 0.12 * Math.sin(phase * 2)) *
            Math.min(1, t * 3) *
            0.45;
          break;
        case 'bass':
          value = (Math.sin(phase) + 0.22 * Math.sin(phase * 2)) * Math.exp(-t * 2.5);
          break;
        case 'bell':
          value =
            (Math.sin(phase) + 0.3 * Math.sin(phase * 2.76) + 0.1 * Math.sin(phase * 5.4)) *
            Math.exp(-t * 5);
          break;
        case 'kick':
          value = Math.sin(tau * (48 * t + 8 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 10);
          break;
        case 'snare':
          value = (noise() * 0.65 + Math.sin(phase) * 0.35) * Math.exp(-t * 20);
          break;
        case 'tom':
          value = Math.sin(phase * (1 + 0.018 * Math.exp(-t * 20))) * Math.exp(-t * 15);
          break;
        case 'brush':
          value = noise() * Math.exp(-t * 45) * 0.5;
          break;
      }
      const sample = value * attack * release,
        frame = (start + i) % frames;
      left[frame] += sample * l;
      right[frame] += sample * r;
    }
  }
  // Short, cross-channel room reflections wrap into the loop instead of cutting off tails.
  for (const channel of [left, right]) {
    const dry = channel.slice();
    for (const [delay, gain] of [
      [0.071, 0.1],
      [0.131, 0.065],
      [0.219, 0.04],
    ]) {
      const offset = Math.round(delay * sampleRate);
      for (let frame = 0; frame < frames; frame++)
        channel[(frame + offset) % frames] += dry[frame] * gain;
    }
  }
  let peak = 0,
    energy = 0;
  for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    energy += left[i] ** 2 + right[i] ** 2;
  }
  const gain = Math.min(0.83 / peak, 0.16 / Math.sqrt(energy / (frames * 2)));
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767), 46 + i * 4);
  }
  return wav;
}
