# Deploying ORBIT ZERO to GitHub Pages

The workflow `.github/workflows/deploy-pages.yml` builds, tests and publishes on every push to `main`.

## One-time setup (repository owner, about 2 minutes)
1. Open the repository on github.com, then **Settings -> Pages**.
2. Under **Build and deployment -> Source**, choose **GitHub Actions** (not "Deploy from a branch").
3. Push to `main` (or open **Actions -> Deploy to GitHub Pages -> Run workflow**).
4. When the run is green, the URL is shown on the `deploy` job and under Settings -> Pages:
   `https://<user>.github.io/ORBIT-ZERO-THE-LAST-DOWNLINK/`

If step 2 is skipped, the first step of the workflow (`actions/configure-pages`) fails with a message saying
Pages is not enabled. Nothing is published until it is.

## What the workflow checks before publishing
`npm ci`, type-check, unit tests, production build, then `tests/deploy-static-check.mjs`, which serves `dist/`
at `/` and at a sub-path and loads the landing, the game and the headset lobby with a Meta Quest user agent.

## Base path and caching
- `vite.config.ts` uses `base: './'`, so every asset URL is relative and the same build works at any sub-path
  (the Pages project path, a custom domain, or a local server).
- Code and CSS files get content-hashed names, so a new deploy never mixes old and new JavaScript.
- Files under `public/` (scene, UI markup, textures) keep their names. GitHub Pages caches every file for
  10 minutes, so for 10 minutes after a deploy a returning visitor can get the old copy of one of them. Do not
  deploy while judges are playing; deploy, wait 10 minutes, then run the smoke test.

## Smoke test of the live URL
```
node tests/live-url-smoke.mjs https://<user>.github.io/ORBIT-ZERO-THE-LAST-DOWNLINK/
```
It opens the live site with a Meta Quest user agent and the IWER Quest 3 emulator, waits for the headset lobby,
taps ENTER VR once, and fails on any 4xx/5xx request or page error. It also loads the desktop landing. It is an
emulator check of the deployed files; the headset checklist (`docs/HEADSET_SESSION_CHECKLIST.md`) still applies.

## Opening it on a Quest
Quest Browser -> type the URL -> the page shows one ENTER VR button -> tap it (pinch or trigger) -> allow
hand tracking if asked. `?perf=1` at the end of the URL adds the performance readout.
