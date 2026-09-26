import type { Entity, Scene, Storyboard } from "../../schema.js";
import type { EntState } from "./state.js";
import { clamp01, easeOut, formatNumber } from "./util.js";

const CSS = `
#hud{position:absolute;inset:0;pointer-events:none;font-family:Inter,sans-serif;color:#fff}
#hud-top{position:absolute;top:4.2cqh;left:4cqw;right:4cqw;display:flex;flex-wrap:wrap;gap:1.6cqw;justify-content:center}
.chip{background:rgba(18,20,28,.78);border:.35cqw solid rgba(255,255,255,.14);border-radius:99px;padding:1.3cqw 3.2cqw;
  font-weight:700;font-size:3.6cqw;letter-spacing:.02em;display:flex;gap:2cqw;align-items:baseline;transform-origin:center}
.chip b{font-weight:800;color:#ffd166;font-variant-numeric:tabular-nums}
.chip.round{background:#ffd166;color:#1b1b1f;border-color:#ffd166;text-transform:uppercase;letter-spacing:.12em;font-weight:800}
.timeline{width:84cqw;border-radius:3cqw;padding:1.6cqw 3cqw}
.timeline .bar{height:1.4cqw;background:rgba(255,255,255,.18);border-radius:1cqw;overflow:hidden;margin-top:1.2cqw}
.timeline .fill{height:100%;background:linear-gradient(90deg,#ffd166,#ef476f)}
.timeline .ends{display:flex;justify-content:space-between;font-size:3cqw;opacity:.85}
.board{flex-direction:column;gap:.6cqw;min-width:40cqw;border-radius:3cqw}
.board .row{display:flex;justify-content:space-between;gap:4cqw;font-size:3.4cqw}
#caption{position:absolute;top:13.5cqh;left:6cqw;right:6cqw;text-align:center;font-weight:800;font-size:7.4cqw;line-height:1.08;
  letter-spacing:-.01em;text-shadow:0 .5cqw 2.5cqw rgba(0,0,0,.55),0 0 .6cqw rgba(0,0,0,.6)}
#subs{position:absolute;bottom:9.5cqh;left:7cqw;right:7cqw;text-align:center}
#subs span{display:inline;background:rgba(10,10,14,.72);box-decoration-break:clone;-webkit-box-decoration-break:clone;
  padding:.5cqw 2.2cqw;border-radius:1.6cqw;font-weight:600;font-size:4.6cqw;line-height:1.55}
#quote{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:0 9cqw;
  background:radial-gradient(ellipse at center,rgba(10,8,20,.55),rgba(10,8,20,.85));text-align:center}
#quote .q{font-family:'DM Serif Display',serif;font-size:9cqw;line-height:1.12;text-shadow:0 .6cqw 3cqw rgba(0,0,0,.5)}
#quote .q .mark{color:#ffd166}
#quote .a{margin-top:4cqh;font-size:4cqw;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#ffd166}
#fade{position:absolute;inset:0;background:#0b0b10}
#brand{position:absolute;bottom:3.4cqh;left:0;right:0;text-align:center;font-weight:800;font-size:3cqw;letter-spacing:.3em;opacity:.75;
  text-shadow:0 0 1cqw rgba(0,0,0,.6)}
#brand i{font-style:normal;color:#ffd166}
`;

/** Splits narration into short subtitle phrases with word-weighted timings. */
function phrases(text: string): { text: string; weight: number }[] {
  const parts = text.split(/(?<=[.!?…])\s+|(?<=[,;:—])\s+/).filter(Boolean);
  const out: { text: string; weight: number }[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/);
    for (let i = 0; i < words.length; i += 9) {
      const chunk = words.slice(i, i + 9);
      out.push({ text: chunk.join(" "), weight: chunk.length + 1.5 });
    }
  }
  return out;
}

export class Hud {
  private top: HTMLElement;
  private caption: HTMLElement;
  private subs: HTMLElement;
  private quote: HTMLElement;
  private fade: HTMLElement;
  private chips = new Map<string, HTMLElement>();
  private lastCaption = "";
  private lastSub = "";

  constructor(root: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    root.insertAdjacentHTML(
      "beforeend",
      `<div id="hud"><div id="hud-top"></div><div id="caption"></div><div id="subs"></div>
       <div id="quote"><div class="q"></div><div class="a"></div></div><div id="fade"></div>
       <div id="brand">SELF<i>A8</i>ENTION</div></div>`,
    );
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.top = q("#hud-top");
    this.caption = q("#caption");
    this.subs = q("#subs");
    this.quote = q("#quote");
    this.fade = q("#fade");
  }

