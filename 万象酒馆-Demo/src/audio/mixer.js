import { MUSIC, audioPreferences } from './config.js';
import { SOUND_CUES, combatCues } from './cues.js';
import { SFX, SFX_NAMES } from './sfx.js';

/** One audio context and two buses per application, created only on a trusted gesture. */
export function createAudioMixer(preferences, onChange = () => {}) {
  let settings = audioPreferences(preferences),
    context = null,
    musicBus,
    effectsBus,
    analyser,
    wanted = 'inn',
    current = null,
    disposed = false,
    unlocked = false,
    error = '',
    sfxError = '',
    sfxPreloaded = false,
    noiseBuffer;
  const buffers = new Map(),
    loading = new Map(),
    sfxBuffers = new Map(),
    sfxLoading = new Map(),
    tracks = new Set(),
    voices = new Set();
  const abort = new AbortController();
  function updateLevels() {
    if (!context) return;
    for (const [bus, level] of [
      [musicBus, settings.musicMuted ? 0 : settings.music],
      [effectsBus, settings.effectsMuted ? 0 : settings.effects],
    ])
      bus.gain.setTargetAtTime(level, context.currentTime, 0.025);
  }
  async function load(scene) {
    if (buffers.has(scene)) return buffers.get(scene);
    if (!loading.has(scene))
      loading.set(
        scene,
        (async () => {
          try {
            const response = await fetch(MUSIC[scene].file, { signal: abort.signal });
            if (!response.ok) throw Error('音乐文件载入失败');
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (!disposed) buffers.set(scene, buffer);
            return buffer;
          } catch (failure) {
            if (!disposed && failure.name !== 'AbortError') {
              error = '音乐载入失败，可再次点击重试';
              loading.delete(scene);
              onChange();
            }
            return null;
          }
        })(),
      );
    return loading.get(scene);
  }
  function loadSfx(name) {
    if (!context || !SFX[name] || disposed) return Promise.resolve(null);
    if (sfxBuffers.has(name)) return Promise.resolve(sfxBuffers.get(name));
    if (!sfxLoading.has(name))
      sfxLoading.set(
        name,
        (async () => {
          try {
            const response = await fetch(SFX[name].file, { signal: abort.signal });
            if (!response.ok) throw Error('音效文件载入失败');
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (!disposed) {
              sfxBuffers.set(name, buffer);
              sfxError = '';
            }
            return buffer;
          } catch (failure) {
            if (!disposed && failure.name !== 'AbortError') {
              sfxError = '音效载入失败';
              onChange();
            }
            return null;
          } finally {
            sfxLoading.delete(name);
          }
        })(),
      );
    return sfxLoading.get(name);
  }
  async function preloadSfx() {
    if (!context || !unlocked || disposed || sfxPreloaded) return;
    sfxPreloaded = true;
    await Promise.allSettled(SFX_NAMES.map((name) => loadSfx(name)));
    if (!disposed) onChange();
  }
  async function refreshMusic() {
    if (!context || !unlocked || disposed) return;
    const scene = wanted,
      buffer = await load(scene);
    if (!buffer || disposed || wanted !== scene || current?.scene === scene) return;
    const now = context.currentTime;
    if (current) {
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.gain.gain.linearRampToValueAtTime(0, now + 0.75);
      current.source.stop(now + 0.8);
    }
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(musicBus);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.8);
    const track = { scene, source, gain };
    tracks.add(track);
    source.onended = () => {
      tracks.delete(track);
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
    current = track;
    error = '';
    onChange();
  }
  async function unlock() {
    if (disposed) return;
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) {
          error = '此浏览器不支持音频';
          onChange();
          return;
        }
        context = new Audio();
        musicBus = context.createGain();
        effectsBus = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.ratio.value = 8;
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        musicBus.connect(limiter);
        effectsBus.connect(limiter);
        limiter.connect(analyser).connect(context.destination);
        musicBus.gain.value = 0;
        effectsBus.gain.value = 0;
        updateLevels();
      }
      if (context.state !== 'running') await context.resume();
      if (disposed) return;
      unlocked = true;
      onChange();
      void refreshMusic();
      void preloadSfx();
    } catch {
      error = '点击页面以启用声音';
      onChange();
    }
  }
  function trimVoices() {
    if (voices.size < 48) return;
    const oldest = voices.values().next().value;
    try {
      oldest.stop();
    } catch {
      /* The voice already finished. */
    }
  }
  function playSample(name, delay, buffer) {
    const definition = SFX[name];
    if (!definition) return false;
    trimVoices();
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * Math.max(0, definition.jitter || 0);
    gain.gain.value = definition.gain;
    let panner = null;
    if (context.createStereoPanner) {
      panner = context.createStereoPanner();
      panner.pan.value = (Math.random() * 2 - 1) * 0.08;
      source.connect(gain).connect(panner).connect(effectsBus);
    } else {
      source.connect(gain).connect(effectsBus);
    }
    const at = context.currentTime + 0.005 + delay;
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    source.start(at);
    return true;
  }
  function playSynth(name, delay) {
    for (const [wave, from, to, duration, level, offset = 0, cutoff = 1800] of SOUND_CUES[name] ||
      []) {
      trimVoices();
      const at = context.currentTime + 0.005 + delay + offset,
        gain = context.createGain();
      let source, filter;
      if (wave === 'noise') {
        if (!noiseBuffer) {
          noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
          const samples = noiseBuffer.getChannelData(0);
          let seed = 9173;
          for (let i = 0; i < samples.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            samples[i] = seed / 2147483648 - 1;
          }
        }
        source = context.createBufferSource();
        source.buffer = noiseBuffer;
        filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.7;
        source.connect(filter).connect(gain);
      } else {
        source = context.createOscillator();
        source.type = wave;
        source.frequency.setValueAtTime(from, at);
        source.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
        source.connect(gain);
      }
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + Math.min(0.012, duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      gain.connect(effectsBus);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
      source.start(at);
      source.stop(at + duration + 0.02);
    }
  }
  function play(name, delay = 0) {
    if (
      !context ||
      context.state !== 'running' ||
      disposed ||
      settings.effectsMuted ||
      settings.effects === 0
    )
      return;
    const buffer = sfxBuffers.get(name);
    if (buffer && playSample(name, delay, buffer)) return;
    if (SFX[name]) void loadSfx(name);
    playSynth(name, delay);
  }
  function status() {
    let rms = 0;
    if (analyser && context.state === 'running') {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    }
    return {
      scene: wanted,
      track: current?.scene || null,
      title: MUSIC[wanted].name,
      state: context?.state || 'locked',
      unlocked,
      settings: { ...settings },
      tracks: tracks.size,
      voices: voices.size,
      loaded: [...buffers.keys()],
      sfxLoaded: [...sfxBuffers.keys()],
      sfxTotal: SFX_NAMES.length,
      sfxError,
      sfxPreloaded,
      rms,
      error,
      disposed,
    };
  }
  return {
    unlock,
    play,
    status,
    setScene(scene) {
      if (!MUSIC[scene] || disposed) return;
      wanted = scene;
      void refreshMusic();
      onChange();
    },
    setPreferences(value) {
      settings = audioPreferences(value);
      updateLevels();
      onChange();
    },
    combat(event, before, speed) {
      for (const cue of combatCues(event, before, speed)) play(cue.name, cue.delay);
    },
    suspend() {
      if (context?.state === 'running') void context.suspend().catch(() => {});
    },
    resume() {
      if (unlocked) void unlock();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      for (const voice of voices) {
        voice.onended = null;
        try {
          voice.stop();
        } catch {
          /* Already ended. */
        }
        voice.disconnect();
      }
      for (const track of tracks) {
        track.source.onended = null;
        try {
          track.source.stop();
        } catch {
          /* Already ended. */
        }
        track.source.disconnect();
        track.gain.disconnect();
      }
      voices.clear();
      tracks.clear();
      buffers.clear();
      loading.clear();
      sfxBuffers.clear();
      sfxLoading.clear();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
