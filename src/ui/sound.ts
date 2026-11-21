/**
 * Nostalgic Procedural RTS Web Audio & Formant Synthesizer
 * Pure Web Audio API — zero external audio assets, safe when AudioContext is absent.
 */

import type { SoundEventKind, TauntId } from '../types/rts.js';

interface AudioBus {
  ctx: AudioContext;
  master: GainNode;
  out: AudioNode;
  noiseBuffer: AudioBuffer;
}

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let bus: AudioBus | null = null;
let muted = false;

const MASTER_GAIN = 0.84;

/** Per-event cooldowns (ms) to prevent combat/harvest audio stacking or phasing. */
const EVENT_COOLDOWN_MS: Record<SoundEventKind, number> = {
  villager_spawn: 45,
  military_spawn: 45,
  wood_chop: 95,
  gold_clink: 95,
  build_place: 50,
  build_done: 70,
  order_move: 65,
  order_attack: 75,
  sword_hit: 95,
  bow_shoot: 85,
  wololo: 340,
  war_horn: 260,
  victory: 400,
  defeat: 400,
};

const lastPlayedAt = new Map<SoundEventKind, number>();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getAudioConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
}

function buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const durationSec = 1.5;
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  // Deterministic LCG seeded PRNG so buffer creation is fast and uniform
  let state = 0x6d2b79f5;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x9e3779b9) | 0;
    const norm = ((state ^ (state >>> 13)) >>> 0) / 4294967296;
    channel[i] = norm * 2 - 1;
  }
  return buffer;
}

function ensureBus(): AudioBus | null {
  if (bus) {
    if (bus.ctx.state === 'suspended' && !muted) {
      try {
        void bus.ctx.resume().catch(() => {});
      } catch {
        // Ignore autoplay gesture restrictions until next user interaction
      }
    }
    return bus;
  }

  const Ctor = getAudioConstructor();
  if (!Ctor) return null;

  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;

    let out: AudioNode = master;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.16;
      master.connect(comp);
      comp.connect(ctx.destination);
      out = master;
    } else {
      master.connect(ctx.destination);
    }

    const noiseBuffer = buildNoiseBuffer(ctx);
    bus = { ctx, master, out, noiseBuffer };

    if (ctx.state === 'suspended' && !muted) {
      void ctx.resume().catch(() => {});
    }
    return bus;
  } catch {
    return null;
  }
}

function activeBus(): AudioBus | null {
  if (muted) return null;
  return ensureBus();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (!bus) return;
  try {
    const t = bus.ctx.currentTime;
    bus.master.gain.cancelScheduledValues(t);
    bus.master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, t, 0.015);
  } catch {
    // Ignore if context was closed externally
  }
}

export function isMuted(): boolean {
  return muted;
}

export function unlockAudio(): void {
  const b = ensureBus();
  if (!b) return;
  try {
    if (b.ctx.state === 'suspended') {
      void b.ctx.resume().catch(() => {});
    }
    // Play a 1-sample silent buffer to unlock iOS/mobile WebViews cleanly on gesture
    const silent = b.ctx.createBuffer(1, 1, b.ctx.sampleRate);
    const src = b.ctx.createBufferSource();
    src.buffer = silent;
    const g = b.ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(b.ctx.destination);
    src.start(b.ctx.currentTime);
  } catch {
    // Safe no-op if blocked
  }
}

/* ============================================================================
 * Synthesis Primitives
 * ========================================================================== */

function jitter(spread = 0.05): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

interface ToneOpts {
  freqStart: number;
  freqEnd?: number;
  start: number;
  attack?: number;
  duration: number;
  type?: OscillatorType;
  gain: number;
  filterType?: BiquadFilterType;
  filterFreqStart?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  detuneCents?: number;
}

function scheduleTone(b: AudioBus, opts: ToneOpts): void {
  const t0 = Math.max(b.ctx.currentTime, opts.start);
  const dur = Math.max(0.015, opts.duration);
  const atk = Math.min(dur * 0.45, Math.max(0.002, opts.attack ?? 0.005));
  const tEnd = t0 + dur;

  const osc = b.ctx.createOscillator();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(Math.max(16, opts.freqStart), t0);
  if (opts.freqEnd !== undefined && opts.freqEnd !== opts.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(16, opts.freqEnd), tEnd);
  }
  if (opts.detuneCents) {
    osc.detune.setValueAtTime(opts.detuneCents, t0);
  }

  const env = b.ctx.createGain();
  const peak = Math.max(0.0002, opts.gain);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + atk);
  env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  if (opts.filterType && opts.filterFreqStart) {
    const flt = b.ctx.createBiquadFilter();
    flt.type = opts.filterType;
    flt.frequency.setValueAtTime(Math.max(30, opts.filterFreqStart), t0);
    if (opts.filterFreqEnd !== undefined && opts.filterFreqEnd !== opts.filterFreqStart) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(30, opts.filterFreqEnd), tEnd);
    }
    if (opts.filterQ !== undefined) {
      flt.Q.setValueAtTime(opts.filterQ, t0);
    }
    osc.connect(flt);
    flt.connect(env);
  } else {
    osc.connect(env);
  }

  env.connect(b.out);
  osc.start(t0);
  osc.stop(tEnd + 0.02);
}

