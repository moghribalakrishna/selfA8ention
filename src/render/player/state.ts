import type { Entity, SceneEvent } from "../../schema.js";
import { clamp01, easeInOut, easeOut, lerp } from "./util.js";

/** Everything an entity can look like at an instant. Pure data, recomputed every frame. */
export interface EntState {
  x: number;
  z: number;
  heading: number;
  value: number;
  text: string;
  opacity: number;
  gray: number;
  glow: number;
  pulse: number;
  walking: boolean;
  locked: number;
  shatter: number;
  collapse: number;
  jump: number;
  /** -1 when inactive, else progress of the level-up burst in [0, 1]. */
  levelUp: number;
  levelText: string;
}

const DEFAULT_VALUE: Record<string, number> = {
  crowd: 6, path: 1, door: 0, bridge: 1, tree: 1, coin_pile: 10, block_stack: 3,
  hourglass: 1, energy_bar: 1, multiplier: 1, counter: 0, round_marker: 1, timeline: 0,
};

const DEFAULT_OVER: Record<string, number> = {
  walk_to: 2, move_to: 1, grow: 1.5, appear: 0.5, disappear: 0.6, gray_out: 0.8, restore: 0.6,
  glow: 0.6, pulse: 0.8, lock: 0.5, unlock: 0.5, shatter: 1.2, collapse: 0.7, celebrate: 1.2,
  level_up: 1.4, time_skip: 2.5, set: 0,
};

export const eventDuration = (ev: SceneEvent) => ev.over ?? DEFAULT_OVER[ev.action] ?? 1;

export function baseline(decl: Entity, events: SceneEvent[]): EntState {
  const first = events.find((e) => e.target === decl.id && (e.action === "appear" || e.action === "disappear"));
  return {
    x: decl.x,
    z: decl.z,
    heading: 0,
    value: decl.value ?? DEFAULT_VALUE[decl.kind] ?? 0,
    text: decl.text ?? "",
    opacity: first?.action === "appear" ? 0 : 1,
    gray: 0,
    glow: 0,
    pulse: 0,
    walking: false,
    locked: 0,
    shatter: 0,
    collapse: 0,
    jump: 0,
    levelUp: -1,
    levelText: "",
  };
}

/**
 * Applies one event to a state at local scene time `lt`. Events are applied
 * in time order, so the state passed in is the "from" state of the event.
 */
export function applyEvent(s: EntState, ev: SceneEvent, lt: number): void {
  if (lt < ev.t) return;
  const over = eventDuration(ev);
  const raw = over > 0 ? clamp01((lt - ev.t) / over) : 1;
  const p = easeInOut(raw);
  const active = raw > 0 && raw < 1;
  switch (ev.action) {
    case "walk_to":
    case "move_to": {
      const tx = ev.x ?? s.x, tz = ev.z ?? s.z;
      if (active && ev.action === "walk_to") {
        s.walking = true;
        s.heading = Math.max(-0.7, Math.min(0.7, Math.atan2(tx - s.x, tz - s.z) * 0.4));
      }
      s.x = lerp(s.x, tx, ev.action === "walk_to" ? raw : p);
      s.z = lerp(s.z, tz, ev.action === "walk_to" ? raw : p);
      if (!active) s.heading = 0;
      break;
    }
    case "set":
      if (ev.value !== undefined) s.value = ev.value;
      if (ev.text !== undefined) s.text = ev.text;
      break;
    case "grow":
      if (ev.value !== undefined) s.value = lerp(s.value, ev.value, easeOut(raw));
      if (ev.text !== undefined && raw >= 1) s.text = ev.text;
      break;
    case "appear":
      s.opacity = lerp(s.opacity, 1, p);
      break;
    case "disappear":
      s.opacity = lerp(s.opacity, 0, p);
      break;
    case "gray_out":
      s.gray = lerp(s.gray, 1, p);
      s.glow = lerp(s.glow, 0, p);
      break;
    case "restore":
      s.gray = lerp(s.gray, 0, p);
      s.glow = lerp(s.glow, 0, p);
      s.collapse = lerp(s.collapse, 0, p);
      break;
    case "glow":
      s.glow = lerp(s.glow, 1, p);
      break;
    case "pulse":
      if (active) s.pulse = Math.max(s.pulse, Math.sin(raw * Math.PI));
      break;
    case "lock":
      s.locked = lerp(s.locked, 1, p);
      break;
    case "unlock":
      s.locked = lerp(s.locked, 0, p);
      break;
    case "shatter":
      s.shatter = raw;
      break;
    case "collapse":
      s.collapse = lerp(s.collapse, 1, p);
      break;
    case "celebrate":
      if (active) s.jump = Math.abs(Math.sin(raw * Math.PI * 3)) * 0.7 * (1 - raw * 0.5);
      break;
    case "level_up":
      if (raw < 1) {
        s.levelUp = raw;
        s.levelText = ev.text ?? (ev.value !== undefined ? `LEVEL ${ev.value}` : "LEVEL UP");
      }
      if (ev.value !== undefined && raw >= 0.35) s.value = ev.value;
      break;
    case "time_skip":
      break; // world-level, handled by the stage
  }
}

export function computeState(decl: Entity, events: SceneEvent[], lt: number): EntState {
  const s = baseline(decl, events);
  for (const ev of events) if (ev.target === decl.id) applyEvent(s, ev, lt);
  return s;
}
