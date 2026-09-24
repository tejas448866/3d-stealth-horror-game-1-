import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as T from "./textures";
import type { HideId } from "./memory";

export type RoomId = "reception" | "lab" | "storage" | "security" | "maintenance" | "elevator" | "corridor" | "service";

export const ROOM_NAMES: Record<RoomId, string> = {
  reception: "Reception Hall",
  lab: "Laboratory",
  storage: "Storage Room",
  security: "Security Room",
  maintenance: "Maintenance Corridor",
  elevator: "Final Elevator Room",
  corridor: "Corridor",
  service: "Service Passage",
};
export const SHORT: Record<RoomId, string> = {
  reception: "Reception",
  lab: "Lab",
  storage: "Storage",
  security: "Security",
  maintenance: "Maintenance",
  elevator: "Elevator",
  corridor: "Corridor",
  service: "Service",
};

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  room: RoomId;
}

export const RECTS: Rect[] = [
  { x0: 24, z0: 24, x1: 36, z1: 34, room: "reception" },
  { x0: 23, z0: 6, x1: 37, z1: 18, room: "lab" },
  { x0: 29, z0: 18, x1: 31, z1: 24, room: "corridor" },
  { x0: 8, z0: 26, x1: 19, z1: 32, room: "storage" },
  { x0: 19, z0: 28, x1: 24, z1: 30, room: "corridor" },
  { x0: 42, z0: 23, x1: 52, z1: 33, room: "security" },
  { x0: 36, z0: 28, x1: 42, z1: 30, room: "corridor" },
  { x0: 37, z0: 9, x1: 46, z1: 11, room: "service" },
  { x0: 44, z0: 11, x1: 46, z1: 23, room: "service" },
  { x0: 29, z0: 34, x1: 32, z1: 50, room: "maintenance" },
  { x0: 32, z0: 42, x1: 35, z1: 46, room: "maintenance" },
  { x0: 29, z0: 50, x1: 31, z1: 52, room: "corridor" },
  { x0: 25, z0: 52, x1: 35, z1: 62, room: "elevator" },
  { x0: 29, z0: 62, x1: 31, z1: 65, room: "elevator" }, // elevator car
];

export const GW = 60;
export const GH = 68;

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type LockType = "none" | "keycard" | "power";

export interface Door {
  id: string;
  label: string;
  cells: [number, number][];
  axis: "x" | "z";
  plane: number;
  s0: number;
  s1: number;
  swing: 1 | -1;
  lock: LockType;
  open: number;
  target: number;
  pivots: THREE.Group[];
  collider: AABB;
  led?: THREE.MeshBasicMaterial;
  center: THREE.Vector3;
  heavy: boolean;
}

export interface HideSpot {
  id: HideId;
  name: string;
  room: RoomId;
  front: THREE.Vector3;
  inside: THREE.Vector3;
  yaw: number;
  pivot: THREE.Group;
  openSign: number;
  doorOpen: number;
  doorTarget: number;
  checkedAt: number;
}

export type ItemId = "fuse1" | "fuse2" | "keycard";
export interface Item {
  id: ItemId;
  name: string;
  room: RoomId;
  group: THREE.Group;
  base: THREE.Vector3;
  taken: boolean;
}

type LightMode = "steady" | "flicker" | "broken" | "pulse" | "sway" | "beacon";
interface LightDef {
  light: THREE.PointLight;
  base: number;
  powered: number;
  color: THREE.Color;
  pcolor: THREE.Color;
  mode: LightMode;
  fixture?: THREE.MeshBasicMaterial;
  phase: number;
  cur: number;
}

const PATROL: Partial<Record<RoomId, [number, number][]>> = {
  reception: [[30, 29.5], [26, 30.5], [34, 27], [33.5, 32.5], [29.5, 32]],
  lab: [[29, 12], [25.5, 16.5], [35, 11], [31, 8], [33, 17]],
  storage: [[10, 27.5], [16.5, 27.5], [10, 30.5], [14, 30.5], [13, 27.5]],
  security: [[45, 28], [48, 25], [47, 31.5], [44, 25]],
  maintenance: [[30.5, 37], [30.5, 45], [33.5, 43], [30.5, 49]],
  elevator: [[30, 56], [27, 58], [33, 54], [30, 60]],
  service: [[41, 10], [45, 17], [45, 12]],
  corridor: [[30, 21], [21, 29], [39, 29]],
};

