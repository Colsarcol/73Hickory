/* 360° walkthrough (Pannellum), embedded as an inline section (#tourViewer,
   rendered by main.js between Floor Plans and the photo tour). Any room in
   content.json may carry a `pano` field:
     { src, yaw?, pitch?, hfov?, hotspots?: [{yaw, pitch, target, text}] }
   `target` is another room's id — hotspots walk between scenes. The hero
   tour button and per-room "View in 360°" buttons scroll to the viewer and
   jump to the matching scene. */
(() => {
  let viewer = null;

  function buildScenes() {
    const c = window.SITE?.state?.content;
    const out = {};
    if (!c) return out;
    c.sections.forEach((s) =>
      s.rooms.forEach((r) => {
        if (!r.pano?.src) return;
        // room title deliberately NOT set as pannellum `title` — pannellum
        // renders that in its own info box, duplicating our .tour-label
        out[r.id] = {
          roomTitle: r.title,
          type: 'equirectangular',
          panorama: r.pano.src,
          yaw: r.pano.yaw || 0,
          pitch: r.pano.pitch || 0,
          hfov: r.pano.hfov || 100,
          hotSpots: (r.pano.hotspots || []).map((h) => ({
            yaw: h.yaw,
            pitch: h.pitch || 0,
            type: 'scene',
            text: h.text || '',
            sceneId: h.target,
          })),
        };
      })
    );
    return out;
  }

  function init() {
    const el = document.getElementById('tourViewer');
    if (!el || typeof pannellum === 'undefined') return;
    const scenes = buildScenes();
    const first = Object.keys(scenes)[0];
    if (!first) return;
    viewer?.destroy();
    viewer = pannellum.viewer('tourViewer', {
      default: {
        firstScene: first,
        sceneFadeDuration: 800,
        autoLoad: true,
        mouseZoom: false, // plain scroll passes through to the page
      },
      scenes,
    });
    viewer.on('scenechange', (id) => setLabel(scenes[id]?.roomTitle));
    setLabel(scenes[first].roomTitle);
    // Ctrl+scroll zooms the panorama; bare scroll keeps normal page flow
    el.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey || !viewer) return;
        e.preventDefault();
        // instant, same step size as pannellum's native wheel zoom
        viewer.setHfov(viewer.getHfov() + e.deltaY * 0.05, false);
      },
      { passive: false }
    );
  }

  function setLabel(t) {
    const label = document.getElementById('tourRoomLabel');
    if (label) label.textContent = t || '';
  }

  function goTo(roomId) {
    const el = document.getElementById('tourViewer');
    if (!el || !viewer) return;
    el.closest('section')?.scrollIntoView({ behavior: 'smooth' });
    if (roomId && viewer.getScene() !== roomId && buildScenes()[roomId]) {
      viewer.loadScene(roomId);
    }
  }

  document.addEventListener('site:rendered', init);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pano-first]')) return goTo(null);
    const btn = e.target.closest('[data-pano]');
    if (btn) goTo(btn.dataset.pano);
  });

  window.SITE_PANO = { goTo };
})();
