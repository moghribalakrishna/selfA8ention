#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { bundlePlayer } from "../render/bundle.js";
import { renderStills, renderVideo } from "../render/capture.js";
import { formatIssues, validateStoryboard } from "../validate.js";
import { findQuote, loadQuotes } from "../quotes.js";
import { writeStoryboard } from "../writer/pipeline.js";

const HELP = `SelfA8ention — turn a quote into a short animated explainer video.

Usage:
  sa8 quotes                                 List quotes in the library
  sa8 write   <quote-id> [--out dir]          Claude: distill → story → critique → storyboard
  sa8 render  <storyboard.json> [--out file.mp4] [--hd] [--seconds N]
  sa8 make    <quote-id> [--out dir] [--hd]   write + render
  sa8 preview <storyboard.json> [--out file.html]   Real-time HTML preview (open in a browser)
  sa8 stills  <storyboard.json> <t1> <t2> ... [--out dir]
  sa8 validate <storyboard.json>

Env: ANTHROPIC_API_KEY (for write/make), SA8_MODEL (default claude-opus-5)`;

function loadBoard(file: string) {
  const { board, issues } = validateStoryboard(JSON.parse(readFileSync(file, "utf8")));
  if (issues.length) console.error(formatIssues(issues));
  if (!board || issues.some((i) => i.level === "error")) throw new Error(`storyboard ${file} is invalid`);
  return board;
}

function progress(label: string) {
  let lastPct = -1;
  return (f: number, total: number) => {
    const pct = Math.floor((f / total) * 100);
    if (pct !== lastPct && (pct % 5 === 0 || f === total)) {
      lastPct = pct;
      process.stderr.write(`\r${label} ${pct}% (${f}/${total} frames)`);
      if (f === total) process.stderr.write("\n");
    }
  };
}

async function render(board: ReturnType<typeof loadBoard>, out: string, hd: boolean, seconds?: number) {
  const [width, height] = hd ? [1080, 1920] : [720, 1280];
  const t0 = Date.now();
  await renderVideo(board, { out, width, height, maxSeconds: seconds, onProgress: progress("rendering") });
  console.log(`✓ ${out} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      hd: { type: "boolean", default: false },
      seconds: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...args] = positionals;
  if (!cmd || values.help) return console.log(HELP);

  switch (cmd) {
    case "quotes":
      for (const q of loadQuotes()) console.log(`${q.id.padEnd(28)} ${q.author}: “${q.text}”`);
      return;
    case "validate": {
      const { issues } = validateStoryboard(JSON.parse(readFileSync(args[0], "utf8")));
      console.log(issues.length ? formatIssues(issues) : "✓ valid");
      if (issues.some((i) => i.level === "error")) process.exitCode = 1;
      return;
    }
    case "render": {
      const board = loadBoard(args[0]);
      const out = values.out ?? args[0].replace(/(\.storyboard)?\.json$/, "") + ".mp4";
      return render(board, out, values.hd!, values.seconds ? Number(values.seconds) : undefined);
    }
    case "preview": {
      const board = loadBoard(args[0]);
      const out = values.out ?? args[0].replace(/(\.storyboard)?\.json$/, "") + ".preview.html";
      writeFileSync(out, await bundlePlayer(board));
      console.log(`✓ ${out} — open it in a browser (click = pause, ←/→ = seek)`);
      return;
    }
    case "stills": {
      const board = loadBoard(args[0]);
      const times = args.slice(1).map(Number);
      const files = await renderStills(board, times.length ? times : [1], values.out ?? "out/stills");
      files.forEach((f) => console.log(`✓ ${f}`));
      return;
    }
    case "write":
    case "make": {
      const quote = findQuote(args[0]);
      const dir = values.out ?? path.join("out", quote.id);
      mkdirSync(dir, { recursive: true });
      const board = await writeStoryboard(quote, dir);
      if (cmd === "make") await render(board, path.join(dir, "video.mp4"), values.hd!);
      return;
    }
    default:
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
