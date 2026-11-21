import { MUSIC, SCENE_TRACKS, audioPreferences } from './config.js';
import { SERVICE_CUES, SOUND_CUES, combatCues } from './cues.js';
import { SFX, SFX_NAMES } from './sfx.js';

/** One audio context and two buses per application, created only on a trusted gesture. */
export function createAudioMixer(preferences, onChange = () => {}, options = {}) {
  function pickTrackForScene(scene, exclude = null) {
    const pool = SCENE_TRACKS[scene];
    if (!pool?.length) return MUSIC[scene] ? scene : 'inn';
    if (pool.length === 1) return pool[0];
    const candidates = exclude ? pool.filter((id) => id !== exclude) : pool;
    const list = candidates.length ? candidates : pool;
    return list[Math.floor(Math.random() * list.length)];
  }
  const initialTrack = pickTrackForScene('inn');
  const unlockedTracks = new Set(
    (Array.isArray(options.unlockedTracks) ? options.unlockedTracks : []).filter((id) =>
      Boolean(MUSIC[id]),
    ),
  );
  let settings = audioPreferences(preferences),
    context = null,
    musicBus,
    effectsBus,
    analyser,
    wantedScene = 'inn',
    activeTrack = initialTrack,
    pinnedTrack = null,
    previewTrack = null,
    refreshToken = 0,
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
    lastSceneTracks = new Map([['inn', initialTrack]]),
    tracks = new Set(),
    voices = new Set();
  const abort = new AbortController();
  function targetTrack() {
    if (previewTrack && MUSIC[previewTrack]) return previewTrack;
    if (pinnedTrack && MUSIC[pinnedTrack]) return pinnedTrack;
    return activeTrack;
  }
  function updateLevels() {
    if (!context) return;
    for (const [bus, level] of [
      [musicBus, settings.musicMuted ? 0 : settings.music],
      [effectsBus, settings.effectsMuted ? 0 : settings.effects],
    ])
      bus.gain.setTargetAtTime(level, context.currentTime, 0.025);
  }
  async function load(trackId) {
    if (!MUSIC[trackId]) return null;
    if (buffers.has(trackId)) return buffers.get(trackId);
    if (!loading.has(trackId))
      loading.set(
        trackId,
        (async () => {
          try {
            const response = await fetch(MUSIC[trackId].file, { signal: abort.signal });
            if (!response.ok) throw Error('音乐文件载入失败');
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (!disposed) buffers.set(trackId, buffer);
            return buffer;
          } catch (failure) {
            if (!disposed && failure.name !== 'AbortError') {
              error = '音乐载入失败，可再次点击重试';
              loading.delete(trackId);
              onChange();
            }
            return null;
          }
        })(),
      );
    return loading.get(trackId);
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
  async function refreshMusic({ quick = false } = {}) {
    if (!context || !unlocked || disposed) return;
    const trackId = targetTrack();
    if (current?.trackId === trackId) return;
    const token = ++refreshToken;
    const buffer = await load(trackId);
    if (
      !buffer ||
      disposed ||
      token !== refreshToken ||
      targetTrack() !== trackId ||
      current?.trackId === trackId
    )
      return;
    const now = context.currentTime;
    const fadeSeconds = quick ? 0.32 : 0.75;
    const stopSeconds = quick ? 0.36 : 0.8;
    if (current) {
      current.stopped = true;
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setValueAtTime(current.gain.gain.value, now);
      current.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      current.source.stop(now + stopSeconds);
    }
    const isPoolAuto =
      !previewTrack && !pinnedTrack && (SCENE_TRACKS[wantedScene]?.length || 0) > 1;
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = buffer;
    source.loop = !isPoolAuto;
    source.connect(gain).connect(musicBus);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + stopSeconds);
    const track = { scene: wantedScene, trackId, source, gain, stopped: false };
    tracks.add(track);
    source.onended = () => {
      tracks.delete(track);
      source.disconnect();
      gain.disconnect();
      if (!track.stopped && !disposed && unlocked && current === track) {
        current = null;
        const pool = SCENE_TRACKS[wantedScene];
        if (!previewTrack && !pinnedTrack && pool?.length > 1) {
          activeTrack = pickTrackForScene(wantedScene, track.trackId);
          lastSceneTracks.set(wantedScene, activeTrack);
        }
        void refreshMusic();
        onChange();
      }
    };
    source.start(now);
    current = track;
    unlockedTracks.add(trackId);
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
      SERVICE_CUES[name] ||
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
    const activeId = pinnedTrack || activeTrack;
    const targetId = targetTrack();
    return {
      scene: wantedScene,
      track: current?.trackId || null,
      activeTrack: activeId,
      pinnedTrack,
      previewTrack,
      mode: previewTrack ? 'preview' : pinnedTrack ? 'manual' : 'auto',
      title: MUSIC[targetId]?.name || '',
      activeTitle: MUSIC[activeId]?.name || '',
      previewTitle: previewTrack ? MUSIC[previewTrack]?.name || '' : '',
      unlockedTracks: Object.keys(MUSIC).filter((id) => unlockedTracks.has(id)),
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
      if ((!SCENE_TRACKS[scene] && !MUSIC[scene]) || disposed) return;
      const pool = SCENE_TRACKS[scene];
      const alreadyInSamePool =
        scene === wantedScene && (pool ? pool.includes(activeTrack) : activeTrack === scene);
      wantedScene = scene;
      if (!alreadyInSamePool) {
        activeTrack = pickTrackForScene(scene, lastSceneTracks.get(scene));
        if (pool?.length > 1) lastSceneTracks.set(scene, activeTrack);
      }
      void refreshMusic();
      onChange();
    },
    preview(trackId) {
      if (!MUSIC[trackId] || !unlockedTracks.has(trackId) || disposed) return;
      previewTrack = previewTrack === trackId ? null : trackId;
      void refreshMusic({ quick: true });
      onChange();
    },
    stopPreview() {
      if (!previewTrack || disposed) return;
      previewTrack = null;
      void refreshMusic({ quick: true });
      onChange();
    },
    selectTrack(trackId) {
      if (!MUSIC[trackId] || !unlockedTracks.has(trackId) || disposed) return;
      previewTrack = null;
      pinnedTrack = trackId;
      if (SCENE_TRACKS[wantedScene]?.includes(trackId)) {
        activeTrack = trackId;
        lastSceneTracks.set(wantedScene, trackId);
      }
      if (current?.trackId === trackId) current.source.loop = true;
      void refreshMusic({ quick: true });
      onChange();
    },
    clearPinnedTrack() {
      if (disposed) return;
      const hadOverride = Boolean(pinnedTrack || previewTrack);
      pinnedTrack = null;
      previewTrack = null;
      if (!hadOverride) return;
      const isPoolAuto = (SCENE_TRACKS[wantedScene]?.length || 0) > 1;
      if (current?.trackId === targetTrack()) current.source.loop = !isPoolAuto;
      void refreshMusic({ quick: true });
      onChange();
    },
    shuffleSceneTrack() {
      if (disposed) return;
      const pool = SCENE_TRACKS[wantedScene];
      if (!pool || pool.length < 2) return;
      const unlockedPool = pool.filter((id) => unlockedTracks.has(id));
      if (unlockedPool.length < 2) return;
      previewTrack = null;
      pinnedTrack = null;
      const candidates = unlockedPool.filter((id) => id !== activeTrack);
      const nextList = candidates.length ? candidates : unlockedPool;
      activeTrack = nextList[Math.floor(Math.random() * nextList.length)];
      lastSceneTracks.set(wantedScene, activeTrack);
      void refreshMusic({ quick: true });
      onChange();
    },
    setPreferences(value) {
      settings = audioPreferences(value);
      updateLevels();
      onChange();
    },
    combat(event, before, speed, visualDuration) {
      for (const cue of combatCues(event, before, speed, visualDuration)) play(cue.name, cue.delay);
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
      previewTrack = null;
      pinnedTrack = null;
      lastSceneTracks.clear();
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
        track.stopped = true;
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
