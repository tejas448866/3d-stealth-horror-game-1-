import * as THREE from "three";

function mk(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function stains(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color = "0,0,0", maxA = 0.25) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 6 + Math.random() * w * 0.35;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${Math.random() * maxA})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

function toTex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** 1m wide x 3m tall wall strip */
export function wallTex(base: string, band: string, dirty = 1) {
  const { c, ctx } = mk(128, 384);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 384);
  stains(ctx, 128, 384, 10 * dirty, "0,0,0", 0.22);
  // drips
  for (let i = 0; i < 6 * dirty; i++) {
    const x = Math.random() * 128;
    const len = 30 + Math.random() * 180;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, "rgba(20,15,10,0.35)");
    g.addColorStop(1, "rgba(20,15,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1 + Math.random() * 2, len);
  }
  // panel seam
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, 2, 384);
  // band
  ctx.fillStyle = band;
  ctx.fillRect(0, 384 - 150, 128, 10);
  // baseboard
  ctx.fillStyle = "rgba(10,10,10,0.8)";
  ctx.fillRect(0, 384 - 18, 128, 18);
  grain(ctx, 128, 384, 26);
  return toTex(c);
}

export function tileTex(base: string, line: string, tiles = 4, dirty = 1) {
  const { c, ctx } = mk(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const s = 256 / tiles;
  for (let i = 0; i < tiles; i++)
    for (let j = 0; j < tiles; j++) {
      const v = (Math.random() - 0.5) * 18;
      ctx.fillStyle = `rgba(${v > 0 ? "255,255,255" : "0,0,0"},${Math.abs(v) / 120})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * s);
    ctx.lineTo(256, i * s);
    ctx.stroke();
  }
  stains(ctx, 256, 256, 12 * dirty, "0,0,0", 0.3);
  // cracks
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 3 * dirty; k++) {
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let n = 0; n < 8; n++) {
      x += (Math.random() - 0.5) * 30;
      y += (Math.random() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, 256, 256, 22);
  return toTex(c);
}

export function concreteTex(base: string, dirty = 1) {
  const { c, ctx } = mk(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  stains(ctx, 256, 256, 22 * dirty, "0,0,0", 0.28);
  stains(ctx, 256, 256, 6, "255,255,255", 0.05);
  grain(ctx, 256, 256, 40);
  return toTex(c);
}

export function gratingTex() {
  const { c, ctx } = mk(128, 128);
  ctx.fillStyle = "#1c1d1e";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#3a3b3c";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(0, i * 16, 128, 5);
    ctx.fillRect(i * 16, 0, 3, 128);
  }
  stains(ctx, 128, 128, 10, "40,20,0", 0.35);
  grain(ctx, 128, 128, 30);
  return toTex(c);
}

export function hazardTex() {
  const { c, ctx } = mk(128, 128);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#8a6a1e";
  for (let i = -4; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 0);
    ctx.lineTo(i * 32 + 16, 0);
    ctx.lineTo(i * 32 + 16 + 128, 128);
    ctx.lineTo(i * 32 + 128, 128);
    ctx.fill();
  }
  stains(ctx, 128, 128, 10, "0,0,0", 0.5);
  grain(ctx, 128, 128, 30);
  return toTex(c);
}

export function metalTex(base: string) {
  const { c, ctx } = mk(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    ctx.fillRect(0, Math.random() * 128, 128, 1);
  }
  stains(ctx, 128, 128, 8, "60,30,10", 0.3);
  grain(ctx, 128, 128, 20);
  return toTex(c);
}

export function lockerTex() {
  const { c, ctx } = mk(128, 256);
  ctx.fillStyle = "#2f3a34";
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = "#101512";
  for (let i = 0; i < 6; i++) ctx.fillRect(34, 22 + i * 9, 60, 4);
  for (let i = 0; i < 6; i++) ctx.fillRect(34, 190 + i * 9, 60, 4);
  ctx.fillStyle = "#888";
  ctx.fillRect(100, 120, 8, 26);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 120, 248);
  stains(ctx, 128, 256, 10, "70,40,10", 0.35);
  grain(ctx, 128, 256, 25);
  return toTex(c);
}

export function labelTex(text: string, fg = "#d9d4c7", bg = "#141414", w = 512, h = 128, sub?: string) {
  const { c, ctx } = mk(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.floor(h * (sub ? 0.36 : 0.46))}px "Courier New", monospace`;
  ctx.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + 2);
  if (sub) {
    ctx.font = `${Math.floor(h * 0.16)}px "Courier New", monospace`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(sub, w / 2, h * 0.75);
    ctx.globalAlpha = 1;
  }
  stains(ctx, w, h, 5, "0,0,0", 0.45);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function paperTex() {
  const { c, ctx } = mk(64, 80);
  ctx.fillStyle = "#b9b3a2";
  ctx.fillRect(0, 0, 64, 80);
  ctx.fillStyle = "rgba(40,40,40,0.55)";
  for (let i = 0; i < 12; i++) ctx.fillRect(8, 10 + i * 5, 20 + Math.random() * 30, 1.5);
  stains(ctx, 64, 80, 4, "90,60,20", 0.3);
  return toTex(c);
}

export function dotTex() {
  const { c, ctx } = mk(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class ScreenTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  t = 0;
  constructor(public w = 128, public h = 96) {
    const { c, ctx } = mk(w, h);
    this.canvas = c;
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0);
  }
  draw(frame: number) {
    const { ctx, w, h } = this;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.floor(i / 4 / w);
      const v = Math.random() * 70 + (y % 3 === 0 ? 0 : 20);
      d[i] = v * 0.7;
      d[i + 1] = v * 0.85;
      d[i + 2] = v * 0.75;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // fake camera silhouettes
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    ctx.fillStyle = "rgba(170,200,170,0.8)";
    ctx.font = "10px monospace";
    ctx.fillText(`CAM 0${(frame % 6) + 1}`, 4, 11);
    ctx.fillText("REC", w - 26, 11);
    if (frame % 2 === 0) {
      ctx.fillStyle = "#a33";
      ctx.beginPath();
      ctx.arc(w - 32, 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, (frame * 7) % h, w, 6);
    this.texture.needsUpdate = true;
  }
}