interface NoiseOpts {
  start: number;
  attack?: number;
  duration: number;
  gain: number;
  filterType: BiquadFilterType;
  freqStart: number;
  freqEnd?: number;
  q?: number;
  highpassHz?: number;
}

function scheduleNoise(b: AudioBus, opts: NoiseOpts): void {
  const t0 = Math.max(b.ctx.currentTime, opts.start);
  const dur = Math.max(0.012, opts.duration);
  const atk = Math.min(dur * 0.55, Math.max(0.002, opts.attack ?? 0.004));
  const tEnd = t0 + dur;

  const src = b.ctx.createBufferSource();
  src.buffer = b.noiseBuffer;
  const maxOffset = Math.max(0, b.noiseBuffer.duration - dur - 0.05);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  const flt = b.ctx.createBiquadFilter();
  flt.type = opts.filterType;
  flt.frequency.setValueAtTime(Math.max(40, opts.freqStart), t0);
  if (opts.freqEnd !== undefined && opts.freqEnd !== opts.freqStart) {
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), tEnd);
  }
  flt.Q.setValueAtTime(opts.q ?? 1.2, t0);

  const env = b.ctx.createGain();
  const peak = Math.max(0.0002, opts.gain);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + atk);
  env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  if (opts.highpassHz) {
    const hp = b.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(opts.highpassHz, t0);
    src.connect(hp);
    hp.connect(flt);
  } else {
    src.connect(flt);
  }

  flt.connect(env);
  env.connect(b.out);
  src.start(t0, offset, dur + 0.02);
  src.stop(tEnd + 0.025);
}

/** Medieval bronze bell / chime synthesizer with realistic inharmonic partials. */
function scheduleBell(
  b: AudioBus,
  fundamentalHz: number,
  start: number,
  duration: number,
  gain: number,
  minor = false
): void {
  // Classic bell partial ratios: hum (0.5), prime (1.0), tierce (1.2 minor / 1.25 major), fifth (1.5), nominal (2.0), superquint (2.99)
  const ratios = minor
    ? [0.5, 1.0, 1.189, 1.502, 2.0, 2.98]
    : [0.5, 1.0, 1.255, 1.502, 2.004, 3.01];
  const weights = [0.22, 0.52, 0.28, 0.22, 0.34, 0.14];
  const decays = [1.15, 1.0, 0.78, 0.65, 0.55, 0.35];

  for (let i = 0; i < ratios.length; i++) {
    scheduleTone(b, {
      freqStart: fundamentalHz * ratios[i],
      start,
      attack: 0.003,
      duration: duration * decays[i],
      type: i === 1 ? 'triangle' : 'sine',
      gain: gain * weights[i],
    });
  }

  // Crisp clapper strike transient
  scheduleNoise(b, {
    start,
    attack: 0.002,
    duration: 0.028,
    gain: gain * 0.28,
    filterType: 'bandpass',
    freqStart: fundamentalHz * 3.4,
    q: 3.2,
  });
}

/** Warm medieval brass horn voice (detuned sawtooth pair + dynamic lowpass swell). */
function scheduleBrassNote(
  b: AudioBus,
  freqHz: number,
  start: number,
  duration: number,
  gain: number,
  brightHz = 1650
): void {
  const atk = Math.min(0.055, duration * 0.22);
  for (const detune of [-7, 7]) {
    scheduleTone(b, {
      freqStart: freqHz * 0.985,
      freqEnd: freqHz,
      start,
      attack: atk,
      duration,
      type: 'sawtooth',
      gain: gain * 0.5,
      detuneCents: detune,
      filterType: 'lowpass',
      filterFreqStart: Math.max(240, freqHz * 1.6),
      filterFreqEnd: brightHz,
      filterQ: 1.8,
    });
  }
  // Fundamental body reinforcement
  scheduleTone(b, {
    freqStart: freqHz,
    start,
    attack: atk,
    duration,
    type: 'triangle',
    gain: gain * 0.35,
  });
}

/* ============================================================================
 * 14 AoE2-Nostalgic Sound Event Patches
 * ========================================================================== */

