/**
 * 8-bit chiptune tracker-style procedural music engine.
 * Evolves based on game state — ball count drives intensity and pattern complexity.
 */

import { ensureAudioContext } from './audio.js';

// Tracker patterns — note values as semitone offsets from root (null = rest)
const BASS_PATTERNS = [
  [0,null,0,null, 12,null,0,null, 5,null,7,null, 0,null,null,null],
  [0,null,12,null, 0,null,7,null, 5,null,5,null, 7,null,12,null],
  [0,null,0,null, 3,null,5,null, 7,null,7,null, 5,null,3,null],
  [0,null,7,null, 5,null,3,null, 0,null,12,null, 7,null,5,null],
];

const ARP_PATTERNS = [
  [0,7,12,7, 0,7,12,7, 5,12,17,12, 5,12,17,12],
  [0,3,7,12, 7,3,0,3, 5,8,12,17, 12,8,5,8],
  [0,12,7,12, 3,15,7,15, 5,17,12,17, 7,19,12,19],
  [12,null,7,null, 12,null,5,null, 12,null,3,null, 12,null,0,null],
  [0,4,7,12, 16,12,7,4, 0,5,9,12, 17,12,9,5],
];

const MELODY_PATTERNS = [
  [24,null,null,19, null,null,17,null, 19,null,null,null, 24,null,null,null],
  [12,null,15,null, 17,null,19,null, 24,null,19,null, 17,null,15,null],
  [null,null,24,null, null,null,19,null, null,null,17,null, null,null,12,null],
  [24,26,24,19, null,null,null,null, 17,19,17,12, null,null,null,null],
];

// Breakbeat drum patterns — K=kick S=snare s=ghost H=hat h=soft O=open
// 16 ticks per bar, syncopated amen-style
const DRUM_PATTERNS = [
  // Classic breakbeat
  ['KH','','h','', 'SH','','h','Ks', 'KH','s','h','', 'SH','','hK','s'],
  // Syncopated funk
  ['KH','','','Kh', 'SH','','h','', 'KH','s','','Kh', 'SO','','h','s'],
  // Double-time break
  ['KH','h','Kh','h', 'SH','h','sh','Kh', 'KH','h','sh','h', 'SH','Kh','sh','s'],
  // Half-time heavy
  ['KH','','','', 'SH','','h','', 'KO','','s','Kh', 'SH','','h','s'],
  // Jungle-ish chop
  ['KH','','sh','K', 'SH','Kh','','s', 'KH','s','Kh','', 'SO','Kh','sh','s'],
  // Wonky break
  ['KH','','h','', 'SO','','Kh','s', 'hK','','sh','K', 'SH','s','Kh',''],
];

// Chord progressions (root offsets for each bar)
const PROGRESSIONS = [
  [0, 5, 7, 3],   // I IV V iii
  [0, 7, 5, 7],   // I V IV V
  [0, 3, 5, 7],   // I iii IV V
  [0, 5, 3, 7],   // I IV iii V
];

