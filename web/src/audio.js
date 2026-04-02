let audioCtx = null;

export function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a sparkly bounce sound.
 * @param {number} x - ball x position
 * @param {number} y - ball y position
 * @param {number} z - ball z position
 * @param {number} intensity - bounce strength (0-10)
 */
export function playBounce(x, y, z, intensity) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = Math.min(intensity / 6.0, 1.0);
  const duration = 0.12 + vol * 0.08;

  // Spatial panner
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 10;
  panner.setPosition(x, y, z);
  panner.connect(ctx.destination);

  // Main tone — pitch varies with intensity
  const baseFreq = 1200 + Math.random() * 1800;
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + duration);

  // Shimmer — detuned second oscillator
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseFreq * 1.5 + Math.random() * 500, now);
  osc2.frequency.exponentialRampToValueAtTime(800, now + duration);

  // Sparkle — high frequency noise burst
  const osc3 = ctx.createOscillator();
  osc3.type = 'square';
  osc3.frequency.setValueAtTime(4000 + Math.random() * 4000, now);
  osc3.frequency.exponentialRampToValueAtTime(1000, now + duration * 0.5);

  // Gain envelopes
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(vol * 0.3, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(vol * 0.15, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(vol * 0.08, now);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.4);

  // Connect
  osc1.connect(gain1).connect(panner);
  osc2.connect(gain2).connect(panner);
  osc3.connect(gain3).connect(panner);

  // Play
  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
  osc3.stop(now + duration);
}

/**
 * Play a percussive thwack for hand-ball contact.
 * @param {number} x - hit x position
 * @param {number} y - hit y position
 * @param {number} z - hit z position
 * @param {number} intensity - hit strength 0-1
 */
export function playHandHit(x, y, z, intensity) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = 0.3 + intensity * 0.7;
  const duration = 0.15;

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 10;
  panner.setPosition(x, y, z);
  panner.connect(ctx.destination);

  // Low thud
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(120 + intensity * 40, now);
  osc1.frequency.exponentialRampToValueAtTime(60, now + duration);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(vol * 0.5, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Slap
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(800 + intensity * 400, now);
  osc2.frequency.exponentialRampToValueAtTime(100, now + duration * 0.3);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(vol * 0.25, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.4);

  // Click transient
  const osc3 = ctx.createOscillator();
  osc3.type = 'square';
  osc3.frequency.setValueAtTime(2000 + Math.random() * 1000, now);
  osc3.frequency.exponentialRampToValueAtTime(500, now + 0.03);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(vol * 0.15, now);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc1.connect(gain1).connect(panner);
  osc2.connect(gain2).connect(panner);
  osc3.connect(gain3).connect(panner);

  osc1.start(now); osc1.stop(now + duration);
  osc2.start(now); osc2.stop(now + duration);
  osc3.start(now); osc3.stop(now + duration);
}

/**
 * Play a descending synth sweep for game over.
 * Sweeps from high frequency down to deep bass over ~2 seconds.
 */
export function playGameOver() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 2.5;

  // Main sweep — high to bass
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(3000, now);
  osc1.frequency.exponentialRampToValueAtTime(40, now + duration);

  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.4, now);
  gain1.gain.setValueAtTime(0.4, now + duration * 0.6);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Detuned second voice for thickness
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(3050, now);
  osc2.frequency.exponentialRampToValueAtTime(38, now + duration);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.2, now);
  gain2.gain.setValueAtTime(0.2, now + duration * 0.5);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Sub bass rumble at the end
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(80, now);
  osc3.frequency.exponentialRampToValueAtTime(30, now + duration);

  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.001, now);
  gain3.gain.linearRampToValueAtTime(0.5, now + duration * 0.5);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Low-pass filter to darken the sweep as it descends
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(8000, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);
  filter.Q.value = 5;

  osc1.connect(gain1).connect(filter);
  osc2.connect(gain2).connect(filter);
  osc3.connect(gain3).connect(ctx.destination);
  filter.connect(ctx.destination);

  osc1.start(now); osc1.stop(now + duration);
  osc2.start(now); osc2.stop(now + duration);
  osc3.start(now); osc3.stop(now + duration);
}

/**
 * Play a shimmery tremolo-vibrato string splash for hot reload.
 * Bright rising chord with fast tremolo and pitch wobble, ~1.5s.
 */
