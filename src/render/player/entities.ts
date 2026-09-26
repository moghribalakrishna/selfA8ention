import * as THREE from "three";
import type { CastMember, Entity } from "../../schema.js";
import type { EntState } from "./state.js";
import {
  clamp01, easeOutBack, formatNumber, hashString, lerp, makeTextSprite, meepleGeometry, rand,
  setSpriteText, starGeometry, toonMaterial,
} from "./util.js";

const GOLD = "#f4c542";
const MEEPLE = meepleGeometry();
const STAR = starGeometry();
const GRAY = new THREE.Color("#8d8f94");

interface MatRecord { mat: THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; opacity: number }; base: THREE.Color | null; baseOpacity: number }

/**
 * A 3D entity on the board. Subclasses build meshes into `body` and map
 * kind-specific state (value/text) in `syncKind`. Generic effects (fade,
 * gray-out, glow, pulse, shatter, lock, level-up) are handled here.
 */
export abstract class WorldEntity {
  readonly root = new THREE.Group();
  protected readonly body = new THREE.Group();
  private mats: MatRecord[] = [];
  private shards: { obj: THREE.Object3D; pos: THREE.Vector3; dir: THREE.Vector3; spin: number }[] = [];
  private lock?: THREE.Group;
  private burst?: { ring: THREE.Mesh; label: THREE.Sprite };
  protected seed: number;
  /** Height above the board where labels / effects sit. */
  protected top = 1.6;

  constructor(public decl: Entity, protected cast?: CastMember) {
    this.seed = hashString(decl.id);
    this.root.add(this.body);
  }

  init() {
    this.build();
    this.collectMaterials();
    return this;
  }

  protected abstract build(): void;
  protected syncKind(_s: EntState, _lt: number): void {}

  /** Call after meshes are added dynamically so tinting covers them. */
  protected collectMaterials() {
    const seen = new Set<THREE.Material>(this.mats.map((m) => m.mat));
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list as any[]) {
        if (seen.has(m)) continue;
        seen.add(m);
        m.transparent = true;
        this.mats.push({ mat: m, base: m.color ? m.color.clone() : null, baseOpacity: m.opacity });
      }
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.shards = this.body.children.map((obj, i) => {
      const a = rand(this.seed + i) * Math.PI * 2;
      return { obj, pos: obj.position.clone(), dir: new THREE.Vector3(Math.cos(a), 0.8 + rand(this.seed + i * 7), Math.sin(a)), spin: rand(i + 3) * 6 - 3 };
    });
  }

  sync(s: EntState, lt: number) {
    this.root.position.set(s.x, s.jump, s.z);
    this.root.visible = s.opacity > 0.01;
    const pulse = 1 + s.pulse * 0.25;
    this.root.scale.setScalar(pulse * lerp(0.6, 1, easeOutBack(clamp01(s.opacity))));

    for (const r of this.mats) {
      if (r.base && r.mat.color) {
        r.mat.color.copy(r.base).lerp(GRAY, s.gray * 0.85).multiplyScalar(1 - s.gray * 0.35);
      }
      if (r.mat.emissive && r.base) r.mat.emissive.copy(r.base).multiplyScalar(s.glow * 0.55 + s.pulse * 0.3);
      r.mat.opacity = r.baseOpacity * s.opacity * (1 - s.shatter);
    }

    for (const sh of this.shards) {
      if (s.shatter > 0) {
        const k = s.shatter;
        sh.obj.position.copy(sh.pos).addScaledVector(sh.dir, k * 3).add(new THREE.Vector3(0, -k * k * 2.5, 0));
        sh.obj.rotation.set(sh.spin * k, sh.spin * k * 0.7, sh.spin * k * 0.3);
      }
    }

    if (s.locked > 0.01) {
      this.lock ??= this.makeLock();
      this.lock.visible = true;
      this.lock.scale.setScalar(easeOutBack(clamp01(s.locked)) * 0.9);
    } else if (this.lock) this.lock.visible = false;

    if (s.levelUp >= 0) {
      this.burst ??= this.makeBurst();
      const p = s.levelUp;
      this.burst.ring.visible = this.burst.label.visible = true;
      this.burst.ring.scale.setScalar(0.3 + p * 2.2);
      (this.burst.ring.material as THREE.MeshBasicMaterial).opacity = 1 - p;
      setSpriteText(this.burst.label, s.levelText);
      this.burst.label.position.y = this.top + 0.6 + p * 1.4;
      (this.burst.label.material as THREE.SpriteMaterial).opacity = p < 0.75 ? 1 : (1 - p) * 4;
    } else if (this.burst) this.burst.ring.visible = this.burst.label.visible = false;

    this.syncKind(s, lt);
  }

  private makeLock() {
    const g = new THREE.Group();
    const bodyM = toonMaterial("#3b3f46", { metalness: 0.5, roughness: 0.35 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.25), bodyM);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 20, Math.PI), toonMaterial("#c9ccd1", { metalness: 0.8, roughness: 0.25 }));
    shackle.position.y = 0.25;
    g.add(box, shackle);
    g.position.set(1.1, this.top * 0.95, 0.4);
    this.root.add(g);
    return g;
  }

  private makeBurst() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const label = makeTextSprite("LEVEL UP", { size: 0.55, color: GOLD });
    this.root.add(ring, label);
    return { ring, label };
  }
}

