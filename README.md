# Synapse Runner

[![CI](https://github.com/JustinLi6886/synapse-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/JustinLi6886/synapse-runner/actions/workflows/ci.yml)

![Synapse Runner — imitation learning mode](docs/readme-screenshot.png)

**Live app:** [synapserunner.com](https://www.synapserunner.com/) · **Current release:** `v2.3.2` · **Source:** [github.com/JustinLi6886/synapse-runner](https://github.com/JustinLi6886/synapse-runner)

Synapse Runner is a browser-based neural-network learning playground. One seeded side-scroller simulation supports human play, behavioral cloning from recorded demonstrations, actor–critic policy gradients, and mutation-only neuroevolution. The core neural-network math and learning updates are implemented directly in TypeScript; React, Tailwind CSS, Recharts, and the libraries listed in `package.json` provide the interface and supporting utilities.

## What you can inspect

| Mode | Public behavior |
|---|---|
| **Human** | Play with the keyboard or pointer/touch and optionally record demonstrations. |
| **Imitation** | Train a behavioral-cloning model from recorded observations and actions. |
| **Policy gradient** | Run actor–critic updates with GAE-style advantages and inspect training/evaluation metrics. |
| **Evolution** | Evaluate populations, retain elites, and create mutated offspring over successive generations. |

## Architecture

- A deterministic game engine owns movement, obstacle generation, collision checks, rewards, and the seven-value observation vector.
- A `7-32-16-1` feedforward network provides forward propagation, Leaky ReLU/sigmoid activations, BCE/MSE training, policy-gradient updates, and gradient clipping without an ML framework.
- React separates the interactive dashboard from ref-backed simulation state; optional headless training hides rendering but still runs on the browser's main thread.
- Versioned `localStorage` persistence retains settings, datasets, models, and training progress. Imports are size-limited, sanitized, and shape-validated.
- The app is client-only: there is no backend, database, Web Worker, Canvas, or WebGL renderer.

## Stack

| Layer | Technologies |
|---|---|
| **Application** | TypeScript, React 19, Vite 7 |
| **Interface** | Tailwind CSS 4, Recharts, Lucide icons, DOM/CSS rendering |
| **Learning** | Direct TypeScript neural-network math, behavioral cloning, actor–critic policy gradients, mutation-only evolution |
| **Quality** | ESLint, Vitest, GitHub Actions |
| **Deployment** | Vercel from the public `main` branch |

## Local setup

Requires **Node.js 20+**.

```bash
npm ci
npm run dev
```

Vite prints the local URL and defaults to port `3000`.

```bash
npm run lint
npm test
npm run build
npm run preview
```

CI runs the clean install, lint, focused correctness tests, and production build on every push and pull request to `main`.

## Current boundaries

- The dashboard is supported at widths of `720` CSS pixels and above. Narrower portrait-phone views show a rotate-or-use-a-larger-screen message; the project does not claim full portrait-phone responsiveness.
- Learning quality depends on demonstrations, settings, seeds, and training duration. This repository does not publish benchmark, convergence, score, generalization, usage, or performance claims.
- Imitation metrics describe the recorded dataset used by the in-browser trainer; they are not held-out research results.
- Headless mode reduces rendering work but is not worker-thread or server-side training.

## Ownership and license

Synapse Runner is an independent personal project created and maintained by Justin Li. Third-party libraries are credited through `package.json` and `package-lock.json`.

[MIT](./LICENSE) — Copyright (c) 2026 Justin Junze Li.

Feedback and reproducible bug reports are welcome through [GitHub Issues](https://github.com/JustinLi6886/synapse-runner/issues).
