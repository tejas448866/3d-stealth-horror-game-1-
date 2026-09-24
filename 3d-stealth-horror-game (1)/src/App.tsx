import { useCallback, useEffect, useRef, useState } from "react";
import { Game, loadScores, type GameMessage, type ScoreEntry, type Snapshot } from "./game/game";
import Hud from "./ui/Hud";
import MapOverlay from "./ui/MapOverlay";
import DevPanel from "./ui/DevPanel";
import TouchControls from "./ui/Touch";
import { DeadScreen, PauseScreen, TitleScreen, WinScreen } from "./ui/Screens";

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [showDev, setShowDev] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [hints, setHints] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [last, setLast] = useState<ScoreEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!mountRef.current) return;
    let g: Game;
    try {
      g = new Game(mountRef.current);
    } catch (e) {
      setError("WebGL is unavailable in this browser. The Archive cannot be rendered.");
      console.error(e);
      return;
    }
    gameRef.current = g;
    g.onSnapshot = (s) => setSnap(s);
    g.onMessage = (m) => {
      setMessages((prev) => [...prev.slice(-12), m]);
      window.setTimeout(() => setMessages((prev) => prev.filter((x) => x.id !== m.id)), m.kind === "big" ? 3600 : 3000);
    };
    g.onToggleDev = () => setShowDev((v) => !v);
    g.onToggleMap = () => setShowMap((v) => !v);
    g.onEnd = (entry) => {
      setLast(entry);
      setScores(loadScores());
    };
    g.emit();
    return () => {
      g.dispose();
      gameRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setMessages([]);
    setLast(null);
    g.start();
    setHints(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHints(false), 10000);
  }, []);

  const mode = snap?.mode ?? "title";
  const g = gameRef.current;
  const inGame = mode === "playing" || mode === "caught" || mode === "escaping";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="grain pointer-events-none absolute inset-[-10%]" />

      {error && <div className="absolute inset-0 z-50 flex items-center justify-center p-8 text-center tracking-[0.2em]">{error}</div>}

      {snap && inGame && <Hud snap={snap} messages={messages} showHints={hints && mode === "playing"} />}
      {snap && mode === "playing" && showMap && <MapOverlay snap={snap} />}
      {snap && showDev && mode !== "title" && g && (
        <DevPanel
          snap={snap}
          onReset={() => {
            g.resetMemory();
          }}
        />
      )}
      {snap && mode === "playing" && snap.touch && g && <TouchControls game={g} onMap={() => setShowMap((v) => !v)} onDev={() => setShowDev((v) => !v)} />}

      {mode === "playing" && snap && !snap.touch && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 text-[10px] tracking-[0.25em] text-[var(--dim)]">{snap.room.toUpperCase()}</div>
      )}

      {mode === "title" && g && (
        <TitleScreen
          onStart={start}
          scores={scores}
          attempts={snap?.attempt ?? 0}
          touch={!!snap?.touch}
          onReset={() => {
            g.resetMemory();
          }}
        />
      )}
      {mode === "paused" && g && <PauseScreen onResume={() => g.resume()} onRestart={start} onQuit={() => g.quitToTitle()} />}
      {mode === "dead" && snap && <DeadScreen snap={snap} onRetry={start} scores={scores} last={last} />}
      {mode === "won" && snap && <WinScreen snap={snap} onAgain={start} scores={scores} last={last} />}
    </div>
  );
}
