/* 360° walkthrough (Pannellum), embedded inline (#tourViewer, rendered by
   main.js between Floor Plans and the photo tour). Scenes live in
   content.json at tour.scenes:
     { id, title, src, srcHd?, yaw?, pitch?, hfov?, room?,
       map?: {plan, x, y},          // dot on floorplans.images[plan], % coords
       hotspots?: [
         {yaw, pitch, target, text, targetYaw?, targetPitch?}  // nav arrow
         | {yaw, pitch, info}                                  // info note
       ] }
   `target` is another scene's id — arrows walk between scenes. A scene with
   a `room` id gives that room its "View in 360°" button; room-tagged scenes
   also form the guided-tour playlist, in list order.

   Visitor UI: scene dropdown, arrows on/off toggle, guided tour play,
   floor-plan mini-map. Admin adds authoring: start views, arrows (+arrival
   views), info notes, and map spots. While `tour.draft` is true, main.js
   hides the section from visitors. */
(() => {
  let viewer = null;
  let lastScene = null; // last scene requested — recovery target after a failed load
  let errRetries = 0;
  let addingArrow = false;
  let addingInfo = false;
  let arrivalEdit = null; // {ownerId, hi} while authoring an arrow's arrival view
  let touring = null; // {idx, timer} while the guided tour is playing
  let mapPlan = null; // plan index currently shown in the mini-map

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isAdmin = () => document.body.classList.contains('admin');
  const content = () => window.SITE?.state?.content;

  const sceneList = () => content()?.tour?.scenes || [];

  // pick the 8192px copy only on GPUs that can texture it AND have full
  // fragment-shader precision — low-precision GPUs (many phones) render big
  // equirects with visible skew near the poles. ?pano=sd / ?pano=hd overrides.
  let hdOk = null;
  function useHd() {
    if (hdOk === null) {
      const forced = new URLSearchParams(location.search).get('pano');
      if (forced === 'sd') return (hdOk = false);
      if (forced === 'hd') return (hdOk = true);
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        const prec = gl?.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        hdOk = !!gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 && !!prec && prec.precision >= 23;
      } catch {
        hdOk = false;
      }
    }
    return hdOk;
  }
  const sceneById = (id) => sceneList().find((s) => s.id === id);
  const currentScene = () => (viewer ? sceneById(viewer.getScene()) : null);

  // rough floor grouping for the scene dropdown, inferred from scene ids
  function sceneGroup(sc) {
    const id = sc.id;
    if (/^(upstairs|stair-landing)/.test(id)) return 'Upstairs';
    if (/^(basement|theater-room|craft-room)/.test(id)) return 'Lower Level';
    if (/^(back-|front-|garage|deck)/.test(id)) return 'Outdoors';
    return 'Main Floor';
  }

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
          if (h.info != null) {
            const spot = { yaw: h.yaw, pitch: h.pitch || 0, type: 'info', text: h.info };
            if (isAdmin()) spot.clickHandlerFunc = (e) => manageInfo(e, sc, hi);
            return spot;
          }
          const spot = {
            yaw: h.yaw,
            pitch: h.pitch || 0,
            type: 'scene',
            text: h.text || '',
            sceneId: h.target,
          };
          // per-arrow arrival direction: face this way when entering through
          // this arrow instead of the destination's default start view
          if (h.targetYaw != null) spot.targetYaw = h.targetYaw;
          if (h.targetPitch != null) spot.targetPitch = h.targetPitch;
          // in admin, clicks manage the arrow instead of following it
          if (isAdmin()) spot.clickHandlerFunc = (e) => manageArrow(e, sc, hi);
          return spot;
        }),
      };
    });
    return out;
  }

  // Widest horizontal FOV whose implied vertical FOV stays sane for this
  // viewer's shape. Landscape screens keep 120°; portrait phones get less —
  // a 120° hfov on a tall canvas implies a ~140° vfov, which renders as
  // heavy vertical skew (the projection, not the GPU).
  function hfovCapFor(el) {
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const MAX_VFOV = 105;
    const cap = (360 / Math.PI) * Math.atan(Math.tan((MAX_VFOV * Math.PI) / 360) * aspect);
    return Math.min(120, Math.max(60, cap));
  }

  function init(startScene) {
    const el = document.getElementById('tourViewer');
    if (!el || typeof pannellum === 'undefined') return;
    stopTour();
    const cap = hfovCapFor(el);
    const scenes = buildScenes();
    Object.values(scenes).forEach((s) => (s.hfov = Math.min(s.hfov, cap)));
    const first = startScene && scenes[startScene] ? startScene : Object.keys(scenes)[0];
    if (!first) return;
    viewer?.destroy();
    viewer = pannellum.viewer('tourViewer', {
      default: {
        firstScene: first,
        sceneFadeDuration: 800,
        autoLoad: true,
        maxHfov: cap, // pinch/button zoom-out clamps to the shape-derived cap too
        mouseZoom: false, // plain scroll passes through to the page
        keyboardZoom: false, // else holding Ctrl/Shift zooms — only Ctrl+wheel and the UI buttons should
      },
      scenes,
    });
    viewer.on('scenechange', (id) => onSceneChange(id));
    viewer.on('load', () => (errRetries = 0));
    onSceneChange(first);
    watchLoadErrors(el);
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
        zoomTarget = Math.min(cap, Math.max(50, zoomTarget + e.deltaY * 0.05));
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
    // any manual interaction ends the guided tour
    el.addEventListener('pointerdown', () => stopTour());
    const frame = el.closest('.tour-frame');
    ensureTourNav(frame);
    ensureMiniMap(frame);
    if (isAdmin()) {
      ensureEditorBar(frame);
      el.addEventListener('mouseup', onPanoClick);
    }
  }

  // pannellum 2.5.6 fires no event when a panorama fetch fails — it only
  // shows a .pnlm-error-msg overlay and the viewer is stuck. Watch for the
  // overlay: first failure drops the session from 8K to the 4K copies and
  // reloads; one more plain retry after that, then give up.
  function watchLoadErrors(el) {
    if (el._errWatch) return;
    el._errWatch = new MutationObserver(() => {
      const err = el.querySelector('.pnlm-error-msg');
      if (!err || err.style.display === 'none') return;
      if (errRetries >= 2) return; // persistent failure — leave the message up
      errRetries += 1;
      const scene = lastScene;
      if (useHd()) {
        hdOk = false; // this device/network just failed an 8K fetch
        setTimeout(() => init(scene), 300);
      } else {
        setTimeout(() => init(scene), 1500);
      }
    });
    el._errWatch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function onSceneChange(id) {
    lastScene = id;
    const sc = sceneById(id);
    setLabel(sc?.title);
    const sel = document.querySelector('.tour-nav select');
    if (sel && sel.value !== id) sel.value = id;
    updateMiniMap();
    if (touring) advanceTourTimer();
    // warm every scene this one's arrows lead to — visitors usually leave
    // through an arrow, so the next panorama is already cached on click
    (sc?.hotspots || []).forEach((h) => {
      if (h.target) preloadStop(sceneById(h.target));
    });
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

  /* ---------- visitor nav: dropdown, arrows toggle, guided tour ---------- */
  function ensureTourNav(frame) {
    if (!frame || frame.querySelector('.tour-nav')) return;
    const nav = document.createElement('div');
    nav.className = 'tour-nav';
    const groups = {};
    sceneList().forEach((sc) => (groups[sceneGroup(sc)] ??= []).push(sc));
    nav.innerHTML = `
      <button class="tour-play" title="Play a guided tour of the main rooms">▶ Tour</button>
      <select title="Jump to a scene">
        ${Object.entries(groups)
          .map(
            ([g, list]) => `<optgroup label="${esc(g)}">
              ${list.map((sc) => `<option value="${esc(sc.id)}">${esc(sc.title)}</option>`).join('')}
            </optgroup>`
          )
          .join('')}
      </select>
      <button class="tour-arrows" title="Hide or show the navigation arrows">Arrows: on</button>`;
    frame.appendChild(nav);
    nav.querySelector('select').addEventListener('change', (e) => {
      stopTour();
      if (viewer && viewer.getScene() !== e.target.value) viewer.loadScene(e.target.value);
    });
    nav.querySelector('.tour-arrows').addEventListener('click', (e) => {
      const off = frame.classList.toggle('arrows-off');
      e.target.textContent = off ? 'Arrows: off' : 'Arrows: on';
    });
    nav.querySelector('.tour-play').addEventListener('click', () => (touring ? stopTour() : startTour()));
  }

  /* ---------- guided tour ---------- */
  const TOUR_DWELL_MS = 8000;
  const tourStops = () => sceneList().filter((s) => s.room);

  function startTour() {
    const stops = tourStops();
    if (!viewer || !stops.length) return;
    const curIdx = stops.findIndex((s) => s.id === viewer.getScene());
    touring = { idx: curIdx >= 0 ? curIdx : -1, timer: 0, rotTimer: 0 };
    const btn = document.querySelector('.tour-play');
    if (btn) btn.textContent = '■ Stop';
    nextTourStop();
  }

  function preloadStop(stop) {
    if (stop) new Image().src = useHd() && stop.srcHd ? stop.srcHd : stop.src;
  }

  function nextTourStop() {
    if (!touring) return;
    const stops = tourStops();
    touring.idx += 1;
    if (touring.idx >= stops.length) touring.idx = 0; // loop until the visitor takes over
    const stop = stops[touring.idx];
    if (viewer.getScene() === stop.id) advanceTourTimer();
    else viewer.loadScene(stop.id); // scenechange → advanceTourTimer
  }

  // Pan as ONE pannellum-native animated yaw move covering the dwell —
  // its internal render loop is the smooth path. Driving setYaw per-frame
  // from an external rAF loop stutters (two competing animation loops), and
  // startAutoRotate can't be used: it re-targets pitch and zoom (a 3s
  // lookAt), which reads as unwanted zooming. Only yaw animates here.
  const PAN_TOTAL_DEG = 28;
  function startPan() {
    if (!touring || !viewer) return;
    const yaw = viewer.getYaw();
    // pick the direction that avoids animating across the ±180° seam
    const target = yaw - PAN_TOTAL_DEG >= -180 ? yaw - PAN_TOTAL_DEG : yaw + PAN_TOTAL_DEG;
    viewer.setYaw(target, TOUR_DWELL_MS - 1200);
  }

  function advanceTourTimer() {
    if (!touring) return;
    clearTimeout(touring.timer);
    clearTimeout(touring.rotTimer);
    // let the crossfade finish before panning — rotating mid-fade janks
    touring.rotTimer = setTimeout(startPan, 900);
    touring.timer = setTimeout(() => nextTourStop(), TOUR_DWELL_MS);
    // warm the next stop's image during the dwell so the switch is instant
    preloadStop(tourStops()[touring.idx + 1]);
  }

  function stopTour() {
    if (!touring) return;
    clearTimeout(touring.timer);
    clearTimeout(touring.rotTimer);
    touring = null;
    // freeze the in-flight pan where it is
    if (viewer) viewer.setYaw(viewer.getYaw(), false);
    const btn = document.querySelector('.tour-play');
    if (btn) btn.textContent = '▶ Tour';
  }

  /* ---------- floor-plan mini-map ---------- */
  function planImages() {
    return content()?.floorplans?.images || [];
  }

  function ensureMiniMap(frame) {
    if (!frame || frame.querySelector('.tour-map')) return;
    if (!sceneList().some((s) => s.map)) return; // nothing placed yet
    const map = document.createElement('div');
    map.className = 'tour-map';
    if (window.innerWidth < 700) map.classList.add('collapsed');
    map.innerHTML = `
      <button class="tour-map-toggle" title="Open the full floor plan">Map</button>
      <button class="tour-map-expand" title="Show or hide the mini-map">⤢</button>
      <div class="tour-map-body"><img alt="Floor plan"><div class="tour-map-dots"></div></div>`;
    frame.appendChild(map);
    map.querySelector('.tour-map-toggle').addEventListener('click', expandMap);
    map.querySelector('.tour-map-expand').addEventListener('click', () => map.classList.toggle('collapsed'));
    map.querySelector('.tour-map-dots').addEventListener('click', (e) => {
      const dot = e.target.closest('[data-scene]');
      if (dot && viewer) {
        stopTour();
        viewer.loadScene(dot.dataset.scene);
      }
    });
    updateMiniMap();
  }

  // full-screen map: big plan, clickable dots, tabs to switch floors
  function expandMap() {
    const plans = planImages();
    let plan = mapPlan ?? 0;
    const sc = currentScene();
    const ov = document.createElement('div');
    ov.className = 'map-big';
    const close = () => {
      document.removeEventListener('keydown', onKey);
      ov.remove();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const render = () => {
      // tabs only for actual floor plans (skip the elevation drawings)
      const tabs = plans
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => /plan/i.test(p.caption || ''))
        .map(
          ({ p, i }) =>
            `<button class="map-big-tab${i === plan ? ' cur' : ''}" data-plan="${i}">${esc(p.caption.replace(/\s*plan\s*$/i, ''))}</button>`
        )
        .join('');
      ov.innerHTML = `
        <div class="map-big-card">
          <div class="map-big-head">
            <div class="map-big-tabs">${tabs}</div>
            <button class="map-big-close" aria-label="Close map">×</button>
          </div>
          <div class="map-big-body">
            <div class="map-big-imgwrap">
            <img src="${esc(plans[plan]?.src || '')}" alt="${esc(plans[plan]?.caption || 'Floor plan')}">
            <div class="tour-map-dots">
              ${sceneList()
                .filter((s) => s.map && s.map.plan === plan)
                .map(
                  (s) => `<span class="tour-map-dot big${s.id === sc?.id ? ' cur' : ''}" data-scene="${esc(s.id)}"
                    style="left:${s.map.x}%;top:${s.map.y}%" data-label="${esc(s.title)}"></span>`
                )
                .join('')}
            </div>
            </div>
          </div>
        </div>`;
      ov.querySelector('.map-big-close').onclick = close;
      ov.querySelectorAll('.map-big-tab').forEach((b) =>
        b.addEventListener('click', () => {
          plan = Number(b.dataset.plan);
          render();
        })
      );
      ov.querySelector('.tour-map-dots').addEventListener('click', (e) => {
        const dot = e.target.closest('[data-scene]');
        if (dot && viewer) {
          stopTour();
          viewer.loadScene(dot.dataset.scene);
          close();
        }
      });
    };
    render();
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close();
    });
    document.body.appendChild(ov);
  }

  // which plan to show for a scene: its own map spot wins; otherwise infer
  // the floor from the scene grouping so the map flips floors even for
  // scenes that haven't been pinned yet. Outdoor scenes keep the last plan.
  function planForScene(sc) {
    if (!sc) return -1;
    if (sc.map) return sc.map.plan;
    const plans = planImages();
    const find = (re) => plans.findIndex((p) => re.test(p.caption || ''));
    // outdoor scenes sit at a floor's level: the back yard/pool is at the
    // walk-out basement level; drives, garages, and the front are main-level
    if (/^back-/.test(sc.id)) return find(/lower|basement/i);
    if (/^(front-|garage|deck)/.test(sc.id)) return find(/main/i);
    const g = sceneGroup(sc);
    if (g === 'Main Floor') return find(/main/i);
    if (g === 'Upstairs') return find(/upper|upstairs/i);
    if (g === 'Lower Level') return find(/lower|basement/i);
    return -1;
  }

  function updateMiniMap() {
    const map = document.querySelector('.tour-map');
    if (!map) return;
    const sc = currentScene();
    const inferred = planForScene(sc);
    if (inferred >= 0) mapPlan = inferred;
    if (mapPlan == null) mapPlan = sceneList().find((s) => s.map)?.map.plan;
    const plan = planImages()[mapPlan];
    if (!plan) return;
    const img = map.querySelector('img');
    if (!img.src.endsWith(plan.src)) img.src = plan.src;
    map.querySelector('.tour-map-dots').innerHTML = sceneList()
      .filter((s) => s.map && s.map.plan === mapPlan)
      .map(
        (s) => `<span class="tour-map-dot${s.id === sc?.id ? ' cur' : ''}" data-scene="${esc(s.id)}"
          style="left:${s.map.x}%;top:${s.map.y}%" data-label="${esc(s.title)}"></span>`
      )
      .join('');
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
      <button data-pact="info" title="Place an info note">+ Info</button>
      <button data-pact="mapspot" title="Place this scene on a floor plan">Map spot</button>
      <span class="pano-edit-hint">Set start view · “+ Arrow”/“+ Info” then click the spot · click an arrow or note to manage it.</span>`;
    frame.appendChild(bar);
    bar.addEventListener('click', (e) => {
      const act = e.target.dataset?.pact;
      if (act === 'start') setStartView();
      else if (act === 'arrow') startAddArrow();
      else if (act === 'info') startAddInfo();
      else if (act === 'mapspot') mapDialog();
      else if (act === 'arrivalSave') saveArrivalView();
      else if (act === 'arrivalCancel') {
        arrivalEdit = null;
        hideArrivalBar();
        status('Arrival view cancelled.');
      }
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
    addingInfo = false;
    status('Now click the doorway in the panorama…');
  }

  function startAddInfo() {
    if (!currentScene()) return;
    addingInfo = true;
    addingArrow = false;
    status('Now click where the info note should sit…');
  }

  function onPanoClick(e) {
    if ((!addingArrow && !addingInfo) || !viewer) return;
    const wasArrow = addingArrow;
    addingArrow = addingInfo = false;
    const sc = currentScene();
    const [pitch, yaw] = viewer.mouseEventToCoords(e);
    if (wasArrow) {
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
    } else {
      textDialog('Info note', 'What should this note say?', '').then((text) => {
        if (!text) {
          status('Info note cancelled.');
          return;
        }
        (sc.hotspots ??= []).push({ yaw: +yaw.toFixed(1), pitch: +pitch.toFixed(1), info: text });
        dirty();
        rebuildKeepingView(sc.id);
        status('Info note added.');
      });
    }
  }

  function textDialog(title, label, value) {
    return new Promise((resolve) => {
      const dlg = document.createElement('div');
      dlg.className = 'dlg-overlay';
      dlg.innerHTML = `
        <div class="updlg-card">
          <h3>${esc(title)}</h3>
          <label>${esc(label)} <input type="text" value="${esc(value)}"></label>
          <div class="updlg-actions">
            <button class="ghost" data-act="cancel">Cancel</button>
            <button data-act="ok">Save</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      const input = dlg.querySelector('input');
      input.focus();
      dlg.querySelector('[data-act="cancel"]').onclick = () => {
        dlg.remove();
        resolve(null);
      };
      dlg.querySelector('[data-act="ok"]').onclick = () => {
        const v = input.value.trim();
        dlg.remove();
        resolve(v || null);
      };
    });
  }

  function manageInfo(e, scene, hi) {
    e?.stopPropagation?.();
    const h = scene.hotspots?.[hi];
    if (!h) return;
    const dlg = document.createElement('div');
    dlg.className = 'dlg-overlay';
    dlg.innerHTML = `
      <div class="updlg-card">
        <h3>Info note</h3>
        <p class="updlg-note">“${esc(h.info)}”</p>
        <div class="updlg-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="ghost" data-act="remove">Remove</button>
          <button data-act="edit">Edit text</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('[data-act="cancel"]').onclick = () => dlg.remove();
    dlg.querySelector('[data-act="remove"]').onclick = () => {
      dlg.remove();
      scene.hotspots.splice(hi, 1);
      dirty();
      rebuildKeepingView(scene.id);
      status('Info note removed.');
    };
    dlg.querySelector('[data-act="edit"]').onclick = () => {
      dlg.remove();
      textDialog('Info note', 'Note text', h.info).then((text) => {
        if (!text) return;
        h.info = text;
        dirty();
        rebuildKeepingView(scene.id);
        status('Info note updated.');
      });
    };
  }

  function mapDialog() {
    const sc = currentScene();
    if (!sc) return;
    const plans = planImages();
    const cur = sc.map || { plan: mapPlan ?? 0, x: null, y: null };
    const dlg = document.createElement('div');
    dlg.className = 'dlg-overlay';
    dlg.innerHTML = `
      <div class="updlg-card updlg-wide">
        <h3>Map spot — ${esc(sc.title)}</h3>
        <label>Floor plan
          <select>${plans
            .map((p, i) => `<option value="${i}" ${i === cur.plan ? 'selected' : ''}>${esc(p.caption)}</option>`)
            .join('')}</select>
        </label>
        <div class="mapdlg-imgwrap"><img src="${esc(plans[cur.plan]?.src || '')}" alt="">
          <span class="tour-map-dot cur" ${cur.x == null ? 'hidden' : `style="left:${cur.x}%;top:${cur.y}%"`}></span>
        </div>
        <p class="updlg-note">Click the plan where this scene was shot.</p>
        <div class="updlg-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          ${sc.map ? '<button class="ghost" data-act="clear">Remove spot</button>' : ''}
          <button data-act="ok" ${cur.x == null ? 'disabled' : ''}>Save spot</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const img = dlg.querySelector('img');
    const dot = dlg.querySelector('.tour-map-dot');
    const okBtn = dlg.querySelector('[data-act="ok"]');
    let pick = { plan: cur.plan, x: cur.x, y: cur.y };
    dlg.querySelector('select').addEventListener('change', (e) => {
      pick = { plan: Number(e.target.value), x: null, y: null };
      img.src = plans[pick.plan].src;
      dot.hidden = true;
      okBtn.disabled = true;
    });
    img.addEventListener('click', (e) => {
      const r = img.getBoundingClientRect();
      pick.x = +(((e.clientX - r.left) / r.width) * 100).toFixed(1);
      pick.y = +(((e.clientY - r.top) / r.height) * 100).toFixed(1);
      dot.style.left = `${pick.x}%`;
      dot.style.top = `${pick.y}%`;
      dot.hidden = false;
      okBtn.disabled = false;
    });
    dlg.querySelector('[data-act="cancel"]').onclick = () => dlg.remove();
    dlg.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      dlg.remove();
      delete sc.map;
      dirty();
      updateMiniMap();
      status('Map spot removed.');
    });
    okBtn.onclick = () => {
      dlg.remove();
      sc.map = pick;
      mapPlan = pick.plan;
      dirty();
      const frame = document.querySelector('.tour-frame');
      if (!frame.querySelector('.tour-map')) ensureMiniMap(frame);
      updateMiniMap();
      status(`Map spot saved for ${sc.title}.`);
    };
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
    const hasArrival = h.targetYaw != null;
    const dlg = document.createElement('div');
    dlg.className = 'dlg-overlay';
    dlg.innerHTML = `
      <div class="updlg-card">
        <h3>Arrow → ${esc(h.text || h.target)}</h3>
        <p class="updlg-note">Arrival view: ${hasArrival ? 'custom' : 'destination default'}</p>
        <div class="updlg-actions">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="ghost" data-act="remove">Remove arrow</button>
          ${hasArrival ? '<button class="ghost" data-act="cleararrival">Clear arrival view</button>' : ''}
          <button class="ghost" data-act="arrival">Set arrival view</button>
          <button data-act="follow">Follow it</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('[data-act="cancel"]').onclick = () => dlg.remove();
    dlg.querySelector('[data-act="follow"]').onclick = () => {
      dlg.remove();
      // pass the arrow's arrival angles like pannellum's native click does —
      // otherwise admin "Follow it" can't be used to verify arrival views
      viewer.loadScene(h.target, h.targetPitch, h.targetYaw);
    };
    dlg.querySelector('[data-act="remove"]').onclick = () => {
      dlg.remove();
      scene.hotspots.splice(hi, 1);
      dirty();
      rebuildKeepingView(scene.id);
      status('Arrow removed.');
    };
    dlg.querySelector('[data-act="cleararrival"]')?.addEventListener('click', () => {
      dlg.remove();
      delete h.targetYaw;
      delete h.targetPitch;
      dirty();
      rebuildKeepingView(scene.id);
      status('Arrival view cleared — this arrow uses the destination default again.');
    });
    dlg.querySelector('[data-act="arrival"]').onclick = () => {
      dlg.remove();
      arrivalEdit = { ownerId: scene.id, hi };
      viewer.loadScene(h.target);
      showArrivalBar();
      status('Aim the camera the way visitors should arrive through this arrow, then "Save arrival view".');
    };
  }

  function showArrivalBar() {
    const bar = document.querySelector('.pano-edit');
    if (!bar || bar.querySelector('[data-pact="arrivalSave"]')) return;
    const save = document.createElement('button');
    save.dataset.pact = 'arrivalSave';
    save.textContent = '✓ Save arrival view';
    const cancel = document.createElement('button');
    cancel.dataset.pact = 'arrivalCancel';
    cancel.textContent = '✕ Cancel arrival';
    bar.prepend(cancel);
    bar.prepend(save);
  }

  function hideArrivalBar() {
    document.querySelectorAll('[data-pact="arrivalSave"], [data-pact="arrivalCancel"]').forEach((b) => b.remove());
  }

  function saveArrivalView() {
    if (!arrivalEdit) return;
    const owner = sceneById(arrivalEdit.ownerId);
    const h = owner?.hotspots?.[arrivalEdit.hi];
    arrivalEdit = null;
    hideArrivalBar();
    if (!h) return status('Arrow no longer exists.');
    h.targetYaw = +viewer.getYaw().toFixed(1);
    h.targetPitch = +viewer.getPitch().toFixed(1);
    dirty();
    rebuildKeepingView(viewer.getScene());
    status(`Arrival view saved for the arrow from ${owner.title}.`);
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
