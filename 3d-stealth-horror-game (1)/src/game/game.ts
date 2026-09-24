import * as THREE from "three";
import { Level, ROOM_NAMES, SHORT, type RoomId, type HideSpot, type Door, type Item } from "./level";
import { Monster, type NoiseEvent, type World } from "./monster";
import { ArchiveMemory } from "./memory";
import { AudioEngine } from "./audio";
import { dotTex } from "./textures";

export type Mode = "title" | "playing" | "paused" | "caught" | "dead" | "escaping" | "won";

export interface DevInfo {
  state: string;
  target: string;
  suspicion: number;
  noise: number;
  room: string;
  monsterRoom: string;
  lastEvent: string;
  path: string;
  lockerA: string;
  lockerB: string;
  closet: string;
  weights: string;
  route: string;
  activity: string[];
  distractions: string;
  attempts: number;
}

export interface Snapshot {
  mode: Mode;
  obj: { fuse1: boolean; fuse2: boolean; keycard: boolean; power: boolean; elevator: boolean };
  prompt: string | null;
  room: string;
  explored: RoomId[];
  px: number;
  pz: number;
  pyaw: number;
  battery: number;
  stamina: number;
  flashlight: boolean;
  hidden: string | null;
  noise: number;
  score: number;
  attempt: number;
  time: number;
  throws: number;
  danger: number;
  chase: boolean;
  fade: number;
  touch: boolean;
  dev: DevInfo;
}

export interface GameMessage {
  id: number;
  text: string;
  kind: "info" | "warn" | "big" | "score" | "room";
}

export interface ScoreEntry {
  score: number;
  time: number;
  result: "ESCAPED" | "CAUGHT";
  attempt: number;
  date: string;
}

interface Interactable {
  pos: THREE.Vector3;
  r: number;
  prompt: () => string | null;
  act: () => void;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
  grav: number;
}

const SCORE_KEY = "archive_scores_v1";

export function loadScores(): ScoreEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SCORE_KEY) || "[]");
  } catch {
    return [];
  }
}