/** 1. 'villager_spawn': Town-bell chime + breathy two-syllable "Shhh-hah!" filtered noise envelope! */
function patchVillagerSpawn(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Crisp Town-Center bell chime (E5 = 659.25 Hz + B5 sparkle)
  scheduleBell(b, 659.25, t, 0.38, 0.2);
  scheduleTone(b, {
    freqStart: 1318.5,
    start: t + 0.008,
    attack: 0.003,
    duration: 0.22,
    type: 'sine',
    gain: 0.06,
  });

  // Syllable 1: Breathy palatal "Shhh-" (sibilant fricative swell)
  scheduleNoise(b, {
    start: t + 0.035,
    attack: 0.04,
    duration: 0.135,
    gain: 0.22,
    filterType: 'bandpass',
    freqStart: 2750,
    freqEnd: 2450,
    q: 2.3,
    highpassHz: 1300,
  });
  scheduleNoise(b, {
    start: t + 0.04,
    attack: 0.035,
    duration: 0.12,
    gain: 0.09,
    filterType: 'bandpass',
    freqStart: 4300,
    q: 1.8,
  });

  // Syllable 2: Aspirated open "-hah!" (pharyngeal breath + subtle voiced chest murmur)
  const tHah = t + 0.185;
  scheduleNoise(b, {
    start: tHah,
    attack: 0.018,
    duration: 0.185,
    gain: 0.26,
    filterType: 'bandpass',
    freqStart: 1180,
    freqEnd: 880,
    q: 1.6,
    highpassHz: 420,
  });
  scheduleNoise(b, {
    start: tHah,
    attack: 0.015,
    duration: 0.16,
    gain: 0.16,
    filterType: 'bandpass',
    freqStart: 760,
    freqEnd: 640,
    q: 2.4,
  });
  // Subtle warm glottal chest sigh ("-ah") underneath the breath
  scheduleTone(b, {
    freqStart: 168,
    freqEnd: 134,
    start: tHah + 0.006,
    attack: 0.018,
    duration: 0.145,
    type: 'sawtooth',
    gain: 0.075,
    filterType: 'bandpass',
    filterFreqStart: 780,
    filterFreqEnd: 660,
    filterQ: 2.8,
  });
}

/** 2. 'military_spawn': Metallic blade draw + drum tap. */
function patchMilitarySpawn(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Scabbard blade draw ("shhhiiing!")
  scheduleNoise(b, {
    start: t,
    attack: 0.025,
    duration: 0.2,
    gain: 0.22,
    filterType: 'bandpass',
    freqStart: 1450,
    freqEnd: 4800,
    q: 6.5,
    highpassHz: 1100,
  });
  scheduleTone(b, {
    freqStart: 2320,
    freqEnd: 2680,
    start: t + 0.03,
    attack: 0.015,
    duration: 0.22,
    type: 'triangle',
    gain: 0.085,
  });
  scheduleTone(b, {
    freqStart: 3580,
    freqEnd: 3960,
    start: t + 0.04,
    attack: 0.01,
    duration: 0.18,
    type: 'sine',
    gain: 0.055,
  });

  // Martial field-drum tap
  const tDrum = t + 0.075;
  scheduleTone(b, {
    freqStart: 152,
    freqEnd: 56,
    start: tDrum,
    attack: 0.003,
    duration: 0.16,
    type: 'sine',
    gain: 0.28,
  });
  scheduleNoise(b, {
    start: tDrum,
    attack: 0.002,
    duration: 0.065,
    gain: 0.15,
    filterType: 'bandpass',
    freqStart: 420,
    freqEnd: 210,
    q: 1.1,
  });
}

/** 3. 'wood_chop': Crisp axe-into-timber thwack + wood chip snap. */
function patchWoodChop(b: AudioBus): void {
  const t = b.ctx.currentTime;
  const p = jitter(0.06);

  // Hollow timber trunk resonance
  scheduleTone(b, {
    freqStart: 305 * p,
    freqEnd: 118 * p,
    start: t,
    attack: 0.002,
    duration: 0.095,
    type: 'triangle',
    gain: 0.22,
  });
  scheduleTone(b, {
    freqStart: 640 * p,
    freqEnd: 380 * p,
    start: t,
    attack: 0.002,
    duration: 0.055,
    type: 'sine',
    gain: 0.1,
  });
  // Bark impact & wood-chip scatter
  scheduleNoise(b, {
    start: t,
    attack: 0.002,
    duration: 0.048,
    gain: 0.18,
    filterType: 'bandpass',
    freqStart: 1350 * p,
    freqEnd: 680 * p,
    q: 1.6,
  });
}

/** 4. 'gold_clink': Pickaxe strike on ore + bright double coin clink. */
function patchGoldClink(b: AudioBus): void {
  const t = b.ctx.currentTime;
  const p = jitter(0.045);

  // Ore strike ping
  scheduleTone(b, {
    freqStart: 2093 * p,
    freqEnd: 2040 * p,
    start: t,
    attack: 0.002,
    duration: 0.14,
    type: 'triangle',
    gain: 0.12,
  });
  scheduleNoise(b, {
    start: t,
    attack: 0.001,
    duration: 0.025,
    gain: 0.12,
    filterType: 'bandpass',
    freqStart: 3400 * p,
    q: 3.5,
  });

  // Sparkling gold coin ring
  scheduleTone(b, {
    freqStart: 2793.8 * p,
    start: t + 0.038,
    attack: 0.002,
    duration: 0.2,
    type: 'sine',
    gain: 0.11,
  });
  scheduleTone(b, {
    freqStart: 4186.0 * p,
    start: t + 0.042,
    attack: 0.002,
    duration: 0.17,
    type: 'sine',
    gain: 0.075,
  });
}

