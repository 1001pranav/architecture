<div align="center">
<img width="1200" height="475" alt="The Event Loop Unmasked — Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# The Event Loop Unmasked

An interactive senior-engineering guide to Node.js internals.

**[Live Demo →](https://1001pranav.github.io/architecture)**

</div>

---

## What is this?

An interactive educational web app that teaches the internal mechanics of the **Node.js Event Loop** at a depth that goes well beyond typical tutorials. Built for engineers who want a mental model precise enough for production debugging — covering why `process.nextTick` can starve the loop, how Libuv phases sequence, and what actually happens between an `await` and a `setTimeout`.

## Features

| Feature | Description |
|---------|-------------|
| **System Architecture Explorer** | Clickable stack diagram — V8 → Node Bindings → Libuv Event Loop → Thread Pool — with per-component senior-level technical insights |
| **Interactive Event Loop Visualiser** | Animated circular diagram cycling through all 5 phases (Timers, Pending Callbacks, Poll, Check, Close) with live execution-log simulation |
| **Syntax-highlighted Code Blocks** | Every snippet is tokenised and colour-coded (keywords, strings, builtins, comments) — zero extra dependencies |
| **Microtask Queue Diagram** | Three stacked priority lanes (nextTick → Promise → Macrotasks) with animated drain-order arrows |
| **Execution Order Reference Card** | Five-step visual card showing the exact callback sequence: Sync → nextTick → Promise → setTimeout → setImmediate |
| **Sticky Navigation Bar** | Section-aware nav that highlights the active section as you scroll |
| **Responsive** | Fully functional on mobile, tablet, and desktop |

## Sections

```
01 Architecture   →  V8, Node Bindings, Libuv Event Loop, Thread Pool
02 Event Loop     →  Timers → Pending Callbacks → Poll → Check → Close Callbacks
03 Microtasks     →  nextTick vs Promise vs setImmediate — and why order matters
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Animation | Motion (Framer Motion) |
| Icons | Lucide React |
| Deployment | GitHub Pages via `gh-pages` |

## Run Locally

**Prerequisites:** Node.js ≥ 18

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:5173/architecture/](http://localhost:5173/architecture/)

No API key required — this is a purely client-side app.

## Deploy

```bash
npm run deploy
```

Builds the project and publishes to the `gh-pages` branch. Live at:
**[https://1001pranav.github.io/architecture](https://1001pranav.github.io/architecture)**

## License

Apache-2.0
