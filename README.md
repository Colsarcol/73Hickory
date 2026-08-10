# 73hickory.com

For-sale-by-owner listing site for 73 Hickory Trail, Norris TN. Pure static site
hosted on GitHub Pages — no build step, no server.

## Layout

- `docs/` — the published website (GitHub Pages serves this folder)
  - `index.html`, `css/`, `js/` — the site shell; all content is rendered from…
  - `content.json` — **every piece of text and photo placement on the site.**
  - `assets/img/` — web-resized, EXIF-stripped copies of the photos (max 1600px)
- `images/` — full-resolution originals. **Git-ignored on purpose** so they are
  never published; only the downscaled copies go online.
- `scripts/process-images.mjs` — regenerates `docs/assets/img/` + manifest from `images/`
- `scripts/build-content.mjs` — regenerates `content.json` from the manifest
  (⚠ overwrites live content edits — only rerun after adding new photos, and merge carefully)

## Adding new photos

1. Drop them into the right room folder under `images/`
2. `node scripts/process-images.mjs`
3. Add entries for the new files to `docs/content.json` (or rerun
   `node scripts/build-content.mjs` if the live content hasn't been hand-edited)
4. Commit and push

## Image protection

True download-prevention is impossible on the open web, but the site layers
deterrents: right-click and drag are disabled on photos, a transparent shield
sits over every image so "Save image as…" doesn't target them, and only
1600px compressed copies are ever published — the originals stay offline.