export class Game implements World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  level: Level;
  monster: Monster;
  memory = new ArchiveMemory();
  audio = new AudioEngine();
  flashlight: THREE.SpotLight;
  hemi: THREE.HemisphereLight;
  mode: Mode = "title";
  time = 0;
  playTime = 0;
  touch: boolean;
  player = {
    pos: new THREE.Vector3(30, 0, 31.5),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    hidden: null as HideSpot | null,
    running: false,
    moving: false,
    flashlight: true,
    stamina: 100,
    battery: 100,
    noise: 0,
    bob: 0,
    stepAcc: 0,
    exhausted: false,
  };
  inv = { fuse1: false, fuse2: false, keycard: false, power: false, elevator: false };
  score = 0;
  throws = 3;
  explored = new Set<RoomId>();
  currentRoom: RoomId | null = null;
  keys = new Set<string>();
  touchMove = { x: 0, y: 0 };
  touchRun = false;
  trauma = 0;
  fade = 0;
  prompt: string | null = null;
  interactables: Interactable[] = [];
  private focus: Interactable | null = null;
  private hbT = 0;
  private uiT = 0;
  private msgId = 0;
  private raf = 0;
  private last = performance.now();
  private seq: { t: number; kind: string; spot?: HideSpot | null; from?: THREE.Vector3; fromYaw?: number } | null = null;
  private anims: { item: Item; t: number }[] = [];
  private projectiles: { mesh: THREE.Mesh; vel: THREE.Vector3; origin: { x: number; z: number }; life: number }[] = [];
  private particles: Particle[] = [];
  private pPoints: THREE.Points;
  private dust: THREE.Points;
  private steam: THREE.Points;
  private steamData: { x: number; y: number; z: number; vy: number; life: number; max: number }[] = [];
  private sparkT = 3;
  private clankT = 8;
  private flashFlick = 0;
  private hideReturn = { yaw: 0 };
  private disposed = false;
  onSnapshot: (s: Snapshot) => void = () => {};
  onMessage: (m: GameMessage) => void = () => {};
  onToggleDev: () => void = () => {};
  onToggleMap: () => void = () => {};
  onEnd: (entry: ScoreEntry) => void = () => {};

  constructor(private container: HTMLElement) {
    this.touch = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.touch, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.touch ? 1 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.touch;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x030303);
    this.scene.fog = new THREE.FogExp2(0x040404, 0.075);
    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 60);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0x3a4048, 0x100d0a, 0.32);
    this.scene.add(this.hemi);

    this.flashlight = new THREE.SpotLight(0xfff0d8, 40, 26, 0.52, 0.5, 1.6);
    this.flashlight.position.set(0.18, -0.15, 0.05);
    this.flashlight.target.position.set(0, -0.05, -1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    if (!this.touch) {
      this.flashlight.castShadow = true;
      this.flashlight.shadow.mapSize.set(512, 512);
      this.flashlight.shadow.camera.near = 0.2;
      this.flashlight.shadow.camera.far = 22;
      this.flashlight.shadow.bias = -0.0008;
    }

    this.level = new Level(this.scene);
    this.monster = new Monster(this);
    this.scene.add(this.monster.group);
    if (!this.touch)
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.receiveShadow = true;
          if (!(m.material as THREE.Material).transparent) m.castShadow = true;
        }
      });

    // particles
    const sprite = dotTex();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    pg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(300 * 3), 3));
    this.pPoints = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.07, map: sprite, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pPoints.frustumCulled = false;
    this.scene.add(this.pPoints);

    const dn = this.touch ? 200 : 380;
    const dg = new THREE.BufferGeometry();
    const dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 16;
      dp[i * 3 + 1] = Math.random() * 3;
      dp[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.025, color: 0xa8a090, map: sprite, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
    this.steam = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.9, color: 0x6a6a66, map: sprite, transparent: true, opacity: 0.16, depthWrite: false }));
    this.steam.frustumCulled = false;
    this.scene.add(this.steam);

    this.buildInteractables();
    this.resetWorld();
    this.bind();
    this.loop();
  }

  // ---------------- World interface ----------------
  onCatch(spot: HideSpot | null) {
    if (this.mode !== "playing") return;
    this.mode = "caught";
    this.monster.frozen = true;
    this.monster.lunge = 1;
    this.seq = { t: 0, kind: "caught", spot, from: this.camera.position.clone(), fromYaw: this.player.yaw };
    this.audio.sting();
    this.audio.growl([this.monster.pos.x, 2.2, this.monster.pos.z], 1.5);
    this.trauma = 1;
    this.audio.setChase(0);
    if (spot) {
      spot.doorTarget = 1;
      this.player.hidden = null;
    }
    this.memory.log(spot ? `Caught the player in ${spot.name}` : "Caught the player");
    this.memory.save();
  }

  addScore(n: number, reason: string) {
    if (this.mode !== "playing") return;
    this.score += n;
    this.msg(`+${n}  ${reason}`, "score");
  }

  shake(n: number) {
    this.trauma = Math.min(1, this.trauma + n);
  }

  // ---------------- setup ----------------
  msg(text: string, kind: GameMessage["kind"] = "info") {
    this.onMessage({ id: ++this.msgId, text, kind });
  }

  buildInteractables() {
    const L = this.level;
    for (const d of L.doors) {
      this.interactables.push({
        pos: d.center,
        r: 1.9,
        prompt: () => {
          if (d.open > 0 && d.open < 1 && d.target === 1) return null;
          if (L.isLocked(d, this.inv)) return "[E] Open Door  —  LOCKED";
          return d.target === 1 ? "[E] Close Door" : "[E] Open Door";
        },
        act: () => this.useDoor(d),
      });
    }
    for (const it of L.items) {
      this.interactables.push({
        pos: it.base,
        r: 1.7,
        prompt: () => (it.taken ? null : it.id === "keycard" ? "[E] Pick Up Keycard" : "[E] Pick Up Fuse"),
        act: () => this.collect(it),
      });
    }
    for (const h of L.hideSpots) {
      this.interactables.push({
        pos: new THREE.Vector3(h.inside.x, 1.2, h.inside.z),
        r: 1.6,
        prompt: () => (this.player.hidden ? null : `[E] Hide  —  ${h.name}`),
        act: () => this.enterHide(h),
      });
    }
    this.interactables.push({
      pos: L.powerPanelPos,
      r: 1.8,
      prompt: () => (this.inv.power ? null : "[E] Restore Power"),
      act: () => this.restorePower(),
    });
    this.interactables.push({
      pos: L.elevPanelPos,
      r: 2.2,
      prompt: () => "[E] Use Elevator",
      act: () => this.useElevator(),
    });
    this.interactables.push({
      pos: new THREE.Vector3(30, 1.3, 61.7),
      r: 1.8,
      prompt: () => "[E] Use Elevator",
      act: () => this.useElevator(),
    });
    this.interactables.push({
      pos: L.mainDoorPos,
      r: 1.9,
      prompt: () => "[E] Main Doors",
      act: () => {
        this.audio.denied();
        this.shake(0.1);
        this.msg("Sealed from the outside. There has to be another way up.", "warn");
      },
    });
  }

  runId = 0;

  resetWorld() {
    this.runId++;
    this.level.reset();
    this.inv = { fuse1: false, fuse2: false, keycard: false, power: false, elevator: false };
    const p = this.player;
    p.pos.set(30, 0, 31.8);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
    p.pitch = -0.02;
    p.hidden = null;
    p.stamina = 100;
    p.battery = 100;
    p.flashlight = true;
    p.exhausted = false;
    this.score = 0;
    this.throws = 3;
    this.playTime = 0;
    this.explored = new Set(["reception"]);
    this.currentRoom = "reception";
    this.fade = 0;
    this.seq = null;
    this.anims = [];
    this.projectiles.forEach((pr) => this.scene.remove(pr.mesh));
    this.projectiles = [];
    this.particles = [];
    this.level.dimmer = 1;
    this.hemi.intensity = 0.32;
    (this.scene.fog as THREE.FogExp2).density = 0.075;
    this.monster.reset(45, 14);
    this.monster.group.visible = true;
    this.audio.setPowered(false);
  }

  // ---------------- flow ----------------
  start() {
    this.audio.init();
    this.memory.newAttempt();
    this.resetWorld();
    this.mode = "playing";
    this.lock();
    this.msg("Explore The Archive. Find the two fuses and security keycard. Restore power. Reach the elevator.", "big");
    setTimeout(() => {
      if (this.mode === "playing") this.audio.growl([40, 2, 12], 0.8);
    }, 3500);
    this.emit();
  }

  retry() {
    this.start();
  }

  pause() {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.emit();
  }

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.last = performance.now();
    this.lock();
    this.emit();
  }

  quitToTitle() {
    this.mode = "title";
    this.resetWorld();
    this.unlock();
    this.emit();
  }

  lock() {
    if (this.touch) return;
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock: () => Promise<void> | void };
    try {
      const r = el.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resetMemory() {
    this.memory.reset();
    this.msg("The Archive forgets... for now.", "info");
    this.emit();
  }

  // ---------------- input ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (k === "Tab") {
      e.preventDefault();
      this.onToggleDev();
      return;
    }
    if (this.mode === "dead" || this.mode === "won") {
      if (k === "KeyR" || k === "Enter" || k === "Space") this.retry();
      return;
    }
    if (k === "Escape" || k === "KeyP") {
      if (this.mode === "playing") {
        this.pause();
        this.unlock();
      } else if (this.mode === "paused") this.resume();
      return;
    }
    if (this.mode !== "playing") return;
    this.keys.add(k);
    if (k === "KeyE") this.interact();
    if (k === "KeyF") this.toggleFlashlight();
    if (k === "KeyM") this.onToggleMap();
    if (k === "KeyQ") this.throwObject();
    if (k === "Space") e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.mode !== "playing" || document.pointerLockElement !== this.renderer.domElement) return;
    this.look(e.movementX, e.movementY, 0.0022);
  };
  private onClick = () => {
    if (this.mode === "playing" && !this.touch && document.pointerLockElement !== this.renderer.domElement) this.lock();
  };
  private onLockChange = () => {
    if (!this.touch && this.mode === "playing" && document.pointerLockElement !== this.renderer.domElement) this.pause();
  };
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  private onBlur = () => {
    this.keys.clear();
    if (this.mode === "playing") this.pause();
  };

  bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onBlur);
    this.renderer.domElement.addEventListener("click", this.onClick);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.audio.ctx?.close();
  }

  look(dx: number, dy: number, sens = 0.0022) {
    const p = this.player;
    p.yaw -= dx * sens;
    p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch - dy * sens));
    if (p.hidden) {
      let d = p.yaw - p.hidden.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw = p.hidden.yaw + Math.max(-0.55, Math.min(0.55, d));
      p.pitch = Math.max(-0.3, Math.min(0.3, p.pitch));
    }
  }

  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  setTouchRun(on: boolean) {
    this.touchRun = on;
  }

  // ---------------- actions ----------------
  toggleFlashlight() {
    if (this.player.hidden) return;
    this.player.flashlight = !this.player.flashlight;
    this.audio.click();
  }

  interact() {
    if (this.mode !== "playing") return;
    if (this.player.hidden) {
      this.leaveHide();
      return;
    }
    if (this.focus) this.focus.act();
  }

  noise(n: NoiseEvent) {
    this.monster.hear(n);
  }

  useDoor(d: Door) {
    if (this.level.isLocked(d, this.inv)) {
      this.audio.denied();
      this.shake(0.12);
      this.msg(d.lock === "keycard" ? "ACCESS DENIED — SECURITY KEYCARD REQUIRED." : "ACCESS DENIED — NO POWER TO ELEVATOR LEVEL.", "warn");
      return;
    }
    // don't close on yourself
    if (d.target === 1) {
      const c = d.collider;
      const p = this.player.pos;
      if (p.x > c.minX - 0.4 && p.x < c.maxX + 0.4 && p.z > c.minZ - 0.4 && p.z < c.maxZ + 0.4) return;
      const m = this.monster.pos;
      if (m.x > c.minX - 0.4 && m.x < c.maxX + 0.4 && m.z > c.minZ - 0.4 && m.z < c.maxZ + 0.4) return;
    }
    if (d.lock === "keycard" && d.target === 0 && d.open === 0) {
      this.audio.beep();
      this.msg("Keycard accepted.", "info");
    }
    d.target = d.target === 1 ? 0 : 1;
    this.audio.door([d.center.x, 1.2, d.center.z], d.heavy);
    this.memory.useDoor(d.id);
    this.shake(0.05);
    this.noise({ x: d.center.x, z: d.center.z, r: 9, type: "door" });
  }

  collect(it: Item) {
    if (it.taken) return;
    it.taken = true;
    this.inv[it.id] = true;
    this.anims.push({ item: it, t: 0 });
    this.audio.pickup();
    this.shake(0.15);
    this.burst(it.base, 26, it.id === "keycard" ? [0.9, 0.35, 0.3] : [1, 0.65, 0.25], 2.2, 2);
    this.msg(it.id === "keycard" ? "Security Keycard acquired." : "Fuse collected.", "big");
    this.addScore(500, it.name);
    this.memory.log(`Player collected ${it.name}`);
    this.noise({ x: it.base.x, z: it.base.z, r: 6, type: "pickup" });
    if (it.id === "keycard") for (const d of this.level.doors) if (d.lock === "keycard" && d.led) d.led.color.set(0x3ac84a);
    // each pickup disturbs the facility
    const run = this.runId;
    setTimeout(() => {
      if (this.mode !== "playing" || run !== this.runId) return;
      if (it.id === "fuse2") {
        const pos: [number, number, number] = [12.5, 1.5, 26.6];
        this.audio.crash(pos);
        this.burst(new THREE.Vector3(12.5, 1.8, 27), 30, [0.6, 0.55, 0.45], 2.5, 6);
        this.shake(0.4);
        this.msg("A shelf gives way. Something heard that.", "warn");
        setTimeout(() => this.audio.growl([this.monster.pos.x, 2.2, this.monster.pos.z], 1.3), 900);
        this.noise({ x: 13, z: 27.6, r: 80, type: "alarm" });
      } else if (it.id === "fuse1") {
        const pos: [number, number, number] = [33.2, 1.2, 6.5];
        this.audio.spark(pos);
        this.burst(new THREE.Vector3(33.2, 1.2, 6.7), 40, [1, 0.8, 0.4], 3, 9);
        this.shake(0.2);
        this.msg("The monitors short out.", "warn");
        this.noise({ x: 33, z: 8, r: 24, type: "alarm" });
      } else {
        this.audio.denied();
        setTimeout(() => this.audio.denied(), 400);
        this.msg("An alarm chirps somewhere in the room.", "warn");
        this.noise({ x: 47, z: 28, r: 26, type: "alarm" });
      }
    }, 700);
    this.emit();
  }

  enterHide(h: HideSpot) {
    const p = this.player;
    p.hidden = h;
    this.hideReturn.yaw = p.yaw;
    p.yaw = h.yaw;
    p.pitch = 0;
    p.vel.set(0, 0, 0);
    p.flashlight = false;
    h.doorOpen = 0.6;
    h.doorTarget = 0;
    this.audio.locker([h.inside.x, 1.2, h.inside.z]);
    this.memory.d.hideUses[h.id] += 1;
    this.memory.addHide(h.id, 0.6, `Player hid in ${h.name}`);
    this.monster.onPlayerHide(h);
    this.noise({ x: h.front.x, z: h.front.z, r: 4, type: "hide" });
    this.emit();
  }

  leaveHide() {
    const p = this.player;
    const h = p.hidden;
    if (!h) return;
    p.hidden = null;
    const dx = h.front.x - h.inside.x;
    const dz = h.front.z - h.inside.z;
    const d = Math.hypot(dx, dz);
    p.pos.set(h.inside.x + (dx / d) * 0.75, 0, h.inside.z + (dz / d) * 0.75);
    h.doorOpen = 0.7;
    h.doorTarget = 0;
    this.audio.locker([h.inside.x, 1.2, h.inside.z]);
    this.noise({ x: h.front.x, z: h.front.z, r: 4, type: "hide" });
    this.emit();
  }

  restorePower() {
    if (this.inv.power) return;
    if (!this.inv.fuse1 || !this.inv.fuse2) {
      this.audio.denied();
      this.shake(0.12);
      const missing = [!this.inv.fuse1 && "Fuse 1", !this.inv.fuse2 && "Fuse 2"].filter(Boolean).join(" and ");
      this.msg(`POWER SYSTEM INCOMPLETE. Missing ${missing}.`, "warn");
      return;
    }
    this.inv.power = true;
    this.level.panelFuses.forEach((f) => (f.visible = true));
    this.level.dimmer = 0;
    this.audio.power();
    this.shake(0.5);
    this.burst(this.level.powerPanelPos, 50, [1, 0.8, 0.4], 3.5, 9);
    this.memory.log("Player restored facility power");
    const run = this.runId;
    setTimeout(() => {
      if (run !== this.runId) return;
      this.level.setPowered();
      this.level.dimmer = 1;
      this.hemi.intensity = 0.55;
      (this.scene.fog as THREE.FogExp2).density = 0.055;
      this.audio.setPowered(true);
      this.shake(0.3);
      this.msg("POWER RESTORED.", "big");
      this.addScore(1000, "Power restored");
      this.noise({ x: 33, z: 44, r: 30, type: "alarm" });
      this.emit();
    }, 1400);
    this.emit();
  }

  useElevator() {
    if (!this.inv.power) {
      this.audio.denied();
      this.msg("ELEVATOR OFFLINE — RESTORE POWER.", "warn");
      return;
    }
    if (!this.inv.fuse1 || !this.inv.fuse2 || !this.inv.keycard) {
      this.audio.denied();
      this.msg("ESCAPE ROUTE INCOMPLETE.", "warn");
      return;
    }
    if (this.mode !== "playing") return;
    this.mode = "escaping";
    this.monster.frozen = true;
    this.inv.elevator = true;
    this.level.elevTarget = 1;
    this.audio.elevatorChime();
    this.audio.setChase(0);
    this.msg("ESCAPE ROUTE ACTIVE.", "big");
    this.seq = { t: 0, kind: "escape", from: this.player.pos.clone(), fromYaw: this.player.yaw };
    this.emit();
  }

  throwObject() {
    if (this.throws <= 0 || this.player.hidden) {
      if (this.throws <= 0) this.msg("Nothing left to throw.", "info");
      return;
    }
    this.throws--;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 6), this.level.mats.metal);
    mesh.position.copy(this.camera.position).addScaledVector(fwd, 0.4);
    this.scene.add(mesh);
    const vel = fwd.multiplyScalar(8.5);
    vel.y += 2.2;
    this.projectiles.push({ mesh, vel, origin: { x: this.player.pos.x, z: this.player.pos.z }, life: 4 });
    this.audio.click();
    this.memory.log("Player threw a distraction");
  }

  // ---------------- particles ----------------
  burst(pos: THREE.Vector3, n: number, color: [number, number, number], speed: number, grav: number) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 290) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - u * u);
      const life = 0.4 + Math.random() * 0.7;
      this.particles.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * r * s, vy: Math.abs(u) * s * 0.8 + 0.5, vz: Math.sin(a) * r * s, life, max: life, r: color[0], g: color[1], b: color[2], grav });
    }
  }

  private updateParticles(dt: number) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    const pos = this.pPoints.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.pPoints.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < 300; i++) {
      const p = ps[i];
      if (p) {
        const k = p.life / p.max;
        pos.setXYZ(i, p.x, p.y, p.z);
        col.setXYZ(i, p.r * k, p.g * k, p.b * k);
      } else {
        pos.setXYZ(i, 0, -50, 0);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.pPoints.geometry.setDrawRange(0, Math.max(1, ps.length));

    // dust follows camera
    const d = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    const t = this.time;
    for (let i = 0; i < d.count; i++) {
      let x = d.getX(i) + Math.sin(t * 0.3 + i) * 0.002;
      let y = d.getY(i) - 0.0015 + Math.cos(t * 0.5 + i * 1.3) * 0.001;
      let z = d.getZ(i) + Math.cos(t * 0.25 + i) * 0.002;
      if (x - cx > 8) x -= 16;
      if (x - cx < -8) x += 16;
      if (z - cz > 8) z -= 16;
      if (z - cz < -8) z += 16;
      if (y < 0) y = 3;
      d.setXYZ(i, x, y, z);
    }
    d.needsUpdate = true;

    // steam
    const L = this.level;
    if (Math.random() < dt * 14) {
      const sp = L.steamPoints[Math.floor(Math.random() * L.steamPoints.length)];
      if (this.steamData.length < 80) this.steamData.push({ x: sp.x + (Math.random() - 0.5) * 0.1, y: sp.y, z: sp.z, vy: -0.3 - Math.random() * 0.4, life: 2, max: 2 });
    }
    const sd = this.steamData;
    for (let i = sd.length - 1; i >= 0; i--) {
      const s = sd[i];
      s.life -= dt;
      if (s.life <= 0) {
        sd.splice(i, 1);
        continue;
      }
      s.y += s.vy * dt;
      s.vy += 0.5 * dt;
      s.x += (Math.random() - 0.5) * dt * 0.6;
      s.z += (Math.random() - 0.5) * dt * 0.6;
    }
    const sa = this.steam.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 80; i++) {
      const s = sd[i];
      if (s) sa.setXYZ(i, s.x, s.y, s.z);
      else sa.setXYZ(i, 0, -50, 0);
    }
    sa.needsUpdate = true;

    // sparks
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 2 + Math.random() * 5;
      const sp = L.sparkPoints[Math.floor(Math.random() * L.sparkPoints.length)];
      this.burst(sp, 18, [1, 0.75, 0.35], 2.2, 9.8);
      this.audio.spark([sp.x, sp.y, sp.z]);
    }
    this.clankT -= dt;
    if (this.clankT <= 0) {
      this.clankT = 10 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      const pos: [number, number, number] = [this.player.pos.x + Math.cos(a) * 18, 2, this.player.pos.z + Math.sin(a) * 18];
      if (Math.random() < 0.5) this.audio.clank(pos);
      else this.audio.steam(pos);
    }
  }

  // ---------------- collision ----------------
  private pushOut(p: THREE.Vector3, minX: number, maxX: number, minZ: number, maxZ: number, r: number) {
    const nx = Math.max(minX, Math.min(p.x, maxX));
    const nz = Math.max(minZ, Math.min(p.z, maxZ));
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.z = nz + (dz / d) * r;
    } else {
      const l = p.x - minX,
        rr = maxX - p.x,
        t = p.z - minZ,
        b = maxZ - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) p.x = minX - r;
      else if (m === rr) p.x = maxX + r;
      else if (m === t) p.z = minZ - r;
      else p.z = maxZ + r;
    }
  }

  private collide(p: THREE.Vector3, r = 0.3) {
    const L = this.level;
    for (let it = 0; it < 2; it++) {
      const cx = Math.floor(p.x);
      const cz = Math.floor(p.z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) if (!L.isWalk(cx + dx, cz + dz)) this.pushOut(p, cx + dx - 0.06, cx + dx + 1.06, cz + dz - 0.06, cz + dz + 1.06, r);
      for (const c of L.colliders) if (Math.abs(c.minX - p.x) < 4 && Math.abs(c.minZ - p.z) < 4) this.pushOut(p, c.minX, c.maxX, c.minZ, c.maxZ, r);
      for (const d of L.doors) if (d.open < 0.6) this.pushOut(p, d.collider.minX, d.collider.maxX, d.collider.minZ, d.collider.maxZ, r);
      if (L.elevOpen < 0.7) this.pushOut(p, 29, 31, 61.8, 62.2, r);
    }
  }

  // ---------------- update ----------------
  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.hidden) {
      p.moving = false;
      p.running = false;
      p.stamina = Math.min(100, p.stamina + dt * 20);
      p.noise *= 0.9;
      return;
    }
    let ix = 0,
      iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    ix += this.touchMove.x;
    iz += this.touchMove.y;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const wantRun = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchRun) && iz > 0.2;
    if (p.stamina <= 0) p.exhausted = true;
    if (p.exhausted && p.stamina > 30) p.exhausted = false;
    p.running = wantRun && !p.exhausted && len > 0.1;
    const speed = p.running ? 4.7 : 2.6;
    const fx = -Math.sin(p.yaw),
      fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw),
      rz = -Math.sin(p.yaw);
    const tx = (fx * iz + rx * ix) * speed;
    const tz = (fz * iz + rz * ix) * speed;
    const acc = Math.min(1, dt * 12);
    p.vel.x += (tx - p.vel.x) * acc;
    p.vel.z += (tz - p.vel.z) * acc;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    this.collide(p.pos);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    p.moving = sp > 0.4;
    p.stamina = p.running ? Math.max(0, p.stamina - dt * 21) : Math.min(100, p.stamina + dt * (p.moving ? 10 : 18));
    // bob + footsteps
    p.bob += sp * dt * 2.2;
    p.stepAcc += sp * dt;
    const stride = p.running ? 0.95 : 0.72;
    if (p.stepAcc > stride) {
      p.stepAcc = 0;
      const room = this.level.roomAt(p.pos.x, p.pos.z);
      this.audio.footstep(p.running, room === "maintenance");
      this.noise({ x: p.pos.x, z: p.pos.z, r: p.running ? 11 : 4.2, type: p.running ? "run" : "step" });
      if (p.running) this.shake(0.02);
    }
    const targetNoise = p.moving ? (p.running ? 85 : 32) : 0;
    p.noise += (targetNoise - p.noise) * Math.min(1, dt * 5);
    // battery
    if (p.flashlight) p.battery = Math.max(0, p.battery - dt * 0.35);
    else p.battery = Math.min(100, p.battery + dt * 0.5);
    if (p.battery <= 0 && p.flashlight) {
      p.flashlight = false;
      this.msg("Flashlight battery depleted. Let it recharge.", "warn");
    }
    // rooms
    const room = this.level.roomAt(p.pos.x, p.pos.z);
    if (room && room !== this.currentRoom) {
      this.currentRoom = room;
      if (room !== "corridor") {
        if (!this.explored.has(room)) this.explored.add(room);
        this.msg(ROOM_NAMES[room], "room");
        this.memory.visitRoom(room);
        this.memory.log(`Player entered ${ROOM_NAMES[room]}`);
      }
    }
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    if (p.hidden) {
      cam.position.copy(p.hidden.inside);
    } else {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      const bobAmt = Math.min(1, sp / 4) * (p.running ? 0.06 : 0.035);
      cam.position.set(p.pos.x + Math.cos(p.bob) * bobAmt * 0.4, 1.62 + Math.abs(Math.sin(p.bob)) * bobAmt, p.pos.z);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const s = this.trauma * this.trauma;
    const t = this.time * 40;
    cam.rotation.set(p.pitch + Math.sin(t * 1.3) * s * 0.05, p.yaw + Math.sin(t * 1.1 + 2) * s * 0.05, Math.sin(t * 0.9 + 4) * s * 0.06);
    cam.position.x += Math.sin(t * 1.7) * s * 0.05;
    cam.position.y += Math.sin(t * 2.1) * s * 0.04;
    // flashlight
    let target = p.flashlight ? 40 : 0;
    if (p.flashlight && p.battery < 18) {
      this.flashFlick -= dt;
      if (this.flashFlick < 0) this.flashFlick = Math.random() * 0.3;
      if (this.flashFlick < 0.06) target *= 0.15;
    }
    const md = this.monster.pos.distanceTo(p.pos);
    if (p.flashlight && md < 6 && Math.random() < 0.08) target *= 0.3; // interference near the Archivist
    this.flashlight.intensity += (target - this.flashlight.intensity) * Math.min(1, dt * 20);
    const fwdX = -Math.sin(p.yaw),
      fwdZ = -Math.cos(p.yaw);
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, fwdX, fwdZ);
  }

  private updateInteract() {
    const p = this.player;
    this.focus = null;
    this.prompt = null;
    if (p.hidden) {
      this.prompt = "[E] Leave hiding place";
      return;
    }
    const fx = -Math.sin(p.yaw),
      fz = -Math.cos(p.yaw);
    let best = 99;
    for (const it of this.interactables) {
      const dx = it.pos.x - p.pos.x;
      const dz = it.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const dot = d > 0.2 ? (dx * fx + dz * fz) / d : 1;
      if (dot < 0.35) continue;
      const pr = it.prompt();
      if (!pr) continue;
      const score = d - dot;
      if (score < best) {
        best = score;
        this.focus = it;
        this.prompt = pr;
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.vel.y -= 9.8 * dt;
      const np = pr.mesh.position.clone().addScaledVector(pr.vel, dt);
      const blocked = !this.level.isWalk(Math.floor(np.x), Math.floor(np.z)) || this.level.doors.some((d) => d.open < 0.6 && np.x > d.collider.minX && np.x < d.collider.maxX && np.z > d.collider.minZ && np.z < d.collider.maxZ);
      if (blocked) {
        pr.vel.x *= -0.3;
        pr.vel.z *= -0.3;
      } else pr.mesh.position.copy(np);
      if (np.y > 2.95) pr.vel.y = -Math.abs(pr.vel.y) * 0.3;
      pr.mesh.rotation.x += dt * 12;
      pr.mesh.rotation.z += dt * 7;
      if (pr.mesh.position.y <= 0.04 || pr.life <= 0) {
        const x = pr.mesh.position.x;
        const z = pr.mesh.position.z;
        pr.mesh.position.y = 0.04;
        this.audio.clatter([x, 0.1, z]);
        this.burst(new THREE.Vector3(x, 0.1, z), 10, [0.7, 0.65, 0.55], 1.5, 6);
        this.noise({ x, z, r: 15, type: "distraction", origin: pr.origin });
        this.projectiles.splice(i, 1);
        setTimeout(() => this.scene.remove(pr.mesh), 8000);
      }
    }
  }

  private updateSequences(dt: number) {
    const s = this.seq;
    if (!s) return;
    s.t += dt;
    const cam = this.camera;
    if (s.kind === "caught") {
      const m = this.monster;
      // the Archivist closes in
      const p = this.player.pos;
      if (s.spot) {
        const sx = s.spot.front.x - s.spot.inside.x;
        const sz = s.spot.front.z - s.spot.inside.z;
        const sl = Math.hypot(sx, sz);
        const pull = Math.min(0.35, s.t * 0.8);
        p.set(s.spot.inside.x + (sx / sl) * pull, 0, s.spot.inside.z + (sz / sl) * pull);
      }
      const dx = p.x - m.pos.x;
      const dz = p.z - m.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.9) {
        m.pos.x += (dx / d) * Math.min(d - 0.9, dt * 6);
        m.pos.z += (dz / d) * Math.min(d - 0.9, dt * 6);
      }
      m.yaw = Math.atan2(dx, dz);
      m.group.position.copy(m.pos);
      m.group.rotation.y = m.yaw;
      const head = new THREE.Vector3(m.pos.x, 2.3, m.pos.z);
      cam.position.set(p.x, 1.55 - Math.min(0.5, s.t * 0.3), p.z);
      const look = new THREE.Matrix4().lookAt(cam.position, head, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      cam.quaternion.slerp(q, Math.min(1, dt * 10));
      const sh = this.trauma * this.trauma;
      cam.position.x += (Math.random() - 0.5) * sh * 0.08;
      cam.position.y += (Math.random() - 0.5) * sh * 0.08;
      this.trauma = Math.max(0.3, this.trauma - dt * 0.5);
      this.fade = Math.min(1, Math.max(0, (s.t - 0.9) / 0.8));
      if (s.t > 1.9) {
        this.mode = "dead";
        this.seq = null;
        this.unlock();
        this.recordScore("CAUGHT");
        this.emit();
      }
      return;
    }
    if (s.kind === "escape") {
      const L = this.level;
      const p = this.player;
      if (s.t > 1.6 && s.t < 3.8) {
        if (s.t < 2.6) {
          const k = Math.min(1, (s.t - 1.6) / 1);
          const e = k * k * (3 - 2 * k);
          p.pos.x = s.from!.x + (30 - s.from!.x) * e;
          p.pos.z = s.from!.z + (60.9 - s.from!.z) * e;
        } else {
          const k = Math.min(1, (s.t - 2.6) / 1.2);
          const e = k * k * (3 - 2 * k);
          p.pos.x = 30;
          p.pos.z = 60.9 + (63.8 - 60.9) * e;
        }
        let dy = 0 - s.fromYaw!;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        const turnK = Math.min(1, Math.max(0, (s.t - 2.4) / 1.4));
        p.yaw = s.fromYaw! + dy * turnK;
        p.pitch *= 0.95;
        p.bob += dt * 6;
      }
      if (s.t > 4.0 && L.elevTarget === 1) {
        L.elevTarget = 0;
        this.audio.door([30, 1.2, 61.8], true);
      }
      if (s.t > 5.4 && s.t - dt <= 5.4) {
        this.audio.rumble(4);
        this.trauma = 0.6;
      }
      if (s.t > 5.4) this.trauma = Math.max(this.trauma, 0.25);
      this.fade = Math.min(1, Math.max(0, (s.t - 7.2) / 1.6));
      this.updateCamera(dt);
      if (s.t > 9.2) {
        this.mode = "won";
        this.seq = null;
        const timeBonus = Math.max(0, 3000 - Math.floor(this.playTime) * 5);
        this.score += 2000 + timeBonus;
        this.unlock();
        this.recordScore("ESCAPED");
        this.emit();
      }
    }
  }

  recordScore(result: "ESCAPED" | "CAUGHT") {
    const entry: ScoreEntry = { score: this.score, time: Math.floor(this.playTime), result, attempt: this.memory.d.attempts, date: new Date().toLocaleDateString() };
    const all = loadScores();
    all.push(entry);
    all.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify(all.slice(0, 8)));
    } catch {
      /* ignore */
    }
    this.onEnd(entry);
  }

  private updateTension(dt: number) {
    const m = this.monster;
    const d = m.pos.distanceTo(this.player.pos);
    const chase = m.state === "CHASE";
    const danger = Math.max(0, 1 - d / 14) * (chase ? 1 : m.state === "SEARCH" || m.state === "SUSPICIOUS" ? 0.75 : 0.5);
    const dz = chase ? Math.max(danger, 0.6) : danger;
    this.hbT -= dt;
    if (dz > 0.18 && this.hbT <= 0) {
      this.hbT = 1.15 - dz * 0.65;
      this.audio.heartbeat(dz);
    }
    this.audio.setChase(chase ? 1 : 0);
    this.audio.setMonsterPos(m.pos.x, 2.1, m.pos.z, chase ? 0.5 : m.state === "SEARCH" ? 0.25 : 0.12);
    return dz;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    let danger = 0;

    if (this.mode === "title") {
      const t = this.time;
      this.player.yaw = Math.sin(t * 0.12) * 0.9;
      this.player.pitch = Math.sin(t * 0.2) * 0.05;
      this.player.pos.set(30 + Math.sin(t * 0.07) * 0.8, 0, 31.8);
      this.player.flashlight = true;
      this.updateCamera(dt);
      this.level.update(this.time, dt);
      this.updateParticles(dt);
    } else if (this.mode === "playing") {
      this.playTime += dt;
      this.updatePlayer(dt);
      this.monster.update(dt);
      this.updateCamera(dt);
      this.updateInteract();
      this.updateProjectiles(dt);
      this.level.update(this.time, dt);
      this.updateParticles(dt);
      danger = this.updateTension(dt);
      // pickup animations
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i];
        a.t += dt * 2.5;
        const g = a.item.group;
        const target = this.camera.position.clone().add(new THREE.Vector3(0, -0.25, 0));
        g.position.lerp(target, Math.min(1, dt * 8));
        g.scale.setScalar(Math.max(0.01, 1 - a.t));
        g.rotation.y += dt * 10;
        if (a.t >= 1) {
          g.visible = false;
          this.anims.splice(i, 1);
        }
      }
    } else if (this.mode === "caught" || this.mode === "escaping") {
      this.updateSequences(dt);
      this.level.update(this.time, dt);
      this.updateParticles(dt);
      if (this.mode === "caught") this.monster.update(dt);
    } else if (this.mode === "dead" || this.mode === "won" || this.mode === "paused") {
      this.level.update(this.time, dt * 0.3);
    }
    this.renderer.render(this.scene, this.camera);

    this.uiT -= dt;
    if (this.uiT <= 0) {
      this.uiT = 0.1;
      this.emit(danger);
    }
  };

  private lastDanger = 0;
  emit(danger?: number) {
    if (danger !== undefined) this.lastDanger = danger;
    const m = this.monster;
    const mem = this.memory;
    const p = this.player;
    this.onSnapshot({
      mode: this.mode,
      obj: { ...this.inv },
      prompt: this.mode === "playing" ? this.prompt : null,
      room: this.currentRoom ? ROOM_NAMES[this.currentRoom] : "",
      explored: [...this.explored],
      px: p.pos.x,
      pz: p.pos.z,
      pyaw: p.yaw,
      battery: p.battery,
      stamina: p.stamina,
      flashlight: p.flashlight,
      hidden: p.hidden ? p.hidden.name : null,
      noise: p.noise,
      score: this.score,
      attempt: mem.d.attempts,
      time: this.playTime,
      throws: this.throws,
      danger: this.lastDanger,
      chase: m.state === "CHASE",
      fade: this.fade,
      touch: this.touch,
      dev: {
        state: m.state,
        target: m.targetLabel,
        suspicion: Math.round(m.suspicion),
        noise: Math.round(p.noise),
        room: this.currentRoom ? ROOM_NAMES[this.currentRoom] : "—",
        monsterRoom: m.room ? ROOM_NAMES[m.room] : "—",
        lastEvent: m.lastEvent,
        path: m.pathRooms(),
        lockerA: `${mem.hideLevel("lockerA")} (${mem.hideWeight("lockerA").toFixed(2)})`,
        lockerB: `${mem.hideLevel("lockerB")} (${mem.hideWeight("lockerB").toFixed(2)})`,
        closet: `${mem.hideLevel("closet")} (${mem.hideWeight("closet").toFixed(2)})`,
        weights: Object.entries(mem.d.rooms)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([r, v]) => `${SHORT[r as RoomId] || r} ${v.toFixed(1)}`)
          .join(" · "),
        route: mem.d.route.slice(-6).map((r) => SHORT[r as RoomId] || r).join(" → ") || "—",
        activity: mem.d.activity.slice(0, 6),
        distractions: mem.d.distractions.toFixed(1),
        attempts: mem.d.attempts,
      },
    });
  }
}
