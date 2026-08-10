/* 73 Hickory Trail — renders the whole page from content.json.
   Everything textual carries a data-edit="json.path" attribute so admin.js
   can make it editable in place. */
(() => {
  const app = document.getElementById('app');
  const state = {
    content: null,
    galleries: {}, // galleryId -> [{src, caption}]
    lb: { gallery: null, index: 0 },
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const visible = (images) => (images || []).filter((i) => !i.hidden);

  /* ---------- protection: block context menu & drag on imagery ---------- */
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('img, .shield, .cover, .thumb, .plancard, .hero, #lightbox')) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (e.target.closest('img')) e.preventDefault();
  });

  /* ---------- rendering ---------- */
  function photoTile(cls, img, gid, idx, extra = '') {
    return `
      <div class="${cls}${img.hidden ? ' is-hidden-img' : ''}" data-gallery="${gid}" data-index="${idx}" data-img="${esc(img.key)}">
        <img src="${esc(cls.startsWith('cover') ? img.src : img.thumb)}" alt="${esc(img.caption || '')}" loading="lazy">
        <div class="shield"></div>
        ${extra}
      </div>`;
  }

  function roomHTML(room, si, ri) {
    const admin = document.body.classList.contains('admin');
    const list = admin ? room.images || [] : visible(room.images);
    const imgs = list.map((img) => ({ ...img, key: `${si}.${ri}.${room.images.indexOf(img)}` }));
    const gid = `room-${si}-${ri}`;
    state.galleries[gid] = imgs.map((i) => ({ src: i.src, caption: room.title }));
    if (!imgs.length && !admin) return '';

    const flip = ri % 2 === 1;
    const arch = ri % 2 === 0;
    const MAXT = 4;
    const rest = imgs.slice(1);
    const shown = admin ? rest : rest.slice(0, MAXT); // admin sees every photo
    const extraCount = rest.length - shown.length;

    const thumbs = shown
      .map((img, i) => {
        const more = extraCount > 0 && i === shown.length - 1
          ? `<div class="morecount" data-gallery="${gid}" data-index="${i + 1}">+${extraCount + 1}</div>` : '';
        return photoTile('thumb', img, gid, i + 1, more);
      })
      .join('');

    return `
      <article class="room${flip ? ' flip' : ''}" id="${esc(room.id)}">
        <div class="room-info">
          <h3 data-edit="sections.${si}.rooms.${ri}.title">${esc(room.title)}</h3>
          <p data-edit="sections.${si}.rooms.${ri}.text">${esc(room.text)}</p>
          ${room.pano?.src && state.showTour ? `<button class="pano-btn" data-pano="${esc(room.id)}">⦿ View in 360°</button>` : ''}
        </div>
        <div class="room-photos" data-room="${si}.${ri}">
          ${imgs.length ? photoTile(`cover${arch ? ' arch' : ''}`, imgs[0], gid, 0) : '<p><em>No photos yet.</em></p>'}
          ${thumbs ? `<div class="thumbstrip">${thumbs}</div>` : ''}
        </div>
      </article>`;
  }

  function render() {
    const c = state.content;
    state.galleries = {};
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    const admin = document.body.classList.contains('admin');
    const hasPano = c.sections.some((s) => s.rooms.some((r) => r.pano?.src));
    // tour.draft hides the 360° tour from visitors while it's being authored
    const showTour = hasPano && (c.tour?.draft !== true || admin);
    state.showTour = showTour;

    const floors = c.sections
      .map(
        (s, si) => `
      <section class="floor" id="${esc(s.id)}">
        <div class="wrap">
          <div class="floor-head">
            <div class="index">${roman[si] || si + 1} —</div>
            <h2 data-edit="sections.${si}.title">${esc(s.title)}</h2>
            <p data-edit="sections.${si}.intro">${esc(s.intro)}</p>
          </div>
          ${s.rooms.map((r, ri) => roomHTML(r, si, ri)).join('')}
        </div>
      </section>`
      )
      .join('');

    const planImgs = visible(c.floorplans.images).map((img) => ({ ...img }));
    state.galleries['plans'] = planImgs.map((i) => ({ src: i.src, caption: i.caption }));

    const townImgs = c.town ? (admin ? c.town.images : visible(c.town.images)) : [];
    state.galleries['town'] = townImgs.map((i) => ({ src: i.src, caption: i.caption }));

    app.innerHTML = `
      <div class="hero" id="top">
        <div class="bg" style="background-image:url('${esc(c.hero.image)}')"></div>
        <div class="hero-inner">
          <span class="status" data-edit="site.status">${esc(c.site.status)}</span>
          <h1 data-edit="hero.headline">${esc(c.hero.headline)}</h1>
          <p class="sub" data-edit="hero.subheadline">${esc(c.hero.subheadline)}</p>
          <p class="price" data-edit="site.price">${esc(c.site.price)}</p>
          ${showTour ? `<button class="tour-btn" data-pano-first>⦿ Take the 360° Tour</button>` : ''}
          <a class="down" href="#main-floor" data-edit="hero.ctaText">${esc(c.hero.ctaText)}</a>
        </div>
      </div>

      <div class="stats">
        <div class="wrap">
          ${c.stats
            .map(
              (st, i) => `
            <div class="stat">
              <div class="value" data-edit="stats.${i}.value">${esc(st.value)}</div>
              <div class="label" data-edit="stats.${i}.label">${esc(st.label)}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <section class="about" id="about">
        <div class="wrap">
          <div class="eyebrow" data-edit="site.location">${esc(c.site.location)}</div>
          <h2 data-edit="about.heading">${esc(c.about.heading)}</h2>
          <div class="cols">
            <div class="lead">
              ${c.about.paragraphs.map((p, i) => `<p data-edit="about.paragraphs.${i}">${esc(p)}</p>`).join('')}
            </div>
            <ul class="features">
              ${c.about.features.map((f, i) => `<li data-edit="about.features.${i}">${esc(f)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </section>

      <section class="plans" id="floorplans">
        <div class="wrap">
          <div class="eyebrow">Drawings</div>
          <h2 data-edit="floorplans.heading">${esc(c.floorplans.heading)}</h2>
          <p data-edit="floorplans.intro">${esc(c.floorplans.intro)}</p>
          <div class="plangrid">
            ${planImgs
              .map(
                (img, i) => `
              <div class="plancard" data-gallery="plans" data-index="${i}">
                <img src="${esc(img.thumb)}" alt="${esc(img.caption)}" loading="lazy">
                <div class="shield"></div>
                <div class="plabel" data-edit="floorplans.images.${c.floorplans.images.indexOf(img)}.caption">${esc(img.caption)}</div>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </section>

      ${showTour ? `
      <section class="tour" id="tour360">
        <div class="wrap">
          <div class="eyebrow">Look Around</div>
          <h2 data-edit="tour.heading">${esc(c.tour?.heading || 'Walk Through in 360°')}</h2>
          <p data-edit="tour.intro">${esc(c.tour?.intro || 'Drag to look around, scroll to zoom, and follow the arrows to move room to room.')}</p>
          ${admin && c.tour?.draft ? `<p class="tour-draft">Draft — visitors won't see this section until the draft flag is turned off.</p>` : ''}
          <div class="tour-frame">
            <div id="tourViewer"></div>
            <div class="tour-label" id="tourRoomLabel"></div>
          </div>
        </div>
      </section>` : ''}

      ${floors}

      ${c.town ? `
      <section class="town" id="town">
        <div class="wrap">
          <div class="eyebrow">The Town</div>
          <h2 data-edit="town.heading">${esc(c.town.heading)}</h2>
          <p class="town-tagline" data-edit="town.tagline">${esc(c.town.tagline)}</p>
          ${c.town.paragraphs.map((p, i) => `<p class="town-para" data-edit="town.paragraphs.${i}">${esc(p)}</p>`).join('')}
          <div class="town-facts">
            ${c.town.facts.map((f, i) => `
              <div class="stat">
                <div class="value" data-edit="town.facts.${i}.value">${esc(f.value)}</div>
                <div class="label" data-edit="town.facts.${i}.label">${esc(f.label)}</div>
              </div>`).join('')}
          </div>
          <div class="towngrid">
            ${townImgs
              .map(
                (img, i) => `
              <div class="plancard${img.hidden ? ' is-hidden-img' : ''}" data-gallery="town" data-index="${i}">
                <img src="${esc(img.thumb)}" alt="${esc(img.caption)}" loading="lazy">
                <div class="shield"></div>
                <div class="plabel" data-edit="town.images.${c.town.images.indexOf(img)}.caption">${esc(img.caption)}</div>
              </div>`
              )
              .join('')}
          </div>
          <p class="town-credit" data-edit="town.credit">${esc(c.town.credit)}</p>
        </div>
      </section>` : ''}

      <section class="contact" id="contact">
        <div class="wrap">
          <div class="card">
            <div class="eyebrow">Get in touch</div>
            <h2 data-edit="contact.heading">${esc(c.contact.heading)}</h2>
            <p data-edit="contact.blurb">${esc(c.contact.blurb)}</p>
            <div class="name" data-edit="contact.name">${esc(c.contact.name)}</div>
            <div class="reach">
              <a href="tel:${esc(c.contact.phone.replace(/[^0-9+]/g, ''))}" data-edit="contact.phone">${esc(c.contact.phone)}</a>
              <a href="mailto:${esc(c.contact.email)}" data-edit="contact.email">${esc(c.contact.email)}</a>
            </div>
            <div class="price-line">${esc(c.site.price)} · ${esc(c.site.status)}</div>
            <a class="brochure" href="assets/brochure-73-hickory-trail.pdf" download>Download the Brochure (PDF)</a>
          </div>
        </div>
      </section>`;

    document.getElementById('footerLine').textContent =
      `${c.site.title} · ${c.site.location} · ${c.site.status}`;
    app.setAttribute('aria-busy', 'false');
    document.dispatchEvent(new CustomEvent('site:rendered'));
  }

  /* ---------- lightbox ---------- */
  const lb = document.getElementById('lightbox');
  const lbImg = lb.querySelector('img');
  const lbCap = lb.querySelector('.lb-caption');
  const lbCount = lb.querySelector('.lb-count');

  function openLightbox(gid, index) {
    const g = state.galleries[gid];
    if (!g || !g.length) return;
    state.lb = { gallery: gid, index };
    show();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function show() {
    const g = state.galleries[state.lb.gallery];
    const item = g[state.lb.index];
    lbImg.src = item.src;
    lbCap.textContent = item.caption || '';
    lbCount.textContent = g.length > 1 ? `— ${state.lb.index + 1} / ${g.length}` : '';
  }
  function nav(d) {
    const g = state.galleries[state.lb.gallery];
    state.lb.index = (state.lb.index + d + g.length) % g.length;
    show();
  }
  function closeLb() {
    lb.hidden = true;
    lbImg.src = '';
    document.body.style.overflow = '';
  }
  lb.querySelector('.lb-close').addEventListener('click', closeLb);
  lb.querySelector('.lb-prev').addEventListener('click', () => nav(-1));
  lb.querySelector('.lb-next').addEventListener('click', () => nav(1));
  lb.addEventListener('click', (e) => {
    if (e.target === lb) closeLb();
  });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') nav(-1);
    if (e.key === 'ArrowRight') nav(1);
  });

  app.addEventListener('click', (e) => {
    if (document.body.classList.contains('admin') && e.target.closest('.imgtools, [data-edit]')) return;
    const tile = e.target.closest('[data-gallery]');
    if (tile) openLightbox(tile.dataset.gallery, Number(tile.dataset.index));
  });

  /* ---------- nav ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') navLinks.classList.remove('open');
  });

  /* ---------- boot ---------- */
  fetch('content.json?v=' + Date.now())
    .then((r) => {
      if (!r.ok) throw new Error(`content.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((c) => {
      state.content = c;
      render();
    })
    .catch((err) => {
      app.innerHTML = `<p style="padding:6rem 2rem;text-align:center">Could not load site content (${esc(err.message)}). Please refresh.</p>`;
    });

  window.SITE = { state, render, openLightbox };
})();
