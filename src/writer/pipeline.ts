import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Quote } from "../quotes.js";
import { Critique, Distillation, Story, Storyboard } from "../schema.js";
import { formatIssues, validateStoryboard } from "../validate.js";
import { structured } from "./claude.js";
import { CRITIC_SYSTEM, DISTILL_SYSTEM, STORY_SYSTEM, STORYBOARD_SYSTEM } from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_STORY_REVISIONS = 2;
const MAX_REPAIRS = 2;

const quoteBlock = (q: Quote) => `<quote author="${q.author}">${q.text}</quote>`;
const json = (v: unknown) => JSON.stringify(v, null, 2);

function save(dir: string, name: string, data: unknown) {
  writeFileSync(path.join(dir, name), json(data) + "\n");
}

/** A hand-made storyboard that shows the renderer's vocabulary used well. */
function exampleStoryboard(): string {
  return readFileSync(path.join(here, "..", "..", "examples", "long-term-games.storyboard.json"), "utf8");
}

/**
 * quote → distillation → story (critiqued and revised until it passes) →
 * storyboard (validated and repaired). Every intermediate is saved to `dir`
 * so the simplification can be reviewed on its own, before any rendering.
 */
export async function writeStoryboard(quote: Quote, dir: string): Promise<Storyboard> {
  const distill = await structured(Distillation, DISTILL_SYSTEM, quoteBlock(quote), { label: "distill", effort: "high" });
  save(dir, "1-distill.json", distill);

  let story = await structured(
    Story,
    STORY_SYSTEM,
    `${quoteBlock(quote)}\n\n<distillation>\n${json(distill)}\n</distillation>\n\nWrite the story.`,
    { label: "story", effort: "high" },
  );
  save(dir, "2-story.json", story);

  let critique: Critique | undefined;
  for (let round = 0; round <= MAX_STORY_REVISIONS; round++) {
    critique = await structured(
      Critique,
      CRITIC_SYSTEM,
      `${quoteBlock(quote)}\n\n<distillation>\n${json(distill)}\n</distillation>\n\n<story>\n${json(story)}\n</story>`,
      { label: `critique #${round + 1}`, effort: "high" },
    );
    save(dir, `3-critique-${round + 1}.json`, critique);
    if (critique.pass || round === MAX_STORY_REVISIONS) break;
    story = await structured(
      Story,
      STORY_SYSTEM,
      `${quoteBlock(quote)}\n\n<distillation>\n${json(distill)}\n</distillation>\n\n<previous_story>\n${json(story)}\n</previous_story>\n\n` +
        `<editor_notes>\n${json({ scores: critique.scores, violations: critique.rule_violations, fixes: critique.fixes })}\n</editor_notes>\n\n` +
        `Revise the story to address every editor note. Keep what already works.`,
      { label: `story revision #${round + 1}`, effort: "high" },
    );
    save(dir, "2-story.json", story);
  }
  if (critique && !critique.pass) {
    process.stderr.write(`! story still below the bar after ${MAX_STORY_REVISIONS} revisions; continuing — review 3-critique-*.json\n`);
  }

  const brief =
    `${quoteBlock(quote)}\n\n<distillation>\n${json(distill)}\n</distillation>\n\n<story>\n${json(story)}\n</story>\n\n` +
    `<example_storyboard note="a different quote; shows the vocabulary used well — do not copy its story">\n${exampleStoryboard()}\n</example_storyboard>\n\n` +
    `Write the storyboard for this story. quote.text must be exactly the quote above and quote.author "${quote.author}".`;
  let board = await structured(Storyboard, STORYBOARD_SYSTEM, brief, { label: "storyboard", effort: "high" });

  for (let attempt = 0; ; attempt++) {
    const { issues } = validateStoryboard(board);
    save(dir, "storyboard.json", board);
    const errors = issues.filter((i) => i.level === "error");
    if (issues.length) process.stderr.write(formatIssues(issues) + "\n");
    if (errors.length === 0) break;
    if (attempt >= MAX_REPAIRS) throw new Error(`storyboard still invalid after ${MAX_REPAIRS} repairs; see ${dir}/storyboard.json`);
    board = await structured(
      Storyboard,
      STORYBOARD_SYSTEM,
      `${brief}\n\n<previous_attempt>\n${json(board)}\n</previous_attempt>\n\n<validation_errors>\n${formatIssues(issues)}\n</validation_errors>\n\n` +
        `Fix every validation error (and the warnings where easy). Change nothing else.`,
      { label: `storyboard repair #${attempt + 1}`, effort: "medium" },
    );
  }
  console.log(`✓ ${path.join(dir, "storyboard.json")}`);
  return board;
}
