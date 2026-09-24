import { useRef, useState } from "react";
import type { Game } from "../game/game";

export default function TouchControls({ game, onMap, onDev }: { game: Game; onMap: () => void; onDev: () => void }) {
  const moveId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const lastLook = useRef({ x: 0, y: 0 });
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [run, setRun] = useState(false);

  const down = (e: React.PointerEvent) => {
    const w = window.innerWidth;
    if (e.clientX < w * 0.45 && moveId.current === null) {
      moveId.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY };
      setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    } else if (lookId.current === null) {
      lookId.current = e.pointerId;
      lastLook.current = { x: e.clientX, y: e.clientY };
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (e.pointerId === moveId.current) {
      let dx = e.clientX - origin.current.x;
      let dy = e.clientY - origin.current.y;
      const l = Math.hypot(dx, dy);
      const R = 55;
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      setStick({ x: origin.current.x, y: origin.current.y, dx, dy });
      game.setTouchMove(dx / R, -dy / R);
    } else if (e.pointerId === lookId.current) {
      const dx = e.clientX - lastLook.current.x;
      const dy = e.clientY - lastLook.current.y;
      lastLook.current = { x: e.clientX, y: e.clientY };
      game.look(dx, dy, 0.0055);
    }
  };
  const up = (e: React.PointerEvent) => {
    if (e.pointerId === moveId.current) {
      moveId.current = null;
      setStick(null);
      game.setTouchMove(0, 0);
    }
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  const Btn = ({ label, onDown, onUp, big, active }: { label: string; onDown: () => void; onUp?: () => void; big?: boolean; active?: boolean }) => (
    <button
      className={`flex items-center justify-center rounded-full border text-[11px] tracking-[0.15em] ${big ? "h-20 w-20" : "h-14 w-14"} ${active ? "border-[var(--amber)] bg-[rgba(192,138,62,0.25)]" : "border-white/25 bg-black/40"} active:bg-white/20`}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDown();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onUp?.();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-20" style={{ touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {stick && (
        <div className="pointer-events-none absolute h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" style={{ left: stick.x, top: stick.y }}>
          <div className="absolute left-1/2 top-1/2 h-11 w-11 rounded-full bg-white/25" style={{ transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))` }} />
        </div>
      )}
      {!stick && <div className="pointer-events-none absolute bottom-10 left-10 h-[110px] w-[110px] rounded-full border border-white/10" />}
      <div className="absolute bottom-6 right-5 grid grid-cols-2 gap-3">
        <Btn label="LIGHT" onDown={() => game.toggleFlashlight()} />
        <Btn label="THROW" onDown={() => game.throwObject()} />
        <Btn
          label="RUN"
          active={run}
          onDown={() => {
            const n = !run;
            setRun(n);
            game.setTouchRun(n);
          }}
        />
        <Btn label="USE" big onDown={() => game.interact()} />
      </div>
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-row gap-2">
        <Btn label="MAP" onDown={onMap} />
        <Btn label="II" onDown={() => game.pause()} />
        <Btn label="DEV" onDown={onDev} />
      </div>
    </div>
  );
}
