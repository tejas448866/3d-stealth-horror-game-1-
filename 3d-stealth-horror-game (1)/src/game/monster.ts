import * as THREE from "three";
import type { Level, HideSpot, RoomId } from "./level";
import { GW, GH, SHORT, ROOM_NAMES } from "./level";
import type { ArchiveMemory } from "./memory";
import type { AudioEngine } from "./audio";

export type MState = "PATROL" | "INVESTIGATE" | "SUSPICIOUS" | "CHASE" | "SEARCH";

export interface NoiseEvent {
  x: number;
  z: number;
  r: number;
  type: "step" | "run" | "door" | "interact" | "pickup" | "distraction" | "alarm" | "hide";
  origin?: { x: number; z: number };
}

export interface World {
  level: Level;
  memory: ArchiveMemory;
  audio: AudioEngine;
  player: { pos: THREE.Vector3; hidden: HideSpot | null; running: boolean; moving: boolean; flashlight: boolean; yaw: number };
  inv: { keycard: boolean; power: boolean };
  time: number;
  onCatch(spot: HideSpot | null): void;
  addScore(n: number, reason: string): void;
  shake(n: number): void;
}

interface Task {
  kind: "move" | "hide";
  x: number;
  z: number;
  wait: number;
  label: string;
  spot?: HideSpot;
  certain?: boolean;
}

// ---- A* on the facility grid ----
class Heap {
  a: number[] = [];
  f: Float32Array;
  constructor(f: Float32Array) {
    this.f = f;
  }
  push(n: number) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

const N = GW * GH;
const gS = new Float32Array(N);
const fS = new Float32Array(N);
const came = new Int32Array(N);
const closed = new Uint8Array(N);

export function findPath(level: Level, inv: { keycard: boolean; power: boolean }, sx: number, sz: number, tx: number, tz: number): [number, number][] | null {
  const pass = (x: number, z: number) => {
    if (!level.isWalk(x, z) || level.propBlock[z * GW + x]) return false;
    const d = level.doorAtCell(x, z);
    if (d && level.isLocked(d, inv)) return false;
    return true;
  };
  let s0 = Math.floor(sx),
    s1 = Math.floor(sz),
    t0 = Math.floor(tx),
    t1 = Math.floor(tz);
  const nearest = (x: number, z: number): [number, number] | null => {
    if (pass(x, z)) return [x, z];
    for (let r = 1; r <= 2; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) if (pass(x + dx, z + dz)) return [x + dx, z + dz];
    return null;
  };
  const s = nearest(s0, s1);
  const t = nearest(t0, t1);
  if (!s || !t) return null;
  [s0, s1] = s;
  [t0, t1] = t;
  gS.fill(1e9);
  closed.fill(0);
  came.fill(-1);
  const si = s1 * GW + s0;
  const ti = t1 * GW + t0;
  gS[si] = 0;
  fS[si] = Math.hypot(t0 - s0, t1 - s1);
  const heap = new Heap(fS);
  heap.push(si);
  let found = false;
  let guard = 0;
  while (heap.size && guard++ < 6000) {
    const c = heap.pop();
    if (c === ti) {
      found = true;
      break;
    }
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % GW;
    const cz = (c / GW) | 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!pass(nx, nz)) continue;
        if (dx && dz && (!pass(cx + dx, cz) || !pass(cx, cz + dz))) continue;
        const ni = nz * GW + nx;
        if (closed[ni]) continue;
        const g = gS[c] + (dx && dz ? 1.414 : 1);
        if (g < gS[ni]) {
          gS[ni] = g;
          fS[ni] = g + Math.hypot(t0 - nx, t1 - nz);
          came[ni] = c;
          heap.push(ni);
        }
      }
  }
  if (!found) return null;
  const out: [number, number][] = [];
  let c = ti;
  while (c !== -1 && c !== si) {
    out.push([(c % GW) + 0.5, ((c / GW) | 0) + 0.5]);
    c = came[c];
  }
  out.reverse();
  if (out.length) out[out.length - 1] = [tx, tz];
  // greedy smoothing
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) if (!pass(Math.floor(x + ox), Math.floor(z + oz))) return false;
    }
    return true;
  };
  const sm: [number, number][] = [];
  let cur: [number, number] = [sx, sz];
  let i = 0;
  while (i < out.length) {
    let j = out.length - 1;
    while (j > i && !clear(cur[0], cur[1], out[j][0], out[j][1])) j--;
    sm.push(out[j]);
    cur = out[j];
    i = j + 1;
  }
  return sm;
}