function labelSprite(text: string, size = 0.42) {
  const s = makeTextSprite(text, { size, color: "#fff", bg: "rgba(20,22,30,0.72)", weight: 700 });
  return s;
}

// ---------------------------------------------------------------------------

class Figure extends WorldEntity {
  private mesh!: THREE.Mesh;
  private name?: THREE.Sprite;
  protected top = 1.4;
  build() {
    const color = this.decl.color ?? this.cast?.color ?? "#e76f51";
    this.mesh = new THREE.Mesh(MEEPLE, toonMaterial(color));
    this.mesh.scale.setScalar(1.15);
    this.body.add(this.mesh);
    const name = this.cast?.name ?? this.decl.label;
    if (name) {
      this.name = makeTextSprite(name, { size: 0.36, color: "#fff", bg: "rgba(20,22,30,0.6)", weight: 700 });
      this.name.position.y = 1.65;
      this.root.add(this.name);
    }
  }
  syncKind(s: EntState, lt: number) {
    const bob = s.walking ? Math.abs(Math.sin(lt * 11)) * 0.18 : Math.sin(lt * 2 + this.seed) * 0.02;
    this.mesh.position.y = bob;
    this.mesh.rotation.set(0, s.heading, (s.walking ? Math.sin(lt * 11) * 0.08 : 0) - s.collapse * (Math.PI / 2));
    this.mesh.position.x = s.collapse * 0.55;
    if (this.name) {
      this.name.position.y = lerp(1.65, 0.9, s.collapse);
      (this.name.material as THREE.SpriteMaterial).opacity = s.opacity * (1 - s.gray * 0.5);
    }
  }
}

class Crowd extends WorldEntity {
  private people: THREE.Mesh[] = [];
  build() {
    const mat = toonMaterial(this.decl.color ?? "#9aa0a8");
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(MEEPLE, mat);
      const ring = Math.floor(Math.sqrt(i));
      const a = rand(this.seed + i) * Math.PI * 2;
      const r = ring * 0.55 + rand(i * 3 + this.seed) * 0.3;
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
      m.scale.setScalar(0.72 + rand(i + 11) * 0.12);
      this.people.push(m);
      this.body.add(m);
    }
  }
  syncKind(s: EntState, lt: number) {
    const n = Math.round(Math.max(0, Math.min(30, s.value)));
    this.people.forEach((m, i) => {
      m.visible = i < n;
      m.position.y = s.walking ? Math.abs(Math.sin(lt * 11 + i)) * 0.12 : 0;
    });
  }
}

/** Segment helper for path / wall / bridge. */
function segment(decl: Entity) {
  const dx = (decl.to_x ?? decl.x) - decl.x;
  const dz = (decl.to_z ?? decl.z - 4) - decl.z;
  const len = Math.max(0.5, Math.hypot(dx, dz));
  return { dx, dz, len, angle: Math.atan2(dx, dz) };
}

class PathEnt extends WorldEntity {
  private tiles: THREE.Mesh[] = [];
  protected top = 0.4;
  build() {
    const { dx, dz, len } = segment(this.decl);
    const n = Math.max(2, Math.round(len / 0.75));
    const mat = toonMaterial(this.decl.color ?? "#e9d8a6");
    const geo = new THREE.BoxGeometry(0.9, 0.08, 0.6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(dx * t, 0.04, dz * t);
      m.rotation.y = Math.atan2(dx, dz) + (rand(this.seed + i) - 0.5) * 0.15;
      this.tiles.push(m);
      this.body.add(m);
    }
    if (this.decl.label) {
      const l = labelSprite(this.decl.label, 0.36);
      l.position.set(dx * 0.15 - 0.9 * Math.sign(dx || 1), 0.5, dz * 0.15);
      this.root.add(l);
    }
  }
  syncKind(s: EntState) {
    const shown = clamp01(s.value) * this.tiles.length;
    this.tiles.forEach((m, i) => {
      const k = clamp01(shown - i);
      m.visible = k > 0;
      m.scale.set(1, 1, Math.max(0.01, k));
    });
  }
}

