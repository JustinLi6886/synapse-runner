# Synapse Runner

[![CI](https://github.com/JustinLi6886/synapse-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/JustinLi6886/synapse-runner/actions/workflows/ci.yml)

![Synapse Runner — imitation learning mode](docs/readme-screenshot.png)

**Live app:** [synapserunner.com](https://www.synapserunner.com/) · **Current release:** `v2.3.2` · **Source:** [github.com/JustinLi6886/synapse-runner](https://github.com/JustinLi6886/synapse-runner)

Synapse Runner is an interactive, browser-based machine-learning playground that makes neural-network training observable through a seeded side-scroller simulation. Players can control the game directly, record demonstrations for behavioral cloning, train an actor-critic policy with generalized advantage estimation, or evolve policies through mutation and selection. The neural-network math and learning updates are implemented directly in TypeScript, with React, Tailwind CSS, Recharts, and supporting libraries powering the interface.

## Learning Modes

| Mode | Experience |
|---|---|
| **Human** | Play with the keyboard or pointer/touch and optionally record demonstrations. |
| **Imitation** | Train a behavioral-cloning model from recorded observations and actions. |
| **Policy gradient** | Run actor–critic updates with GAE-style advantages and inspect training/evaluation metrics. |
| **Evolution** | Evaluate populations, retain elites, and create mutated offspring over successive generations. |

## Engineering Highlights

- A deterministic game engine manages movement, obstacle generation, collision checks, rewards, and a seven-value observation vector.
- A `7-32-16-1` feedforward network implements forward propagation, Leaky ReLU/sigmoid activations, BCE/MSE training, actor-critic updates, and gradient clipping without an ML framework.
- React separates the interactive dashboard from ref-backed simulation state, supporting optional headless training for faster experimentation.
- Versioned `localStorage` persistence retains settings, datasets, models, and training progress; imports are size-limited, sanitized, and shape-validated.
- The application runs entirely in the browser, with no backend or database dependency.

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

## Product Notes

- The dashboard is designed for screens `720` CSS pixels wide and above; narrower portrait-phone views prompt users to rotate or use a larger screen.
- Learning results vary with demonstrations, settings, seeds, and training duration. Metrics are designed for interactive exploration rather than benchmark reporting.
- Headless mode reduces rendering work while training remains in the browser's main thread.

## Ownership and license

Synapse Runner is an independent personal project created and maintained by Justin Li. Third-party libraries are credited through `package.json` and `package-lock.json`.

[MIT](./LICENSE) — Copyright (c) 2026 Justin Junze Li.

Feedback and reproducible bug reports are welcome through [GitHub Issues](https://github.com/JustinLi6886/synapse-runner/issues).