export class Level {
  scene: THREE.Scene;
  walk: Uint8Array = new Uint8Array(GW * GH);
  roomGrid: (RoomId | null)[] = new Array(GW * GH).fill(null);
  propBlock: Uint8Array = new Uint8Array(GW * GH);
  colliders: AABB[] = [];
  opaque: AABB[] = [];
  doors: Door[] = [];
  hideSpots: HideSpot[] = [];
  items: Item[] = [];
  lights: LightDef[] = [];
  sparkPoints: THREE.Vector3[] = [];
  steamPoints: THREE.Vector3[] = [];
  screens: T.ScreenTex[] = [];
  flickerMats: THREE.MeshBasicMaterial[] = [];
  leds: THREE.MeshBasicMaterial[] = [];
  beacon!: THREE.Object3D;
  lamp!: THREE.Group;
  lampLight!: THREE.PointLight;
  panelFuses: THREE.Mesh[] = [];
  panelLed!: THREE.MeshBasicMaterial;
  elevLed!: THREE.MeshBasicMaterial;
  elevDoors: THREE.Mesh[] = [];
  elevOpen = 0;
  elevTarget = 0;
  carLight!: THREE.MeshBasicMaterial;
  carLamp!: THREE.PointLight;
  powerPanelPos = new THREE.Vector3(34.6, 1.3, 44);
  elevPanelPos = new THREE.Vector3(32.3, 1.3, 61.7);
  mainDoorPos = new THREE.Vector3(33.5, 1.3, 24.2);
  patrol = PATROL;
  mats: Record<string, THREE.Material> = {};
  powered = false;
  dimmer = 1;
  private sprite = T.dotTex();
  private frame = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initMats();
    for (const r of RECTS)
      for (let x = r.x0; x < r.x1; x++)
        for (let z = r.z0; z < r.z1; z++) {
          this.walk[z * GW + x] = 1;
          this.roomGrid[z * GW + x] = r.room;
        }
    this.buildShell();
    this.buildDoors();
    this.buildReception();
    this.buildLab();
    this.buildStorage();
    this.buildSecurity();
    this.buildMaintenance();
    this.buildElevator();
    this.buildService();
    this.computePropBlock();
    this.mergeStatic();
  }

  /** Merge static meshes sharing a material into single draw calls. */
  mergeStatic() {
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Object3D[] = [];
    for (const o of this.scene.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || m.userData.dynamic) continue;
      if (Array.isArray(m.material)) continue;
      m.updateMatrixWorld(true);
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      if (!groups.has(m.material)) groups.set(m.material, []);
      groups.get(m.material)!.push(g);
      remove.push(m);
    }
    for (const r of remove) this.scene.remove(r);
    groups.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);
      }
      geos.forEach((g) => g.dispose());
    });
  }

  // ---------- helpers ----------
  initMats() {
    const L = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
    this.mats = {
      metal: L({ map: T.metalTex("#4a4d50") }),
      metalDark: L({ map: T.metalTex("#26282a") }),
      rust: L({ map: T.metalTex("#4a3a2c") }),
      green: L({ map: T.metalTex("#2f3a34") }),
      wood: L({ map: T.concreteTex("#4a3a2a", 0.4) }),
      desk: L({ map: T.metalTex("#3d3a35") }),
      cardboard: L({ map: T.concreteTex("#6a5438", 0.5) }),
      crate: L({ map: T.concreteTex("#4d3f2c", 0.8) }),
      plastic: L({ color: 0x2a2826 }),
      pale: L({ color: 0x9a968c }),
      chair: L({ color: 0x3a2622 }),
      black: L({ color: 0x0a0a0a }),
      pipe: L({ map: T.metalTex("#3b3a36") }),
      pipeRust: L({ map: T.metalTex("#5a3b26") }),
      cable: L({ color: 0x111111 }),
      glass: new THREE.MeshLambertMaterial({ color: 0x9ab0a8, transparent: true, opacity: 0.18, depthWrite: false }),
      liquid: L({ color: 0x1c2a22, emissive: 0x0c1a12, emissiveIntensity: 1 }),
      paper: L({ map: T.paperTex(), side: THREE.DoubleSide }),
      hazard: L({ map: T.hazardTex() }),
      locker: L({ map: T.lockerTex() }),
      screenOff: L({ color: 0x0c0f0e }),
      concrete: L({ map: T.concreteTex("#4a4640") }),
    };
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | string, o: { collide?: boolean; opaque?: boolean; ry?: number; parent?: THREE.Object3D; rx?: number; rz?: number } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === "string" ? this.mats[mat] : mat);
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry;
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    (o.parent || this.scene).add(m);
    if (o.collide || o.opaque) {
      const swap = o.ry && Math.abs(Math.sin(o.ry)) > 0.7;
      const hw = (swap ? d : w) / 2;
      const hd = (swap ? w : d) / 2;
      const bb = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
      if (o.collide) this.colliders.push(bb);
      if (o.opaque) this.opaque.push(bb);
    }
    return m;
  }

  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, mat: THREE.Material | string, o: { rx?: number; rz?: number; seg?: number; parent?: THREE.Object3D; collide?: boolean } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 10), typeof mat === "string" ? this.mats[mat] : mat);
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    (o.parent || this.scene).add(m);
    if (o.collide) this.colliders.push({ minX: x - rb, maxX: x + rb, minZ: z - rb, maxZ: z + rb });
    return m;
  }

  label(text: string, x: number, y: number, z: number, ry: number, w = 1.6, h = 0.4, fg = "#d9d4c7", bg = "#161616", sub?: string, bright = 0.85) {
    const mat = new THREE.MeshBasicMaterial({ map: T.labelTex(text, fg, bg, 512, 128, sub), color: new THREE.Color(bright, bright, bright) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }

  addLight(x: number, y: number, z: number, color: number, base: number, powered: number, pcolor: number, mode: LightMode, dist = 12, fixture = true) {
    const light = new THREE.PointLight(color, base, dist, 1.7);
    light.position.set(x, y, z);
    this.scene.add(light);
    let fm: THREE.MeshBasicMaterial | undefined;
    if (fixture) {
      fm = new THREE.MeshBasicMaterial({ color });
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.25), fm);
      f.position.set(x, 2.97, z);
      this.scene.add(f);
    }
    this.lights.push({ light, base, powered, color: new THREE.Color(color), pcolor: new THREE.Color(pcolor), mode, fixture: fm, phase: Math.random() * 100, cur: base });
    return light;
  }

  papers(cx: number, cz: number, n: number, spread: number, y = 0.012) {
    const g = new THREE.PlaneGeometry(0.21, 0.28);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, this.mats.paper);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI * 2;
      m.position.set(cx + (Math.random() - 0.5) * spread, y + i * 0.001, cz + (Math.random() - 0.5) * spread);
      this.scene.add(m);
    }
  }

  chair(x: number, z: number, ry: number, tipped = false) {
    const g = new THREE.Group();
    const m = this.mats.chair;
    this.box(0.45, 0.06, 0.45, 0, 0.45, 0, m, { parent: g });
    this.box(0.45, 0.5, 0.05, 0, 0.72, -0.2, m, { parent: g });
    for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) this.box(0.03, 0.45, 0.03, a, 0.22, b, "metalDark", { parent: g });
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    if (tipped) {
      g.rotation.z = Math.PI / 2;
      g.position.y = 0.23;
    }
    this.scene.add(g);
  }

  monitor(x: number, y: number, z: number, ry: number, broken = false, flicker = true) {
    const g = new THREE.Group();
    this.box(0.5, 0.4, 0.4, 0, 0.2, 0, "plastic", { parent: g });
    const mat = new THREE.MeshBasicMaterial({ color: broken ? 0x1a2a24 : 0x4a6a5a });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), mat);
    s.position.set(0, 0.21, 0.201);
    g.add(s);
    if (broken) {
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 }));
      crack.position.set(0.05, 0.19, 0.202);
      crack.rotation.z = 0.6;
      crack.scale.set(0.2, 1.2, 1);
      g.add(crack);
    }
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
    if (flicker) this.flickerMats.push(mat);
  }

  secCam(x: number, y: number, z: number, ry: number) {
    const g = new THREE.Group();
    this.box(0.06, 0.25, 0.06, 0, 0.12, 0, "metalDark", { parent: g });
    const body = this.box(0.16, 0.14, 0.38, 0, -0.02, 0.15, "pale", { parent: g });
    body.rotation.x = 0.35;
    const led = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), led);
    l.position.set(0.05, 0.04, 0.34);
    g.add(l);
    this.leds.push(led);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
  }

  glow(x: number, y: number, z: number, color: number, scale: number, parent?: THREE.Object3D) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sprite, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z);
    s.scale.setScalar(scale);
    (parent || this.scene).add(s);
    return s;
  }

  // ---------- shell ----------
  buildShell() {
    const wallMats: Record<RoomId, THREE.Material> = {
      reception: new THREE.MeshLambertMaterial({ map: T.wallTex("#5c5446", "#6b2a22") }),
      lab: new THREE.MeshLambertMaterial({ map: T.wallTex("#7f8683", "#3d6660") }),
      storage: new THREE.MeshLambertMaterial({ map: T.wallTex("#4a453c", "#5a4a2a", 1.6) }),
      security: new THREE.MeshLambertMaterial({ map: T.wallTex("#3b4046", "#7a2a24") }),
      maintenance: new THREE.MeshLambertMaterial({ map: T.wallTex("#393935", "#8a6a1e", 2) }),
      elevator: new THREE.MeshLambertMaterial({ map: T.wallTex("#46413a", "#8a6a1e", 1.5) }),
      corridor: new THREE.MeshLambertMaterial({ map: T.wallTex("#48443d", "#3a3530") }),
      service: new THREE.MeshLambertMaterial({ map: T.wallTex("#302e2a", "#3a3530", 2.2) }),
    };
    const floorMats: Record<RoomId, THREE.Material> = {
      reception: new THREE.MeshLambertMaterial({ map: T.tileTex("#4d463a", "#1e1b16", 4) }),
      lab: new THREE.MeshLambertMaterial({ map: T.tileTex("#7d827d", "#343834", 6) }),
      storage: new THREE.MeshLambertMaterial({ map: T.concreteTex("#3d3832", 1.3) }),
      security: new THREE.MeshLambertMaterial({ map: T.tileTex("#2a2e33", "#15181b", 2) }),
      maintenance: new THREE.MeshLambertMaterial({ map: T.gratingTex() }),
      elevator: new THREE.MeshLambertMaterial({ map: T.concreteTex("#3a3936", 1.2) }),
      corridor: new THREE.MeshLambertMaterial({ map: T.concreteTex("#34312d") }),
      service: new THREE.MeshLambertMaterial({ map: T.concreteTex("#2b2a28", 1.6) }),
    };
    const ceilMat = new THREE.MeshLambertMaterial({ map: T.tileTex("#2c2a27", "#141312", 2, 1.5) });

    // walls grouped per room
    const byRoom = new Map<RoomId, THREE.Matrix4[]>();
    const q = new THREE.Quaternion();
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const s = new THREE.Vector3(1, 1, 1);
    const push = (room: RoomId, x: number, z: number, rot: boolean) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 1.5, z), rot ? qy : q, s);
      if (!byRoom.has(room)) byRoom.set(room, []);
      byRoom.get(room)!.push(m);
    };
    for (let x = 0; x < GW; x++)
      for (let z = 0; z < GH; z++) {
        if (!this.isWalk(x, z)) continue;
        const room = this.roomGrid[z * GW + x]!;
        if (!this.isWalk(x + 1, z)) push(room, x + 1, z + 0.5, true);
        if (!this.isWalk(x - 1, z)) push(room, x, z + 0.5, true);
        if (!this.isWalk(x, z + 1)) push(room, x + 0.5, z + 1, false);
        if (!this.isWalk(x, z - 1)) push(room, x + 0.5, z, false);
      }
    const wg = new THREE.BoxGeometry(1.12, 3, 0.12);
    byRoom.forEach((arr, room) => {
      const im = new THREE.InstancedMesh(wg, wallMats[room], arr.length);
      arr.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im);
    });

    for (const r of RECTS) {
      const w = r.x1 - r.x0;
      const h = r.z1 - r.z0;
      const fg = new THREE.PlaneGeometry(w, h);
      const uv = fg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 0.5, uv.getY(i) * h * 0.5);
      const f = new THREE.Mesh(fg, floorMats[r.room]);
      f.rotation.x = -Math.PI / 2;
      f.position.set(r.x0 + w / 2, 0, r.z0 + h / 2);
      this.scene.add(f);
      const c = new THREE.Mesh(fg, ceilMat);
      c.rotation.x = Math.PI / 2;
      c.position.set(r.x0 + w / 2, 3, r.z0 + h / 2);
      this.scene.add(c);
    }
  }

  // ---------- doors ----------
  buildDoors() {
    const defs: { id: string; label: string; back?: string; cells: [number, number][]; axis: "x" | "z"; plane: number; s0: number; s1: number; swing: 1 | -1; face: 1 | -1; lock: LockType; heavy?: boolean }[] = [
      { id: "lab", label: "LABORATORY", back: "RECEPTION", cells: [[29, 23], [30, 23]], axis: "z", plane: 24, s0: 29, s1: 31, swing: -1, face: 1, lock: "none" },
      { id: "storage", label: "STORAGE", back: "RECEPTION", cells: [[23, 28], [23, 29]], axis: "x", plane: 24, s0: 28, s1: 30, swing: -1, face: 1, lock: "none" },
      { id: "security", label: "SECURITY", back: "RECEPTION", cells: [[36, 28], [36, 29]], axis: "x", plane: 36, s0: 28, s1: 30, swing: 1, face: -1, lock: "none" },
      { id: "maintenance", label: "MAINTENANCE", back: "RECEPTION", cells: [[29, 34], [30, 34], [31, 34]], axis: "z", plane: 34, s0: 29, s1: 32, swing: 1, face: -1, lock: "keycard" },
      { id: "elevator", label: "ELEVATOR", cells: [[29, 51], [30, 51]], axis: "z", plane: 52, s0: 29, s1: 31, swing: -1, face: -1, lock: "power", heavy: true },
    ];
    const doorMat = new THREE.MeshLambertMaterial({ map: T.metalTex("#3e3f3c") });
    const heavyMat = new THREE.MeshLambertMaterial({ map: T.hazardTex() });
    for (const d of defs) {
      const len = d.s1 - d.s0;
      const mid = (d.s0 + d.s1) / 2;
      const pivots: THREE.Group[] = [];
      const pl = len / 2 - 0.02;
      for (let side = 0; side < 2; side++) {
        const pv = new THREE.Group();
        const hinge = side === 0 ? d.s0 : d.s1;
        const dir = side === 0 ? 1 : -1;
        const g = new THREE.BoxGeometry(d.axis === "z" ? pl : 0.08, 2.4, d.axis === "z" ? 0.08 : pl);
        const panel = new THREE.Mesh(g, d.heavy ? heavyMat : doorMat);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0x0a0c0c }));
        if (d.axis === "z") {
          pv.position.set(hinge, 0, d.plane);
          panel.position.set((dir * pl) / 2, 1.2, 0);
          win.position.set((dir * pl) / 2, 1.6, 0.045 * d.face);
          if (d.face < 0) win.rotation.y = Math.PI;
        } else {
          pv.position.set(d.plane, 0, hinge);
          panel.position.set(0, 1.2, (dir * pl) / 2);
          win.position.set(0.045 * d.face, 1.6, (dir * pl) / 2);
          win.rotation.y = (d.face * Math.PI) / 2;
        }
        pv.add(panel);
        if (!d.heavy) pv.add(win);
        pv.userData.side = side;
        this.scene.add(pv);
        pivots.push(pv);
      }
      // frame + header
      const fw = 0.18;
      if (d.axis === "z") {
        this.box(len + 0.3, 0.6, 0.22, mid, 2.7, d.plane, "metalDark");
        this.box(fw, 2.4, 0.22, d.s0 + 0.02, 1.2, d.plane, "metalDark");
        this.box(fw, 2.4, 0.22, d.s1 - 0.02, 1.2, d.plane, "metalDark");
      } else {
        this.box(0.22, 0.6, len + 0.3, d.plane, 2.7, mid, "metalDark");
        this.box(0.22, 2.4, fw, d.plane, 1.2, d.s0 + 0.02, "metalDark");
        this.box(0.22, 2.4, fw, d.plane, 1.2, d.s1 - 0.02, "metalDark");
      }
      // labels
      const fg = d.lock === "none" ? "#d9d4c7" : "#d8a24a";
      const off = 0.125;
      if (d.axis === "z") {
        this.label(d.label, mid, 2.72, d.plane + off * d.face, d.face > 0 ? 0 : Math.PI, Math.min(1.9, len * 0.8), 0.42, fg, "#141414", d.lock === "keycard" ? "SECURITY CLEARANCE" : d.lock === "power" ? "POWER REQUIRED" : undefined);
        if (d.back) this.label(d.back, mid, 2.72, d.plane - off * d.face, d.face > 0 ? Math.PI : 0, 1.5, 0.36);
      } else {
        this.label(d.label, d.plane + off * d.face, 2.72, mid, (d.face * Math.PI) / 2, 1.6, 0.42, fg);
        if (d.back) this.label(d.back, d.plane - off * d.face, 2.72, mid, (-d.face * Math.PI) / 2, 1.5, 0.36);
      }
      const collider = d.axis === "z" ? { minX: d.s0, maxX: d.s1, minZ: d.plane - 0.1, maxZ: d.plane + 0.1 } : { minX: d.plane - 0.1, maxX: d.plane + 0.1, minZ: d.s0, maxZ: d.s1 };
      const center = d.axis === "z" ? new THREE.Vector3(mid, 1.2, d.plane) : new THREE.Vector3(d.plane, 1.2, mid);
      let led: THREE.MeshBasicMaterial | undefined;
      if (d.lock !== "none") {
        led = new THREE.MeshBasicMaterial({ color: 0xc8231a });
        const rx = d.axis === "z" ? d.s1 + 0.35 : d.plane + 0.1 * d.face;
        const rz = d.axis === "z" ? d.plane + 0.1 * d.face : d.s1 + 0.35;
        this.box(0.16, 0.26, 0.06, rx, 1.3, rz, "metalDark", { ry: d.axis === "x" ? Math.PI / 2 : 0 });
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.08), led);
        l.position.set(rx, 1.4, rz);
        this.scene.add(l);
      }
      this.doors.push({ id: d.id, label: d.label, cells: d.cells, axis: d.axis, plane: d.plane, s0: d.s0, s1: d.s1, swing: d.swing, lock: d.lock, open: 0, target: 0, pivots, collider, led, center, heavy: !!d.heavy });
    }
  }

  // ---------- rooms ----------
  buildReception() {
    // desk
    this.box(3.6, 1.1, 0.5, 26.2, 0.55, 27.2, "desk", { collide: true });
    this.box(3.8, 0.05, 0.7, 26.2, 1.12, 27.2, "wood");
    this.box(0.5, 1.1, 2.0, 27.75, 0.55, 26.0, "desk", { collide: true });
    this.box(2.4, 0.76, 0.7, 25.6, 0.38, 24.45, "wood", { collide: true });
    this.monitor(25.2, 0.76, 24.5, 0, true);
    this.monitor(26.4, 1.14, 27.1, Math.PI, true);
    this.box(0.45, 0.03, 0.15, 25.9, 0.78, 24.7, "plastic");
    this.chair(26, 25.6, Math.PI * 0.9);
    this.papers(26.2, 27.2, 5, 1.2, 1.15);
    this.papers(28.5, 28.5, 10, 3);
    this.papers(31, 31, 6, 2.5);
    // waiting chairs
    for (let i = 0; i < 4; i++) this.chair(24.8 + i * 0.6, 33.4, Math.PI);
    this.chair(28.8, 30.8, 0.7, true);
    this.chair(33, 26.5, 2.3);
    // columns
    this.box(0.6, 3, 0.6, 26.5, 1.5, 31.2, "concrete", { collide: true, opaque: true });
    this.box(0.6, 3, 0.6, 33.5, 1.5, 31.2, "concrete", { collide: true, opaque: true });
    // plant
    this.cyl(0.25, 0.2, 0.5, 35.3, 0.25, 33.3, "plastic", { collide: true });
    this.cyl(0.02, 0.02, 0.8, 35.3, 0.8, 33.3, "wood");
    // main doors (sealed)
    this.box(2.6, 2.9, 0.2, 33.5, 1.45, 24.1, "metalDark");
    this.box(1.2, 2.6, 0.1, 32.85, 1.35, 24.22, "rust");
    this.box(1.2, 2.6, 0.1, 34.15, 1.35, 24.22, "rust");
    for (let i = 0; i < 3; i++) this.box(2.8, 0.18, 0.06, 33.5, 0.8 + i * 0.7, 24.3, "wood", { rz: (i - 1) * 0.12 });
    this.label("EXIT", 33.5, 2.75, 24.2, 0, 0.7, 0.22, "#c8403a", "#1a0c0a");
    this.label("SEALED", 33.5, 1.55, 24.34, 0, 0.8, 0.2, "#b8b0a0", "#2a1a14");
    // notice board
    this.box(0.05, 1, 1.6, 35.93, 1.6, 26.2, "wood");
    this.label("THE ARCHIVE", 35.9, 2.3, 26.2, -Math.PI / 2, 1.5, 0.3, "#b8b0a0", "#161616", "SUBLEVEL 4 - RESTRICTED");
    this.secCam(35.6, 2.75, 24.4, -Math.PI * 0.75);
    this.addLight(27.2, 2.85, 29.5, 0xd8b078, 3.2, 8, 0xf0dcb8, "flicker");
    this.addLight(32.8, 2.85, 29.5, 0xd8a868, 2.4, 8, 0xf0dcb8, "broken");
  }

  buildLab() {
    const tbl = (x: number, z: number, w: number, d: number) => {
      this.box(w, 0.06, d, x, 0.9, z, "pale", { collide: true });
      this.box(w - 0.1, 0.7, d - 0.1, x, 0.5, z, "metalDark");
    };
    tbl(27.5, 10, 5, 1.1);
    tbl(27.5, 14, 5, 1.1);
    tbl(33.5, 14.5, 3, 1.1);
    tbl(33, 6.5, 4, 0.8);
    this.monitor(32, 0.93, 6.5, 0);
    this.monitor(33.2, 0.93, 6.5, 0, true);
    this.monitor(34.4, 0.93, 6.5, 0);
    this.monitor(26, 0.93, 13.9, Math.PI);
    this.monitor(28.6, 0.93, 10.1, 0, true);
    // specimen tanks
    for (let i = 0; i < 4; i++) {
      const z = 8 + i * 2.5;
      const broken = i === 2;
      this.cyl(0.52, 0.55, 0.3, 23.7, 0.15, z, "metalDark", { collide: true });
      this.cyl(0.52, 0.52, 0.2, 23.7, 2.6, z, "metalDark");
      if (!broken) {
        this.cyl(0.45, 0.45, 2.1, 23.7, 1.4, z, "glass", { seg: 14 });
        this.cyl(0.43, 0.43, 1.4 - i * 0.2, 23.7, 0.3 + (1.4 - i * 0.2) / 2, z, "liquid", { seg: 12 });
      } else {
        for (let k = 0; k < 7; k++) this.box(0.15 + Math.random() * 0.2, 0.01, 0.1, 24.4 + Math.random() * 1.2, 0.01, z + (Math.random() - 0.5) * 1.5, "glass", { ry: Math.random() * 3 });
      }
    }
    // glass containers + equipment
    for (let i = 0; i < 6; i++) this.cyl(0.05, 0.06, 0.18 + Math.random() * 0.1, 25.5 + i * 0.7, 1.02, 9.8 + Math.random() * 0.4, "glass", { seg: 8 });
    for (let i = 0; i < 4; i++) this.cyl(0.07, 0.07, 0.25, 26 + i * 1.1, 1.05, 14.2, "glass", { seg: 8 });
    this.box(0.5, 0.35, 0.4, 29.4, 1.1, 14, "pale");
    this.box(0.35, 0.5, 0.35, 30, 1.18, 10, "metal");
    this.cyl(0.08, 0.1, 0.4, 32.4, 1.13, 14.6, "metalDark");
    this.box(0.8, 1.8, 0.5, 36.6, 0.9, 16.5, "metal", { collide: true, opaque: true });
    this.box(0.8, 1.8, 0.5, 36.6, 0.9, 15.6, "metal", { collide: true, opaque: true });
    this.papers(29, 12, 14, 4);
    this.papers(34, 12, 6, 2.5);
    this.papers(27.5, 14, 4, 2, 0.94);
    this.chair(30.8, 12.2, 1.2, true);
    this.chair(27, 15.2, 3);
    this.label("GENETIC ARCHIVE - WING C", 30, 2.3, 17.93, Math.PI, 2.2, 0.3, "#9ab8b0", "#101414");
    this.secCam(23.4, 2.75, 6.4, Math.PI * 0.25);
    this.addLight(28.5, 2.85, 12, 0xb8d4d0, 3.4, 9, 0xe8f0f0, "flicker");
    this.addLight(35.5, 2.6, 7.5, 0xc0281c, 3.2, 1.2, 0xc0281c, "pulse");
    this.makeItem("fuse1", "Fuse 1", "lab", 34.2, 0.98, 14.5);
  }

  buildStorage() {
    const shelf = (x: number, z: number, w: number, d: number, h: number) => {
      const bb = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
      this.colliders.push(bb);
      this.opaque.push(bb);
      for (const sx of [-w / 2 + 0.03, w / 2 - 0.03])
        for (const sz of [-d / 2 + 0.03, d / 2 - 0.03]) this.box(0.05, h, 0.05, x + sx, h / 2, z + sz, "rust");
      const levels = Math.floor(h / 0.6);
      for (let i = 0; i < levels; i++) {
        const y = 0.12 + i * 0.6;
        this.box(w, 0.04, d, x, y, z, "metal");
        let bx = x - w / 2 + 0.1;
        while (bx < x + w / 2 - 0.3) {
          const bw = 0.25 + Math.random() * 0.35;
          if (Math.random() < 0.75) {
            const bh = 0.2 + Math.random() * 0.3;
            this.box(bw - 0.03, bh, d * (0.6 + Math.random() * 0.35), bx + bw / 2, y + 0.02 + bh / 2, z, Math.random() < 0.7 ? "cardboard" : "crate", { ry: (Math.random() - 0.5) * 0.2 });
          }
          bx += bw;
        }
      }
    };
    for (let i = 0; i < 5; i++) shelf(11.9 + i * 1.4, 26.35, 1.36, 0.6, 2.6);
    for (let i = 0; i < 5; i++) shelf(9.1 + i * 1.4, 31.65, 1.36, 0.6, 2.6);
    shelf(12.1, 29, 2.1, 0.8, 2.2);
    shelf(14.2, 29, 2.1, 0.8, 2.2);
    // lockers
    const locker = (x: number, z: number, faceZ: 1 | -1, id?: HideId, letter?: string) => {
      const bz = z;
      this.box(0.78, 2.1, 0.6, x, 1.05, bz, "green", { collide: true, opaque: true });
      const pv = new THREE.Group();
      const hingeX = x - 0.38;
      pv.position.set(hingeX, 0, bz + faceZ * 0.31);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.0, 0.03), this.mats.locker);
      door.position.set(0.37, 1.05, 0);
      if (faceZ < 0) door.rotation.y = Math.PI;
      pv.add(door);
      this.scene.add(pv);
      if (letter) this.label(letter, x + 0.05, 1.75, bz + faceZ * 0.335, faceZ > 0 ? 0 : Math.PI, 0.22, 0.22, "#d9d4c7", "#1a221e");
      if (id)
        this.hideSpots.push({
          id,
          name: letter ? `Locker ${letter}` : "Locker",
          room: "storage",
          front: new THREE.Vector3(x, 0, bz + faceZ * 1.15),
          inside: new THREE.Vector3(x, 1.62, bz + faceZ * 0.36),
          yaw: faceZ > 0 ? Math.PI : 0,
          pivot: pv,
          openSign: faceZ > 0 ? -1 : 1,
          doorOpen: 0,
          doorTarget: 0,
          checkedAt: -99,
        });
    };
    locker(8.75, 26.34, 1);
    locker(9.55, 26.34, 1, "lockerA", "A");
    locker(10.35, 26.34, 1);
    locker(16.4, 31.66, -1);
    locker(17.2, 31.66, -1, "lockerB", "B");
    locker(18.0, 31.66, -1);
    // crates + cabinets
    this.box(0.8, 0.8, 0.8, 8.6, 0.4, 28.4, "crate", { collide: true, opaque: true });
    this.box(0.7, 0.7, 0.7, 8.6, 1.15, 28.4, "crate", { ry: 0.2 });
    this.box(0.7, 0.65, 0.7, 8.6, 0.325, 30.2, "crate", { collide: true });
    this.box(0.6, 1.6, 0.6, 16.3, 0.8, 29, "metal", { collide: true, opaque: true });
    this.box(0.9, 0.5, 0.6, 18.4, 0.25, 27.1, "crate", { collide: true });
    this.papers(13, 27.6, 5, 2);
    this.papers(11, 30.5, 4, 2);
    // hanging lamp
    this.lamp = new THREE.Group();
    this.lamp.position.set(13.2, 3, 29);
    this.cyl(0.008, 0.008, 0.7, 0, -0.35, 0, "cable", { parent: this.lamp });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.2, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0x2a2a26, side: THREE.DoubleSide }));
    shade.position.y = -0.75;
    this.lamp.add(shade);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xf0c890 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), bulbMat);
    bulb.position.y = -0.82;
    this.lamp.add(bulb);
    this.scene.add(this.lamp);
    this.lampLight = this.addLight(13.2, 2.1, 29, 0xe0a860, 3, 7, 0xf0d0a0, "sway", 10, false);
    this.lights[this.lights.length - 1].fixture = bulbMat;
    this.label("STORAGE B-2", 8.07, 2.2, 29, Math.PI / 2, 1.3, 0.3);
    this.makeItem("fuse2", "Fuse 2", "storage", 8.6, 0.71, 30.2);
  }

  buildSecurity() {
    this.box(1.0, 0.8, 6, 50.9, 0.4, 28, "desk", { collide: true });
    this.box(1.1, 0.04, 6.1, 50.9, 0.82, 28, "wood");
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 2; r++) {
        const z = 26.2 + c * 0.95 + (c > 0 ? 0 : 0);
        const zz = 26.3 + c * 1.7;
        this.box(0.25, 0.62, 1.4, 51.8, 1.4 + r * 0.72, zz, "plastic");
        const st = new T.ScreenTex(128, 96);
        this.screens.push(st);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.54), new THREE.MeshBasicMaterial({ map: st.texture, color: 0x9aa89a }));
        m.position.set(51.66, 1.4 + r * 0.72, zz);
        m.rotation.y = -Math.PI / 2;
        this.scene.add(m);
        void z;
      }
    this.box(0.35, 0.03, 0.8, 50.7, 0.85, 28, "plastic");
    this.chair(49.7, 28, -Math.PI / 2);
    for (let i = 0; i < 4; i++) this.box(0.7, 1.3, 0.6, 43.5 + i * 0.75, 0.65, 32.6, "metal", { collide: true, opaque: true });
    this.box(0.7, 1.3, 0.6, 51.6, 0.65, 24, "metal", { collide: true });
    this.box(1.6, 0.76, 0.8, 47.5, 0.38, 32.5, "desk", { collide: true });
    this.monitor(47.5, 0.76, 32.5, Math.PI, true, false);
    this.papers(47, 29, 6, 3);
    this.papers(50.9, 28, 3, 2, 0.85);
    // keycard reader panel decor
    this.box(0.06, 0.3, 0.2, 42.07, 1.3, 30.6, "metalDark");
    this.label("SECURITY CONTROL", 46, 2.4, 23.07, 0, 2, 0.3, "#c8403a", "#140a0a");
    // beacon
    this.beacon = new THREE.Group();
    this.beacon.position.set(47, 2.85, 28);
    const bm = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), bm);
    b.position.z = 0.1;
    this.beacon.add(b);
    this.cyl(0.12, 0.14, 0.14, 47, 2.93, 28, "metalDark");
    this.scene.add(this.beacon);
    this.secCam(42.4, 2.75, 32.6, Math.PI * 0.75);
    this.addLight(47, 2.6, 28, 0xd02418, 3.4, 2.4, 0xd08a40, "beacon", 12, false);
    this.addLight(49.9, 1.7, 28, 0x80a890, 1.6, 2.4, 0x90b0a0, "flicker", 6, false);
    this.makeItem("keycard", "Security Keycard", "security", 50.7, 0.86, 30.2);
  }

  buildMaintenance() {
    // pipes along walls
    for (const [x, y, mat] of [[29.25, 2.55, "pipe"], [29.35, 2.8, "pipeRust"], [31.75, 2.3, "pipe"], [31.65, 2.62, "pipeRust"]] as [number, number, string][]) this.cyl(0.08, 0.08, 16, x, y, 42, mat, { rx: Math.PI / 2 });
    for (let z = 35; z < 50; z += 3.1) {
      this.cyl(0.06, 0.06, 2.4, 31.82, 1.2, z, "pipeRust");
      this.box(0.25, 0.12, 0.25, 31.82, 2.3, z, "metalDark");
    }
    this.cyl(0.02, 0.02, 16, 29.1, 2.9, 42, "cable", { rx: Math.PI / 2 });
    this.cyl(0.015, 0.015, 16, 29.12, 2.85, 42.1, "cable", { rx: Math.PI / 2 });
    // broken fixtures
    for (const z of [37, 41, 45, 49]) this.box(0.9, 0.06, 0.25, 30.5, 2.96, z, "metalDark");
    // equipment
    this.box(0.5, 0.25, 0.25, 31.5, 0.13, 36, "rust", { ry: 0.3 });
    this.cyl(0.28, 0.28, 0.9, 31.55, 0.45, 47.7, "rust", { collide: true });
    this.cyl(0.28, 0.28, 0.9, 31.5, 0.45, 48.4, "pipeRust", { collide: true });
    this.box(1.2, 1.0, 0.8, 33.4, 0.5, 45.4, "metal", { collide: true, opaque: true });
    this.box(0.5, 0.35, 0.3, 32.6, 0.18, 42.4, "rust");
    this.cyl(0.12, 0.12, 0.9, 32.3, 0.45, 42.3, "pipeRust");
    // power panel
    this.box(0.2, 1.3, 1.0, 34.9, 1.35, 44, "metalDark");
    this.box(0.04, 1.1, 0.85, 34.78, 1.35, 44, "rust");
    this.label("POWER CONTROL", 34.75, 2.2, 44, -Math.PI / 2, 1.1, 0.26, "#d8a24a", "#141008", "MAIN BUS B4");
    for (let i = 0; i < 2; i++) {
      this.box(0.06, 0.28, 0.14, 34.74, 1.45, 43.75 + i * 0.5, "black");
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), new THREE.MeshBasicMaterial({ color: 0xe0a040 }));
      f.position.set(34.7, 1.45, 43.75 + i * 0.5);
      f.visible = false;
      f.userData.dynamic = true;
      this.scene.add(f);
      this.panelFuses.push(f);
    }
    this.panelLed = new THREE.MeshBasicMaterial({ color: 0xc8231a });
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.08), this.panelLed);
    pl.position.set(34.74, 1.0, 44);
    this.scene.add(pl);
    this.box(0.05, 0.3, 0.05, 34.72, 1.05, 44.3, "pale", { rz: 0.5 });
    // closet
    this.box(0.2, 2.3, 0.14, 29.05, 1.15, 38.4, "metalDark");
    this.box(0.2, 2.3, 0.14, 29.05, 1.15, 39.6, "metalDark");
    this.box(0.2, 0.15, 1.34, 29.05, 2.3, 39, "metalDark");
    const pv = new THREE.Group();
    pv.position.set(29.08, 0, 38.48);
    const cd = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 1.04), this.mats.rust);
    cd.position.set(0, 1.1, 0.52);
    pv.add(cd);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    grille.position.set(0.025, 1.6, 0.52);
    grille.rotation.y = Math.PI / 2;
    pv.add(grille);
    this.scene.add(pv);
    this.label("CLOSET", 29.1, 2.12, 39, Math.PI / 2, 0.5, 0.12, "#b8b0a0");
    this.hideSpots.push({ id: "closet", name: "Maintenance Closet", room: "maintenance", front: new THREE.Vector3(30.3, 0, 39), inside: new THREE.Vector3(29.25, 1.62, 39), yaw: -Math.PI / 2, pivot: pv, openSign: 1, doorOpen: 0, doorTarget: 0, checkedAt: -99 });
    this.steamPoints.push(new THREE.Vector3(31.6, 2.3, 37.8), new THREE.Vector3(29.4, 2.55, 46.5));
    this.sparkPoints.push(new THREE.Vector3(30.5, 2.9, 45), new THREE.Vector3(30.5, 2.9, 41));
    this.label("WARNING - HIGH PRESSURE", 31.88, 1.6, 40.5, -Math.PI / 2, 1.2, 0.2, "#d8a24a", "#141008");
    this.addLight(30.5, 2.6, 36.5, 0xb82418, 2.6, 6, 0xe0b070, "pulse", 9, false);
    this.addLight(33.2, 2.6, 44, 0xb82418, 2.2, 6, 0xe0b070, "broken", 8, false);
  }

  buildElevator() {
    // frame
    this.box(0.6, 3, 0.4, 28.5, 1.5, 61.8, "metalDark", { collide: true });
    this.box(0.6, 3, 0.4, 31.5, 1.5, 61.8, "metalDark", { collide: true });
    this.box(3.6, 0.5, 0.4, 30, 2.75, 61.8, "hazard");
    this.box(0.12, 2.5, 0.42, 28.26, 1.25, 61.8, "hazard");
    this.box(0.12, 2.5, 0.42, 31.74, 1.25, 61.8, "hazard");
    const dm = new THREE.MeshLambertMaterial({ map: T.metalTex("#5a5c5a") });
    for (let i = 0; i < 2; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.5, 0.08), dm);
      d.position.set(29.5 + i, 1.25, 61.86);
      d.userData.dynamic = true;
      this.scene.add(d);
      this.elevDoors.push(d);
    }
    this.label("B4", 30, 2.75, 61.58, Math.PI, 0.4, 0.2, "#d8a24a", "#101010");
    // car interior
    this.box(1.9, 0.02, 2.9, 30, 0.01, 63.5, "metal");
    this.carLight = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const cl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 1.2), this.carLight);
    cl.position.set(30, 2.97, 63.5);
    this.scene.add(cl);
    this.carLamp = new THREE.PointLight(0xf0e0c0, 0, 5, 1.7);
    this.carLamp.position.set(30, 2.6, 63.5);
    this.scene.add(this.carLamp);
    this.box(0.05, 0.12, 1.8, 29.06, 1.0, 63.5, "pale");
    this.box(0.05, 0.12, 1.8, 30.94, 1.0, 63.5, "pale");
    // panel
    this.box(0.35, 0.6, 0.08, 32.3, 1.3, 61.94, "metalDark");
    this.elevLed = new THREE.MeshBasicMaterial({ color: 0xc8231a });
    const el = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), this.elevLed);
    el.position.set(32.3, 1.4, 61.89);
    el.rotation.y = Math.PI;
    this.scene.add(el);
    this.box(0.08, 0.08, 0.02, 32.3, 1.18, 61.89, "pale");
    // hazard floor
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), this.mats.hazard);
    hz.rotation.x = -Math.PI / 2;
    hz.position.set(30, 0.012, 61);
    this.scene.add(hz);
    // beams
    for (const [x, z] of [[25.9, 55], [34.1, 55], [25.9, 59], [34.1, 59]]) {
      this.box(0.5, 3, 0.5, x, 1.5, z, "rust", { collide: true, opaque: true });
      this.box(0.7, 0.1, 0.7, x, 0.05, z, "hazard");
    }
    this.box(10, 0.35, 0.3, 30, 2.8, 55, "rust");
    this.box(10, 0.35, 0.3, 30, 2.8, 59, "rust");
    this.box(1, 0.9, 1, 27, 0.45, 53.2, "crate", { collide: true, opaque: true });
    this.box(0.8, 0.6, 0.8, 27.1, 1.2, 53.2, "crate", { ry: 0.3 });
    this.box(0.9, 0.9, 0.9, 33.8, 0.45, 60.6, "crate", { collide: true });
    this.label("DANGER", 25.07, 1.7, 57, Math.PI / 2, 1.0, 0.3, "#d8a24a", "#1a1206", "HIGH VOLTAGE");
    this.label("AUTHORIZED PERSONNEL ONLY", 34.93, 1.7, 57, -Math.PI / 2, 1.6, 0.26, "#c8403a", "#140a0a");
    this.label("SURFACE LIFT", 30, 2.4, 52.07, 0, 1.5, 0.3, "#d8a24a", "#101010", "EMERGENCY EVACUATION");
    this.secCam(25.4, 2.75, 52.4, Math.PI * 0.25);
    this.addLight(30, 2.7, 57, 0xc0281c, 3.2, 8, 0xf0dcb8, "pulse", 14, false);
  }

  buildService() {
    this.cyl(0.1, 0.1, 9, 41.5, 2.6, 9.2, "pipeRust", { rz: Math.PI / 2 });
    this.cyl(0.06, 0.06, 12, 45.85, 2.4, 17, "pipe", { rx: Math.PI / 2 });
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshLambertMaterial({ color: 0x050606 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(44.8, 0.01, 14);
    this.scene.add(puddle);
    this.box(0.6, 0.4, 0.5, 38.5, 0.2, 10.6, "crate", { ry: 0.4 });
    this.papers(41, 10, 4, 1.5);
    this.label("SERVICE", 36.95, 2.4, 10, -Math.PI / 2, 0.9, 0.22, "#8a857a");
  }

  makeItem(id: ItemId, name: string, room: RoomId, x: number, y: number, z: number) {
    const g = new THREE.Group();
    if (id === "keycard") {
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.1), new THREE.MeshBasicMaterial({ color: 0xd8d4c8 }));
      g.add(card);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.025), new THREE.MeshBasicMaterial({ color: 0xa3322a }));
      stripe.position.z = -0.025;
      g.add(stripe);
      this.glow(0, 0.02, 0, 0xc84a3a, 0.5, g);
    } else {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0xe0a040 }));
      glass.rotation.z = Math.PI / 2;
      g.add(glass);
      for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), this.mats.metal);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = s * 0.1;
        g.add(cap);
      }
      this.glow(0, 0, 0, 0xe09a3a, 0.6, g);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    this.items.push({ id, name, room, group: g, base: new THREE.Vector3(x, y, z), taken: false });
  }

  // ---------- grid queries ----------
  isWalk(x: number, z: number) {
    if (x < 0 || z < 0 || x >= GW || z >= GH) return false;
    return this.walk[z * GW + x] === 1;
  }

  roomAt(x: number, z: number): RoomId | null {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return null;
    return this.roomGrid[cz * GW + cx];
  }

  computePropBlock() {
    for (let x = 0; x < GW; x++)
      for (let z = 0; z < GH; z++) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        for (const c of this.colliders) {
          if (cx > c.minX - 0.25 && cx < c.maxX + 0.25 && cz > c.minZ - 0.25 && cz < c.maxZ + 0.25) {
            this.propBlock[z * GW + x] = 1;
            break;
          }
        }
      }
    // elevator car is off-limits to the monster
    for (let x = 29; x < 31; x++) for (let z = 62; z < 65; z++) this.propBlock[z * GW + x] = 1;
  }

  doorAtCell(x: number, z: number) {
    for (const d of this.doors) for (const c of d.cells) if (c[0] === x && c[1] === z) return d;
    return null;
  }

  isLocked(d: Door, inv: { keycard: boolean; power: boolean }) {
    if (d.lock === "keycard") return !inv.keycard;
    if (d.lock === "power") return !inv.power;
    return false;
  }

  /** Line-of-sight test through walls, closed doors and tall props. */
  losClear(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (!this.isWalk(Math.floor(x), Math.floor(z))) return false;
      for (const d of this.doors) {
        if (d.open > 0.6) continue;
        const c = d.collider;
        if (x > c.minX && x < c.maxX && z > c.minZ - 0.05 && z < c.maxZ + 0.05) return false;
      }
      for (const o of this.opaque) if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return false;
    }
    return true;
  }

  randomPoint(room: RoomId) {
    const pts = this.patrol[room]!;
    return pts[Math.floor(Math.random() * pts.length)];
  }

  // ---------- state ----------
  reset() {
    this.powered = false;
    for (const d of this.doors) {
      d.open = 0;
      d.target = 0;
      if (d.led) d.led.color.set(0xc8231a);
    }
    for (const h of this.hideSpots) {
      h.doorOpen = 0;
      h.doorTarget = 0;
      h.checkedAt = -99;
    }
    for (const it of this.items) {
      it.taken = false;
      it.group.visible = true;
      it.group.position.copy(it.base);
      it.group.scale.setScalar(1);
    }
    this.panelFuses.forEach((f) => (f.visible = false));
    this.panelLed.color.set(0xc8231a);
    this.elevLed.color.set(0xc8231a);
    this.elevOpen = 0;
    this.elevTarget = 0;
    this.carLight.color.set(0x1a1a1a);
    this.carLamp.intensity = 0;
    for (const l of this.lights) {
      l.light.color.copy(l.color);
      l.fixture?.color.copy(l.color);
    }
  }

  setPowered() {
    this.powered = true;
    this.panelLed.color.set(0x3ac84a);
    this.elevLed.color.set(0x3ac84a);
    for (const d of this.doors) if (d.lock === "power" && d.led) d.led.color.set(0x3ac84a);
    this.carLight.color.set(0xf0e8d0);
    this.carLamp.intensity = 4;
    for (const l of this.lights) {
      l.light.color.copy(l.pcolor);
      l.fixture?.color.copy(l.pcolor);
    }
  }

  update(t: number, dt: number) {
    this.frame++;
    // lights
    for (const l of this.lights) {
      const target = (this.powered ? l.powered : l.base) * this.dimmer;
      let k = 1;
      const p = t + l.phase;
      switch (l.mode) {
        case "flicker":
          k = Math.random() < (this.powered ? 0.005 : 0.03) ? 0.1 + Math.random() * 0.5 : 0.92 + Math.sin(p * 13) * 0.05;
          break;
        case "broken":
          k = Math.sin(p * 0.7) > 0.6 && !this.powered ? (Math.random() < 0.4 ? 0 : 1) : Math.random() < 0.06 ? 0.2 : 1;
          break;
        case "pulse":
          k = this.powered ? 1 : 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(p * 2.2), 2);
          break;
        case "beacon":
          k = this.powered ? 0.9 : 0.25 + 0.75 * Math.max(0, Math.sin(p * 4));
          break;
        case "sway":
          k = 0.9 + Math.random() * 0.1;
          break;
      }
      l.cur += (target * k - l.cur) * Math.min(1, dt * 30);
      l.light.intensity = l.cur;
      if (l.fixture) {
        const f = Math.min(1, Math.max(0.08, l.cur / Math.max(1, target)));
        l.fixture.color.copy(this.powered ? l.pcolor : l.color).multiplyScalar(f);
      }
    }
    // hanging lamp sway
    if (this.lamp) {
      const a = Math.sin(t * 0.9) * 0.18;
      const b = Math.cos(t * 0.63) * 0.12;
      this.lamp.rotation.set(b, 0, a);
      this.lampLight.position.set(13.2 + Math.sin(a) * 0.8, 2.2, 29 - Math.sin(b) * 0.8);
    }
    if (this.beacon) this.beacon.rotation.y = t * (this.powered ? 1 : 4);
    // monitors
    if (this.frame % 3 === 0) for (const m of this.flickerMats) m.color.setRGB(0.15, 0.25, 0.2).multiplyScalar(Math.random() < 0.1 ? 0.2 : 0.8 + Math.random() * 0.5);
    if (this.frame % 6 === 0) this.screens.forEach((s, i) => s.draw(Math.floor(this.frame / 6) + i));
    const blink = Math.floor(t * 1.2) % 2 === 0;
    for (const l of this.leds) l.color.setHex(blink ? 0xff2a1a : 0x220806);
    // doors
    for (const d of this.doors) {
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * (d.heavy ? 0.9 : 1.6));
      const e = d.open * d.open * (3 - 2 * d.open);
      for (const pv of d.pivots) {
        const side = pv.userData.side as number;
        let th: number;
        if (d.axis === "z") th = (d.swing === -1 ? 1 : -1) * (Math.PI / 2) * e;
        else th = (d.swing === 1 ? 1 : -1) * (Math.PI / 2) * e;
        pv.rotation.y = side === 0 ? th : -th;
      }
    }
    for (const h of this.hideSpots) {
      h.doorOpen += Math.sign(h.doorTarget - h.doorOpen) * Math.min(Math.abs(h.doorTarget - h.doorOpen), dt * 3);
      h.pivot.rotation.y = h.openSign * h.doorOpen * 1.7;
    }
    // items bob
    for (const it of this.items) {
      if (it.taken) continue;
      it.group.position.y = it.base.y + Math.sin(t * 2 + it.base.x) * 0.02;
      it.group.rotation.y = t * 0.8;
    }
    // elevator doors
    this.elevOpen += Math.sign(this.elevTarget - this.elevOpen) * Math.min(Math.abs(this.elevTarget - this.elevOpen), dt * 0.7);
    this.elevDoors[0].position.x = 29.5 - this.elevOpen * 0.95;
    this.elevDoors[1].position.x = 30.5 + this.elevOpen * 0.95;
  }
}