class Wall extends WorldEntity {
  build() {
    const { dx, dz, len, angle } = segment(this.decl);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, len), toonMaterial(this.decl.color ?? "#b56576"));
    m.position.set(dx / 2, 0.7, dz / 2);
    m.rotation.y = angle;
    this.body.add(m);
  }
}

class Bridge extends WorldEntity {
  private planks: THREE.Mesh[] = [];
  build() {
    const { dx, dz, len, angle } = segment(this.decl);
    const n = Math.max(3, Math.round(len / 0.45));
    const mat = toonMaterial(this.decl.color ?? "#a47148");
    const geo = new THREE.BoxGeometry(1.4, 0.12, 0.34);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(dx * t, 0.35 + Math.sin(t * Math.PI) * 0.35, dz * t);
      m.rotation.y = angle;
      this.planks.push(m);
      this.body.add(m);
    }
  }
  syncKind(s: EntState) {
    const shown = clamp01(s.value) * this.planks.length;
    this.planks.forEach((m, i) => {
      const k = clamp01(shown - i);
      m.visible = k > 0;
      m.scale.setScalar(Math.max(0.01, easeOutBack(k)));
    });
  }
}

class Door extends WorldEntity {
  private pivot = new THREE.Group();
  protected top = 2.6;
  build() {
    const frameM = toonMaterial("#5e548e");
    const post = new THREE.BoxGeometry(0.2, 2.2, 0.3);
    const l = new THREE.Mesh(post, frameM); l.position.set(-0.7, 1.1, 0);
    const r = new THREE.Mesh(post, frameM); r.position.set(0.7, 1.1, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.3), frameM); lintel.position.y = 2.2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 0.1), toonMaterial(this.decl.color ?? "#9f86c0"));
    panel.position.set(0.6, 1.0, 0);
    this.pivot.position.set(-0.6, 0, 0);
    this.pivot.add(panel);
    this.body.add(l, r, lintel, this.pivot);
    if (this.decl.label) {
      const s = labelSprite(this.decl.label, 0.36);
      s.position.y = 2.75;
      this.root.add(s);
    }
  }
  syncKind(s: EntState) {
    this.pivot.rotation.y = -clamp01(s.value) * 1.8;
  }
}

class Tree extends WorldEntity {
  private crown = new THREE.Group();
  build() {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 8), toonMaterial("#7f5539"));
    trunk.position.y = 0.4;
    const leaf = toonMaterial(this.decl.color ?? "#52b788", { flatShading: true });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.75 - i * 0.18, 0.8, 7), leaf);
      c.position.y = 0.9 + i * 0.45;
      this.crown.add(c);
    }
    this.body.add(trunk, this.crown);
  }
  syncKind(s: EntState, lt: number) {
    const g = 0.2 + clamp01(s.value) * 0.9;
    this.body.scale.setScalar(g);
    this.crown.rotation.z = Math.sin(lt * 1.3 + this.seed) * 0.03;
  }
}

class CoinPile extends WorldEntity {
  private coins: THREE.Mesh[] = [];
  private label!: THREE.Sprite;
  build() {
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 0.09, 20);
    const mat = toonMaterial(this.decl.color ?? GOLD, { metalness: 0.6, roughness: 0.3 });
    const cols = [[0, 0], [0.6, 0.05], [-0.58, 0.08], [0.3, 0.52], [-0.3, 0.5], [0.3, -0.5]];
    for (let i = 0; i < 60; i++) {
      const c = cols[i % cols.length];
      const layer = Math.floor(i / cols.length);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c[0] + (rand(i) - 0.5) * 0.05, 0.05 + layer * 0.1, c[1] + (rand(i + 99) - 0.5) * 0.05);
      m.rotation.y = rand(i + 7);
      this.coins.push(m);
      this.body.add(m);
    }
    this.label = labelSprite("0");
    this.root.add(this.label);
  }
  syncKind(s: EntState) {
    const n = Math.max(0, Math.min(60, s.value <= 60 ? s.value : 60));
    this.coins.forEach((m, i) => {
      const k = clamp01(n - i);
      m.visible = k > 0;
      m.scale.setScalar(Math.max(0.01, easeOutBack(k)));
    });
    const layers = Math.ceil(Math.ceil(n) / 6);
    this.label.position.y = 0.5 + layers * 0.1;
    setSpriteText(this.label, this.decl.label ? `${this.decl.label} ${formatNumber(s.value)}` : formatNumber(s.value));
  }
}