/** 5. 'build_place': Timber foundation stake thud + double mallet peg tap. */
function patchBuildPlace(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Turf / foundation stake thump
  scheduleTone(b, {
    freqStart: 136,
    freqEnd: 52,
    start: t,
    attack: 0.003,
    duration: 0.12,
    type: 'sine',
    gain: 0.24,
  });
  // Two brisk wooden beam taps
  scheduleTone(b, {
    freqStart: 350,
    freqEnd: 190,
    start: t + 0.005,
    attack: 0.002,
    duration: 0.065,
    type: 'triangle',
    gain: 0.15,
  });
  scheduleTone(b, {
    freqStart: 445,
    freqEnd: 245,
    start: t + 0.068,
    attack: 0.002,
    duration: 0.065,
    type: 'triangle',
    gain: 0.14,
  });
  scheduleNoise(b, {
    start: t,
    attack: 0.002,
    duration: 0.075,
    gain: 0.12,
    filterType: 'bandpass',
    freqStart: 880,
    q: 1.4,
  });
}

/** 6. 'build_done': Carpentry finish tap + warm medieval major triad chime. */
function patchBuildDone(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Final hammer tap
  scheduleTone(b, {
    freqStart: 480,
    freqEnd: 220,
    start: t,
    attack: 0.002,
    duration: 0.055,
    type: 'triangle',
    gain: 0.14,
  });

  // Warm rising triad (C5 -> E5 -> G5 -> C6)
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    const nt = t + 0.03 + i * 0.048;
    scheduleTone(b, {
      freqStart: notes[i],
      start: nt,
      attack: 0.006,
      duration: 0.26 + i * 0.04,
      type: 'triangle',
      gain: 0.12,
    });
    scheduleTone(b, {
      freqStart: notes[i],
      start: nt,
      attack: 0.008,
      duration: 0.22,
      type: 'sawtooth',
      gain: 0.045,
      filterType: 'lowpass',
      filterFreqStart: notes[i] * 2.6,
      filterFreqEnd: notes[i] * 1.4,
    });
  }
}

/** 7. 'order_move': Crisp leather boot/parchment step + subtle two-note confirmation. */
function patchOrderMove(b: AudioBus): void {
  const t = b.ctx.currentTime;
  const p = jitter(0.03);

  scheduleTone(b, {
    freqStart: 195 * p,
    freqEnd: 88 * p,
    start: t,
    attack: 0.003,
    duration: 0.06,
    type: 'sine',
    gain: 0.15,
  });
  scheduleNoise(b, {
    start: t,
    attack: 0.003,
    duration: 0.045,
    gain: 0.08,
    filterType: 'bandpass',
    freqStart: 1050,
    q: 1.5,
  });
  // Gentle wooden lute fifth (G4 -> D5)
  scheduleTone(b, {
    freqStart: 392.0 * p,
    start: t + 0.005,
    attack: 0.004,
    duration: 0.085,
    type: 'triangle',
    gain: 0.085,
  });
  scheduleTone(b, {
    freqStart: 587.33 * p,
    start: t + 0.048,
    attack: 0.004,
    duration: 0.1,
    type: 'triangle',
    gain: 0.075,
  });
}

/** 8. 'order_attack': Urgent crossed-swords steel clink + martial horn/drum accent. */
function patchOrderAttack(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Low drum punch
  scheduleTone(b, {
    freqStart: 140,
    freqEnd: 55,
    start: t,
    attack: 0.002,
    duration: 0.13,
    type: 'sine',
    gain: 0.22,
  });
  // Brassy command interval (D4 -> A4)
  scheduleBrassNote(b, 293.66, t, 0.11, 0.13, 1400);
  scheduleBrassNote(b, 440.0, t + 0.065, 0.17, 0.15, 1800);

  // Crossed-blades metallic ring
  scheduleTone(b, {
    freqStart: 2240,
    freqEnd: 2120,
    start: t + 0.015,
    attack: 0.002,
    duration: 0.15,
    type: 'triangle',
    gain: 0.09,
  });
  scheduleNoise(b, {
    start: t + 0.01,
    attack: 0.002,
    duration: 0.055,
    gain: 0.14,
    filterType: 'bandpass',
    freqStart: 3100,
    q: 4.2,
  });
}