export function playHotReload() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 1.5;

  // Tremolo LFO — fast amplitude modulation
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.type = 'sine';
  tremoloLfo.frequency.setValueAtTime(12, now);
  tremoloLfo.frequency.linearRampToValueAtTime(6, now + duration);
  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 0.4;
  tremoloLfo.connect(tremoloGain);

  // Vibrato LFO — pitch wobble
  const vibratoLfo = ctx.createOscillator();
  vibratoLfo.type = 'sine';
  vibratoLfo.frequency.setValueAtTime(6, now);
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = 8;
  vibratoLfo.connect(vibratoGain);

  // Three string voices in a bright major chord
  const freqs = [880, 1108.73, 1318.51]; // A5, C#6, E6
  const types = ['sawtooth', 'triangle', 'sawtooth'];
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, now);
  masterGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
  masterGain.gain.setValueAtTime(0.3, now + duration * 0.4);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Connect tremolo to master gain (modulates amplitude)
  tremoloGain.connect(masterGain.gain);

  // Bright shimmer filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(4000, now + duration * 0.3);
  filter.frequency.exponentialRampToValueAtTime(1500, now + duration);
  filter.Q.value = 2;

  masterGain.connect(filter);
  filter.connect(ctx.destination);

  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = types[i];
    osc.frequency.setValueAtTime(freqs[i], now);
    osc.frequency.linearRampToValueAtTime(freqs[i] * 1.15, now + duration);
    vibratoGain.connect(osc.frequency);
    osc.detune.value = (i - 1) * 12;
    osc.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }

  // High sparkle layer
  const sparkle = ctx.createOscillator();
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(3520, now);
  sparkle.frequency.exponentialRampToValueAtTime(5000, now + duration * 0.5);
  sparkle.frequency.exponentialRampToValueAtTime(2000, now + duration);
  const sparkleGain = ctx.createGain();
  sparkleGain.gain.setValueAtTime(0.08, now);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
  sparkle.connect(sparkleGain).connect(filter);
  sparkle.start(now);
  sparkle.stop(now + duration);

  tremoloLfo.start(now); tremoloLfo.stop(now + duration);
  vibratoLfo.start(now); vibratoLfo.stop(now + duration);
}

/**
 * Play a squishy/farty/leathery dimensional-squeeze sound for ball spawn.
 * Low gurgling pitch bend with formant wobble — like something squishing through a portal.
 */
export function playSpawn() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.45;

  // Main squelch — deep pitch that bends up then drops
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(50, now);
  osc1.frequency.exponentialRampToValueAtTime(250, now + duration * 0.3);
  osc1.frequency.exponentialRampToValueAtTime(60, now + duration);

  // Formant wobble LFO — makes it sound fleshy/leathery
  const wobbleLfo = ctx.createOscillator();
  wobbleLfo.type = 'sine';
  wobbleLfo.frequency.setValueAtTime(30, now);
  wobbleLfo.frequency.linearRampToValueAtTime(8, now + duration);
  const wobbleGain = ctx.createGain();
  wobbleGain.gain.value = 60;
  wobbleLfo.connect(wobbleGain);
  wobbleGain.connect(osc1.frequency);

  // Second voice — square wave fart undertone
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(35, now);
  osc2.frequency.exponentialRampToValueAtTime(180, now + duration * 0.25);
  osc2.frequency.exponentialRampToValueAtTime(40, now + duration);

  // High squeeze — the "popping through" moment
  const osc3 = ctx.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(800, now + duration * 0.2);
  osc3.frequency.exponentialRampToValueAtTime(120, now + duration);

  // Gain envelopes
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.35, now + duration * 0.15);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.linearRampToValueAtTime(0.2, now + duration * 0.2);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.001, now);
  gain3.gain.linearRampToValueAtTime(0.12, now + duration * 0.25);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);

  // Resonant filter — gives the squelchy formant character
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(800, now + duration * 0.3);
  filter.frequency.exponentialRampToValueAtTime(150, now + duration);
  filter.Q.value = 8;

  osc1.connect(gain1).connect(filter);
  osc2.connect(gain2).connect(filter);
  osc3.connect(gain3).connect(ctx.destination);
  filter.connect(ctx.destination);

  osc1.start(now); osc1.stop(now + duration);
  osc2.start(now); osc2.stop(now + duration);
  osc3.start(now + duration * 0.2); osc3.stop(now + duration);
  wobbleLfo.start(now); wobbleLfo.stop(now + duration);
}
