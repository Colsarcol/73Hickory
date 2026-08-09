// Batch-process listing photos into web-safe copies.
// Originals in images/ are never published; only resized, EXIF-stripped
// copies land in docs/assets/img/.
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const SRC = path.resolve('images');
const OUT = path.resolve('docs/assets/img');
const WEB_MAX = 1600;   // long edge for lightbox/display copies
const THUMB_MAX = 520;  // long edge for grid thumbnails
const SKIP = new Set(['Brochure 73 Hickory Trail.pdf']);

const manifest = {};

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else if (!SKIP.has(e.name) && /\.jpe?g$/i.test(e.name)) files.push(p);
  }
  return files;
}

const files = (await walk(SRC)).sort();
console.log(`Processing ${files.length} images...`);

// Group by relative directory so we can number images per room.
const groups = {};
for (const f of files) {
  const rel = path.relative(SRC, path.dirname(f)) || 'root';
  (groups[rel] ??= []).push(f);
}

for (const [rel, group] of Object.entries(groups)) {
  const outDir = path.join(OUT, rel);
  await fs.mkdir(outDir, { recursive: true });
  manifest[rel] = [];
  let i = 0;
  for (const f of group.sort()) {
    i++;
    const slug = path.basename(rel).replace(/[^a-zA-Z0-9]/g, '') || 'img';
    const base = `${slug}-${String(i).padStart(2, '0')}`;
    const img = sharp(f).rotate(); // honor EXIF orientation, then strip metadata
    const meta = await img.metadata();
    const webPath = path.join(outDir, `${base}.jpg`);
    const thumbPath = path.join(outDir, `${base}-t.jpg`);
    const webInfo = await img
      .clone()
      .resize(WEB_MAX, WEB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(webPath);
    await img
      .clone()
      .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(thumbPath);
    manifest[rel].push({
      src: path.posix.join('assets/img', rel.split(path.sep).join('/'), `${base}.jpg`),
      thumb: path.posix.join('assets/img', rel.split(path.sep).join('/'), `${base}-t.jpg`),
      w: webInfo.width,
      h: webInfo.height,
      original: path.relative(SRC, f),
    });
  }
  console.log(`${rel}: ${i} images`);
}

await fs.mkdir('docs', { recursive: true });
await fs.writeFile('docs/assets/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Wrote docs/assets/manifest.json');