class BlockStack extends WorldEntity {
  private blocks: THREE.Mesh[] = [];
  private label?: THREE.Sprite;
  build() {
    const geo = new THREE.BoxGeometry(0.62, 0.42, 0.62);
    const base = new THREE.Color(this.decl.color ?? "#4cc9f0");
    const offsets = [[0, 0], [0.66, 0], [0, 0.66], [0.66, 0.66]];
    for (let i = 0; i < 48; i++) {
      const col = Math.floor(i / 12);
      const row = i % 12;
      const c = base.clone().offsetHSL(0, 0, (rand(i + this.seed) - 0.5) * 0.12);
      const m = new THREE.Mesh(geo, toonMaterial(c));
      m.position.set(offsets[col][0] - 0.33 * (col > 0 ? 1 : 0), 0.21 + row * 0.44, offsets[col][1] - 0.33 * (col > 1 ? 1 : 0));
      m.rotation.y = (rand(i * 5) - 0.5) * 0.12;
      this.blocks.push(m);
      this.body.add(m);
    }
    this.label = labelSprite("0");
    this.root.add(this.label);
  }
  syncKind(s: EntState) {
    const n = Math.max(0, Math.min(48, s.value));
    this.blocks.forEach((m, i) => {
      const k = clamp01(n - i);
      m.visible = k > 0;
      m.scale.setScalar(Math.max(0.01, easeOutBack(k)));
    });
    const h = Math.min(12, Math.ceil(n)) * 0.44;
    this.top = h + 0.3;
    if (this.label) {
      this.label.position.y = h + 0.55;
      setSpriteText(this.label, this.decl.label ? `${this.decl.label} ${formatNumber(s.value)}` : formatNumber(s.value));
    }
  }
}

class Hourglass extends WorldEntity {
  private topSand!: THREE.Mesh;
  private botSand!: THREE.Mesh;
  protected top = 2;
  build() {
    const glass = new THREE.MeshStandardMaterial({ color: "#dff6ff", transparent: true, opacity: 0.35, roughness: 0.1 });
    const frame = toonMaterial("#6d4c41");
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 16, 1, true), glass);
    upper.rotation.x = Math.PI; upper.position.y = 1.3;
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 16, 1, true), glass);
    lower.position.y = 0.5;
    const sand = toonMaterial("#e9c46a");
    this.topSand = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.65, 16), sand);
    this.topSand.rotation.x = Math.PI;
    this.botSand = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.65, 16), sand);
    const capGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16);
    const c1 = new THREE.Mesh(capGeo, frame); c1.position.y = 0.05;
    const c2 = new THREE.Mesh(capGeo, frame); c2.position.y = 1.75;
    this.body.add(upper, lower, this.topSand, this.botSand, c1, c2);
  }
  syncKind(s: EntState) {
    const v = clamp01(s.value);
    this.topSand.scale.setScalar(Math.max(0.01, v));
    this.topSand.position.y = 1.0 + 0.325 * v;
    this.botSand.scale.setScalar(Math.max(0.01, 1 - v));
    this.botSand.position.y = 0.1 + 0.325 * (1 - v);
  }
}

class EnergyBar extends WorldEntity {
  private fill!: THREE.Mesh;
  protected top = 2.9;
  build() {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.36, 0.14), toonMaterial("#1d1f27"));
    frame.position.y = 2.4;
    this.fill = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.24, 0.16), toonMaterial("#57cc99"));
    this.fill.position.y = 2.4;
    this.body.add(frame, this.fill);
    if (this.decl.label) {
      const l = labelSprite(this.decl.label, 0.34);
      l.position.y = 3.25;
      this.root.add(l);
    }
  }
  syncKind(s: EntState) {
    const v = clamp01(s.value);
    this.fill.scale.x = Math.max(0.01, v);
    this.fill.position.x = -0.98 * (1 - v);
    const m = this.fill.material as THREE.MeshStandardMaterial;
    m.color.setHSL(0.33 * v, 0.6, 0.55).lerp(GRAY, s.gray * 0.85);
  }
}

