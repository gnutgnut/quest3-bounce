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
