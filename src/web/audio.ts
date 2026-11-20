// Synthesised WebAudio: night music (pad + slow pentatonic arpeggio) and short SFX. No asset files.
// The context is created on the first user gesture; every call is safe when AudioContext is unavailable or throws.
import type { GameEvent, GameState } from '../core/types';

const MUSIC_GAIN = 0.25;
const DUCK = 0.3;
/** A minor pentatonic, two octaves (Hz). */
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
const NOTE_EVERY_S = 1.1;

type Sfx =
  | 'pick' | 'lit' | 'refuel' | 'pulse' | 'hit' | 'jump' | 'dash' | 'win' | 'lose' | 'shade' | 'beep' | 'whoosh' | 'steal' | 'charm';

export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let music: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let volume = 0.7;
  let ducked = false;
  let nextNote = 0;
  let noteIndex = 3;
  // web-detected sound triggers
  let prevGrounded = true;
  let prevCountdown = -1;
  let prevWarning = false;

  const safe = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // audio is a nicety: never break the game
    }
  };

  function applyVolume(): void {
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
    if (music && ctx) music.gain.setTargetAtTime(MUSIC_GAIN * (ducked ? DUCK : 1), ctx.currentTime, 0.15);
  }

  /** Short oscillator blip with an exponential decay and an optional pitch slide. */
  function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo = 0, delay = 0): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(dur: number, gain: number, f0: number, f1: number): void {
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function play(name: Sfx): void {
    safe(() => {
      switch (name) {
        case 'pick': tone(880, 0.12, 'sine', 0.25, 1320); break;
        case 'charm': tone(660, 0.1, 'triangle', 0.25, 990); tone(990, 0.16, 'triangle', 0.2, 1480, 0.08); break;
        case 'lit': tone(523.25, 0.18, 'triangle', 0.3); tone(659.25, 0.18, 'triangle', 0.3, 0, 0.09); tone(783.99, 0.3, 'triangle', 0.3, 0, 0.18); break;
        case 'refuel': tone(440, 0.14, 'sine', 0.25, 587.33); break;
        case 'pulse': tone(300, 0.35, 'sine', 0.35, 900); hiss(0.3, 0.2, 800, 3000); break;
        case 'hit': tone(180, 0.3, 'sawtooth', 0.3, 60); hiss(0.2, 0.25, 500, 200); break;
        case 'jump': tone(300, 0.14, 'square', 0.1, 600); break;
        case 'dash': hiss(0.22, 0.3, 400, 2500); break;
        case 'win': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, 'triangle', 0.3, 0, i * 0.12)); break;
        case 'lose': [392, 329.63, 261.63, 196].forEach((f, i) => tone(f, 0.38, 'sawtooth', 0.18, 0, i * 0.12)); break;
        case 'shade': tone(140, 0.38, 'sawtooth', 0.18, 70); tone(142, 0.38, 'sine', 0.2, 72); break;
        case 'beep': tone(1000, 0.09, 'square', 0.14); break;
        case 'whoosh': hiss(0.4, 0.3, 300, 1800); break;
        case 'steal': tone(700, 0.25, 'triangle', 0.25, 200); break;
      }
    });
  }

  function scheduleMusic(): void {
    if (!ctx || !music) return;
    while (nextNote < ctx.currentTime + 0.3) {
      if (nextNote < ctx.currentTime) nextNote = ctx.currentTime;
      // random-walk over the scale: gentle, no big leaps
      noteIndex = Math.min(SCALE.length - 1, Math.max(0, noteIndex + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]!));
      const f = SCALE[noteIndex]!;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, nextNote);
      g.gain.exponentialRampToValueAtTime(0.5, nextNote + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, nextNote + 1.8);
      o.connect(g).connect(music);
      o.start(nextNote);
      o.stop(nextNote + 1.9);
      nextNote += NOTE_EVERY_S;
    }
  }

  function startPad(): void {
    if (!ctx || !music) return;
    // Two slightly detuned low sines (A2 + E3) with a slow tremolo: a soft looping pad.
    for (const [f, detune] of [[110, 0], [110, 6], [164.81, -4]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = detune;
      g.gain.value = 0.18;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.12 + detune * 0.005;
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(music);
      o.start();
      lfo.start();
    }
  }

  return {
    /** Call from a user gesture (key / click). Creates the context once; resumes it if it was suspended. */
    unlock(): void {
      safe(() => {
        if (!ctx) {
          const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return;
          ctx = new Ctor();
          master = ctx.createGain();
          master.connect(ctx.destination);
          music = ctx.createGain();
          music.connect(master);
          const len = Math.floor(ctx.sampleRate * 0.6);
          noise = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
          applyVolume();
          startPad();
          nextNote = ctx.currentTime + 0.2;
        }
        if (ctx.state === 'suspended') void ctx.resume();
      });
    },

    /** 0..100 */
    setVolume(v0to100: number): void {
      volume = Math.min(1, Math.max(0, v0to100 / 100));
      safe(applyVolume);
    },

    /** Music drops to 30 % (pause menu). */
    setDucked(d: boolean): void {
      if (d === ducked) return;
      ducked = d;
      safe(applyVolume);
    },

    /** Forget the web-detected triggers (new night / restart). */
    resetTracking(state: GameState): void {
      prevGrounded = state.player.grounded;
      prevCountdown = -1;
      prevWarning = state.wind.warning;
    },

    /** Sound for the events of one step. */
    onEvents(events: readonly GameEvent[]): void {
      for (const e of events) {
        switch (e.name) {
          case 'mote_picked': play('pick'); break;
          case 'charm_picked': play('charm'); break;
          case 'lantern_lit': play('lit'); break;
          case 'refuel': play('refuel'); break;
          case 'pulse': play('pulse'); break;
          case 'player_hit': play('hit'); break;
          case 'dash': play('dash'); break;
          case 'game_over': play(e.data.result === 'won' ? 'win' : 'lose'); break;
          case 'shade_spawned': play('shade'); break;
          case 'drifter_steal': play('steal'); break;
          default: break;
        }
      }
    },

    /** Once per frame while playing: music scheduling plus the sounds the core has no event for. */
    update(state: GameState, running: boolean): void {
      safe(scheduleMusic);
      if (!running || state.paused || state.state !== 'playing') {
        prevGrounded = state.player.grounded;
        return;
      }
      if (prevGrounded && !state.player.grounded && state.player.vel[1] > 0) play('jump');
      prevGrounded = state.player.grounded;
      const secs = Math.ceil(state.timeLeftS);
      if (secs !== prevCountdown) {
        prevCountdown = secs;
        if (secs >= 1 && secs <= 10) play('beep');
      }
      if (state.wind.warning && !prevWarning) play('whoosh');
      prevWarning = state.wind.warning;
    },
  };
}
