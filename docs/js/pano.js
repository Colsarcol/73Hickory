/* 360° walkthrough (Pannellum), embedded inline (#tourViewer, rendered by
   main.js between Floor Plans and the photo tour). Scenes live in
   content.json at tour.scenes:
     { id, title, src, yaw?, pitch?, hfov?, room?,
       hotspots?: [{yaw, pitch, target, text}] }
   `target` is another scene's id — hotspots walk between scenes. A scene
   with a `room` id gives that room its "View in 360°" button.

   Admin mode adds authoring on top of the viewer:
   - "Set start view" saves the current camera angles as the room's opening view
   - "+ Arrow" then a click in the panorama places a doorway hotspot
   - clicking an existing arrow offers Follow / Remove
   While `tour.draft` is true, main.js hides the section from visitors. */
(() => {
  let viewer = null;
  let addingArrow = false;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isAdmin = () => document.body.classList.contains('admin');
  const content = () => window.SITE?.state?.content;

  const sceneList = () => content()?.tour?.scenes || [];

  // pick the 8192px copy only on GPUs that can texture it; 4096 otherwise
  let hdOk = null;
  function useHd() {
    if (hdOk === null) {
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        hdOk = !!gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192;
      } catch {
        hdOk = false;
      }
    }
    return hdOk;
  }
  const sceneById = (id) => sceneList().find((s) => s.id === id);
  const currentScene = () => (viewer ? sceneById(viewer.getScene()) : null);

  function buildScenes() {
    const out = {};
    sceneList().forEach((sc) => {
      out[sc.id] = {
        roomTitle: sc.title,
        type: 'equirectangular',
        panorama: useHd() && sc.srcHd ? sc.srcHd : sc.src,
        yaw: sc.yaw || 0,
        pitch: sc.pitch || 0,
        hfov: sc.hfov || 120,
        hotSpots: (sc.hotspots || []).map((h, hi) => {
          const spot = {
            yaw: h.yaw,
            pitch: h.pitch || 0,
            type: 'scene',
            text: h.text || '',
            sceneId: h.target,
          };
          // in admin, clicks manage the arrow instead of following it
          if (isAdmin()) spot.clickHandlerFunc = (e) => manageArrow(e, sc, hi);
          return spot;
        }),
      };
    });
    return out;
  }

  function init(startScene) {
    const el = document.getElementById('tourViewer');
    if (!el || typeof pannellum === 'undefined') return;
    const scenes = buildScenes();
    const first = startScene && scenes[startScene] ? startScene : Object.keys(scenes)[0];
    if (!first) return;
    viewer?.destroy();
    viewer = pannellum.viewer('tourViewer', {
      default: {
        firstScene: first,
        sceneFadeDuration: 800,
        autoLoad: true,
        mouseZoom: false, // plain scroll passes through to the page
        keyboardZoom: false, // else holding Ctrl/Shift zooms — only Ctrl+wheel and the UI buttons should
      },
      scenes,
    });
    viewer.on('scenechange', (id) => setLabel(scenes[id]?.roomTitle));
    setLabel(scenes[first].roomTitle);
    // Ctrl+scroll zooms the panorama; bare scroll keeps normal page flow.
    // Wheel input moves a target and the view glides toward it each frame —
    // per-event steps (instant or tweened) both feel jumpy.
    let zoomTarget = null;
    let zoomRaf = 0;
    el.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey || !viewer) return;
        e.preventDefault();
        if (zoomTarget === null) zoomTarget = viewer.getHfov();
        zoomTarget = Math.min(120, Math.max(50, zoomTarget + e.deltaY * 0.05));
        if (!zoomRaf) {
          const step = () => {
            if (!viewer) { zoomRaf = 0; zoomTarget = null; return; }
            const cur = viewer.getHfov();
            viewer.setHfov(cur + (zoomTarget - cur) * 0.25, false);
            if (Math.abs(zoomTarget - cur) > 0.1) {
              zoomRaf = requestAnimationFrame(step);
            } else {
              zoomRaf = 0;
              zoomTarget = null;
            }
          };
          zoomRaf = requestAnimationFrame(step);
        }
      },
      { passive: false }
    );
    if (isAdmin()) {
      ensureEditorBar(el.closest('.tour-frame'));
      el.addEventListener('mouseup', onPanoClick);
    }
  }

  function setLabel(t) {
    const label = document.getElementById('tourRoomLabel');
    if (label) label.textContent = t || '';
  }

  function goTo(roomId) {
    const el = document.getElementById('tourViewer');
    if (!el || !viewer) return;
    el.closest('section')?.scrollIntoView({ behavior: 'smooth' });
    if (roomId && viewer.getScene() !== roomId && sceneById(roomId)) {
      viewer.loadScene(roomId);
    }
  }

  /* ---------- admin authoring ---------- */
  const dirty = () => window.SITE_ADMIN?.markDirty?.();
  const status = (m) => window.SITE_ADMIN?.status?.(m);

  function ensureEditorBar(frame) {
    if (!frame || frame.querySelector('.pano-edit')) return;
    const bar = document.createElement('div');
    bar.className = 'pano-edit';
    bar.innerHTML = `
      <button data-pact="start" title="Save the current view as this room's opening view">Set start view</button>
      <button data-pact="arrow" title="Place a doorway arrow">+ Arrow</button>
      <span class="pano-edit-hint">Drag to the view you want, then “Set start view”. “+ Arrow”, then click a doorway. Click an arrow to follow or remove it.</span>`;
    frame.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const act = e.target.dataset?.pact;
      if (act === 'start') setStartView();
      else if (act === 'arrow') startAddArrow();
    });
  }

  function setStartView() {
    const sc = currentScene();
    if (!sc) return;
    sc.yaw = +viewer.getYaw().toFixed(1);
    sc.pitch = +viewer.getPitch().toFixed(1);
    sc.hfov = +viewer.getHfov().toFixed(1);
    dirty();
    // rebuild so the running viewer picks up the new config — otherwise
    // revisiting the scene still opens with the angles it was created with
    init(sc.id);
    status(`Start view saved for ${sc.title}.`);
  }

  function startAddArrow() {
    const sc = currentScene();
    if (!sc) return;
    if (!sceneList().some((x) => x.id !== sc.id)) {
      alert('No other 360° scenes to link to yet — upload another panorama first.');
      return;
    }
    addingArrow = true;
    status('Now click the doorway in the panorama…');
  }

  function onPanoClick(e) {
    if (!addingArrow || !viewer) return;
    addingArrow = false;
    const sc = currentScene();
    const [pitch, yaw] = viewer.mouseEventToCoords(e);
    chooseDestination(sc).then((dest) => {
      if (!dest) {
        status('Arrow cancelled.');
        return;
      }
      (sc.hotspots ??= []).push({
        yaw: +yaw.toFixed(1),
        pitch: +pitch.toFixed(1),
        target: dest.id,
        text: dest.title,
      });
      dirty();
      rebuildKeepingView(sc.id);
      status(`Arrow to ${dest.title} added.`);
    });
  }

  function chooseDestination(fromScene) {
    return new Promise((resolve) => {
      const others = sceneList().filter((x) => x.id !== fromScene.id);
      const dlg = document.createElement('div');
      dlg.className = 'dlg-overlay';
      dlg.innerHTML = `
        <div class="updlg-card">
          <h3>This doorway leads to…</h3>
          <label>Scene
            <select>${others.map((o) => `<option value="${esc(o.id)}">${esc(o.title)}</option>`).join('')}</select>
          </label>
          <div class="updlg-actions">
            <button class="ghost" data-act="cancel">Cancel</button>
            <button data-act="ok">Place arrow</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('[data-act="cancel"]').onclick = () => {
        dlg.remove();
        resolve(null);
      };
      dlg.querySelector('[data-act="ok"]').onclick = () => {
        const id = dlg.querySelector('select').value;
        dlg.remove();
        resolve(others.find((o) => o.id === id));
      };
    });
  }

  function manageArrow(e, scene, hi) {
    e?.stopPropagation?.();
    const h = scene.hotspots?.[hi];
    if (!h) return;
    const dlg = document.createElement('div');
    dlg.className = 'dlg-overlay';
    dlg.innerHTML = `
      <div class="updlg-card">
        <h3>Arrow → ${esc(h.text || h.target)}</h3>
        <div class="updlg-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="ghost" data-act="remove">Remove arrow</button>
          <button data-act="follow">Follow it</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('[data-act="cancel"]').onclick = () => dlg.remove();
    dlg.querySelector('[data-act="follow"]').onclick = () => {
      dlg.remove();
      viewer.loadScene(h.target);
    };
    dlg.querySelector('[data-act="remove"]').onclick = () => {
      dlg.remove();
      scene.hotspots.splice(hi, 1);
      dirty();
      rebuildKeepingView(scene.id);
      status('Arrow removed.');
    };
  }

  function rebuildKeepingView(sceneId) {
    const y = viewer.getYaw();
    const p = viewer.getPitch();
    const f = viewer.getHfov();
    init(sceneId);
    viewer.on('load', function restore() {
      viewer.setYaw(y, false);
      viewer.setPitch(p, false);
      viewer.setHfov(f, false);
      viewer.off('load', restore);
    });
  }

  document.addEventListener('site:rendered', () => init());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pano-first]')) return goTo(null);
    const btn = e.target.closest('[data-pano]');
    if (btn) goTo(btn.dataset.pano);
  });

  window.SITE_PANO = { goTo };
})();