  update(board: Storyboard, scene: Scene, lt: number, hudEnts: { decl: Entity; s: EntState }[], fade: number) {
    const d = scene.duration;
    this.fade.style.opacity = String(fade);

    // Quote beat: full-screen quote card replaces the caption.
    const isQuote = scene.beat === "quote";
    const qIn = isQuote ? easeOut(clamp01((lt - 0.2) / 1.2)) : 0;
    this.quote.style.opacity = String(qIn);
    if (isQuote) {
      const qt = this.quote.querySelector(".q") as HTMLElement;
      const html = `<span class="mark">“</span>${escapeHtml(board.quote.text)}<span class="mark">”</span>`;
      if (qt.innerHTML !== html) qt.innerHTML = html;
      (this.quote.querySelector(".a") as HTMLElement).textContent = `— ${board.quote.author}`;
      this.quote.style.transform = `scale(${0.96 + 0.04 * qIn})`;
    }

    // Caption: slides up at the start, holds, then eases out before the cut.
    const capText = isQuote ? "" : scene.caption;
    if (capText !== this.lastCaption) { this.caption.textContent = capText; this.lastCaption = capText; }
    const cin = easeOut(clamp01((lt - 0.25) / 0.6));
    const cout = clamp01((d - lt) / 0.35);
    this.caption.style.opacity = String(cin * cout);
    this.caption.style.transform = `translateY(${(1 - cin) * 3}cqh)`;
    if (scene.beat === "mirror") {
      this.caption.style.top = "24cqh";
      this.caption.style.fontSize = "8.4cqw";
    } else {
      this.caption.style.top = "13.5cqh";
      this.caption.style.fontSize = "7.4cqw";
    }

    // Subtitles, word-weighted across the scene.
    const ph = phrases(scene.narration);
    const total = ph.reduce((a, p) => a + p.weight, 0);
    const start = 0.3, span = Math.max(0.5, d - 0.6);
    let acc = 0, current = "";
    for (const p of isQuote ? [] : ph) {
      const t0 = start + (acc / total) * span;
      acc += p.weight;
      const t1 = start + (acc / total) * span;
      if (lt >= t0 && lt < t1) current = p.text;
    }
    if (current !== this.lastSub) {
      this.subs.innerHTML = current ? `<span>${escapeHtml(current)}</span>` : "";
      this.lastSub = current;
    }

    // HUD entities.
    const alive = new Set<string>();
    for (const { decl, s } of hudEnts) {
      alive.add(decl.id);
      let el = this.chips.get(decl.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "chip";
        this.top.appendChild(el);
        this.chips.set(decl.id, el);
      }
      renderHudEntity(el, decl, s);
      el.style.opacity = String(s.opacity);
      el.style.filter = s.gray > 0.01 ? `grayscale(${s.gray}) brightness(${1 - s.gray * 0.3})` : "";
      el.style.transform = `scale(${1 + s.pulse * 0.18})`;
      el.style.boxShadow = s.glow > 0.01 ? `0 0 ${4 * s.glow}cqw rgba(255,209,102,${0.8 * s.glow})` : "";
    }
    for (const [id, el] of this.chips) if (!alive.has(id)) { el.remove(); this.chips.delete(id); }
  }
}

function renderHudEntity(el: HTMLElement, decl: Entity, s: EntState) {
  let html = "";
  switch (decl.kind) {
    case "counter":
      el.className = "chip";
      html = `<span>${escapeHtml(decl.label ?? "")}</span><b>${formatNumber(s.value)}</b>`;
      break;
    case "round_marker":
      el.className = "chip round";
      html = s.text ? escapeHtml(s.text) : `${escapeHtml(decl.label ?? "Round")} ${formatNumber(s.value)}`;
      break;
    case "timeline": {
      el.className = "chip timeline";
      const [a, b] = (s.text || "Start|Later").split("|");
      html = `<div class="ends"><span>${escapeHtml(a ?? "")}</span><span>${escapeHtml(decl.label ?? "")}</span><span>${escapeHtml(b ?? "")}</span></div>
        <div class="bar"><div class="fill" style="width:${clamp01(s.value) * 100}%"></div></div>`;
      break;
    }
    case "leaderboard": {
      el.className = "chip board";
      const rows = (s.text || "").split(";").filter(Boolean).map((r) => r.split(":"));
      html = (decl.label ? `<div class="row"><span>${escapeHtml(decl.label)}</span></div>` : "") +
        rows.map(([n, v]) => `<div class="row"><span>${escapeHtml(n ?? "")}</span><b>${escapeHtml(v ?? "")}</b></div>`).join("");
      break;
    }
  }
  if ((el as any)._html !== html) { el.innerHTML = html; (el as any)._html = html; }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
