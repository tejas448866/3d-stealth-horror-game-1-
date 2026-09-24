// Procedural WebAudio sound design — no external assets.
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  noise!: AudioBuffer;
  brown!: AudioBuffer;
  hum!: GainNode;
  drone!: GainNode;
  chaseGain!: GainNode;
  monsterPanner!: PannerNode;
  breath!: GainNode;
  started = false;
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      bd[i] = last * 3.5;
    }

    // ambient bed
    const amb = ctx.createBufferSource();
    amb.buffer = this.brown;
    amb.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    const ambG = ctx.createGain();
    ambG.gain.value = 0.22;
    amb.connect(lp).connect(ambG).connect(this.master);
    amb.start();

    this.drone = ctx.createGain();
    this.drone.gain.value = 0.05;
    this.drone.connect(this.master);
    [41, 55.3, 61.7].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain();
      lg.gain.value = 1.5;
      lfo.connect(lg).connect(o.frequency);
      lfo.start();
      o.connect(this.drone);
      o.start();
    });

    // electrical hum
    this.hum = ctx.createGain();
    this.hum.gain.value = 0.012;
    const ho = ctx.createOscillator();
    ho.type = "sawtooth";
    ho.frequency.value = 60;
    const hf = ctx.createBiquadFilter();
    hf.type = "lowpass";
    hf.frequency.value = 240;
    ho.connect(hf).connect(this.hum).connect(this.master);
    ho.start();

    // chase layer (dissonant pulse)
    this.chaseGain = ctx.createGain();
    this.chaseGain.gain.value = 0;
    this.chaseGain.connect(this.master);
    [73.4, 77.8, 110].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = 420;
      o.connect(f2).connect(this.chaseGain);
      o.start();
    });

    // monster breathing (positional loop)
    this.monsterPanner = this.makePanner();
    this.monsterPanner.connect(this.sfx);
    this.breath = ctx.createGain();
    this.breath.gain.value = 0;
    const br = ctx.createBufferSource();
    br.buffer = this.noise;
    br.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 520;
    bf.Q.value = 2.5;
    const blfo = ctx.createOscillator();
    blfo.frequency.value = 0.45;
    const blg = ctx.createGain();
    blg.gain.value = 0.5;
    const bamp = ctx.createGain();
    bamp.gain.value = 0.5;
    blfo.connect(blg).connect(bamp.gain);
    blfo.start();
    br.connect(bf).connect(bamp).connect(this.breath).connect(this.monsterPanner);
    br.start();
    this.started = true;
  }

  makePanner() {
    const p = this.ctx!.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 2;
    p.maxDistance = 60;
    p.rolloffFactor = 1.3;
    return p;
  }

  setListener(x: number, y: number, z: number, fx: number, fz: number) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      (l as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, y, z);
    }
  }

  setMonsterPos(x: number, y: number, z: number, breathLevel: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.monsterPanner;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, 0.05);
      p.positionY.setTargetAtTime(y, t, 0.05);
      p.positionZ.setTargetAtTime(z, t, 0.05);
    }
    this.breath.gain.setTargetAtTime(breathLevel, t, 0.3);
  }

  setChase(level: number) {
    if (!this.ctx) return;
    this.chaseGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.6);
  }

  setPowered(on: boolean) {
    if (!this.ctx) return;
    this.hum.gain.setTargetAtTime(on ? 0.035 : 0.012, this.ctx.currentTime, 0.8);
  }

  private dest(pos?: [number, number, number]) {
    if (!pos) return this.sfx;
    const p = this.makePanner();
    const t = this.ctx!.currentTime;
    if (p.positionX) {
      p.positionX.setValueAtTime(pos[0], t);
      p.positionY.setValueAtTime(pos[1], t);
      p.positionZ.setValueAtTime(pos[2], t);
    }
    p.connect(this.sfx);
    return p;
  }

  private burst(opts: {
    dur: number;
    type?: BiquadFilterType;
    f0: number;
    f1?: number;
    q?: number;
    gain: number;
    pos?: [number, number, number];
    delay?: number;
    brown?: boolean;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = opts.brown ? this.brown : this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type || "bandpass";
    f.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    s.connect(f).connect(g).connect(this.dest(opts.pos));
    s.start(t, Math.random() * 1.5);
    s.stop(t + opts.dur + 0.05);
  }

  private tone(opts: {
    f0: number;
    f1?: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
    pos?: [number, number, number];
    delay?: number;
    attack?: number;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator();
    o.type = opts.type || "sine";
    o.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g).connect(this.dest(opts.pos));
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  footstep(run: boolean, metal: boolean) {
    this.burst({ dur: run ? 0.09 : 0.07, f0: metal ? 1400 : 500 + Math.random() * 300, q: metal ? 3 : 0.8, gain: run ? 0.22 : 0.11 });
    this.tone({ f0: 90, f1: 50, dur: 0.08, gain: run ? 0.12 : 0.06 });
    if (metal) this.tone({ f0: 900 + Math.random() * 200, dur: 0.05, gain: 0.02, type: "triangle" });
  }

  monsterStep(pos: [number, number, number], heavy = 1) {
    this.burst({ dur: 0.18, type: "lowpass", f0: 260, gain: 0.9 * heavy, pos, brown: true });
    this.tone({ f0: 70, f1: 32, dur: 0.25, gain: 0.7 * heavy, pos });
    if (Math.random() < 0.35) this.burst({ dur: 0.3, f0: 1800, f1: 900, q: 6, gain: 0.05, pos, delay: 0.05 });
  }

  growl(pos: [number, number, number], intensity = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const d = this.dest(pos);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * intensity, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 1.8);
    g.connect(d);
    f.connect(g);
    [62, 64.5, 93, 131].forEach((fr) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(fr * 1.2, t);
      o.frequency.exponentialRampToValueAtTime(fr * 0.8, t + 1.8);
      o.connect(f);
      o.start(t);
      o.stop(t + 1.9);
    });
    this.burst({ dur: 1.4, f0: 700, f1: 300, q: 3, gain: 0.25 * intensity, pos });
  }

  door(pos: [number, number, number], heavy = false) {
    this.burst({ dur: 0.9, f0: 500, f1: 180, q: 4, gain: 0.25, pos });
    this.tone({ f0: 180, f1: 120, dur: 0.7, gain: 0.05, type: "sawtooth", pos, delay: 0.05 });
    this.burst({ dur: 0.3, type: "lowpass", f0: 200, gain: heavy ? 0.9 : 0.5, pos, delay: 0.75, brown: true });
    this.tone({ f0: 80, f1: 40, dur: 0.3, gain: 0.35, pos, delay: 0.75 });
  }

  locker(pos: [number, number, number]) {
    this.tone({ f0: 320, f1: 210, dur: 0.45, gain: 0.05, type: "sawtooth", pos });
    this.burst({ dur: 0.4, f0: 2200, f1: 1200, q: 8, gain: 0.08, pos });
    this.tone({ f0: 420, dur: 0.25, gain: 0.08, type: "triangle", pos, delay: 0.42 });
    this.burst({ dur: 0.12, f0: 900, q: 2, gain: 0.3, pos, delay: 0.42 });
  }

  pickup() {
    this.tone({ f0: 520, dur: 0.18, gain: 0.12, type: "triangle" });
    this.tone({ f0: 780, dur: 0.3, gain: 0.1, type: "triangle", delay: 0.08 });
    this.burst({ dur: 0.1, f0: 3000, q: 2, gain: 0.05 });
  }

  denied() {
    this.tone({ f0: 140, dur: 0.16, gain: 0.12, type: "square" });
    this.tone({ f0: 110, dur: 0.26, gain: 0.12, type: "square", delay: 0.2 });
  }

  beep() {
    this.tone({ f0: 1200, dur: 0.07, gain: 0.05, type: "square" });
  }

  click() {
    this.burst({ dur: 0.03, f0: 2500, q: 3, gain: 0.12 });
  }

  power() {
    this.tone({ f0: 40, f1: 240, dur: 2.2, gain: 0.18, type: "sawtooth", attack: 0.8 });
    this.burst({ dur: 0.5, type: "lowpass", f0: 180, gain: 0.9, brown: true });
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.35, type: "lowpass", f0: 150, gain: 0.5, brown: true, delay: 0.6 + i * 0.4 });
  }

  spark(pos: [number, number, number]) {
    for (let i = 0; i < 5; i++) this.burst({ dur: 0.04 + Math.random() * 0.05, type: "highpass", f0: 3000, gain: 0.25, pos, delay: i * 0.04 * Math.random() * 3 });
  }

  clank(pos: [number, number, number]) {
    [310, 473, 821, 1190].forEach((f, i) => this.tone({ f0: f, dur: 1.4 - i * 0.2, gain: 0.07, type: "sine", pos }));
    this.burst({ dur: 0.2, f0: 1500, q: 1, gain: 0.25, pos });
  }

  clatter(pos: [number, number, number]) {
    for (let i = 0; i < 4; i++) {
      this.tone({ f0: 900 + Math.random() * 1400, dur: 0.15, gain: 0.08, type: "triangle", pos, delay: i * 0.09 + Math.random() * 0.03 });
      this.burst({ dur: 0.06, f0: 2600, q: 2, gain: 0.25, pos, delay: i * 0.09 });
    }
  }

  crash(pos: [number, number, number]) {
    for (let i = 0; i < 7; i++) {
      this.burst({ dur: 0.3, f0: 400 + Math.random() * 1600, q: 2, gain: 0.6, pos, delay: i * 0.07 });
      this.tone({ f0: 300 + Math.random() * 900, dur: 0.6, gain: 0.08, type: "triangle", pos, delay: i * 0.08 });
    }
    this.burst({ dur: 0.6, type: "lowpass", f0: 200, gain: 1, pos, brown: true });
  }

  heartbeat(level: number) {
    const g = 0.1 + level * 0.35;
    this.tone({ f0: 58, f1: 40, dur: 0.16, gain: g });
    this.tone({ f0: 52, f1: 38, dur: 0.18, gain: g * 0.8, delay: 0.22 });
  }

  sting() {
    this.burst({ dur: 1.6, f0: 1200, f1: 200, q: 1, gain: 0.8 });
    [98, 103.8, 146.8, 155.6].forEach((f) => this.tone({ f0: f * 2, f1: f, dur: 2.5, gain: 0.12, type: "sawtooth" }));
    this.tone({ f0: 50, f1: 30, dur: 2, gain: 0.6 });
  }

  rumble(dur: number) {
    this.burst({ dur, type: "lowpass", f0: 140, gain: 0.8, brown: true });
    this.tone({ f0: 48, f1: 44, dur, gain: 0.25, type: "triangle", attack: 0.5 });
  }

  elevatorChime() {
    this.tone({ f0: 660, dur: 1.2, gain: 0.1, type: "sine" });
    this.tone({ f0: 523, dur: 1.5, gain: 0.1, type: "sine", delay: 0.35 });
  }

  steam(pos: [number, number, number]) {
    this.burst({ dur: 1.4, type: "highpass", f0: 2500, gain: 0.12, pos });
  }
}
