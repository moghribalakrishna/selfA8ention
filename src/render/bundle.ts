import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Storyboard } from "../schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function fontFace(family: string, weight: number, pkgFile: string) {
  const data = readFileSync(require.resolve(pkgFile)).toString("base64");
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}

let cachedJs: string | undefined;

/**
 * Bundles the browser player (Three.js + scene engine) into one self-contained
 * HTML page with fonts inlined. When `board` is given, the page auto-plays it
 * in real time (preview mode); otherwise it waits to be driven by the capturer.
 */
export async function bundlePlayer(board?: Storyboard): Promise<string> {
  if (!cachedJs) {
    const result = await build({
      entryPoints: [path.join(here, "player", "main.ts")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      write: false,
      minify: true,
      logLevel: "silent",
    });
    cachedJs = result.outputFiles[0].text;
  }
  const fonts = [
    fontFace("Inter", 600, "@fontsource/inter/files/inter-latin-600-normal.woff2"),
    fontFace("Inter", 700, "@fontsource/inter/files/inter-latin-700-normal.woff2"),
    fontFace("Inter", 800, "@fontsource/inter/files/inter-latin-800-normal.woff2"),
    fontFace("DM Serif Display", 400, "@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2"),
  ].join("\n");
  const safe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
  const embed = board ? `<script>window.__SA8_BOARD=${safe(JSON.stringify(board))}</script>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${board ? board.title.replace(/</g, "&lt;") : "SelfA8ention player"}</title>
<style>
${fonts}
html,body{margin:0;height:100%;overflow:hidden;background:#111}
#frame{position:relative;height:100vh;aspect-ratio:9/16;max-width:100vw;margin:0 auto;container-type:size;overflow:hidden}
#stage{position:absolute;inset:0}
canvas{display:block;width:100%;height:100%}
</style></head>
<body><div id="frame"><div id="stage"></div></div>${embed}<script>${safe(cachedJs)}</script></body></html>`;
}
