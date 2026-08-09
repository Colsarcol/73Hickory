# 73hickory.com

For-sale-by-owner listing site for 73 Hickory Trail, Norris TN. Pure static site
hosted on GitHub Pages — no build step, no server.

## Layout

- `docs/` — the published website (GitHub Pages serves this folder)
  - `index.html`, `css/`, `js/` — the site shell; all content is rendered from…
  - `content.json` — **every piece of text and photo placement on the site.**
    This is the file the admin panel edits.
  - `assets/img/` — web-resized, EXIF-stripped copies of the photos (max 1600px)
- `images/` — full-resolution originals. **Git-ignored on purpose** so they are
  never published; only the downscaled copies go online.
- `scripts/process-images.mjs` — regenerates `docs/assets/img/` + manifest from `images/`
- `scripts/build-content.mjs` — regenerates `content.json` from the manifest
  (⚠ overwrites admin edits — only rerun after adding new photos, and merge carefully)

## Adding new photos

1. Drop them into the right room folder under `images/`
2. `node scripts/process-images.mjs`
3. Add entries for the new files to `docs/content.json` (or rerun
   `node scripts/build-content.mjs` if the live content hasn't been hand-edited)
4. Commit and push

## Admin panel

Visit `https://73hickory.com/#admin` (or press **Ctrl+Shift+A** on the site).

- Click any text to edit it in place
- Buttons on each photo: ← → reorder · ★ make room cover · Hide/Show ·
  ⌂ use as banner photo · dropdown moves it to another room
- **Save & Publish** commits `docs/content.json` back to this repo; the live
  site updates about a minute later
- First use asks for the repo (`owner/name`) and a GitHub fine-grained personal
  access token with **Contents: Read and write** permission on this repo only
  (create at Settings → Developer settings → Fine-grained tokens). The token
  stays in that browser's localStorage — never in the repo.

## Deploying (one-time setup)

1. Create a GitHub repository and push this project
2. Repo Settings → Pages → Source: **Deploy from a branch**, branch `main`,
   folder `/docs`
3. Repo Settings → Pages → Custom domain: `73hickory.com` (the `docs/CNAME`
   file already matches), tick **Enforce HTTPS** once the check passes
4. At your domain registrar, point the domain at GitHub Pages:
   - `A` records for `73hickory.com` → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<your-github-username>.github.io`

## Image protection

True download-prevention is impossible on the open web, but the site layers
deterrents: right-click and drag are disabled on photos, a transparent shield
sits over every image so "Save image as…" doesn't target them, and only
1600px compressed copies are ever published — the originals stay offline.

## 360° photos (future)

GitHub Pages handles these fine — a 360 photo is a normal JPEG rendered by a
client-side viewer such as [Pannellum](https://pannellum.org/). When photos
exist, add the viewer and a `pano` field to a room in `content.json`.
