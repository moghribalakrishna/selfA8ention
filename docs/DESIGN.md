# SelfA8ention — Design (v1)

## Why

A great quote packs a whole system of thought into a handful of words, so most people read past it. SelfA8ention turns a quote into a 45–90 second vertical video. The video *shows* the mechanism behind the quote as a tiny story, and the quote itself arrives last, as the caption for what the viewer just watched.

**The simplification is the product. The rendering is how it gets delivered.**

## Format: a board-game diorama

Everything happens on one low-poly tabletop, seen from a 3/4 camera. Meeple figures stand in for people. Coins, block stacks, counters, round markers and multipliers act as the game UI.

Games suit wisdom quotes because a quote compresses the *rules of a system*, and a game makes a system visible:

| Idea | Game mechanic |
|---|---|
| long-term games | rounds that accumulate vs. rounds that reset |
| compounding | a block stack that grows faster each round, with a ×N multiplier |
| status | a leaderboard, a badge |
| wealth vs. money | assets that keep producing on their own vs. a coin pile you top up by hand |
| desire | a locked contract card that grays out everything else |
| specific knowledge | a key or path that only one player has |

The board also suits rendering: one reusable world, deterministic motion, and cheap to render.

Alternatives we considered and set aside for v1:

- **Paper cut-outs:** warmer, but weaker at showing systems.
- **Flat diagram explainer:** clear, but it lands as a lecture.
- **Generative video (e.g. Google Veo):** the most cinematic option, but it's non-deterministic and costs money per scene. It's the planned v2 backend, and it will consume the same storyboard.

## Pipeline

```
quote ─▶ distill ─▶ story ─▶ critique ⟲ revise ─▶ storyboard ─▶ validate ⟲ repair ─▶ render ─▶ MP4
        (Claude)   (Claude)  (Claude)             (Claude)      (code)               (Three.js + ffmpeg)
```

1. **Distill**: Claude unpacks the quote into the core claim, the hidden *mechanism* (why it's true), the common misreading, the cost of ignoring it, the one-line "so what", a game metaphor, and three everyday situations.
2. **Story**: a parable built on fixed beats:
   - **hook**: a concrete temptation, with no moral.
   - **rule**: the character's default logic, shown as a game rule.
   - **choice**: the short-term path pays first.
   - **consequence**: the mechanism plays out, often with a time skip.
   - **reveal**: shown as a changed number or shape, not said.
   - **quote**: the quote appears for the first time.
   - **mirror**: one question back to the viewer.
3. **Critique**: a separate editor pass scores clarity, fairness, show-don't-tell, human scale and freshness. The story is revised (up to 2 times) until every score is ≥ 4. This gate is text-only, so a weak story is caught before any rendering time is spent.
4. **Storyboard**: Claude converts the story into JSON using a **constrained visual vocabulary** (`src/schema.ts`), with a hand-made example as reference. Structured outputs guarantee the shape.
5. **Validate / repair**: `src/validate.ts` checks the things a schema can't: references resolve, positions are on the board, the beat order is right, and the pacing is sane. Errors go back to Claude for up to 2 repair passes.
6. **Render**: a Three.js scene engine runs in headless Chromium. Every frame is a pure function of *t*, so frames are stepped (never real-time), screenshotted, and piped to ffmpeg to produce an H.264 MP4 (720×1280, or 1080×1920 with `--hd`). The same engine plays in a browser for previews.

Every intermediate result is saved: `1-distill.json`, `2-story.json`, `3-critique-N.json` and `storyboard.json`. That lets the simplification be reviewed and hand-edited separately from the visuals.

## Story quality rules

- Never state the moral before the reveal. The quote always comes last.
- The wrong choice must look reasonable.
- One mechanism per video.
- Stakes stay at human scale: a job, a friend, a Tuesday. Never billionaires.
- The payoff is a visible change on the board.
- Narration stays at or under 150 words.
- Banned words: success, hustle, mindset, journey…
- The character may lose.

## Visual vocabulary

- **World:** `figure`, `crowd`, `path`, `wall`, `bridge`, `door`, `tree`, `coin_pile`, `block_stack`, `hourglass`, `energy_bar`, `badge`, `key`, `contract_card`, `multiplier`.
- **HUD** (screen overlays): `counter`, `round_marker`, `timeline`, `leaderboard`.
- **Events:** `walk_to`, `move_to`, `set`, `grow`, `appear`, `disappear`, `gray_out`, `restore`, `glow`, `pulse`, `lock`, `unlock`, `shatter`, `collapse`, `celebrate`, `level_up`, `time_skip`.
- **Scene:** `beat`, `duration`, `mood` (dawn / neutral / tension / cold / warm), `shot` (wide / top_down / push_in / pull_back / orbit / follow / close), `focus`, `narration` (subtitles), `caption` (big text).

The full reference Claude receives is `VOCAB` in `src/writer/prompts.ts`.

## Deliberately NOT in v1

- Voice-over (TTS) and music. Narration currently appears as subtitles.
- Generative-video backend (Veo).
- Multiple art styles and character customization.
- A web app or hosting.

The plan is to ship ~5 videos, watch retention, then decide what comes next.

## Next steps (v2 candidates)

1. **Voice-over:** TTS (e.g. Google Cloud TTS or ElevenLabs), with scene durations timed to the audio, plus a music bed.
2. **Batch mode:** render the whole quote library overnight.
3. **Anti-sameness:** track primitive usage across videos and nudge the storyboard prompt away from repeats.
4. **Veo backend:** turn each scene into a prompt, generate a clip, stitch the clips, and burn in captions.
5. **Review UI:** a small web page to approve or edit distill/story/storyboard before rendering.