/** 9. 'sword_hit' (throttled): Steel-on-mail melee clang + shield impact. */
function patchSwordHit(b: AudioBus): void {
  const t = b.ctx.currentTime;
  const p = jitter(0.075);

  // Broadband steel impact burst
  scheduleNoise(b, {
    start: t,
    attack: 0.001,
    duration: 0.055,
    gain: 0.19,
    filterType: 'bandpass',
    freqStart: 2850 * p,
    freqEnd: 1950 * p,
    q: 2.6,
    highpassHz: 1400,
  });

  // Inharmonic sword-blade modes
  const modes = [1790, 2710, 4150];
  const gains = [0.095, 0.075, 0.045];
  for (let i = 0; i < modes.length; i++) {
    scheduleTone(b, {
      freqStart: modes[i] * p,
      freqEnd: modes[i] * p * 0.96,
      start: t,
      attack: 0.002,
      duration: 0.12 - i * 0.02,
      type: 'triangle',
      gain: gains[i],
    });
  }

  // Armor/shield body thud
  scheduleTone(b, {
    freqStart: 165 * p,
    freqEnd: 68 * p,
    start: t,
    attack: 0.002,
    duration: 0.075,
    type: 'sine',
    gain: 0.15,
  });
}

/** 10. 'bow_shoot' (throttled): Taut yew-bowstring twang + feathered arrow whoosh. */
function patchBowShoot(b: AudioBus): void {
  const t = b.ctx.currentTime;
  const p = jitter(0.065);

  // Plucked yew string twang
  scheduleTone(b, {
    freqStart: 215 * p,
    freqEnd: 138 * p,
    start: t,
    attack: 0.002,
    duration: 0.095,
    type: 'sawtooth',
    gain: 0.11,
    filterType: 'lowpass',
    filterFreqStart: 950,
    filterFreqEnd: 340,
  });

  // High-speed fletching air fwhip
  scheduleNoise(b, {
    start: t + 0.006,
    attack: 0.008,
    duration: 0.088,
    gain: 0.17,
    filterType: 'bandpass',
    freqStart: 1450 * p,
    freqEnd: 3750 * p,
    q: 2.4,
    highpassHz: 900,
  });
}

/**
 * 11. 'wololo': Iconic nasal two-note vowel-formant chant "WO-LO-LO!"
 *     (Eb4 -> C4 -> Eb4 over ~0.68s) + golden monastery chime!
 */
