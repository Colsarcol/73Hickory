/* Admin mode for 73hickory.com.
   Activate by visiting the site with #admin in the URL (73hickory.com/#admin)
   or pressing Ctrl+Shift+A. Edits happen in the browser against content.json;
   "Save & Publish" commits the file to GitHub via the REST API using a
   fine-grained personal access token, and GitHub Pages redeploys the site.
   The token is stored only in this browser's localStorage. */
(() => {
  const LS = {
    cfg: 'hickory-admin-cfg',
    on: 'hickory-admin-on',
  };

  const getCfg = () => JSON.parse(localStorage.getItem(LS.cfg) || 'null');
  const setCfg = (c) => localStorage.setItem(LS.cfg, JSON.stringify(c));

  let dirty = false;
  let bar = null;

  /* ---------- object path helpers ---------- */
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const setPath = (obj, path, val) => {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o == null ? o : o[k]), obj);
    if (target != null) target[last] = val;
  };

  /* ---------- activation ---------- */
  // SHA-256 of the admin passphrase. This is a courtesy gate to keep visitors
  // out of the editing UI — real protection is the GitHub token, without which
  // nothing can be published. To change: printf 'newpass' | sha256sum
  const PASS_HASH = 'a13c6eea646a38bcdac6e6639162a11b7d121657d3918a3424ef938e78e51658';

  async function checkPass() {
    if (isOn()) return true; // already unlocked in this tab
    const p = prompt('Admin passphrase:');
    if (p === null) return false;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.trim()));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== PASS_HASH) {
      alert('Incorrect passphrase.');
      return false;
    }
    return true;
  }

  function isOn() {
    return sessionStorage.getItem(LS.on) === '1';
  }
  function enable() {
    sessionStorage.setItem(LS.on, '1');
    document.body.classList.add('admin');
    buildBar();
    // re-render so hidden photos appear ghosted; render fires site:rendered → decorate()
    if (window.SITE?.state?.content) window.SITE.render();
  }
  function disable() {
    sessionStorage.removeItem(LS.on);
    document.body.classList.remove('admin');
    bar?.remove();
    bar = null;
    location.hash = '';
    window.SITE?.render();
  }

  function setup() {
    const cur = getCfg() || { repo: '', branch: 'main', path: 'docs/content.json', token: '' };
    const repo = prompt('GitHub repository as owner/name (e.g. colin/73hickory):', cur.repo);
    if (repo === null) return;
    const token = prompt(
      'GitHub personal access token with "Contents: read & write" on that repo.\n' +
        'Create one at github.com/settings/personal-access-tokens (fine-grained).\n' +
        'Stored only in this browser:',
      cur.token
    );
    if (token === null) return;
    setCfg({ ...cur, repo: repo.trim(), token: token.trim() });
    status('Settings saved.');
  }

  /* ---------- admin bar ---------- */
  function buildBar() {
    bar?.remove();
    bar = document.createElement('div');
    bar.id = 'adminbar';
    bar.innerHTML = `
      <strong>Admin</strong>
      <span class="status" id="adminStatus">Click any text to edit it. Use the buttons on photos to rearrange.</span>
      <span class="grow"></span>
      <button class="ghost" id="adminUpload">Upload Photo</button>
      <button class="ghost" id="adminSetup">Settings</button>
      <button class="ghost" id="adminDownload">Download JSON</button>
      <button id="adminSave">Save &amp; Publish</button>
      <button class="ghost" id="adminExit">Exit</button>`;
    document.body.appendChild(bar);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.hidden = true;
    bar.appendChild(fileInput);
    bar.querySelector('#adminUpload').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      if (fileInput.files[0]) uploadDialog(fileInput.files[0]);
      fileInput.value = '';
    };
    bar.querySelector('#adminSetup').onclick = setup;
    bar.querySelector('#adminExit').onclick = () => {
      if (dirty && !confirm('You have unsaved changes. Exit anyway?')) return;
      disable();
    };
    bar.querySelector('#adminDownload').onclick = () => {
      const blob = new Blob([JSON.stringify(window.SITE.state.content, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'content.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    bar.querySelector('#adminSave').onclick = save;
  }

  function status(msg) {
    const el = document.getElementById('adminStatus');
    if (el) el.textContent = msg;
  }
  function markDirty() {
    dirty = true;
    status('Unsaved changes — click "Save & Publish" when ready.');
  }

  /* ---------- decorate rendered DOM ---------- */
  function decorate() {
    if (!isOn() || !window.SITE?.state?.content) return;
    const c = window.SITE.state.content;

    // Editable text
    document.querySelectorAll('[data-edit]').forEach((el) => {
      el.setAttribute('contenteditable', 'plaintext-only');
      el.addEventListener('blur', () => {
        const val = el.innerText.trim();
        if (val !== String(getPath(c, el.dataset.edit) ?? '')) {
          setPath(c, el.dataset.edit, val);
          markDirty();
        }
      });
      // prevent link navigation / lightbox while editing
      el.addEventListener('click', (e) => e.preventDefault());
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    });

    // Banner photo picker on the hero
    const hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.hero-tools')) {
      const every = [];
      c.sections.forEach((s) =>
        s.rooms.forEach((r) =>
          (r.images || []).forEach((img, i) => every.push({ src: img.src, label: `${r.title} #${i + 1}` }))
        )
      );
      (c.town?.images || []).forEach((img, i) => every.push({ src: img.src, label: `Norris #${i + 1}` }));
      const tools = document.createElement('div');
      tools.className = 'imgtools hero-tools';
      tools.innerHTML = `
        <span class="hero-tools-label">Banner photo:</span>
        <select title="Choose the banner photo">
          ${every
            .map((o) => `<option value="${o.src}" ${o.src === c.hero.image ? 'selected' : ''}>${o.label}</option>`)
            .join('')}
        </select>`;
      hero.appendChild(tools);
      tools.querySelector('select').addEventListener('change', (e) => {
        c.hero.image = e.target.value;
        markDirty();
        status('Banner photo updated.');
        window.SITE.render();
      });
    }

    // Photo toolbars
    const roomList = [];
    c.sections.forEach((s, si) => s.rooms.forEach((r, ri) => roomList.push({ si, ri, label: `${s.title} — ${r.title}` })));

    document.querySelectorAll('[data-img]').forEach((tile) => {
      const [si, ri, idx] = tile.dataset.img.split('.').map(Number);
      const room = c.sections[si].rooms[ri];
      const arr = room.images;
      const img = arr[idx];
      if (!img) return;

      const tools = document.createElement('div');
      tools.className = 'imgtools';
      const opts = roomList
        .map((r) => `<option value="${r.si}.${r.ri}" ${r.si === si && r.ri === ri ? 'selected' : ''}>${r.label}</option>`)
        .join('');
      tools.innerHTML = `
        <button data-act="left" title="Move earlier">←</button>
        <button data-act="right" title="Move later">→</button>
        <button data-act="cover" title="Make this the room's big photo">★</button>
        <button data-act="hide" title="Hide/show on the site">${img.hidden ? 'Show' : 'Hide'}</button>
        <button data-act="hero" title="Use as the top banner photo">⌂</button>
        <select title="Move to another room">${opts}</select>`;
      tile.appendChild(tools);

      tools.addEventListener('click', (e) => {
        const act = e.target.dataset?.act;
        if (!act) return;
        e.stopPropagation();
        if (act === 'left' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        else if (act === 'right' && idx < arr.length - 1) [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
        else if (act === 'cover') { arr.splice(idx, 1); arr.unshift(img); }
        else if (act === 'hide') img.hidden = !img.hidden;
        else if (act === 'hero') { c.hero.image = img.src; status('Banner photo updated.'); }
        markDirty();
        window.SITE.render();
      });
      tools.querySelector('select').addEventListener('change', (e) => {
        e.stopPropagation();
        const [tsi, tri] = e.target.value.split('.').map(Number);
        if (tsi === si && tri === ri) return;
        arr.splice(idx, 1);
        c.sections[tsi].rooms[tri].images.push(img);
        markDirty();
        window.SITE.render();
      });
      tools.querySelector('select').addEventListener('click', (e) => e.stopPropagation());
    });
  }

  /* ---------- photo upload ---------- */
  // Mirrors scripts/process-images.mjs in the browser: resize to a 2048px web
  // copy + 520px thumb; canvas re-encode strips EXIF (GPS etc.) automatically.
  async function resizeToJpeg(file, maxEdge, quality) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bmp = await createImageBitmap(file); // older browsers
    }
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error('could not process this image');
    return { blob, w, h };
  }

  const blobToB64 = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(new Error('could not read file'));
      r.readAsDataURL(blob);
    });

  async function ghPutFile(cfg, path, blob, message) {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ message, content: await blobToB64(blob), branch: cfg.branch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub error ${res.status}`);
    }
  }

  function uploadDialog(file) {
    const c = window.SITE.state.content;
    const dests = [];
    c.sections.forEach((s, si) =>
      s.rooms.forEach((r, ri) => dests.push({ v: `room.${si}.${ri}`, label: `${s.title} — ${r.title}` }))
    );
    if (c.town) dests.push({ v: 'town', label: 'Life in Norris' });

    const dlg = document.createElement('div');
    dlg.id = 'uploadDlg';
    dlg.innerHTML = `
      <div class="updlg-card">
        <h3>Add a photo</h3>
        <img class="updlg-preview" alt="">
        <label>Place in
          <select>${dests.map((d) => `<option value="${d.v}">${d.label}</option>`).join('')}</select>
        </label>
        <label>Caption <input type="text" placeholder="optional"></label>
        <div class="updlg-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button data-act="go">Upload &amp; Add</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const preview = dlg.querySelector('.updlg-preview');
    preview.src = URL.createObjectURL(file);
    const closeDlg = () => {
      URL.revokeObjectURL(preview.src);
      dlg.remove();
    };
    dlg.querySelector('[data-act="cancel"]').onclick = closeDlg;
    dlg.querySelector('[data-act="go"]').onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      try {
        let cfg = getCfg();
        if (!cfg?.repo || !cfg?.token) {
          setup();
          cfg = getCfg();
        }
        if (!cfg?.repo || !cfg?.token) throw new Error('repo and token are required');
        const dest = dlg.querySelector('select').value;
        const caption = dlg.querySelector('input').value.trim();
        const web = await resizeToJpeg(file, 2048, 0.8);
        const thumb = await resizeToJpeg(file, 520, 0.72);
        const slug = file.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40) || 'photo';
        const base = `upload-${Date.now()}-${slug}`;
        const rel = `assets/img/uploads/${base}`;
        await ghPutFile(cfg, `docs/${rel}.jpg`, web.blob, `Upload photo via admin panel: ${base}`);
        await ghPutFile(cfg, `docs/${rel}-t.jpg`, thumb.blob, `Upload photo thumb via admin panel: ${base}`);
        const entry = { src: `${rel}.jpg`, thumb: `${rel}-t.jpg`, w: web.w, h: web.h, caption, hidden: false };
        if (dest === 'town') c.town.images.push(entry);
        else {
          const [, si, ri] = dest.split('.').map(Number);
          c.sections[si].rooms[ri].images.push(entry);
        }
        markDirty();
        closeDlg();
        window.SITE.render();
        status('Photo uploaded. It may show broken for a minute while GitHub deploys — click "Save & Publish" to put it on the site.');
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Upload & Add';
      }
    };
  }

  /* ---------- save to GitHub ---------- */
  async function save() {
    // flush any focused edit first
    document.activeElement?.blur?.();
    let cfg = getCfg();
    if (!cfg?.repo || !cfg?.token) {
      setup();
      cfg = getCfg();
      if (!cfg?.repo || !cfg?.token) return status('Save cancelled — repo and token are required.');
    }

    const api = `https://api.github.com/repos/${cfg.repo}/contents/${cfg.path}`;
    const headers = {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
    };
    status('Saving…');
    try {
      const cur = await fetch(`${api}?ref=${cfg.branch}`, { headers });
      if (cur.status === 401 || cur.status === 403) throw new Error('Token was rejected — check it in Settings.');
      if (cur.status === 404) throw new Error(`Could not find ${cfg.path} in ${cfg.repo} — check Settings.`);
      if (!cur.ok) throw new Error(`GitHub error ${cur.status}`);
      const { sha } = await cur.json();

      const json = JSON.stringify(window.SITE.state.content, null, 2);
      const body = {
        message: 'Update site content via admin panel',
        content: btoa(unescape(encodeURIComponent(json))),
        sha,
        branch: cfg.branch,
      };
      const put = await fetch(api, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!put.ok) {
        const err = await put.json().catch(() => ({}));
        throw new Error(err.message || `GitHub error ${put.status}`);
      }
      dirty = false;
      status('Saved! The live site will update in about a minute.');
    } catch (e) {
      status(`Save failed: ${e.message}`);
      alert(`Save failed: ${e.message}`);
    }
  }

  /* ---------- wiring ---------- */
  document.addEventListener('site:rendered', decorate);
  document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (isOn()) disable();
      else if (await checkPass()) enable();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  const boot = async () => {
    if (isOn()) enable();
    else if (location.hash === '#admin' && (await checkPass())) enable();
  };
  if (window.SITE?.state?.content) boot();
  else document.addEventListener('site:rendered', boot, { once: true });
  window.addEventListener('hashchange', async () => {
    if (location.hash === '#admin' && !isOn() && (await checkPass())) enable();
  });
})();
