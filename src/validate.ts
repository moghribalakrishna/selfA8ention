import { HUD_KINDS, Storyboard } from "./schema.js";

export interface Issue { level: "error" | "warn"; where: string; msg: string }

const HUD = new Set<string>(HUD_KINDS);
const needsEnd = new Set(["path", "wall", "bridge"]);

/**
 * Checks what the JSON schema cannot: references resolve, coordinates are on
 * the board, the beat structure follows the story framework, pacing is sane.
 * Errors make the storyboard unrenderable or off-framework; warnings are style.
 */
export function validateStoryboard(input: unknown): { board?: Storyboard; issues: Issue[] } {
  const parsed = Storyboard.safeParse(input);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((i) => ({ level: "error", where: i.path.join("."), msg: i.message })) };
  }
  const board = parsed.data;
  const issues: Issue[] = [];
  const err = (where: string, msg: string) => issues.push({ level: "error", where, msg });
  const warn = (where: string, msg: string) => issues.push({ level: "warn", where, msg });
  const castIds = new Set(board.cast.map((c) => c.id));

  const beats = board.scenes.map((s) => s.beat);
  if (beats[0] !== "hook") err("scenes[0]", "the first scene must be the hook");
  const qi = beats.indexOf("quote");
  if (qi === -1) err("scenes", "missing a 'quote' scene");
  if (qi !== -1 && qi < beats.indexOf("reveal")) err("scenes", "the quote must come after the reveal, never before");
  if (beats[beats.length - 1] !== "mirror") warn("scenes", "the last scene should be the mirror question");

  const total = board.scenes.reduce((a, s) => a + s.duration, 0);
  if (total < 35 || total > 100) warn("scenes", `total duration ${total.toFixed(1)}s is outside 35-100s`);
  const words = board.scenes.reduce((a, s) => a + s.narration.split(/\s+/).filter(Boolean).length, 0);
  if (words > 170) warn("narration", `${words} words of narration; aim for <= 150`);

  board.scenes.forEach((s, i) => {
    const at = `scenes[${i}] (${s.beat})`;
    if (s.duration < 2.5 || s.duration > 20) err(at, `duration ${s.duration}s must be within 2.5-20s`);
    const ids = new Set<string>();
    for (const e of s.entities) {
      if (ids.has(e.id)) err(at, `duplicate entity id '${e.id}'`);
      ids.add(e.id);
      if (!HUD.has(e.kind) && (Math.abs(e.x) > 5.5 || Math.abs(e.z) > 8.5)) err(at, `'${e.id}' at (${e.x}, ${e.z}) is off the board (x in [-5,5], z in [-8,8])`);
      if (e.kind === "figure" && !(e.cast && castIds.has(e.cast))) err(at, `figure '${e.id}' must reference a cast id`);
      if (needsEnd.has(e.kind) && (e.to_x === undefined || e.to_z === undefined)) warn(at, `${e.kind} '${e.id}' should set to_x / to_z`);
    }
    if (s.focus && !ids.has(s.focus)) err(at, `focus '${s.focus}' is not an entity in this scene`);
    const wordsHere = s.caption.split(/\s+/).filter(Boolean).length;
    if (wordsHere > 9) warn(at, `caption has ${wordsHere} words; keep it <= 8`);
    if (s.events.length === 0 && s.beat !== "quote") warn(at, "scene has no events; every scene should show something change");
    for (const ev of s.events) {
      if (ev.target === "world") {
        if (ev.action !== "time_skip") err(at, `only time_skip may target 'world' (got ${ev.action})`);
        continue;
      }
      if (!ids.has(ev.target)) err(at, `event targets unknown entity '${ev.target}'`);
      if (ev.t < 0 || ev.t > s.duration) err(at, `event at t=${ev.t} is outside the scene (0-${s.duration})`);
      if ((ev.action === "walk_to" || ev.action === "move_to") && (ev.x === undefined || ev.z === undefined)) err(at, `${ev.action} on '${ev.target}' needs x and z`);
      if ((ev.action === "grow" || ev.action === "set") && ev.value === undefined && ev.text === undefined) err(at, `${ev.action} on '${ev.target}' needs value or text`);
    }
  });
  return { board, issues };
}

export function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `${i.level === "error" ? "✗" : "!"} ${i.where}: ${i.msg}`).join("\n");
}
