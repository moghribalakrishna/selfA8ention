import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import type { Storyboard } from "../schema.js";
import { bundlePlayer } from "./bundle.js";

export interface RenderOptions {
  out: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Render only the first N seconds (handy for quick previews). */
  maxSeconds?: number;
  onProgress?: (frame: number, total: number) => void;
}

/**
 * Deterministic renderer: loads the Three.js player in headless Chromium,
 * steps it frame by frame (no wall clock), screenshots each frame and pipes
 * the JPEGs into ffmpeg to produce an H.264 MP4.
 */
export async function renderVideo(board: Storyboard, opts: RenderOptions): Promise<string> {
  const width = opts.width ?? 720;
  const height = opts.height ?? 1280;
  const fps = opts.fps ?? 30;
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not available for this platform");

  const html = await bundlePlayer();
  mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("[player]", e.message));
    await page.setContent(html, { waitUntil: "load" });
    const duration: number = await page.evaluate(
      (b) => (window as any).__sa8.load(b, { capture: true }),
      board as unknown,
    );
    const seconds = Math.min(duration, opts.maxSeconds ?? Infinity);
    const total = Math.ceil(seconds * fps);

    const ff = spawn(
      ffmpegPath as unknown as string,
      [
        "-y", "-loglevel", "error",
        "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        opts.out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });

    for (let f = 0; f < total; f++) {
      await page.evaluate((t) => (window as any).__sa8.renderAt(t), f / fps);
      const jpg = await page.screenshot({ type: "jpeg", quality: 90 });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
      opts.onProgress?.(f + 1, total);
    }
    ff.stdin.end();
    await done;
  } finally {
    await browser.close();
  }
  return opts.out;
}

/** Renders single frames at the given times to PNG files (for quick visual checks). */
export async function renderStills(board: Storyboard, times: number[], outDir: string, width = 720, height = 1280): Promise<string[]> {
  const html = await bundlePlayer();
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const files: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => console.error("[player]", e.message));
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate((b) => (window as any).__sa8.load(b, { capture: true }), board as unknown);
    for (const t of times) {
      await page.evaluate((tt) => (window as any).__sa8.renderAt(tt), t);
      const file = path.join(outDir, `frame-${t.toFixed(1).padStart(5, "0")}s.png`);
      await page.screenshot({ path: file });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  return files;
}