function patchWololo(b: AudioBus): void {
  const ctx = b.ctx;
  const t0 = ctx.currentTime + 0.005;
  const totalDur = 0.68;
  const tEnd = t0 + totalDur;

  // Pitch contour: Eb4 (311.13 Hz) -> C4 (261.63 Hz) -> Eb4 (311.13 Hz)
  const eb4 = 311.13;
  const c4 = 261.63;

  // Dual-oscillator nasal glottal source (main sawtooth + nasal octave harmonic)
  const oscMain = ctx.createOscillator();
  const oscNasal = ctx.createOscillator();
  oscMain.type = 'sawtooth';
  oscNasal.type = 'sawtooth';
  oscNasal.detune.setValueAtTime(5, t0);

  for (const [osc, mult] of [
    [oscMain, 1],
    [oscNasal, 2],
  ] as const) {
    // Syllable 1 "WO-": quick labial scoop into Eb4
    osc.frequency.setValueAtTime(282 * mult, t0);
    osc.frequency.linearRampToValueAtTime(eb4 * mult, t0 + 0.035);
    osc.frequency.setValueAtTime(eb4 * mult, t0 + 0.205);
    // Syllable 2 "-LO-": clean step down to C4
    osc.frequency.linearRampToValueAtTime(c4 * mult, t0 + 0.225);
    osc.frequency.setValueAtTime(c4 * mult, t0 + 0.415);
    // Syllable 3 "-LO!": step back up to Eb4
    osc.frequency.linearRampToValueAtTime(eb4 * mult, t0 + 0.435);
    osc.frequency.setValueAtTime(eb4 * mult, tEnd);
  }

  // Subtle monk vibrato on the sustained final "-LO!"
  const vib = ctx.createOscillator();
  const vibGain = ctx.createGain();
  vib.type = 'sine';
  vib.frequency.setValueAtTime(5.6, t0);
  vibGain.gain.setValueAtTime(0.5, t0);
  vibGain.gain.setValueAtTime(0.8, t0 + 0.42);
  vibGain.gain.linearRampToValueAtTime(3.6, t0 + 0.5);
  vib.connect(vibGain);
  vibGain.connect(oscMain.frequency);

  // Mix glottal oscillators into a shared syllable articulation gate
  const mainMix = ctx.createGain();
  mainMix.gain.value = 0.78;
  const nasalMix = ctx.createGain();
  nasalMix.gain.value = 0.24;
  const voiceGate = ctx.createGain();

  // Three-syllable amplitude contour with crisp /l/ tongue-tip dips at 0.21s & 0.425s
  voiceGate.gain.setValueAtTime(0.0001, t0);
  voiceGate.gain.linearRampToValueAtTime(0.95, t0 + 0.03);
  voiceGate.gain.setValueAtTime(0.92, t0 + 0.185);
  voiceGate.gain.linearRampToValueAtTime(0.18, t0 + 0.212); // /l/ closure 1
  voiceGate.gain.linearRampToValueAtTime(0.96, t0 + 0.238); // "-LO-"
  voiceGate.gain.setValueAtTime(0.92, t0 + 0.398);
  voiceGate.gain.linearRampToValueAtTime(0.18, t0 + 0.425); // /l/ closure 2
  voiceGate.gain.linearRampToValueAtTime(1.0, t0 + 0.452); // "-LO!"
  voiceGate.gain.setValueAtTime(0.95, t0 + 0.575);
  voiceGate.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  oscMain.connect(mainMix);
  oscNasal.connect(nasalMix);
  mainMix.connect(voiceGate);
  nasalMix.connect(voiceGate);

  // Parallel 3-formant vocal tract bank (F1 pharyngeal, F2 oral/labial, F3 nasal ring)
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.setValueAtTime(3.8, t0);
  // "W" -> "O" -> "L" -> "O" -> "L" -> "O"
  f1.frequency.setValueAtTime(310, t0);
  f1.frequency.linearRampToValueAtTime(485, t0 + 0.065);
  f1.frequency.setValueAtTime(480, t0 + 0.195);
  f1.frequency.linearRampToValueAtTime(350, t0 + 0.215);
  f1.frequency.linearRampToValueAtTime(475, t0 + 0.25);
  f1.frequency.setValueAtTime(470, t0 + 0.41);
  f1.frequency.linearRampToValueAtTime(355, t0 + 0.428);
  f1.frequency.linearRampToValueAtTime(495, t0 + 0.465);

  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.setValueAtTime(4.8, t0);
  // Labial /w/ (610 Hz) -> /o/ (890 Hz), then alveolar /l/ flick (1190 Hz) -> /o/ (850-900 Hz)
  f2.frequency.setValueAtTime(610, t0);
  f2.frequency.linearRampToValueAtTime(890, t0 + 0.07);
  f2.frequency.setValueAtTime(880, t0 + 0.195);
  f2.frequency.linearRampToValueAtTime(1190, t0 + 0.215);
  f2.frequency.linearRampToValueAtTime(845, t0 + 0.255);
  f2.frequency.setValueAtTime(845, t0 + 0.41);
  f2.frequency.linearRampToValueAtTime(1210, t0 + 0.428);
  f2.frequency.linearRampToValueAtTime(900, t0 + 0.468);

  const f3 = ctx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.setValueAtTime(5.8, t0);
  f3.frequency.setValueAtTime(2460, t0);
  f3.frequency.linearRampToValueAtTime(2540, tEnd);

  const g1 = ctx.createGain();
  g1.gain.value = 0.28;
  const g2 = ctx.createGain();
  g2.gain.value = 0.24;
  const g3 = ctx.createGain();
  g3.gain.value = 0.11;

  voiceGate.connect(f1);
  f1.connect(g1);
  g1.connect(b.out);

  voiceGate.connect(f2);
  f2.connect(g2);
  g2.connect(b.out);

  voiceGate.connect(f3);
  f3.connect(g3);
  g3.connect(b.out);

  // Subtle warm chest resonance
  const chest = ctx.createBiquadFilter();
  chest.type = 'lowpass';
  chest.frequency.setValueAtTime(420, t0);
  const gChest = ctx.createGain();
  gChest.gain.value = 0.08;
  voiceGate.connect(chest);
  chest.connect(gChest);
  gChest.connect(b.out);

  oscMain.start(t0);
  oscNasal.start(t0);
  vib.start(t0);
  oscMain.stop(tEnd + 0.03);
  oscNasal.stop(tEnd + 0.03);
  vib.stop(tEnd + 0.03);

  // Subtle consonant breath puffs on "W", "L", "L"
  for (const bt of [0, 0.212, 0.425]) {
    scheduleNoise(b, {
      start: t0 + bt,
      attack: 0.005,
      duration: 0.04,
      gain: 0.045,
      filterType: 'bandpass',
      freqStart: 1450,
      q: 2.2,
    });
  }

  // Golden monastery relic chime (Eb major shimmer)
  scheduleBell(b, 1244.51, t0 + 0.01, 0.34, 0.09); // Eb6 initial glint
  scheduleBell(b, 932.33, t0 + 0.43, 0.46, 0.1); // Bb5 warm bloom
  scheduleTone(b, {
    freqStart: 1567.98, // G6 golden major third sparkle
    start: t0 + 0.45,
    attack: 0.005,
    duration: 0.42,
    type: 'sine',
    gain: 0.065,
  });
  scheduleTone(b, {
    freqStart: 1864.66, // Bb6 halo
    start: t0 + 0.48,
    attack: 0.005,
    duration: 0.38,
    type: 'sine',
    gain: 0.045,
  });
}

