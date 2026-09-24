// Persistent learned behaviour of The Archivist. Survives retries and page reloads.
export type HideId = "lockerA" | "lockerB" | "closet";

export interface MemoryData {
  attempts: number;
  hide: Record<HideId, number>;
  hideUses: Record<HideId, number>;
  hideFound: Record<HideId, number>;
  rooms: Record<string, number>;
  doors: Record<string, number>;
  noise: Record<string, number>;
  distractions: number; // times fooled by thrown objects
  route: string[]; // recent player room transitions
  activity: string[];
}

const KEY = "archive_memory_v1";

function fresh(): MemoryData {
  return {
    attempts: 0,
    hide: { lockerA: 0, lockerB: 0, closet: 0 },
    hideUses: { lockerA: 0, lockerB: 0, closet: 0 },
    hideFound: { lockerA: 0, lockerB: 0, closet: 0 },
    rooms: {},
    doors: {},
    noise: {},
    distractions: 0,
    route: [],
    activity: [],
  };
}

export class ArchiveMemory {
  d: MemoryData;
  constructor() {
    this.d = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.d = { ...fresh(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* ignore */
    }
  }

  reset() {
    this.d = fresh();
    this.save();
  }

  /** Called at the start of every new attempt: older knowledge fades, but is never erased. */
  newAttempt() {
    const d = this.d;
    d.attempts += 1;
    const decay = (r: Record<string, number>, k: number) => {
      for (const key of Object.keys(r)) r[key] = +(r[key] * k).toFixed(3);
    };
    decay(d.hide, 0.72);
    decay(d.rooms, 0.6);
    decay(d.doors, 0.6);
    decay(d.noise, 0.55);
    d.distractions = +(d.distractions * 0.8).toFixed(2);
    this.log(`Attempt ${d.attempts} began`);
    this.save();
  }

  log(s: string) {
    this.d.activity.unshift(s);
    if (this.d.activity.length > 8) this.d.activity.length = 8;
  }

  hideWeight(id: HideId) {
    return this.d.hide[id] || 0;
  }

  hideLevel(id: HideId) {
    const w = this.hideWeight(id);
    if (w >= 2.2) return "HIGH";
    if (w >= 1.0) return "MEDIUM";
    if (w > 0.15) return "LOW";
    return "NONE";
  }

  addHide(id: HideId, amount: number, reason?: string) {
    this.d.hide[id] = Math.max(0, +(this.d.hide[id] + amount).toFixed(3));
    if (reason) this.log(reason);
    this.save();
  }

  visitRoom(room: string) {
    this.d.rooms[room] = (this.d.rooms[room] || 0) + 1;
    const r = this.d.route;
    if (r[r.length - 1] !== room) {
      r.push(room);
      if (r.length > 10) r.shift();
    }
    this.save();
  }

  useDoor(id: string) {
    this.d.doors[id] = (this.d.doors[id] || 0) + 1;
  }

  addNoise(room: string, amt: number) {
    this.d.noise[room] = +((this.d.noise[room] || 0) + amt).toFixed(2);
  }
}
