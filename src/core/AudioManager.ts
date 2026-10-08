import { progress } from './Progress';

export type SfxName =
  | 'click'
  | 'pop'
  | 'match'
  | 'coin'
  | 'star'
  | 'success'
  | 'fail'
  | 'jump'
  | 'land'
  | 'collect'
  | 'reward'
  | 'flip'
  | 'swap'
  | 'wrong'
  | 'right'
  | 'place'
  | 'erase'
  | 'whoosh'
  | 'tick'
  | 'sizzle'
  | 'dice'
  | 'capture'
  | 'engine'
  | 'step'
  | 'splash'
  | 'bubble'
  | 'chime'
  | 'thud';

/**
 * Procedural Web Audio sound engine.
 * Every sound is synthesised, so the game can never break because of a
 * missing audio file. Everything is wrapped in try/catch.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return true;
    }
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = progress.data.settings.sound ? 0.75 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = progress.data.settings.music ? 0.28 : 0;
      this.musicBus.connect(this.master);

      const len = Math.floor(this.ctx.sampleRate * 0.4);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  /** Call from a user gesture so browsers unlock audio. */
  unlock(): void {
    this.ensure();
    if (progress.data.settings.music && !this.musicTimer) this.startMusic();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
    glide?: number
  ): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName): void {
    try {
      if (!progress.data.settings.sound) return;
      if (!this.ensure()) return;
      switch (name) {
        case 'click':
          this.tone(720, 0.06, 'square', 0.16, 0, 520);
          break;
        case 'pop':
          this.tone(880, 0.09, 'sine', 0.28, 0, 260);
          this.noise(0.05, 0.1, 1800);
          break;
        case 'match':
          this.tone(660, 0.1, 'triangle', 0.24);
          this.tone(880, 0.12, 'triangle', 0.22, 0.07);
          break;
        case 'coin':
          this.tone(932, 0.08, 'square', 0.16);
          this.tone(1244, 0.14, 'square', 0.15, 0.07);
          break;
        case 'star':
          this.tone(1046, 0.09, 'triangle', 0.2);
          this.tone(1318, 0.09, 'triangle', 0.2, 0.06);
          this.tone(1568, 0.16, 'triangle', 0.2, 0.12);
          break;
        case 'success':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.22, i * 0.09));
          break;
        case 'fail':
          this.tone(392, 0.18, 'triangle', 0.18, 0, 330);
          this.tone(311, 0.26, 'triangle', 0.16, 0.14, 260);
          break;
        case 'jump':
          this.tone(420, 0.16, 'square', 0.16, 0, 900);
          break;
        case 'land':
          this.noise(0.09, 0.16, 380);
          break;
        case 'collect':
          this.tone(760, 0.07, 'triangle', 0.2, 0, 1300);
          break;
        case 'reward':
          [659, 784, 988, 1318, 1568].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.2, i * 0.07));
          this.noise(0.3, 0.05, 5200, 0.2);
          break;
        case 'flip':
          this.tone(560, 0.07, 'square', 0.13, 0, 760);
          break;
        case 'swap':
          this.tone(500, 0.08, 'sine', 0.16, 0, 700);
          this.tone(700, 0.08, 'sine', 0.14, 0.05, 500);
          break;
        case 'wrong':
          this.tone(300, 0.16, 'sine', 0.18, 0, 220);
          break;
        case 'right':
          this.tone(700, 0.1, 'square', 0.15, 0, 1050);
          break;
        case 'place':
          this.tone(300, 0.1, 'sine', 0.22, 0, 180);
          this.noise(0.06, 0.08, 700);
          break;
        case 'erase':
          this.tone(600, 0.09, 'sawtooth', 0.09, 0, 200);
          break;
        case 'whoosh':
          this.noise(0.24, 0.14, 900);
          break;
        case 'tick':
          this.tone(988, 0.05, 'square', 0.1);
          break;
        case 'sizzle':
          this.noise(0.3, 0.1, 3200);
          break;
        case 'dice':
          this.noise(0.05, 0.12, 2400);
          this.noise(0.05, 0.12, 3000, 0.09);
          this.noise(0.07, 0.16, 2000, 0.18);
          this.tone(520, 0.05, 'square', 0.1, 0.3, 340);
          break;
        case 'capture':
          this.tone(660, 0.09, 'square', 0.18, 0, 260);
          this.tone(340, 0.16, 'sawtooth', 0.16, 0.07, 140);
          this.noise(0.12, 0.18, 700, 0.05);
          break;
        case 'engine':
          this.tone(90, 0.26, 'sawtooth', 0.07, 0, 70);
          this.noise(0.2, 0.05, 420);
          break;
        case 'step':
          this.noise(0.05, 0.07, 640);
          this.tone(150, 0.05, 'sine', 0.07, 0, 90);
          break;
        case 'splash':
          this.noise(0.3, 0.16, 1500);
          this.tone(300, 0.22, 'sine', 0.1, 0, 620);
          break;
        case 'bubble':
          this.tone(520, 0.1, 'sine', 0.16, 0, 1180);
          break;
        case 'chime':
          [1318, 1568, 1976].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.16, i * 0.07));
          break;
        case 'thud':
          this.tone(120, 0.14, 'sine', 0.2, 0, 60);
          this.noise(0.1, 0.1, 300);
          break;
      }
    } catch {
      /* sound must never crash the game */
    }
  }

  /* ---------------- music ---------------- */

  private readonly melody = [
    0, 4, 7, 12, 7, 4, 0, 4, 2, 5, 9, 14, 9, 5, 2, 5,
    0, 4, 7, 12, 16, 12, 7, 4, 5, 9, 12, 17, 12, 9, 5, 0,
  ];
  private readonly bass = [0, 0, 5, 5, 7, 7, 5, 5];

  private scheduleNote(freq: number, time: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private readonly mtof = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

  private musicLoop = (): void => {
    if (!this.ctx || !progress.data.settings.music) return;
    const spb = 60 / 112 / 2; // eighth notes at 112 BPM
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const i = this.step % this.melody.length;
      const root = 60;
      this.scheduleNote(this.mtof(root + this.melody[i]), this.nextNoteTime, spb * 0.9, 'triangle', 0.5);
      if (i % 2 === 0) {
        const b = this.bass[Math.floor(i / 2) % this.bass.length];
        this.scheduleNote(this.mtof(root - 24 + b), this.nextNoteTime, spb * 1.6, 'sine', 0.7);
      }
      if (i % 4 === 2) this.scheduleNote(this.mtof(root + 24 + this.melody[i]), this.nextNoteTime, spb * 0.4, 'square', 0.12);
      this.nextNoteTime += spb;
      this.step++;
    }
  };

  startMusic(): void {
    try {
      if (!progress.data.settings.music) return;
      if (!this.ensure()) return;
      if (this.musicTimer) return;
      this.nextNoteTime = (this.ctx?.currentTime ?? 0) + 0.1;
      this.step = 0;
      this.musicTimer = setInterval(this.musicLoop, 90);
      this.musicLoop();
    } catch {
      /* ignore */
    }
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setSound(on: boolean): void {
    if (this.sfxBus) this.sfxBus.gain.value = on ? 0.75 : 0;
  }

  setMusic(on: boolean): void {
    if (this.musicBus) this.musicBus.gain.value = on ? 0.28 : 0;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  resumeAfterGesture(): void {
    this.ensure();
    if (progress.data.settings.music) this.startMusic();
  }
}

export const audio = new AudioManager();
