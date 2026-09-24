import type { Snapshot } from "../game/game";

const stateColor: Record<string, string> = {
  PATROL: "#8a857a",
  INVESTIGATE: "#c08a3e",
  SUSPICIOUS: "#d8a24a",
  CHASE: "#d0443a",
  SEARCH: "#b8703a",
};

function Row({ k, v, c }: { k: string; v: string | number; c?: string }) {
  return (
    <div className="flex gap-3 leading-5">
      <span className="w-40 shrink-0 text-[var(--dim)]">{k}</span>
      <span style={{ color: c }} className="break-words">
        {v}
      </span>
    </div>
  );
}

export default function DevPanel({ snap, onReset }: { snap: Snapshot; onReset: () => void }) {
  const d = snap.dev;
  const lvl = (s: string) => (s.startsWith("HIGH") ? "#d0443a" : s.startsWith("MEDIUM") ? "#d8a24a" : "#8a857a");
  return (
    <div className="absolute left-4 top-44 z-30 w-[400px] max-w-[calc(100vw-2rem)] border border-[rgba(163,50,42,0.6)] bg-black/85 p-3 text-[11px] text-[var(--ink)]">
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1 tracking-[0.25em]">
        <span>DEVELOPER — ARCHIVIST AI</span>
        <span className="text-[var(--dim)]">[TAB]</span>
      </div>
      <Row k="ENEMY STATE" v={d.state} c={stateColor[d.state]} />
      <Row k="CURRENT TARGET" v={d.target} />
      <Row k="SUSPICION" v={`${d.suspicion}`} c={d.suspicion > 60 ? "#d0443a" : undefined} />
      <div className="my-1 h-1 w-full bg-white/10">
        <div className="h-full" style={{ width: `${d.suspicion}%`, background: stateColor[d.state] }} />
      </div>
      <Row k="PLAYER NOISE" v={d.noise} />
      <Row k="PLAYER ROOM" v={d.room} />
      <Row k="ARCHIVIST ROOM" v={d.monsterRoom} />
      <Row k="LAST EVENT" v={d.lastEvent} />
      <Row k="CURRENT PATH" v={d.path} />
      <div className="my-2 border-t border-white/10" />
      <Row k="LOCKER A MEMORY" v={d.lockerA} c={lvl(d.lockerA)} />
      <Row k="LOCKER B MEMORY" v={d.lockerB} c={lvl(d.lockerB)} />
      <Row k="CLOSET MEMORY" v={d.closet} c={lvl(d.closet)} />
      <Row k="DISTRACTIONS FOOLED" v={d.distractions} />
      <Row k="FREQUENT ROOMS" v={d.weights || "—"} />
      <Row k="RECENT ROUTE" v={d.route} />
      <Row k="ATTEMPT" v={d.attempts} />
      <div className="mt-2 text-[var(--dim)]">RECENT ACTIVITY</div>
      {d.activity.map((a, i) => (
        <div key={i} className="truncate leading-5" style={{ opacity: 1 - i * 0.13 }}>
          · {a}
        </div>
      ))}
      <button className="mt-2 border border-white/20 px-2 py-1 text-[10px] tracking-[0.2em] text-[var(--dim)] hover:text-white" onClick={onReset}>
        ERASE AI MEMORY
      </button>
    </div>
  );
}
