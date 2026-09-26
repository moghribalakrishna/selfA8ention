import * as THREE from "three";

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Overshoot ease for playful "pop" entrances. */
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "∞";
  const r = Math.abs(v) < 10 && Math.abs(v - Math.round(v)) > 0.05 ? v.toFixed(1) : String(Math.round(v));
  return r;
}

/** A camera-facing text label rendered to a canvas texture. */
export function makeTextSprite(
  text: string,
  opts: { size?: number; color?: string; bg?: string; font?: string; weight?: number } = {},
): THREE.Sprite {
  const size = opts.size ?? 0.6;
  const canvas = document.createElement("canvas");
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }),
  );
  sprite.renderOrder = 10;
  (sprite.userData as any).canvas = canvas;
  (sprite.userData as any).opts = { ...opts, size };
  setSpriteText(sprite, text);
  return sprite;
}

export function setSpriteText(sprite: THREE.Sprite, text: string) {
  const ud = sprite.userData as any;
  if (ud.text === text) return;
  ud.text = text;
  const { size, color = "#fff", bg, font = "Inter", weight = 800 } = ud.opts;
  const canvas: HTMLCanvasElement = ud.canvas;
  const ctx = canvas.getContext("2d")!;
  const px = 96;
  ctx.font = `${weight} ${px}px ${font}`;
  const w = Math.ceil(ctx.measureText(text).width) + (bg ? 72 : 24);
  const h = px + (bg ? 48 : 24);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${weight} ${px}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (bg) {
    ctx.fillStyle = bg;
    const r = h / 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  } else {
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.strokeText(text, w / 2, h / 2 + 4);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
  sprite.scale.set((size * w) / h, size, 1);
}

/** Classic board-game meeple silhouette, extruded. Height ≈ 1. */
export function meepleGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.42, 0);
  s.lineTo(-0.16, 0.02);
  s.quadraticCurveTo(0, 0.28, 0.16, 0.02);
  s.lineTo(0.42, 0);
  s.quadraticCurveTo(0.3, 0.3, 0.2, 0.46);
  s.quadraticCurveTo(0.5, 0.5, 0.48, 0.62);
  s.quadraticCurveTo(0.42, 0.7, 0.14, 0.66);
  s.quadraticCurveTo(0.24, 0.98, 0, 1.0);
  s.quadraticCurveTo(-0.24, 0.98, -0.14, 0.66);
  s.quadraticCurveTo(-0.42, 0.7, -0.48, 0.62);
  s.quadraticCurveTo(-0.5, 0.5, -0.2, 0.46);
  s.quadraticCurveTo(-0.3, 0.3, -0.42, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.26, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10,
  });
  g.translate(0, 0, -0.13);
  return g;
}

export function starGeometry(points = 5, outer = 0.5, inner = 0.22): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
  g.translate(0, 0, -0.06);
  return g;
}

export function toonMaterial(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: false, ...extra });
}
