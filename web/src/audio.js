let audioCtx = null;

/**
 * Speak text in a robotic voice using Web Speech API.
 * @param {string} text
 */
export function speakRobot(text) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.pitch = 0.3;
  utter.rate = 0.9;
  utter.volume = 1.0;
  // Try to pick a robotic-sounding voice
  const voices = speechSynthesis.getVoices();
  const robot = voices.find(v => /english/i.test(v.lang) && /male/i.test(v.name))
    || voices.find(v => /en/i.test(v.lang))
    || voices[0];
  if (robot) utter.voice = robot;
  speechSynthesis.speak(utter);
}

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

/**
 * Play a sharp pop sound when a ball is destroyed by the blade.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function playPop(x, y, z) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 10;
  panner.setPosition(x, y, z);
  panner.connect(ctx.destination);

  // Sharp transient pop
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(600, now);
  osc1.frequency.exponentialRampToValueAtTime(80, now + 0.1);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.6, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  // Noise-like burst
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(2000 + Math.random() * 2000, now);
  osc2.frequency.exponentialRampToValueAtTime(100, now + 0.05);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.25, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  // Airy release
  const osc3 = ctx.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(1200, now);
  osc3.frequency.exponentialRampToValueAtTime(300, now + 0.2);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.1, now);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc1.connect(gain1).connect(panner);
  osc2.connect(gain2).connect(panner);
  osc3.connect(gain3).connect(panner);

  osc1.start(now); osc1.stop(now + 0.15);
  osc2.start(now); osc2.stop(now + 0.08);
  osc3.start(now); osc3.stop(now + 0.25);
}

/**
 * Play a metallic blade extend/unsheathe "shing" sound.
 */
export function playBladeExtend() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const duration = 0.3;

  // Metallic ring — high sine sweep
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(3000, now);
  osc1.frequency.exponentialRampToValueAtTime(6000, now + 0.05);
  osc1.frequency.exponentialRampToValueAtTime(2000, now + duration);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.2, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Scrape — filtered noise-like
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(800, now);
  osc2.frequency.exponentialRampToValueAtTime(4000, now + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(1000, now + duration);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.08, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  filter.Q.value = 3;

  osc1.connect(gain1).connect(ctx.destination);
  osc2.connect(gain2).connect(filter).connect(ctx.destination);

  osc1.start(now); osc1.stop(now + duration);
  osc2.start(now); osc2.stop(now + duration);
}

/**
 * Play a blade swoosh sound — movement through air.
 * @param {number} speed - hand speed (higher = more intense)
 */
export function playBladeSwoosh(speed) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = Math.min(speed / 5.0, 0.3);
  const duration = 0.15 + vol * 0.1;

  // Whoosh — filtered noise sweep
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(100 + speed * 50, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500 + speed * 200, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);
  filter.Q.value = 1.5;

  osc.connect(gain).connect(filter).connect(ctx.destination);
  osc.start(now); osc.stop(now + duration);
}

/**
 * Play a bingy-boingy winner celebration fanfare.
 * Ascending arpeggiated chime sequence with sparkly tail.
 */
export function playWinner() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Ascending major arpeggio notes (C5, E5, G5, C6, E6, G6, C7)
  const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
  const noteGap = 0.12;

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * noteGap;
    const freq = notes[i];

    // Main chime
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Boingy pitch wobble
    const wobble = ctx.createOscillator();
    wobble.type = 'sine';
    wobble.frequency.value = 15 - i * 1.5;
    const wobbleAmt = ctx.createGain();
    wobbleAmt.gain.value = freq * 0.02;
    wobble.connect(wobbleAmt);
    wobbleAmt.connect(osc.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    // Shimmer overtone
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(freq * 2.01, t);
    const shimGain = ctx.createGain();
    shimGain.gain.setValueAtTime(0.001, t);
    shimGain.gain.linearRampToValueAtTime(0.08, t + 0.02);
    shimGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain).connect(ctx.destination);
    shimmer.connect(shimGain).connect(ctx.destination);

    osc.start(t); osc.stop(t + 0.6);
    shimmer.start(t); shimmer.stop(t + 0.4);
    wobble.start(t); wobble.stop(t + 0.6);
  }

  // Final sparkly wash after arpeggio
  const washStart = now + notes.length * noteGap;
  const washDur = 2.0;

  const wash1 = ctx.createOscillator();
  wash1.type = 'sine';
  wash1.frequency.setValueAtTime(2093, washStart);
  wash1.frequency.exponentialRampToValueAtTime(4186, washStart + washDur * 0.3);
  wash1.frequency.exponentialRampToValueAtTime(2093, washStart + washDur);

  const wash2 = ctx.createOscillator();
  wash2.type = 'triangle';
  wash2.frequency.setValueAtTime(2637, washStart);
  wash2.frequency.exponentialRampToValueAtTime(5274, washStart + washDur * 0.3);
  wash2.frequency.exponentialRampToValueAtTime(1319, washStart + washDur);

  // Tremolo on the wash
  const tremLfo = ctx.createOscillator();
  tremLfo.type = 'sine';
  tremLfo.frequency.value = 8;
  const tremAmt = ctx.createGain();
  tremAmt.gain.value = 0.15;
  tremLfo.connect(tremAmt);

  const washGain = ctx.createGain();
  washGain.gain.setValueAtTime(0.001, washStart);
  washGain.gain.linearRampToValueAtTime(0.2, washStart + 0.1);
  washGain.gain.setValueAtTime(0.2, washStart + washDur * 0.5);
  washGain.gain.exponentialRampToValueAtTime(0.001, washStart + washDur);
  tremAmt.connect(washGain.gain);

  wash1.connect(washGain).connect(ctx.destination);
  wash2.connect(washGain);

  wash1.start(washStart); wash1.stop(washStart + washDur);
  wash2.start(washStart); wash2.stop(washStart + washDur);
  tremLfo.start(washStart); tremLfo.stop(washStart + washDur);
}
