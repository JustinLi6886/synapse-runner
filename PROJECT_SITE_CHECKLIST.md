# Gaps vs typical public sites — checklist

**How to read this**

- **Gap** — not in the project yet, or inconsistent (worth fixing before a public launch).
- **Deploy** — depends on your host and domain, not on React code in this repo.
- **Optional** — common on polished sites; skip for a minimal demo if you prefer.
- **Review** — quality pass (accessibility, motion), not a single missing file.

This is a planning list, not a legal or compliance checklist.

---

## Branding *(gap)*

- Use **one public name** everywhere. Right now: **`package.json` name** is `synapse-runner`, **README** title is **Synapse Runner**, and **`index.html` `<title>`** is **Neural Network Game** — pick one and align all three plus future social/meta tags.

---

## In `index.html` / `public/` *(gaps unless noted)*

| Item | Why |
|------|-----|
| **`<meta name="description">`** | Search snippets and some tools use it. |
| **`link rel="canonical"`** | Point to the real URL of the page when you have a stable address (helps avoid duplicate-URL confusion). |
| **Open Graph** (`og:title`, `og:type`, `og:url`, `og:description`, `og:image`) | Link previews (Slack, Discord, iMessage, etc.). Use **absolute** URLs for `og:url` and `og:image` on the live site. |
| **Twitter / X cards** *(optional)* | `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` — often mirror OG. |
| **JSON-LD** *(optional)* | e.g. `SoftwareApplication` — can help rich results; not required for a small app. |
| **Favicon** *(gap)* | Still the default Vite `/vite.svg`; replace when you have final art (usually under `public/`). |
| **`apple-touch-icon`** *(optional)* | ~180×180 PNG for iOS “Add to Home Screen.” |
| **`meta name="theme-color"`** *(optional)* | Tints mobile browser chrome; align with your background. |
| **`manifest.webmanifest` + icons** *(optional)* | “Install” / PWA-style behavior on some devices. |

---

## Deploy & domain *(deploy, not something `npm run build` adds)*

| Item | Notes |
|------|--------|
| **HTTPS** | Normal for public sites; enabled by almost all static hosts by default. |
| **SPA fallback** | Only required if the app uses **client-side routes** (e.g. `/foo` handled by JavaScript). This project is effectively **one URL** today; the host only needs to serve `index.html` at `/`. If you add a router later, configure the host so unknown paths still return `index.html`. |
| **`robots.txt`** | At site root if you care how crawlers behave (allow indexing vs not). |
| **`sitemap.xml`** *(optional)* | Can list your public URLs for search engines; one entry is enough for a single-page app. |
| **Custom 404** *(optional)* | Depends on host: many SPAs send all paths to `index.html`, so users may see the app instead of a dedicated 404 page unless you configure one. |

---

## Privacy & trust *(only when it applies)*

| Item | When |
|------|------|
| **Privacy policy** | If you add analytics, sign-in, ads, or non-essential cookies. Loading fonts from Google Fonts is a small third-party request; some teams self-host fonts or mention third parties briefly. |
| **Cookie / consent UI** | If you set cookies beyond what’s strictly necessary for the site to work (e.g. analytics). |
| **`/.well-known/security.txt`** *(optional)* | Security contact for disclosure; common on larger or security-conscious sites. |

---

## Codebase & process *(optional)*

| Item | Notes |
|------|--------|
| **Tests / CI** | Helps regressions; not required to ship a static app. |
| **`engines` in `package.json`** | e.g. `"node": ">=20"` — documents which Node versions you expect. |

---

## Accessibility & motion *(review, not one-time “files”)*

| Item | Notes |
|------|--------|
| **Keyboard** | Logical tab order; modals trap focus safely. |
| **Focus visibility** | Focus ring visible against your theme. |
| **Names for controls** | Icon-only buttons and inputs expose an accessible name. |
| **`prefers-reduced-motion`** *(optional)* | Reduce heavy animation when the user asks for less motion. |

A separate legal **“accessibility statement”** page is optional for a small tool unless you have specific requirements.

---

## Already in place (nothing to add for these)

- Valid **HTML basics**: `DOCTYPE`, `lang="en"`, `charset`, `viewport`, a **`<title>`**.
- **README** with install and scripts, **LICENSE**, **`npm run build`** / **`npm run preview`**.
- **React error boundary** in `src/main.tsx` (`AppErrorBoundary`) — shows a fallback UI with the error message if render throws.
- **Loading** text in `#root` before the app mounts.
- **Session persistence** in the browser (`localStorage`, key `synapse-runner-v1`) so reload keeps dashboard/training state for this app.

---

## Suggested order when you go public

1. **Name + `<title>` + favicon** — quick, visible wins.  
2. **Description + canonical + Open Graph** (and optionally Twitter) — after you know the live URL.  
3. **Host check** — HTTPS; if you add routes later, SPA fallback rules.  
4. Short **a11y** review (and optional `prefers-reduced-motion`).  
5. Everything else from the tables above as you need it (manifest, `robots.txt`, `engines`, tests, privacy text).
