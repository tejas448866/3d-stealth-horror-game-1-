import type { GameMessage, Snapshot } from "../game/game";

function Obj({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={done ? "tick text-[var(--dim)]" : ""}>
      <span className={done ? "text-[var(--amber)]" : "text-[var(--dim)]"}>{done ? "[x]" : "[ ]"}</span>{" "}
      <span className={done ? "line-through decoration-[rgba(192,138,62,0.6)]" : ""}>{label}</span>
    </div>
  );
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Hud({ snap, messages, showHints }: { snap: Snapshot; messages: GameMessage[]; showHints: boolean }) {
  const big = messages.filter((m) => m.kind === "big").slice(-1)[0];
  const warn = messages.filter((m) => m.kind === "warn" || m.kind === "info").slice(-2);
  const scores = messages.filter((m) => m.kind === "score").slice(-4);
  const room = messages.filter((m) => m.kind === "room").slice(-1)[0];
  const o = snap.obj;
  const danger = snap.danger;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* danger vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: Math.min(1, danger * 1.1),
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(90,8,4,0.55) 85%, rgba(40,0,0,0.9) 100%)",
        }}
      />
      {snap.chase && <div className="pulse-red absolute inset-0 shadow-[inset_0_0_140px_rgba(150,20,10,0.8)]" />}

      {/* hiding overlay */}
      {snap.hidden && (
        <>
          <div className="absolute inset-0 bg-black/55" />
          <div className="locker-slits absolute inset-0" />
          <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,1)]" />
          <div className="absolute left-1/2 top-[18%] -translate-x-1/2 text-[11px] tracking-[0.4em] text-[var(--dim)]">HIDING — {snap.hidden.toUpperCase()}</div>
        </>
      )}

      {/* objectives */}
      <div className="absolute left-4 top-4 text-[12px] leading-[1.55] text-[var(--ink)] [text-shadow:0_1px_2px_#000]">
        <div className="mb-1 text-[10px] tracking-[0.35em] text-[var(--dim)]">OBJECTIVES</div>
        <Obj done={o.fuse1} label="Fuse 1" />
        <Obj done={o.fuse2} label="Fuse 2" />
        <Obj done={o.keycard} label="Security Keycard" />
        <Obj done={o.power} label="Restore Power" />
        <Obj done={o.elevator} label="Reach Elevator" />
      </div>

      {/* score / attempt */}
      <div className="absolute right-4 top-4 text-right text-[12px] [text-shadow:0_1px_2px_#000]">
        <div className="text-[10px] tracking-[0.35em] text-[var(--dim)]">ATTEMPT {snap.attempt}</div>
        <div className="text-lg tabular-nums tracking-widest">{snap.score.toString().padStart(6, "0")}</div>
        <div className="text-[10px] text-[var(--dim)] tabular-nums">{fmt(snap.time)}</div>
        <div className="mt-1 flex flex-col items-end gap-0.5">
          {scores.map((m) => (
            <div key={m.id} className="toast text-[11px] text-[var(--amber)]">
              {m.text}
            </div>
          ))}
        </div>
      </div>

      {/* crosshair */}
      {!snap.hidden && <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(217,212,199,0.6)]" />}

      {/* room title */}
      {room && (
        <div key={room.id} className="toast absolute left-1/2 top-[14%] -translate-x-1/2 text-center">
          <div className="text-[10px] tracking-[0.6em] text-[var(--dim)]">SUBLEVEL 4</div>
          <div className="mt-1 text-xl tracking-[0.45em] text-[var(--ink)] [text-shadow:0_0_12px_#000]">{room.text.toUpperCase()}</div>
        </div>
      )}

      {/* big message */}
      {big && (
        <div key={big.id} className="toast absolute left-1/2 top-[30%] w-[min(90vw,720px)] -translate-x-1/2 text-center text-[15px] leading-relaxed tracking-[0.25em] text-[var(--ink)] [text-shadow:0_0_14px_#000,0_0_4px_#000]">
          {big.text}
        </div>
      )}

      {/* warnings */}
      <div className="absolute left-1/2 top-[40%] flex w-[min(90vw,640px)] -translate-x-1/2 flex-col items-center gap-1">
        {warn.map((m) => (
          <div key={m.id} className={`toast text-center text-[13px] tracking-[0.18em] [text-shadow:0_0_8px_#000] ${m.kind === "warn" ? "text-[#d0584c]" : "text-[var(--ink)]"}`}>
            {m.text}
          </div>
        ))}
      </div>

      {/* prompt */}
      {snap.prompt && (
        <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 border border-[rgba(217,212,199,0.3)] bg-black/60 px-4 py-1.5 text-[13px] tracking-[0.2em] text-[var(--ink)]">
          {snap.touch ? snap.prompt.replace("[E]", "[USE]") : snap.prompt}
        </div>
      )}

      {/* bottom-left status */}
      <div className={`absolute left-4 text-[10px] tracking-[0.25em] text-[var(--dim)] ${snap.touch ? "top-40" : "bottom-4"}`}>
        <div className="flex items-center gap-2">
          <span className="w-14">LIGHT</span>
          <div className="h-[3px] w-24 bg-white/10">
            <div className="h-full" style={{ width: `${snap.battery}%`, background: snap.battery < 20 ? "#a3322a" : snap.flashlight ? "#d9d4c7" : "#5a574f" }} />
          </div>
          <span>{snap.flashlight ? "ON" : "OFF"}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="w-14">BREATH</span>
          <div className="h-[3px] w-24 bg-white/10">
            <div className="h-full bg-[var(--amber)]" style={{ width: `${snap.stamina}%`, opacity: snap.stamina < 99 ? 1 : 0.4 }} />
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="w-14">NOISE</span>
          <div className="flex gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[6px] w-[6px]" style={{ background: snap.noise > i * 18 + 4 ? (i > 2 ? "#a3322a" : "#d9d4c7") : "rgba(255,255,255,0.1)" }} />
            ))}
          </div>
        </div>
        <div className="mt-1.5">THROWABLES {snap.throws} {snap.touch ? "" : "[Q]"}</div>
      </div>

      {/* control hints */}
      {showHints && !snap.touch && (
        <div className="fade-slow absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap border border-white/15 bg-black/60 px-5 py-2 text-[11px] tracking-[0.2em] text-[var(--ink)]">
          <b>WASD</b> Move &nbsp;·&nbsp; <b>Mouse</b> Look &nbsp;·&nbsp; <b>E</b> Interact &nbsp;·&nbsp; <b>F</b> Flashlight &nbsp;·&nbsp; <b>Shift</b> Run &nbsp;·&nbsp; <b>Q</b> Throw &nbsp;·&nbsp; <b>M</b> Map &nbsp;·&nbsp; <b>Tab</b> Developer Panel
        </div>
      )}
      {showHints && snap.touch && (
        <div className="fade-slow absolute bottom-40 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/60 px-3 py-1.5 text-[10px] tracking-[0.15em]">
          Left: move · Right: look · Buttons: use / run / light / throw
        </div>
      )}

      {/* fade to black */}
      <div className="absolute inset-0 bg-black" style={{ opacity: snap.fade }} />
    </div>
  );
}
