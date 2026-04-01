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