/** 12. 'war_horn': Deep urgent raid horn blast + watchtower alarm bell. */
function patchWarHorn(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Deep ox-horn fifth swell (Bb2 = 116.54 Hz + F3 = 174.61 Hz + Bb3 = 233.08 Hz)
  scheduleBrassNote(b, 116.54, t, 0.76, 0.22, 1150);
  scheduleBrassNote(b, 174.61, t + 0.03, 0.72, 0.16, 1350);
  scheduleBrassNote(b, 233.08, t + 0.06, 0.68, 0.14, 1550);

  // Urgent double alarm bell strike
  scheduleBell(b, 587.33, t + 0.04, 0.3, 0.14, true);
  scheduleBell(b, 587.33, t + 0.24, 0.34, 0.14, true);
}

/** 13. 'victory': Royal medieval brass fanfare + kettledrum & crown chime! */
function patchVictory(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Royal trumpet fanfare: G4 -> C5 -> E5 -> G5 (quick heraldic pickup) -> E5 -> C6!
  const melody: Array<[number, number, number, number]> = [
    [392.0, 0.0, 0.13, 0.17], // G4
    [523.25, 0.13, 0.13, 0.18], // C5
    [659.25, 0.26, 0.13, 0.19], // E5
    [783.99, 0.39, 0.24, 0.22], // G5
    [659.25, 0.64, 0.13, 0.18], // E5
    [1046.5, 0.78, 0.65, 0.24], // C6 triumphant hold!
  ];

  for (const [freq, offset, dur, gain] of melody) {
    scheduleBrassNote(b, freq, t + offset, dur, gain, 2400);
  }

  // Rich sustained C-major royal chord accompaniment on the climax
  scheduleBrassNote(b, 261.63, t + 0.39, 1.02, 0.15, 1400); // C4
  scheduleBrassNote(b, 523.25, t + 0.78, 0.65, 0.15, 1900); // C5
  scheduleBrassNote(b, 659.25, t + 0.78, 0.65, 0.14, 2100); // E5

  // Kettledrum downbeats
  for (const dt of [0.0, 0.39, 0.78]) {
    scheduleTone(b, {
      freqStart: 130.81,
      freqEnd: 65.4,
      start: t + dt,
      attack: 0.003,
      duration: 0.22,
      type: 'sine',
      gain: 0.24,
    });
  }

  // Crown bell sparkle on final chord
  scheduleBell(b, 1046.5, t + 0.79, 0.62, 0.12);
}

/** 14. 'defeat': Solemn minor cathedral bell toll + low horn sigh. */
function patchDefeat(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Descending mournful C-minor bell & horn figures (G4 -> Eb4 -> C4)
  scheduleBell(b, 392.0, t, 0.55, 0.17, true);
  scheduleBell(b, 311.13, t + 0.32, 0.62, 0.18, true);
  scheduleBell(b, 261.63, t + 0.68, 0.95, 0.24, true);

  // Deep somber drone sigh (G2 -> C2)
  scheduleBrassNote(b, 98.0, t, 0.62, 0.14, 520);
  scheduleBrassNote(b, 65.41, t + 0.66, 0.92, 0.18, 440);
}

/* ============================================================================
 * Nostalgic AoE2 Chat Taunt Patches ('30', '11', '14', '1')
 * ========================================================================== */

/** Taunt '11': Classic 5-note staccato laugh cadence ("Ha-ha-ha-ha-ha!"). */
function patchTauntLaugh11(b: AudioBus): void {
  const t0 = b.ctx.currentTime + 0.005;
  // Cheeky 5-note descending staccato cadence
  const pitches = [349.23, 329.63, 293.66, 277.18, 246.94]; // F4, E4, D4, C#4, B3
  const step = 0.108;

  for (let i = 0; i < pitches.length; i++) {
    const st = t0 + i * step;
    const dur = i === 4 ? 0.155 : 0.088;
    const f0 = pitches[i];

    // Aspirated "H-" puff
    scheduleNoise(b, {
      start: st,
      attack: 0.004,
      duration: 0.036,
      gain: 0.14,
      filterType: 'bandpass',
      freqStart: 1450,
      q: 1.8,
      highpassHz: 600,
    });

    // Nasal "/a/" vowel formant burst (F1 ~780 Hz, F2 ~1340 Hz, F3 ~2680 Hz)
    scheduleTone(b, {
      freqStart: f0 * 1.06,
      freqEnd: f0 * 0.92,
      start: st + 0.008,
      attack: 0.01,
      duration: dur,
      type: 'sawtooth',
      gain: 0.22,
      filterType: 'bandpass',
      filterFreqStart: 780,
      filterFreqEnd: 710,
      filterQ: 3.4,
    });
    scheduleTone(b, {
      freqStart: f0 * 1.06,
      freqEnd: f0 * 0.92,
      start: st + 0.008,
      attack: 0.01,
      duration: dur,
      type: 'sawtooth',
      gain: 0.2,
      filterType: 'bandpass',
      filterFreqStart: 1360,
      filterFreqEnd: 1240,
      filterQ: 4.2,
    });
    scheduleTone(b, {
      freqStart: f0 * 2.12,
      freqEnd: f0 * 1.84,
      start: st + 0.008,
      attack: 0.01,
      duration: dur * 0.85,
      type: 'sawtooth',
      gain: 0.08,
      filterType: 'bandpass',
      filterFreqStart: 2680,
      filterQ: 5.0,
    });
  }
}

