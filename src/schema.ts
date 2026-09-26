import { z } from "zod";

/**
 * The storyboard is the contract between the writer (Claude) and the renderer
 * (Three.js). Everything visual must be expressed with this constrained
 * vocabulary so the renderer can draw it deterministically.
 *
 * World coordinates: the board is a tabletop, x in [-5, 5] (the frame is a
 * vertical 9:16 phone screen, so keep things narrow) and z in [-8, 8].
 * -z is "back" (top of screen), +z is "front" (bottom of screen, near camera).
 */

export const BEATS = ["hook", "rule", "choice", "consequence", "reveal", "quote", "mirror"] as const;
export const MOODS = ["dawn", "neutral", "tension", "cold", "warm"] as const;
export const SHOTS = ["wide", "top_down", "push_in", "pull_back", "orbit", "follow", "close"] as const;

/** World props live on the board; HUD kinds are drawn as screen overlays. */
export const WORLD_KINDS = [
  "figure", "crowd", "path", "door", "wall", "bridge", "tree",
  "coin_pile", "block_stack", "hourglass", "energy_bar", "badge", "key",
  "contract_card", "multiplier",
] as const;
export const HUD_KINDS = ["counter", "round_marker", "timeline", "leaderboard"] as const;
export const ENTITY_KINDS = [...WORLD_KINDS, ...HUD_KINDS] as const;

export const ACTIONS = [
  "walk_to", "move_to", "set", "grow", "appear", "disappear",
  "gray_out", "restore", "glow", "pulse", "lock", "unlock", "shatter",
  "collapse", "celebrate", "level_up", "time_skip",
] as const;

export const CastMember = z.object({
  id: z.string().describe("short slug, e.g. 'mia'"),
  name: z.string().describe("display name shown above the figure"),
  color: z.string().describe("hex color like '#e76f51'"),
});

export const Entity = z.object({
  id: z.string().describe("unique within the scene; reuse the same id across scenes for continuity"),
  kind: z.enum(ENTITY_KINDS),
  x: z.number().describe("board x in [-5, 5]; ignored for HUD kinds"),
  z: z.number().describe("board z in [-8, 8]; ignored for HUD kinds"),
  cast: z.string().optional().describe("figure only: cast member id"),
  label: z.string().optional().describe("short label (<= 24 chars) shown near the entity / on the HUD chip"),
  value: z.number().optional().describe("initial numeric state; meaning depends on kind"),
  text: z.string().optional().describe("contract_card text, round_marker override like '∞', timeline range 'Year 1|Year 10', leaderboard 'Ravi:40;Mia:12'"),
  color: z.string().optional().describe("hex color override"),
  to_x: z.number().optional().describe("path / wall / bridge: end x"),
  to_z: z.number().optional().describe("path / wall / bridge: end z"),
});

export const SceneEvent = z.object({
  t: z.number().describe("seconds from scene start"),
  target: z.string().describe("entity id, or 'world' for time_skip"),
  action: z.enum(ACTIONS),
  value: z.number().optional().describe("target value for set / grow"),
  x: z.number().optional().describe("walk_to / move_to destination x"),
  z: z.number().optional().describe("walk_to / move_to destination z"),
  over: z.number().optional().describe("animation duration in seconds (default depends on action)"),
  text: z.string().optional().describe("set: replacement text for text-bearing entities"),
});

export const Scene = z.object({
  beat: z.enum(BEATS),
  duration: z.number().describe("seconds, 3-18"),
  mood: z.enum(MOODS),
  shot: z.enum(SHOTS),
  focus: z.string().optional().describe("entity id the camera frames; default = board center"),
  narration: z.string().describe("voice-over line, spoken plainly; shown as subtitles"),
  caption: z.string().describe("big on-screen text, <= 8 words"),
  entities: z.array(Entity),
  events: z.array(SceneEvent),
});

export const Storyboard = z.object({
  title: z.string(),
  quote: z.object({ text: z.string(), author: z.string() }),
  cast: z.array(CastMember),
  scenes: z.array(Scene),
});

export type Storyboard = z.infer<typeof Storyboard>;
export type Scene = z.infer<typeof Scene>;
export type Entity = z.infer<typeof Entity>;
export type SceneEvent = z.infer<typeof SceneEvent>;
export type CastMember = z.infer<typeof CastMember>;

// ---------------------------------------------------------------------------
// Writer-stage schemas (text-only, before anything is rendered)
// ---------------------------------------------------------------------------

export const Distillation = z.object({
  core_claim: z.string().describe("the quote restated in plain words a 14-year-old understands"),
  mechanism: z.string().describe("WHY it is true: the hidden system dynamic at work"),
  misreading: z.string().describe("the most common way people misunderstand it"),
  cost_of_ignoring: z.string().describe("what concretely goes wrong for someone who ignores it"),
  so_what: z.string().describe("one sentence the viewer should walk away with"),
  game_metaphor: z.string().describe("the game rule / mechanic that makes the mechanism visible"),
  situations: z.array(z.string()).describe("3 human-scale everyday situations where this plays out"),
});
export type Distillation = z.infer<typeof Distillation>;

export const Story = z.object({
  logline: z.string(),
  characters: z.array(z.object({ name: z.string(), role: z.string() })),
  beats: z.array(z.object({ beat: z.enum(BEATS), what_we_see: z.string(), narration: z.string() })),
  mirror_question: z.string(),
});
export type Story = z.infer<typeof Story>;

export const Critique = z.object({
  scores: z.object({
    clarity: z.number().describe("1-5: would a 14-year-old get the mechanism?"),
    fairness: z.number().describe("1-5: does the wrong choice look genuinely reasonable?"),
    show_dont_tell: z.number().describe("1-5: is the moral withheld until the reveal and shown via on-screen change?"),
    human_scale: z.number().describe("1-5: everyday stakes, not billionaires"),
    freshness: z.number().describe("1-5: free of cliché, preachiness and self-help vocabulary"),
  }),
  rule_violations: z.array(z.string()),
  fixes: z.array(z.string()).describe("concrete, specific edits that would raise the weakest scores"),
  pass: z.boolean().describe("true only if every score >= 4 and there are no rule violations"),
});
export type Critique = z.infer<typeof Critique>;
