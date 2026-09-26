# SelfA8ention

Turn short, dense quotes (Naval Ravikant and others) into 45–90 second animated vertical videos. Each video shows the mechanism behind the quote as a tiny board-game story. The quote itself arrives last.

The design and the reasoning behind it are in [docs/DESIGN.md](docs/DESIGN.md).

## Setup

```bash
npm install
npx playwright install chromium   # skip if Chromium for Playwright is already installed
export ANTHROPIC_API_KEY=...       # only needed for write / make
```

## Usage

```bash
npm run sa8 -- quotes                                   # list the quote library
npm run sa8 -- make long-term-games                     # Claude writes it, then renders out/long-term-games/video.mp4
npm run sa8 -- write earn-with-mind                     # only the writing stages → out/earn-with-mind/*.json
npm run sa8 -- render out/earn-with-mind/storyboard.json [--hd] [--seconds 10]
npm run sa8 -- preview examples/long-term-games.storyboard.json   # real-time HTML preview
npm run sa8 -- stills  examples/long-term-games.storyboard.json 3 20 50
npm run sa8 -- validate out/earn-with-mind/storyboard.json
```

You can render the included example without an API key:

```bash
npm run sa8 -- render examples/long-term-games.storyboard.json --out out/long-term-games.mp4
```

The default model is `claude-opus-5`. Set `SA8_MODEL` to use a different one.

## Layout

```
quotes/quotes.json          quote library
examples/                   hand-made reference storyboard
src/schema.ts               storyboard + writer-stage schemas (the contract)
src/validate.ts             semantic checks beyond the schema
src/writer/                 Claude stages: distill → story → critique → storyboard
src/render/player/          Three.js scene engine (runs in the browser)
src/render/capture.ts       headless frame-stepping → ffmpeg → MP4
src/cli/index.ts            the `sa8` CLI
```
