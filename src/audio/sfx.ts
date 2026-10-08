// Звуки и вибрация без аудиофайлов: короткие синтезированные сигналы WebAudio.
let ctx: AudioContext | null = null;
let enabled = true;
let vibrate = true;

export function configureFeedback(sound: boolean, vib: boolean) {
  enabled = sound;
  vibrate = vib;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function buzz(pattern: number | number[]) {
  if (!vibrate) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* нет поддержки */
  }
}

export const sfx = {
  click(combo = 1) {
    tone(520 + combo * 60, 0.06, 'triangle', 0.05, 1.3);
    buzz(6);
  },
  crit() {
    tone(880, 0.08, 'square', 0.04, 1.5);
    tone(1320, 0.12, 'triangle', 0.05, 1.2, 0.05);
    buzz([10, 30, 16]);
  },
  buy() {
    tone(660, 0.07, 'sine', 0.06, 1.2);
    tone(990, 0.09, 'sine', 0.05, 1.1, 0.06);
    buzz(12);
  },
  cash() {
    tone(1200, 0.05, 'triangle', 0.04);
    tone(1600, 0.07, 'triangle', 0.04, 1, 0.05);
  },
  error() {
    tone(220, 0.12, 'sawtooth', 0.03, 0.7);
    buzz([20, 40, 20]);
  },
  milestone() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, 1, i * 0.08));
    buzz([20, 40, 20, 40, 60]);
  },
  achievement() {
    [784, 988, 1175].forEach((f, i) => tone(f, 0.18, 'sine', 0.05, 1, i * 0.09));
    buzz([15, 30, 15]);
  },
  news() {
    tone(440, 0.08, 'sine', 0.03);
  },
  bad() {
    tone(330, 0.15, 'sawtooth', 0.03, 0.6);
    buzz(40);
  },
};