export class Monster {
  w: World;
  group = new THREE.Group();
  pos = new THREE.Vector3(45, 0, 14);
  yaw = Math.PI;
  headYaw = 0;
  state: MState = "PATROL";
  suspicion = 0;
  seeing = false;
  timeSinceSeen = 99;
  lastSeen: { x: number; z: number } | null = null;
  tasks: Task[] = [];
  cur: Task | null = null;
  path: [number, number][] = [];
  pi = 0;
  waitT = 0;
  phase: "move" | "wait" | "check" = "move";
  checkT = 0;
  repathT = 0;
  stepT = 0;
  animT = 0;
  doorWaitT = 0;
  lastEvent = "Dormant";
  targetLabel = "—";
  reason = "";
  lastDriveBy = 0;
  hideCredited = false;
  growlT = 6;
  frozen = false;
  lunge = 0;
  room: RoomId | null = null;
  private arms: THREE.Group[] = [];
  private head!: THREE.Mesh;
  private body!: THREE.Group;

  constructor(w: World) {
    this.w = w;
    this.buildModel();
  }

  buildModel() {
    const skin = new THREE.MeshLambertMaterial({ color: 0x4a4540 });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x0d0c0b });
    const body = new THREE.Group();
    this.body = body;
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 1.3, 9, 1, true), new THREE.MeshLambertMaterial({ color: 0x0d0c0b, side: THREE.DoubleSide }));
    robe.position.y = 0.7;
    body.add(robe);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.9, 8), cloth);
    torso.position.y = 1.75;
    torso.rotation.x = 0.25;
    body.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6), skin);
    neck.position.set(0, 2.25, 0.12);
    neck.rotation.x = 0.5;
    body.add(neck);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), skin);
    this.head.scale.set(0.85, 1.35, 0.95);
    this.head.position.set(0, 2.42, 0.22);
    body.add(this.head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb8a888 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
      e.position.set(s * 0.055, 0.02, 0.16);
      this.head.add(e);
      const arm = new THREE.Group();
      arm.position.set(s * 0.27, 2.05, 0.1);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.85, 6), skin);
      upper.position.y = -0.42;
      arm.add(upper);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.8, 6), skin);
      fore.position.set(0, -1.2, 0.08);
      fore.rotation.x = -0.2;
      arm.add(fore);
      for (let f = 0; f < 3; f++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.28, 4), skin);
        finger.position.set((f - 1) * 0.025, -1.72, 0.14);
        finger.rotation.x = -0.3;
        arm.add(finger);
      }
      arm.rotation.z = s * 0.08;
      body.add(arm);
      this.arms.push(arm);
    }
    // tattered strips
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x0a0908, side: THREE.DoubleSide }));
      strip.position.set(Math.sin(a) * 0.5, 0.15, Math.cos(a) * 0.5);
      strip.rotation.y = a;
      body.add(strip);
    }
    this.group.add(body);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  reset(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.state = "PATROL";
    this.suspicion = 0;
    this.seeing = false;
    this.timeSinceSeen = 99;
    this.lastSeen = null;
    this.tasks = [];
    this.cur = null;
    this.path = [];
    this.phase = "move";
    this.lastEvent = "Awakened in the Service Passage";
    this.targetLabel = "—";
    this.lastDriveBy = this.w.time;
    this.hideCredited = false;
    this.growlT = 5;
    this.frozen = false;
    this.lunge = 0;
    this.doorWaitT = 0;
    // first patrol target: the laboratory, so the player hears it early
    this.tasks.push({ kind: "move", x: 29, z: 12, wait: 2, label: "Laboratory" });
  }

  event(s: string) {
    this.lastEvent = s;
    this.w.memory.log(s);
  }

  setState(s: MState) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    if (s === "CHASE") {
      this.w.audio.growl([this.pos.x, 2.2, this.pos.z], 1.2);
      this.w.shake(0.35);
      this.event("Spotted the player — CHASE");
    }
    if (prev === "CHASE" && s === "SEARCH") this.w.addScore(300, "Broke line of sight");
  }

  // ---------- perception ----------
  private perceive(dt: number) {
    const p = this.w.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.seeing = false;
    if (!p.hidden) {
      let range = p.flashlight ? 15 : 8.5;
      if (this.w.level.powered) range += 4;
      if (p.running) range += 2;
      const fx = Math.sin(this.yaw + this.headYaw);
      const fz = Math.cos(this.yaw + this.headYaw);
      const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const cone = this.state === "CHASE" ? -0.3 : 0.42;
      if (d < range && (dot > cone || d < 1.6) && this.w.level.losClear(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
        this.seeing = true;
        const roomBias = 1 + Math.min(0.4, (this.w.memory.d.rooms[this.room || ""] || 0) * 0.04);
        const gain = (22 + 120 * (1 - d / range)) * (p.running ? 1.4 : 1) * (p.flashlight ? 1.2 : 0.8) * (p.moving ? 1 : 0.55) * roomBias;
        this.suspicion = Math.min(100, this.suspicion + gain * dt);
        this.lastSeen = { x: p.pos.x, z: p.pos.z };
        this.timeSinceSeen = 0;
        if (d < 3) this.suspicion = 100;
      } else if (p.flashlight && d < 14) {
        // the flashlight beam itself draws attention
        const pfx = -Math.sin(p.yaw);
        const pfz = -Math.cos(p.yaw);
        if ((-dx * pfx + -dz * pfz) / Math.max(0.01, d) > 0.93 && this.w.level.losClear(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
          this.suspicion = Math.min(100, this.suspicion + 18 * dt);
          if (this.suspicion > 30 && this.state === "PATROL") {
            this.investigate(p.pos.x, p.pos.z, "light");
            this.event("Noticed a light beam");
          }
        }
      }
    }
    if (!this.seeing) {
      this.timeSinceSeen += dt;
      if (this.state !== "CHASE") this.suspicion = Math.max(0, this.suspicion - dt * (this.state === "SEARCH" ? 3 : 6));
    }
  }

  hear(n: NoiseEvent) {
    if (this.frozen) return;
    const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
    const los = this.w.level.losClear(this.pos.x, this.pos.z, n.x, n.z);
    const eff = n.type === "alarm" ? n.r : n.r * (los ? 1 : 0.55);
    if (d > eff) return;
    const room = this.w.level.roomAt(n.x, n.z);
    if (room) this.w.memory.addNoise(room, n.type === "step" ? 0.05 : 0.3);
    if (this.state === "CHASE") {
      if (!this.seeing && n.type !== "distraction") this.lastSeen = { x: n.x, z: n.z };
      return;
    }
    if (n.type === "step" || n.type === "run") {
      this.suspicion = Math.min(100, this.suspicion + (n.type === "run" ? 30 : 12) * (1 - d / eff));
      if (this.suspicion < 22) {
        this.headYaw = 0;
        this.yaw = Math.atan2(n.x - this.pos.x, n.z - this.pos.z);
        return;
      }
    }
    if (n.type === "distraction" && n.origin) {
      const fooled = this.w.memory.d.distractions;
      if (fooled >= 1.6 && Math.random() < Math.min(0.85, 0.3 * fooled)) {
        this.investigate(n.origin.x, n.origin.z, "thrower");
        this.event("Ignored the thrown object — heading to where it came from");
        return;
      }
    }
    const jitter = n.type === "step" ? 1.8 : n.type === "run" ? 1.0 : 0.4;
    const x = n.x + (Math.random() - 0.5) * jitter;
    const z = n.z + (Math.random() - 0.5) * jitter;
    const label = { step: "footsteps", run: "running", door: "a door", interact: "a sound", pickup: "movement", distraction: "a clatter", alarm: "a crash", hide: "a metal creak" }[n.type];
    this.investigate(x, z, n.type);
    this.event(`Heard ${label} in ${ROOM_NAMES[room || "corridor"]}`);
  }

  investigate(x: number, z: number, reason: string) {
    if (this.state === "SEARCH" && this.cur?.certain) return;
    this.state = "INVESTIGATE";
    this.reason = reason;
    this.tasks = [{ kind: "move", x, z, wait: 2.4, label: ROOM_NAMES[this.w.level.roomAt(x, z) || "corridor"] }];
    this.cur = null;
    this.path = [];
  }

  onPlayerHide(spot: HideSpot) {
    this.hideCredited = false;
    if (this.seeing || (this.state === "CHASE" && this.timeSinceSeen < 1.2)) {
      this.event(`Saw the player enter ${spot.name}`);
      this.startSearch(spot.front.x, spot.front.z, spot);
    }
  }

  startSearch(cx: number, cz: number, known: HideSpot | null = null) {
    const mem = this.w.memory;
    this.state = "SEARCH";
    this.cur = null;
    this.path = [];
    const tasks: Task[] = [];
    if (known) tasks.push({ kind: "hide", x: known.front.x, z: known.front.z, wait: 0.3, label: known.name, spot: known, certain: true });
    const point: Task = { kind: "move", x: cx, z: cz, wait: 1.6, label: "last known position" };
    const high: Task[] = [];
    const low: Task[] = [];
    const cand = this.w.level.hideSpots
      .filter((s) => s !== known)
      .map((s) => ({ s, w: mem.hideWeight(s.id), d: Math.hypot(s.front.x - cx, s.front.z - cz) }))
      .filter((c) => c.d < 30 && (c.d < 18 || c.w > 1.4))
      .filter((c) => findPath(this.w.level, this.w.inv, this.pos.x, this.pos.z, c.s.front.x, c.s.front.z))
      .map((c) => ({ ...c, score: c.w * 2 - c.d * 0.06 }))
      .sort((a, b) => b.score - a.score);
    for (const c of cand) {
      // unfamiliar hiding places are rarely checked; learned ones are always checked
      const p = 0.04 + c.w * 0.2 + (c.d < 5 ? 0.06 : 0);
      const t: Task = { kind: "hide", x: c.s.front.x, z: c.s.front.z, wait: 0.3, label: c.s.name, spot: c.s };
      if (c.w >= 0.9) high.push(t);
      else if (Math.random() < p) low.push(t);
    }
    const aggressive = high.length > 0 && mem.hideWeight(high[0].spot!.id) >= 1.8;
    if (aggressive) {
      tasks.push(...high, point);
      this.event(`Remembers ${high[0].label} — checking it first`);
    } else {
      tasks.push(point, ...high);
    }
    const room = this.w.level.roomAt(cx, cz);
    if (room && this.w.level.patrol[room]) {
      for (let i = 0; i < 2; i++) {
        const [x, z] = this.w.level.randomPoint(room);
        tasks.push({ kind: "move", x, z, wait: 1.2, label: ROOM_NAMES[room] });
      }
    }
    tasks.push(...low);
    this.tasks = tasks;
    if (!known && !aggressive) this.event(`Searching ${ROOM_NAMES[room || "corridor"]}`);
  }

  private choosePatrol() {
    const mem = this.w.memory;
    const lvl = this.w.level;
    // drive-by check of a hiding place it has learned about
    if (this.w.time - this.lastDriveBy > 38) {
      let best: HideSpot | null = null;
      let bw = 1.15;
      for (const s of lvl.hideSpots) {
        const w = mem.hideWeight(s.id);
        if (w > bw && this.w.time - s.checkedAt > 30 && findPath(lvl, this.w.inv, this.pos.x, this.pos.z, s.front.x, s.front.z)) {
          best = s;
          bw = w;
        }
      }
      this.lastDriveBy = this.w.time;
      if (best) {
        this.tasks.push({ kind: "hide", x: best.front.x, z: best.front.z, wait: 0.3, label: best.name, spot: best });
        this.event(`Patrol route altered: inspecting ${best.name}`);
        return;
      }
    }
    const doorRoom: Record<string, string> = { lab: "lab", storage: "storage", security: "security", maintenance: "maintenance", elevator: "elevator" };
    const doorW: Record<string, number> = {};
    for (const [k, v] of Object.entries(mem.d.doors)) if (doorRoom[k]) doorW[doorRoom[k]] = v;
    const recent = mem.d.route.slice(-4);
    const rooms: RoomId[] = ["reception", "lab", "storage", "security", "service", "corridor", "maintenance", "elevator"];
    const opts: { r: RoomId; w: number; pt: [number, number]; path: [number, number][] }[] = [];
    for (const r of rooms) {
      const pt = lvl.randomPoint(r);
      const path = findPath(lvl, this.w.inv, this.pos.x, this.pos.z, pt[0], pt[1]);
      if (!path) continue;
      let w = 1 + (mem.d.rooms[r] || 0) * 0.3 + (mem.d.noise[r] || 0) * 0.5 + (doorW[r] || 0) * 0.2 + (recent.includes(r) ? 1.4 : 0);
      if (r === this.room) w *= 0.3;
      if (r === "corridor") w *= 0.5;
      opts.push({ r, w, pt, path });
    }
    if (!opts.length) return;
    const tot = opts.reduce((a, b) => a + b.w, 0);
    let roll = Math.random() * tot;
    let pick = opts[0];
    for (const o of opts) {
      roll -= o.w;
      if (roll <= 0) {
        pick = o;
        break;
      }
    }
    this.tasks.push({ kind: "move", x: pick.pt[0], z: pick.pt[1], wait: 1.5 + Math.random() * 2, label: ROOM_NAMES[pick.r] });
  }

  // ---------- movement ----------
  private followPath(dt: number, speed: number) {
    if (this.pi >= this.path.length) return true;
    const [tx, tz] = this.path[this.pi];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    // doors ahead
    if (d > 0.01) {
      const ax = this.pos.x + (dx / d) * 0.9;
      const az = this.pos.z + (dz / d) * 0.9;
      const door = this.w.level.doorAtCell(Math.floor(ax), Math.floor(az)) || this.w.level.doorAtCell(Math.floor(this.pos.x), Math.floor(this.pos.z));
      if (door && door.open < 0.75) {
        if (door.target === 0) {
          this.doorWaitT += dt;
          if (this.doorWaitT > (this.state === "CHASE" ? 0.35 : 0.8)) {
            door.target = 1;
            this.doorWaitT = 0;
            this.w.audio.door([door.center.x, 1.2, door.center.z], door.heavy);
          }
        }
        this.faceTo(tx, tz, dt, 6);
        return false;
      }
    }
    if (d < 0.25) {
      this.pi++;
      return this.pi >= this.path.length;
    }
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.faceTo(tx, tz, dt, 7);
    this.animT += dt * speed * 2.2;
    this.stepT -= dt * speed;
    if (this.stepT <= 0) {
      this.stepT = 1.1;
      this.w.audio.monsterStep([this.pos.x, 0.2, this.pos.z], this.state === "CHASE" ? 1.2 : 0.8);
      const pd = this.pos.distanceTo(this.w.player.pos);
      if (pd < 8) this.w.shake(0.04 * (1 - pd / 8));
    }
    return false;
  }

  private faceTo(x: number, z: number, dt: number, rate: number) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    let diff = target - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * rate);
  }

  private setPath(x: number, z: number) {
    const p = findPath(this.w.level, this.w.inv, this.pos.x, this.pos.z, x, z);
    this.path = p || [];
    this.pi = 0;
    return !!p;
  }

  private runTasks(dt: number, speed: number) {
    if (!this.cur) {
      this.cur = this.tasks.shift() || null;
      if (!this.cur) return true;
      this.targetLabel = this.cur.label;
      this.phase = "move";
      if (!this.setPath(this.cur.x, this.cur.z)) {
        this.cur = null;
        return false;
      }
    }
    const t = this.cur;
    if (this.phase === "move") {
      if (this.followPath(dt, speed)) {
        this.phase = t.kind === "hide" ? "check" : "wait";
        this.waitT = t.wait;
        this.checkT = 0;
      }
    } else if (this.phase === "wait") {
      this.waitT -= dt;
      this.headYaw = Math.sin(this.w.time * 1.6) * 0.9;
      if (this.waitT <= 0) {
        this.headYaw = 0;
        this.cur = null;
      }
    } else if (this.phase === "check" && t.spot) {
      const s = t.spot;
      this.faceTo(s.inside.x, s.inside.z, dt, 8);
      this.checkT += dt;
      if (this.checkT > 0.5 && s.doorTarget === 0 && this.checkT < 0.6) {
        s.doorTarget = 1;
        this.w.audio.locker([s.inside.x, 1.2, s.inside.z]);
        this.w.shake(0.12);
      }
      if (this.checkT > 0.85 && this.checkT - dt <= 0.85) {
        s.checkedAt = this.w.time;
        if (this.w.player.hidden === s) {
          this.event(`Found the player in ${s.name}`);
          this.w.memory.addHide(s.id, 0.5);
          this.w.onCatch(s);
          return false;
        }
        this.w.memory.addHide(s.id, -0.25);
        this.lastEvent = `Checked ${s.name} — empty`;
        this.w.memory.log(this.lastEvent);
      }
      if (this.checkT > 2.0) {
        s.doorTarget = 0;
        this.cur = null;
      }
    }
    return false;
  }

  // ---------- main update ----------
  update(dt: number) {
    const p = this.w.player;
    this.room = this.w.level.roomAt(this.pos.x, this.pos.z);
    if (this.frozen) {
      this.animate(dt, 0);
      return;
    }
    this.perceive(dt);
    const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);

    // hidden-player awareness credit
    if (p.hidden && !this.hideCredited && dist < 6 && this.state !== "CHASE") {
      this.hideCredited = true;
      this.w.memory.addHide(p.hidden.id, 0.8, `Lost the player near ${p.hidden.name}`);
      this.w.addScore(200, "Stayed hidden");
    }

    // transitions from perception
    if (this.seeing) {
      if (this.suspicion >= 100 && this.state !== "CHASE") this.setState("CHASE");
      else if (this.suspicion >= 28 && (this.state === "PATROL" || this.state === "INVESTIGATE" || this.state === "SEARCH")) {
        this.state = "SUSPICIOUS";
        this.cur = null;
        this.event("Glimpsed movement — SUSPICIOUS");
        this.w.audio.growl([this.pos.x, 2.2, this.pos.z], 0.4);
      }
    }

    let speed = 1.4;
    switch (this.state) {
      case "CHASE": {
        speed = 4.15;
        this.targetLabel = "PLAYER";
        this.repathT -= dt;
        const tgt = this.lastSeen || { x: p.pos.x, z: p.pos.z };
        if (this.repathT <= 0) {
          this.repathT = 0.25;
          this.setPath(tgt.x, tgt.z);
        }
        this.followPath(dt, speed);
        if (this.seeing) this.faceTo(p.pos.x, p.pos.z, dt, 5);
        if (!p.hidden && dist < 1.1) {
          this.w.onCatch(null);
          return;
        }
        if (this.timeSinceSeen > 3.6 || (this.lastSeen && !this.seeing && Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z) < 0.6 && this.timeSinceSeen > 1.2)) {
          const ls = this.lastSeen || { x: this.pos.x, z: this.pos.z };
          this.suspicion = 70;
          this.setState("SEARCH");
          this.startSearch(ls.x, ls.z);
          this.event("Lost sight of the player — SEARCH");
        }
        break;
      }
      case "SUSPICIOUS": {
        speed = 0.7;
        this.targetLabel = "Movement";
        if (this.lastSeen) {
          this.faceTo(this.lastSeen.x, this.lastSeen.z, dt, 4);
          if (!this.seeing && this.timeSinceSeen > 1.4) {
            this.investigate(this.lastSeen.x, this.lastSeen.z, "glimpse");
            this.event("Moving to investigate what it saw");
          } else if (this.seeing) {
            const dx = this.lastSeen.x - this.pos.x;
            const dz = this.lastSeen.z - this.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 1.5) {
              this.pos.x += (dx / d) * speed * dt;
              this.pos.z += (dz / d) * speed * dt;
            }
          }
        }
        if (this.suspicion <= 5) {
          this.state = "PATROL";
          this.event("Lost interest — PATROL");
        }
        break;
      }
      case "INVESTIGATE": {
        speed = this.reason === "alarm" || this.reason === "run" ? 2.8 : 2.3;
        const done = this.runTasks(dt, speed);
        if (done) {
          if (this.reason === "distraction") {
            this.w.memory.d.distractions += 1;
            this.w.memory.save();
            this.event(`Found nothing at the noise (fooled ${this.w.memory.d.distractions.toFixed(1)}x)`);
            this.w.addScore(100, "Distraction worked");
            this.state = "PATROL";
          } else if (this.suspicion > 30 || ["alarm", "run", "hide", "glimpse", "thrower", "door", "pickup"].includes(this.reason)) {
            this.startSearch(this.pos.x, this.pos.z);
          } else {
            this.state = "PATROL";
            this.event("Nothing found — PATROL");
          }
        }
        break;
      }
      case "SEARCH": {
        speed = 2.0;
        if (this.runTasks(dt, speed)) {
          this.state = "PATROL";
          this.suspicion = Math.min(this.suspicion, 20);
          this.event("Search complete — returning to PATROL");
        }
        break;
      }
      case "PATROL": {
        speed = 1.4;
        if (this.runTasks(dt, speed)) this.choosePatrol();
        break;
      }
    }

    // bumping into it is fatal in any state
    if (!p.hidden && dist < 0.85) {
      this.w.onCatch(null);
      return;
    }

    // ambient growls
    this.growlT -= dt;
    if (this.growlT <= 0) {
      this.growlT = 9 + Math.random() * 14;
      if (this.state !== "CHASE") this.w.audio.growl([this.pos.x, 2.2, this.pos.z], 0.5);
    }
    const moving = this.phase === "move" || this.state === "CHASE";
    this.animate(dt, moving ? speed : 0);
  }

  private animate(dt: number, speed: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const t = this.w.time;
    const sw = Math.sin(this.animT);
    this.body.position.y = speed > 0 ? Math.abs(sw) * 0.06 : Math.sin(t * 1.3) * 0.02;
    this.body.rotation.z = sw * 0.05 * Math.min(1, speed);
    this.body.rotation.x = this.state === "CHASE" ? 0.25 : 0.05;
    this.arms[0].rotation.x = speed > 0 ? sw * 0.5 * Math.min(1.5, speed / 2) : Math.sin(t * 0.9) * 0.05;
    this.arms[1].rotation.x = speed > 0 ? -sw * 0.5 * Math.min(1.5, speed / 2) : Math.sin(t * 0.9 + 1) * 0.05;
    if (this.lunge > 0) {
      this.arms[0].rotation.x = -1.4;
      this.arms[1].rotation.x = -1.4;
    }
    // occasional head twitch
    const tw = Math.sin(t * 7.3) > 0.97 ? (Math.random() - 0.5) * 0.6 : 0;
    this.head.rotation.y += (this.headYaw + tw - this.head.rotation.y) * Math.min(1, dt * 8);
    this.head.rotation.z = Math.sin(t * 0.7) * 0.25;
  }

  pathRooms() {
    const out: string[] = [];
    const push = (r: RoomId | null) => {
      if (!r) return;
      const s = SHORT[r];
      if (out[out.length - 1] !== s) out.push(s);
    };
    push(this.room);
    for (let i = this.pi; i < this.path.length; i++) push(this.w.level.roomAt(this.path[i][0], this.path[i][1]));
    return out.join(" → ") || "—";
  }
}