/** Taunt '14': Impatient double herald horn ("Start the game already!"). */
function patchTauntDoubleHorn14(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Blast 1: brisk F4 + Bb3 punch
  scheduleBrassNote(b, 349.23, t, 0.15, 0.2, 1950);
  scheduleBrassNote(b, 233.08, t, 0.15, 0.13, 1500);

  // Blast 2: accented Bb4 + F4 fifth flare
  scheduleBrassNote(b, 466.16, t + 0.19, 0.34, 0.22, 2350);
  scheduleBrassNote(b, 349.23, t + 0.19, 0.34, 0.15, 1850);

  // Snappy tabor tap on second blast
  scheduleTone(b, {
    freqStart: 155,
    freqEnd: 62,
    start: t + 0.19,
    attack: 0.002,
    duration: 0.14,
    type: 'sine',
    gain: 0.2,
  });
}

/** Taunt '1': Crisp knightly armor salute ("Yes, my liege!"). */
function patchTauntSalute1(b: AudioBus): void {
  const t = b.ctx.currentTime;

  // Gauntlet-on-breastplate metallic salute click
  scheduleTone(b, {
    freqStart: 2480,
    freqEnd: 2320,
    start: t,
    attack: 0.002,
    duration: 0.11,
    type: 'triangle',
    gain: 0.1,
  });
  scheduleNoise(b, {
    start: t,
    attack: 0.002,
    duration: 0.038,
    gain: 0.12,
    filterType: 'bandpass',
    freqStart: 3200,
    q: 3.8,
  });

  // Brisk heraldic fifth salute (C5 -> G5)
  scheduleBrassNote(b, 523.25, t + 0.02, 0.11, 0.16, 2000);
  scheduleBrassNote(b, 783.99, t + 0.13, 0.24, 0.19, 2300);
}

/* ============================================================================
 * Public RTS Sound API
 * ========================================================================== */

export function playSoundEvent(kind: SoundEventKind): void {
  const b = activeBus();
  if (!b) return;

  const now = nowMs();
  const minGap = EVENT_COOLDOWN_MS[kind];
  const prev = lastPlayedAt.get(kind);
  if (prev !== undefined && now - prev < minGap) {
    return;
  }
  lastPlayedAt.set(kind, now);

  try {
    switch (kind) {
      case 'villager_spawn':
        patchVillagerSpawn(b);
        break;
      case 'military_spawn':
        patchMilitarySpawn(b);
        break;
      case 'wood_chop':
        patchWoodChop(b);
        break;
      case 'gold_clink':
        patchGoldClink(b);
        break;
      case 'build_place':
        patchBuildPlace(b);
        break;
      case 'build_done':
        patchBuildDone(b);
        break;
      case 'order_move':
        patchOrderMove(b);
        break;
      case 'order_attack':
        patchOrderAttack(b);
        break;
      case 'sword_hit':
        patchSwordHit(b);
        break;
      case 'bow_shoot':
        patchBowShoot(b);
        break;
      case 'wololo':
        patchWololo(b);
        break;
      case 'war_horn':
        patchWarHorn(b);
        break;
      case 'victory':
        patchVictory(b);
        break;
      case 'defeat':
        patchDefeat(b);
        break;
      default: {
        const exhaustive: never = kind;
        void exhaustive;
      }
    }
  } catch {
    // Never disrupt game loop if Web Audio scheduling encounters an environment quirk
  }
}

export function playTauntSound(tauntId: TauntId): void {
  const b = activeBus();
  if (!b) return;

  try {
    switch (tauntId) {
      case '30':
        patchWololo(b);
        break;
      case '11':
        patchTauntLaugh11(b);
        break;
      case '14':
        patchTauntDoubleHorn14(b);
        break;
      case '1':
        patchTauntSalute1(b);
        break;
      default: {
        const exhaustive: never = tauntId;
        void exhaustive;
      }
    }
  } catch {
    // Safe fallback if audio scheduling fails
  }
}

export function flushStateSounds(events: SoundEventKind[]): void {
  if (events.length === 0) return;
  for (let i = 0; i < events.length; i++) {
    playSoundEvent(events[i]);
  }
  events.length = 0;
}