class Badge extends WorldEntity {
  private star!: THREE.Mesh;
  protected top = 2.1;
  build() {
    this.star = new THREE.Mesh(STAR, toonMaterial(this.decl.color ?? GOLD, { metalness: 0.7, roughness: 0.25 }));
    this.star.scale.setScalar(1.3);
    this.star.position.y = 1.4;
    this.body.add(this.star);
    if (this.decl.label) {
      const l = labelSprite(this.decl.label, 0.34);
      l.position.y = 0.45;
      this.root.add(l);
    }
  }
  syncKind(_s: EntState, lt: number) {
    this.star.rotation.y = lt * 1.6;
    this.star.position.y = 1.4 + Math.sin(lt * 2) * 0.1;
  }
}

class Key extends WorldEntity {
  private keyG = new THREE.Group();
  build() {
    const mat = toonMaterial(this.decl.color ?? GOLD, { metalness: 0.7, roughness: 0.25 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 10, 24), mat);
    bow.position.x = -0.5;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), mat);
    shaft.position.x = 0.15;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), mat); t1.position.set(0.45, -0.14, 0);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), mat); t2.position.set(0.3, -0.11, 0);
    this.keyG.add(bow, shaft, t1, t2);
    this.keyG.position.y = 1.2;
    this.body.add(this.keyG);
  }
  syncKind(_s: EntState, lt: number) {
    this.keyG.rotation.y = lt * 1.4;
    this.keyG.position.y = 1.2 + Math.sin(lt * 2.2) * 0.1;
  }
}

class ContractCard extends WorldEntity {
  private canvas = document.createElement("canvas");
  private tex!: THREE.CanvasTexture;
  private drawn = "";
  protected top = 2.2;
  build() {
    this.canvas.width = 640; this.canvas.height = 420;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const paper = toonMaterial("#fdf6e3");
    const face = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.8 });
    const card = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.58, 0.06), [paper, paper, paper, paper, face, paper]);
    card.position.y = 1.3;
    card.rotation.x = -0.18;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.5), toonMaterial("#6c584c"));
    stand.position.y = 0.2;
    this.body.add(card, stand);
  }
  syncKind(s: EntState) {
    const text = s.text || this.decl.label || "Contract";
    if (text === this.drawn) return;
    this.drawn = text;
    const ctx = this.canvas.getContext("2d")!;
    ctx.fillStyle = "#fdf6e3"; ctx.fillRect(0, 0, 640, 420);
    ctx.strokeStyle = "#c9b79c"; ctx.lineWidth = 10; ctx.strokeRect(18, 18, 604, 384);
    ctx.fillStyle = "#8a7a63"; ctx.font = "700 30px Inter"; ctx.textAlign = "center";
    ctx.fillText("CONTRACT", 320, 76);
    ctx.fillStyle = "#2b2d42"; ctx.font = "400 54px 'DM Serif Display'";
    const words = text.split(/\s+/); const lines: string[] = []; let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > 540 && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, 320, 170 + i * 62 - (lines.length - 1) * 20));
    ctx.strokeStyle = "#2b2d42"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(380, 372); ctx.bezierCurveTo(420, 340, 450, 390, 500, 360); ctx.stroke();
    this.tex.needsUpdate = true;
  }
}

class Multiplier extends WorldEntity {
  private label!: THREE.Sprite;
  protected top = 2.4;
  build() {
    this.label = makeTextSprite("×1", { size: 1.1, color: GOLD, weight: 800 });
    this.label.position.y = 2;
    this.root.add(this.label);
  }
  syncKind(s: EntState, lt: number) {
    setSpriteText(this.label, `×${formatNumber(s.value)}`);
    this.label.position.y = 2 + Math.sin(lt * 2.4) * 0.12;
    const m = this.label.material as THREE.SpriteMaterial;
    m.opacity = s.opacity * (1 - s.shatter);
    m.color.setScalar(1 - s.gray * 0.6);
  }
}

const REGISTRY: Record<string, new (d: Entity, c?: CastMember) => WorldEntity> = {
  figure: Figure, crowd: Crowd, path: PathEnt, wall: Wall, bridge: Bridge, door: Door, tree: Tree,
  coin_pile: CoinPile, block_stack: BlockStack, hourglass: Hourglass, energy_bar: EnergyBar,
  badge: Badge, key: Key, contract_card: ContractCard, multiplier: Multiplier,
};

export function createWorldEntity(decl: Entity, cast: CastMember[]): WorldEntity | null {
  const Ctor = REGISTRY[decl.kind];
  if (!Ctor) return null;
  return new Ctor(decl, cast.find((c) => c.id === decl.cast)).init();
}