const ROOTS = [48, 50, 52, 53, 55]; // C3, D3, E3, F3, G3 (MIDI)
const TICKS_PER_BEAT = 4;
const BEATS_PER_BAR = 4;
const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class MusicEngine {
  constructor() {
    this.started = false;
    this.elapsed = 0;
    this.tick = 0;
    this.bar = 0;
    this.lastTickTime = 0;
    this.bpm = 120;
    this.rootMidi = ROOTS[0];
    this.progIndex = 0;
    this.progression = PROGRESSIONS[0];
    this.bassPattern = 0;
    this.arpPattern = 0;
    this.melodyPattern = 0;
    this.drumPattern = 0;
    this.intensity = 0;
    this.targetIntensity = 0;

    // Evolve timers
    this.barsPlayed = 0;
    this.lastKeyChange = 0;

    // Audio nodes
    this.ctx = null;
    this.masterGain = null;
  }

  start() {
    const ctx = ensureAudioContext();
    if (!ctx || this.started) return;
    this.ctx = ctx;
    this.started = true;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.15;
    this.masterGain.connect(ctx.destination);
  }

  /**
   * @param {number} dt
   * @param {number} ballCount
   * @param {number} maxBalls
   */
  update(dt, ballCount, maxBalls) {
    if (!this.started) {
      this.start();
      if (!this.started) return;
    }

    this.elapsed += dt;

    // Smooth intensity
    this.targetIntensity = Math.min(ballCount / maxBalls, 1.0);
    this.intensity += (this.targetIntensity - this.intensity) * dt * 0.8;

    // BPM increases with intensity
    this.bpm = 110 + this.intensity * 50; // 110-160

    const tickDuration = 60 / (this.bpm * TICKS_PER_BEAT);

    if (this.elapsed - this.lastTickTime >= tickDuration) {
      this.lastTickTime = this.elapsed;
      this._onTick();
      this.tick++;

      if (this.tick >= TICKS_PER_BAR) {
        this.tick = 0;
        this.bar = (this.bar + 1) % 4;
        this.barsPlayed++;
        this._onBarChange();
      }
    }
  }

  _onTick() {
    const now = this.ctx.currentTime;
    const chordRoot = this.rootMidi + this.progression[this.bar];

    // Channel 1: Bass (always on)
    this._playBass(now, chordRoot);

    // Channel 2: Arp (fades in with intensity)
    if (this.intensity > 0.15) {
      this._playArp(now, chordRoot);
    }

    // Channel 3: Melody (higher intensity)
    if (this.intensity > 0.4) {
      this._playMelody(now, chordRoot);
    }

    // Channel 4: Drums (noise percussion)
    this._playDrums(now);
  }

  _playBass(now, root) {
    const pattern = BASS_PATTERNS[this.bassPattern % BASS_PATTERNS.length];
    const note = pattern[this.tick % pattern.length];
    if (note === null) return;

    const freq = midiToFreq(root + note - 12); // one octave down
    const dur = 60 / (this.bpm * TICKS_PER_BEAT) * 0.8;

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.setValueAtTime(0.3, now + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0.001, now + dur);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  _playArp(now, root) {
    const pattern = ARP_PATTERNS[this.arpPattern % ARP_PATTERNS.length];
    const note = pattern[this.tick % pattern.length];
    if (note === null) return;

    const freq = midiToFreq(root + note);
    const dur = 60 / (this.bpm * TICKS_PER_BEAT) * 0.5;
    const vol = 0.12 + (this.intensity - 0.15) * 0.2;

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    // Chiptune pitch slide on some notes
    if (Math.random() < 0.1) {
      osc.frequency.linearRampToValueAtTime(freq * 1.05, now + dur * 0.3);
      osc.frequency.linearRampToValueAtTime(freq, now + dur * 0.6);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.linearRampToValueAtTime(0.001, now + dur);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  _playMelody(now, root) {
    const pattern = MELODY_PATTERNS[this.melodyPattern % MELODY_PATTERNS.length];
    const note = pattern[this.tick % pattern.length];
    if (note === null) return;

    const freq = midiToFreq(root + note);
    const dur = 60 / (this.bpm * TICKS_PER_BEAT) * 1.2;
    const vol = 0.08 + (this.intensity - 0.4) * 0.15;

    // Lead voice — triangle for softer chiptune lead
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    // Vibrato
    const vib = this.ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.015;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.setValueAtTime(vol, now + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur);
    vib.start(now);
    vib.stop(now + dur);
  }

  _playDrums(now) {
    const beat = this.tick % TICKS_PER_BAR;
    const pat = this.drumPattern % DRUM_PATTERNS.length;
    const row = DRUM_PATTERNS[pat][beat];
    if (!row) return;

    if (row.includes('K')) this._kick(now);
    if (row.includes('S')) this._snare(now, 0.18);
    if (row.includes('s')) this._snare(now, 0.07); // ghost snare
    if (row.includes('H')) this._hat(now, 0.07, 0.05);
    if (row.includes('h')) this._hat(now, 0.03, 0.03); // soft hat
    if (row.includes('O')) this._hat(now, 0.06, 0.12); // open hat
  }

  _kick(now) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    // Click transient
    const click = this.ctx.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(800, now);
    click.frequency.exponentialRampToValueAtTime(100, now + 0.01);
    const cGain = this.ctx.createGain();
    cGain.gain.setValueAtTime(0.15, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    osc.connect(gain).connect(this.masterGain);
    click.connect(cGain).connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.15);
    click.start(now); click.stop(now + 0.02);
  }

  _snare(now, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    // Noise body
    const noise = this.ctx.createOscillator();
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(5000 + Math.random() * 4000, now);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.6, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 3000;
    osc.connect(gain).connect(this.masterGain);
    noise.connect(nGain).connect(nFilter).connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.1);
    noise.start(now); noise.stop(now + 0.09);
  }

  _hat(now, vol, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(8000 + Math.random() * 5000, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    osc.connect(gain).connect(filter).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  _onBarChange() {
    // Every 4 bars (one full progression cycle), evolve
    if (this.barsPlayed % 4 === 0) {
      // Shift patterns
      this.bassPattern = (this.bassPattern + 1) % BASS_PATTERNS.length;
      this.arpPattern = (this.arpPattern + 1) % ARP_PATTERNS.length;
      this.melodyPattern = (this.melodyPattern + 1) % MELODY_PATTERNS.length;
      this.drumPattern = (this.drumPattern + 1) % DRUM_PATTERNS.length;
    }

    // Every 8 bars, change key and progression
    if (this.barsPlayed % 8 === 0 && this.barsPlayed > 0) {
      this.rootMidi = ROOTS[Math.floor(Math.random() * ROOTS.length)];
      this.progIndex = (this.progIndex + 1) % PROGRESSIONS.length;
      this.progression = PROGRESSIONS[this.progIndex];
    }
  }

  celebrationSwell() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(0.15, now);
    this.masterGain.gain.linearRampToValueAtTime(0.3, now + 0.3);
    this.masterGain.gain.linearRampToValueAtTime(0.15, now + 4);
  }

  gameOverDarken() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.linearRampToValueAtTime(0.03, now + 1.5);
    this.masterGain.gain.linearRampToValueAtTime(0.15, now + 5);
  }
}
