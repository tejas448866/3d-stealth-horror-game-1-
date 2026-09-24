import { useEffect, useState } from "react";
import type { ScoreEntry, Snapshot } from "../game/game";
import { downloadSourceZip, SOURCE_FILE_COUNT } from "../sourceZip";

export function DownloadSourceButton({ className = "" }: { className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`btn ${className}`}
      onClick={() => {
        downloadSourceZip();
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }}
      title={`Download all ${SOURCE_FILE_COUNT} source files as a .zip`}
    >
      {done ? "ZIP DOWNLOADED" : "DOWNLOAD SOURCE (.ZIP)"}
    </button>
  );
}

function fmt(t: number) {
  return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
}

export function ScoreTable({ scores, highlight }: { scores: ScoreEntry[]; highlight?: ScoreEntry | null }) {
  if (!scores.length) return <div className="text-[11px] tracking-[0.2em] text-[var(--dim)]">No records yet. The Archive is waiting.</div>;
  return (
    <table className="w-full text-[11px] tracking-[0.12em]">
      <thead>
        <tr className="text-left text-[var(--dim)]">
          <th className="pb-1 font-normal">#</th>
          <th className="pb-1 font-normal">SCORE</th>
          <th className="pb-1 font-normal">RESULT</th>
          <th className="pb-1 font-normal">TIME</th>
          <th className="pb-1 font-normal">TRY</th>
        </tr>
      </thead>
      <tbody>
        {scores.slice(0, 6).map((s, i) => {
          const hl = highlight && s.score === highlight.score && s.time === highlight.time && s.attempt === highlight.attempt;
          return (
            <tr key={i} className={hl ? "text-[var(--amber)]" : ""}>
              <td className="py-0.5">{i + 1}</td>
              <td className="tabular-nums">{s.score.toString().padStart(6, "0")}</td>
              <td className={s.result === "ESCAPED" ? "" : "text-[#a3584c]"}>{s.result}</td>
              <td className="tabular-nums">{fmt(s.time)}</td>
              <td>{s.attempt}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function TitleScreen({ onStart, scores, attempts, onReset, touch }: { onStart: () => void; scores: ScoreEntry[]; attempts: number; onReset: () => void; touch: boolean }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[linear-gradient(180deg,rgba(0,0,0,0.55),rgba(0,0,0,0.8))] p-6">
      <div className="flicker-in w-full max-w-[760px]">
        <div className="text-[11px] tracking-[0.6em] text-[var(--dim)]">SUBLEVEL 4 · THE ARCHIVE</div>
        <h1 className="mt-3 text-[clamp(28px,6vw,58px)] font-bold leading-[1.05] tracking-[0.12em] text-[var(--ink)] [text-shadow:0_0_30px_rgba(0,0,0,0.9)]">
          ECHOES OF THE
          <br />
          LAST PLAYER
        </h1>
        <div className="mt-3 h-px w-40 bg-[var(--red)]" />
        <p className="mt-4 max-w-[520px] text-[13px] leading-relaxed text-[var(--ink)]/80">
          You are the last one left inside. Find two fuses and the security keycard, restore power, and reach the surface lift. Something walks these halls — and it pays attention to how you survive.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button className="btn" onClick={onStart} autoFocus>
            ENTER THE ARCHIVE
          </button>
          <DownloadSourceButton />
          {attempts > 0 && (
            <span className="text-[11px] tracking-[0.2em] text-[var(--dim)]">
              {attempts} previous {attempts === 1 ? "visit" : "visits"} recorded.{" "}
              <button className="underline decoration-dotted hover:text-white" onClick={onReset}>
                erase
              </button>
            </span>
          )}
        </div>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="text-[11px] leading-6 tracking-[0.15em]">
            <div className="mb-1 tracking-[0.35em] text-[var(--dim)]">CONTROLS</div>
            {touch ? (
              <>
                <div>Left thumb — move</div>
                <div>Right thumb — look</div>
                <div>USE · RUN · LIGHT · THROW — buttons</div>
                <div>Hide in lockers when you hear it coming</div>
              </>
            ) : (
              <>
                <div><b>WASD</b> move &nbsp; <b>Mouse</b> look &nbsp; <b>Shift</b> run</div>
                <div><b>E</b> interact / hide &nbsp; <b>F</b> flashlight</div>
                <div><b>Q</b> throw distraction &nbsp; <b>M</b> map</div>
                <div><b>Esc</b> pause &nbsp; <b>Tab</b> developer panel</div>
              </>
            )}
            <div className="mt-2 text-[var(--dim)]">Headphones recommended.</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] tracking-[0.35em] text-[var(--dim)]">RECORDS</div>
            <ScoreTable scores={scores} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PauseScreen({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75">
      <div className="flex flex-col items-center gap-3">
        <div className="mb-4 text-2xl tracking-[0.6em]">PAUSED</div>
        <button className="btn w-64" onClick={onResume} autoFocus>
          RESUME
        </button>
        <button className="btn w-64" onClick={onRestart}>
          RESTART ATTEMPT
        </button>
        <button className="btn w-64" onClick={onQuit}>
          QUIT TO TITLE
        </button>
        <DownloadSourceButton className="w-64 !px-2" />
        <div className="mt-3 text-[10px] tracking-[0.25em] text-[var(--dim)]">The Archivist does not forget between attempts.</div>
      </div>
    </div>
  );
}

export function DeadScreen({ snap, onRetry, scores, last }: { snap: Snapshot; onRetry: () => void; scores: ScoreEntry[]; last: ScoreEntry | null }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 p-6">
      <div className="flex w-full max-w-[520px] flex-col items-center text-center">
        <div className="fade-slow text-[clamp(22px,4.5vw,40px)] tracking-[0.3em] text-[var(--ink)]">THE ARCHIVE REMEMBERS.</div>
        <div className="mt-3 h-px w-24 bg-[var(--red)]" />
        <div className="mt-4 text-[11px] tracking-[0.3em] text-[var(--dim)]">
          ATTEMPT {snap.attempt} · SCORE {snap.score.toString().padStart(6, "0")}
        </div>
        <button className="btn mt-8" onClick={onRetry} autoFocus>
          RETRY
        </button>
        <div className="mt-2 text-[10px] tracking-[0.25em] text-[var(--dim)]">{snap.touch ? "" : "PRESS R"}</div>
        <div className="mt-8 w-full max-w-[380px] text-left">
          <ScoreTable scores={scores} highlight={last} />
        </div>
      </div>
    </div>
  );
}

export function WinScreen({ snap, onAgain, scores, last }: { snap: Snapshot; onAgain: () => void; scores: ScoreEntry[]; last: ScoreEntry | null }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStage(1), 1800);
    const b = setTimeout(() => setStage(2), 3200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black p-6">
      <div className="flex w-full max-w-[520px] flex-col items-center text-center">
        <div className="fade-slow text-[clamp(22px,4.5vw,40px)] tracking-[0.3em]">THE ARCHIVE REMEMBERS.</div>
        {stage >= 1 && <div className="fade-slow mt-4 text-[clamp(16px,3vw,24px)] tracking-[0.35em] text-[var(--amber)]">BUT YOU ESCAPED.</div>}
        {stage >= 2 && (
          <div className="flicker-in mt-8 flex w-full flex-col items-center">
            <div className="text-[11px] tracking-[0.3em] text-[var(--dim)]">
              FINAL SCORE <span className="text-[var(--ink)]">{snap.score.toString().padStart(6, "0")}</span> · TIME {fmt(snap.time)} · ATTEMPT {snap.attempt}
            </div>
            <button className="btn mt-6" onClick={onAgain} autoFocus>
              PLAY AGAIN
            </button>
            <div className="mt-8 w-full max-w-[380px] text-left">
              <ScoreTable scores={scores} highlight={last} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
