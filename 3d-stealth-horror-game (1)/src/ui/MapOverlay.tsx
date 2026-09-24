import { useEffect, useRef } from "react";
import { RECTS, ROOM_NAMES, type RoomId } from "../game/level";
import type { Snapshot } from "../game/game";

const LABELS: { room: RoomId; x: number; z: number }[] = [
  { room: "lab", x: 30, z: 12 },
  { room: "reception", x: 30, z: 29 },
  { room: "storage", x: 13.5, z: 29 },
  { room: "security", x: 47, z: 28 },
  { room: "maintenance", x: 30.5, z: 41 },
  { room: "elevator", x: 30, z: 57 },
];

export default function MapOverlay({ snap }: { snap: Snapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const S = 7;
    const ox = 6;
    const oz = 4;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(14,13,11,0.92)";
    ctx.fillRect(0, 0, W, H);
    const tx = (x: number) => (x - ox) * S;
    const tz = (z: number) => (z - oz) * S;
    const explored = new Set(snap.explored);
    const cur = RECTS.find((r) => snap.px >= r.x0 && snap.px < r.x1 && snap.pz >= r.z0 && snap.pz < r.z1)?.room;
    for (const r of RECTS) {
      const known = explored.has(r.room) || r.room === "corridor";
      ctx.fillStyle = r.room === cur ? "rgba(192,138,62,0.22)" : known ? "rgba(200,192,176,0.10)" : "rgba(200,192,176,0.03)";
      ctx.fillRect(tx(r.x0), tz(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    }
    ctx.strokeStyle = "rgba(217,212,199,0.55)";
    ctx.lineWidth = 1.5;
    for (const r of RECTS) {
      if (!explored.has(r.room) && r.room !== "corridor") ctx.setLineDash([3, 4]);
      else ctx.setLineDash([]);
      ctx.strokeRect(tx(r.x0) + 0.5, tz(r.z0) + 0.5, (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    }
    ctx.setLineDash([]);
    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "center";
    for (const l of LABELS) {
      ctx.fillStyle = explored.has(l.room) ? "rgba(217,212,199,0.9)" : "rgba(217,212,199,0.35)";
      const name = ROOM_NAMES[l.room].toUpperCase();
      const parts = name.split(" ");
      parts.forEach((p, i) => ctx.fillText(explored.has(l.room) ? p : "?".repeat(Math.min(4, p.length)), tx(l.x), tz(l.z) + i * 11 - (parts.length - 1) * 5));
    }
    // player
    const px = tx(snap.px);
    const pz = tz(snap.pz);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-snap.pyaw);
    ctx.fillStyle = "#c08a3e";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [snap]);

  return (
    <div className="pointer-events-none absolute right-4 top-16 z-20 border border-[rgba(217,212,199,0.25)] bg-black/60 p-2">
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.3em] text-[var(--dim)]">
        <span>THE ARCHIVE — B4</span>
        <span>[M]</span>
      </div>
      <canvas ref={ref} width={340} height={440} className="h-[min(56vh,440px)] w-auto" />
    </div>
  );
}
