# Synapse Runner

**Version 1.0.0**

A browser-based runner game where you train small neural networks to play it. Play manually, record demonstrations, then train with imitation learning, policy-gradient reinforcement learning, or evolution. The dashboard shows live metrics and observations so you can see what the model is doing.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (LTS recommended)
- npm (bundled with Node)

## Getting started

```bash
npm install
npm run dev
```

The dev server listens on `127.0.0.1` (port **3000** by default; if that port is busy, Vite chooses another) and opens in your browser when possible.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Typecheck and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint on `src/` |

## Tech stack

- **React** and **TypeScript** for the UI
- **Vite** for bundling and dev tooling
- **Tailwind CSS** for styling
- **Recharts** for training charts

The neural network and game logic live in plain TypeScript modules so they stay independent of the UI.

## License

MIT — see [LICENSE](LICENSE).
