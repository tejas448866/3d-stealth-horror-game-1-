import { zipSync, strToU8 } from "fflate";
import pkg from "../package.json?raw";
import indexHtml from "../index.html?raw";
import viteConfig from "../vite.config.ts?raw";
import tsconfig from "../tsconfig.json?raw";

// Every source file under src/, bundled as raw text at build time.
const srcFiles = import.meta.glob("./**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const README = `# Echoes of the Last Player

A first-person stealth-horror browser game built with React, Vite, Tailwind CSS and Three.js.
All geometry, textures and audio are generated procedurally in code — no external assets.

## Run locally

    npm install
    npm run dev

Then open the printed local URL. Build a single-file production version with:

    npm run build

The output is dist/index.html (fully self-contained).

## Controls

WASD move · Mouse look · Shift run · E interact / hide · F flashlight
Q throw distraction · M map · Esc pause · Tab developer panel
Touch devices get a virtual joystick and on-screen buttons.

## Project structure

src/game/game.ts      Core engine: renderer, player, interactions, particles, sequences, scoring
src/game/monster.ts   The Archivist AI: A* pathfinding, perception, state machine, adaptive search
src/game/memory.ts    Persistent learned memory (survives retries, stored in localStorage)
src/game/level.ts     Facility construction: rooms, doors, props, lockers, lights, items
src/game/textures.ts  Procedural canvas textures
src/game/audio.ts     Procedural WebAudio sound design
src/ui/*.tsx          HUD, screens, map, developer panel, touch controls
src/App.tsx           Wires the game engine to the React UI

## Persistent data (browser localStorage)

archive_memory_v1   The Archivist's learned behaviour
archive_scores_v1   Local high-score table
`;

export function buildSourceZip(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "echoes-of-the-last-player/README.md": strToU8(README),
    "echoes-of-the-last-player/package.json": strToU8(pkg),
    "echoes-of-the-last-player/index.html": strToU8(indexHtml),
    "echoes-of-the-last-player/vite.config.ts": strToU8(viteConfig),
    "echoes-of-the-last-player/tsconfig.json": strToU8(tsconfig),
    "echoes-of-the-last-player/.gitignore": strToU8("node_modules\ndist\n"),
  };
  for (const [path, content] of Object.entries(srcFiles)) {
    files[`echoes-of-the-last-player/src/${path.replace(/^\.\//, "")}`] = strToU8(content);
  }
  return zipSync(files, { level: 6 });
}

export function downloadSourceZip() {
  const data = buildSourceZip();
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "echoes-of-the-last-player-source.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const SOURCE_FILE_COUNT = Object.keys(srcFiles).length + 6;
