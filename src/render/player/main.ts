import * as THREE from "three";
import type { SceneEvent, Storyboard } from "../../schema.js";
import { HUD_KINDS } from "../../schema.js";
import { createWorldEntity, WorldEntity } from "./entities.js";
import { Hud } from "./hud.js";
import { MOODS, Stage } from "./stage.js";
import { computeState, eventDuration } from "./state.js";
import { clamp01 } from "./util.js";

const HUD_SET = new Set<string>(HUD_KINDS);
const MOOD_BLEND = 0.9;
const FADE = 0.28;

class Player {
  private stage!: Stage;
  private hud!: Hud;
  private board!: Storyboard;
  private starts: number[] = [];
  private duration = 0;
  private current = -1;
  private live = new Map<string, WorldEntity>();
  private events: SceneEvent[][] = [];

  async load(board: Storyboard, _opts: { capture?: boolean } = {}): Promise<number> {
    await Promise.all(["800 48px Inter", "700 48px Inter", "600 48px Inter", "400 48px 'DM Serif Display'"].map((f) => document.fonts.load(f)));
    const frame = document.getElementById("frame")!;
    this.stage = new Stage(document.getElementById("stage")!, frame.clientWidth, frame.clientHeight);
    this.hud = new Hud(frame);
    this.board = board;
    let t = 0;
    this.starts = board.scenes.map((s) => { const st = t; t += s.duration; return st; });
    this.duration = t;
    this.events = board.scenes.map((s) => [...s.events].sort((a, b) => a.t - b.t));
    this.renderAt(0);
    return this.duration;
  }

  get length() { return this.duration; }

  private enterScene(i: number) {
    const scene = this.board.scenes[i];
    const next = new Map<string, WorldEntity>();
    for (const decl of scene.entities) {
      if (HUD_SET.has(decl.kind)) continue;
      const key = `${decl.id}:${decl.kind}`;
      const existing = this.live.get(key);
      // Reuse only when the declaration is structurally identical (same geometry inputs).
      if (existing && JSON.stringify({ ...existing.decl, x: 0, z: 0, value: 0 }) === JSON.stringify({ ...decl, x: 0, z: 0, value: 0 })) {
        existing.decl = decl;
        next.set(key, existing);
        this.live.delete(key);
      } else {
        const ent = createWorldEntity(decl, this.board.cast);
        if (!ent) continue;
        this.stage.entitiesRoot.add(ent.root);
        next.set(key, ent);
      }
    }
    for (const ent of this.live.values()) this.stage.entitiesRoot.remove(ent.root);
    this.live = next;
    this.current = i;
  }

  renderAt(t: number) {
    t = Math.max(0, Math.min(t, this.duration - 1e-4));
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i] > t) i--;
    if (i !== this.current) this.enterScene(i);
    const scene = this.board.scenes[i];
    const lt = t - this.starts[i];
    const events = this.events[i];

    // Entities.
    const hudEnts = [];
    let focus = new THREE.Vector3();
    for (const decl of scene.entities) {
      const s = computeState(decl, events, lt);
      if (decl.id === scene.focus) focus = new THREE.Vector3(s.x, 0, s.z);
      if (HUD_SET.has(decl.kind)) { hudEnts.push({ decl, s }); continue; }
      this.live.get(`${decl.id}:${decl.kind}`)?.sync(s, lt);
    }

    // World: mood blend from previous scene, time skips, camera.
    const prevMood = MOODS[(this.board.scenes[i - 1] ?? scene).mood];
    const skip = events.find((e) => e.action === "time_skip" && lt >= e.t && lt < e.t + eventDuration(e));
    const skipP = skip ? clamp01((lt - skip.t) / eventDuration(skip)) : 0;
    this.stage.applyMood(prevMood, MOODS[scene.mood], clamp01(lt / MOOD_BLEND), skipP);
    this.stage.frame(scene.shot, focus, lt / scene.duration, t);

    const first = i === 0, last = i === this.board.scenes.length - 1;
    const fadeIn = clamp01(1 - lt / (first ? 0.6 : FADE));
    const fadeOut = clamp01(1 - (scene.duration - lt) / (last ? 0.8 : FADE));
    this.hud.update(this.board, scene, lt, hudEnts, Math.max(fadeIn, fadeOut) * (first || last ? 1 : 0.85));
    this.stage.render();
  }

  /** Real-time playback for the browser preview. Click to pause, arrow keys to seek. */
  play() {
    let t = 0, last = performance.now(), paused = false;
    const bar = document.createElement("div");
    bar.style.cssText = "position:absolute;top:0;left:0;height:4px;background:#ffd166;z-index:9";
    document.getElementById("frame")!.appendChild(bar);
    addEventListener("click", () => (paused = !paused));
    addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") t = Math.min(this.duration, t + 3);
      if (e.key === "ArrowLeft") t = Math.max(0, t - 3);
      if (e.key === " ") paused = !paused;
    });
    const loop = (now: number) => {
      if (!paused) t += (now - last) / 1000;
      last = now;
      if (t >= this.duration) t = 0;
      this.renderAt(t);
      bar.style.width = `${(t / this.duration) * 100}%`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const player = new Player();
(window as any).__sa8 = {
  load: (b: Storyboard, o?: { capture?: boolean }) => player.load(b, o),
  renderAt: (t: number) => player.renderAt(t),
};

const embedded = (window as any).__SA8_BOARD as Storyboard | undefined;
if (embedded) player.load(embedded).then(() => player.play());

