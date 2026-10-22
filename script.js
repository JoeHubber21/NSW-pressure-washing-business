// =============================================================
// PRESSURE WASHING WEBSITE — SCRIPT
// Two independent features live in this file:
//   1. The before/after drag-to-compare slider on the homepage.
//   2. The quote calculator modal (service picker, pricing engine,
//      lead-capture form, and EmailJS confirmation email).
// Everything else on the site is plain HTML and CSS.
// =============================================================

/* =============================================================
   EMAILJS SETUP — fill these 3 values in before this goes live
   -------------------------------------------------------------
   1. Create a free account at https://www.emailjs.com
   2. Add an Email Service (e.g. connect your Gmail) ->
      copy its "Service ID" into EMAILJS_CONFIG.serviceId below.
   3. Create an Email Template with these variables somewhere in
      the template body (EmailJS inserts them automatically):
         {{to_name}}        {{to_email}}       {{customer_phone}}
         {{customer_suburb}} {{preferred_date}} {{notes}}
         {{service_name}}   {{scope}}          {{duration}}
         {{estimate_avg}}   {{estimate_low}}   {{estimate_high}}
         {{reference}}      {{business_phone}}
      Copy that template's "Template ID" into templateId below.
   4. On the EmailJS "Account" page, copy your "Public Key" into
      publicKey below.
   Until all 3 are filled in, the calculator still works end to
   end — it just skips the actual network call and goes straight
   to the confirmation screen, so you can demo and test everything
   else first.
============================================================= */
const EMAILJS_CONFIG = {
  publicKey: 'YOUR_EMAILJS_PUBLIC_KEY',
  serviceId: 'YOUR_EMAILJS_SERVICE_ID',
  templateId: 'YOUR_EMAILJS_TEMPLATE_ID'
};

const BUSINESS_PHONE_DISPLAY = '0485 998 427';

function emailJsIsConfigured() {
  return typeof emailjs !== 'undefined' &&
    EMAILJS_CONFIG.publicKey.indexOf('YOUR_') !== 0 &&
    EMAILJS_CONFIG.serviceId.indexOf('YOUR_') !== 0 &&
    EMAILJS_CONFIG.templateId.indexOf('YOUR_') !== 0;
}

// =============================================================
// BEFORE / AFTER PHOTO CAROUSEL (homepage) + ZOOMABLE PHOTO VIEWER
// The photos themselves live in index.html (one <li> per photo).
// This code only makes them scroll, and opens the big viewer.
// =============================================================

// How many seconds each photo takes to scroll past. Higher = slower.
const GALLERY_SECONDS_PER_SLIDE = 10;

let galleryItems = [];   // filled in by initGallery(), read by the viewer

function initGallery() {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;

  const marquee = gallery.querySelector('.marquee');
  const track = gallery.querySelector('.marquee-track');
  const firstSet = gallery.querySelector('.marquee-set');
  const toggleBtn = document.getElementById('marqueeToggle');
  const originals = Array.from(firstSet.querySelectorAll('.gallery-item'));
  if (!originals.length) return;

  // 1. Read each photo once, so the viewer knows what to show
  galleryItems = originals.map(function (li, i) {
    li.dataset.index = i;
    const img = li.querySelector('img');
    const cap = li.querySelector('.gallery-caption');
    return {
      src: li.dataset.full || img.src,
      alt: img.alt,
      caption: cap ? cap.textContent.trim() : img.alt,
      type: li.dataset.type || ''
    };
  });

  // Copies are only for the endless-loop effect: hidden from screen readers and the Tab key
  function markAsCopy(el) {
    el.setAttribute('data-clone', '');
    el.setAttribute('aria-hidden', 'true');
    el.querySelectorAll('button').forEach(function (b) { b.tabIndex = -1; });
  }

  // 2. Make the loop: fill the row if there are very few photos,
  //    then add a second identical row so the scroll never shows a gap.
  function rebuild() {
    gallery.querySelectorAll('[data-clone]').forEach(function (n) { n.remove(); });

    let guard = 0;
    while (firstSet.scrollWidth < marquee.clientWidth && guard < 10) {
      originals.forEach(function (li) {
        const copy = li.cloneNode(true);
        markAsCopy(copy);
        firstSet.appendChild(copy);
      });
      guard++;
    }

    const secondSet = firstSet.cloneNode(true);
    secondSet.querySelectorAll('.gallery-item').forEach(markAsCopy);
    markAsCopy(secondSet);
    track.appendChild(secondSet);

    track.style.setProperty('--marquee-duration', (firstSet.children.length * GALLERY_SECONDS_PER_SLIDE) + 's');
  }

  rebuild();
  gallery.classList.add('is-ready');

  let lastWidth = marquee.clientWidth;
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (marquee.clientWidth !== lastWidth) {
        lastWidth = marquee.clientWidth;
        rebuild();
      }
    }, 250);
  });

  // 3. Clicking any photo (including the looped copies) opens the viewer
  marquee.addEventListener('click', function (e) {
    const li = e.target.closest('.gallery-item');
    if (!li) return;
    openLightbox(parseInt(li.dataset.index, 10), li.querySelector('button'));
  });

  // 4. Pause / Play button
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      const paused = gallery.classList.toggle('is-paused');
      toggleBtn.textContent = paused ? 'Play' : 'Pause';
      toggleBtn.setAttribute('aria-label', paused ? 'Resume photo scrolling' : 'Pause photo scrolling');
    });
  }
}

// =============================================================
// PHOTO VIEWER (lightbox) with zoom
// Zoom: + / - buttons, mouse wheel, pinch, double-click / double-tap.
// Move around when zoomed: drag, or arrow keys.
// =============================================================
const LB_MAX_SCALE = 5;
const lb = { index: 0, scale: 1, x: 0, y: 0, lastFocus: null, pointers: new Map(), pan: null, pinch: null, lastTap: null };
let lbEl, lbStage, lbImg, lbCaption, lbCounter, lbZoomIn, lbZoomOut, lbReset, lbPrev, lbNext;

function initLightbox() {
  lbEl = document.getElementById('lightbox');
  if (!lbEl) return;
  lbStage = document.getElementById('lightboxStage');
  lbImg = document.getElementById('lightboxImg');
  lbCaption = document.getElementById('lightboxCaption');
  lbCounter = document.getElementById('lightboxCounter');
  lbZoomIn = document.getElementById('lightboxZoomIn');
  lbZoomOut = document.getElementById('lightboxZoomOut');
  lbReset = document.getElementById('lightboxReset');
  lbPrev = document.getElementById('lightboxPrev');
  lbNext = document.getElementById('lightboxNext');

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lbZoomIn.addEventListener('click', function () { lbZoomBy(1.5); });
  lbZoomOut.addEventListener('click', function () { lbZoomBy(1 / 1.5); });
  lbReset.addEventListener('click', function () { lb.scale = 1; lb.x = 0; lb.y = 0; lbApply(); });
  lbPrev.addEventListener('click', function () { showLightboxImage(lb.index - 1); });
  lbNext.addEventListener('click', function () { showLightboxImage(lb.index + 1); });

  lbImg.addEventListener('load', lbApply);
  lbImg.addEventListener('dragstart', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { if (!lbEl.hidden) lbApply(); });

  lbStage.addEventListener('wheel', onLightboxWheel, { passive: false });
  lbStage.addEventListener('pointerdown', onLightboxPointerDown);
  lbStage.addEventListener('pointermove', onLightboxPointerMove);
  lbStage.addEventListener('pointerup', onLightboxPointerUp);
  lbStage.addEventListener('pointercancel', onLightboxPointerUp);
}

function openLightbox(index, trigger) {
  if (!lbEl || !galleryItems.length) return;
  lb.lastFocus = trigger || document.activeElement;
  lbEl.hidden = false;
  document.body.style.overflow = 'hidden';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.classList.add('is-lb-open');
  showLightboxImage(index);
  document.addEventListener('keydown', onLightboxKey);
  document.getElementById('lightboxClose').focus();
}

function closeLightbox() {
  if (!lbEl || lbEl.hidden) return;
  lbEl.hidden = true;
  document.body.style.overflow = '';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.classList.remove('is-lb-open');
  document.removeEventListener('keydown', onLightboxKey);
  lb.pointers.clear();
  lb.pan = null;
  lb.pinch = null;
  lbStage.classList.remove('is-gesture', 'is-panning');
  if (lb.lastFocus && typeof lb.lastFocus.focus === 'function') lb.lastFocus.focus();
}

function showLightboxImage(i) {
  const n = galleryItems.length;
  lb.index = (i + n) % n;
  const item = galleryItems[lb.index];
  lb.scale = 1; lb.x = 0; lb.y = 0;
  lbImg.src = item.src;
  lbImg.alt = item.alt;
  lbCaption.textContent = item.caption;
  lbCaption.setAttribute('data-type', item.type);
  lbCounter.textContent = (lb.index + 1) + ' / ' + n;
  lbPrev.hidden = lbNext.hidden = n < 2;
  lbApply();
}

// ---- zoom maths ----
// The size the photo is drawn at when not zoomed (it "fits" inside the viewer)
function lbFit() {
  const sw = lbStage.clientWidth, sh = lbStage.clientHeight;
  const nw = lbImg.naturalWidth || sw, nh = lbImg.naturalHeight || sh;
  const k = Math.min(sw / nw, sh / nh);
  return { w: nw * k, h: nh * k, sw: sw, sh: sh };
}
// How far the zoomed photo may be dragged before its edge would leave the screen
function lbLimits() {
  const f = lbFit();
  return {
    x: Math.max(0, (f.w * lb.scale - f.sw) / 2),
    y: Math.max(0, (f.h * lb.scale - f.sh) / 2)
  };
}
function lbApply() {
  if (!lbEl || lbEl.hidden) return;
  const lim = lbLimits();
  lb.x = Math.min(lim.x, Math.max(-lim.x, lb.x));
  lb.y = Math.min(lim.y, Math.max(-lim.y, lb.y));
  lbImg.style.transform = 'translate(' + lb.x + 'px, ' + lb.y + 'px) scale(' + lb.scale + ')';
  const zoomed = lb.scale > 1.001;
  lbStage.classList.toggle('is-zoomed', zoomed);
  lbZoomOut.disabled = !zoomed;
  lbReset.disabled = !zoomed;
  lbZoomIn.disabled = lb.scale >= LB_MAX_SCALE - 0.001;
}
// Zoom to newScale, keeping the point (clientX, clientY) under the finger/cursor
function lbZoomAt(newScale, clientX, clientY) {
  newScale = Math.min(LB_MAX_SCALE, Math.max(1, newScale));
  const r = lbStage.getBoundingClientRect();
  const px = clientX - (r.left + r.width / 2);
  const py = clientY - (r.top + r.height / 2);
  const ratio = newScale / lb.scale;
  lb.x = px - ratio * (px - lb.x);
  lb.y = py - ratio * (py - lb.y);
  lb.scale = newScale;
  if (newScale === 1) { lb.x = 0; lb.y = 0; }
  lbApply();
}
function lbZoomBy(factor) {
  const r = lbStage.getBoundingClientRect();
  lbZoomAt(lb.scale * factor, r.left + r.width / 2, r.top + r.height / 2);
}
function lbPointIsOnPhoto(clientX, clientY) {
  const r = lbStage.getBoundingClientRect();
  const f = lbFit();
  const px = clientX - (r.left + r.width / 2) - lb.x;
  const py = clientY - (r.top + r.height / 2) - lb.y;
  return Math.abs(px) <= (f.w * lb.scale) / 2 && Math.abs(py) <= (f.h * lb.scale) / 2;
}

// ---- mouse wheel ----
function onLightboxWheel(e) {
  e.preventDefault();
  const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  lbZoomAt(lb.scale * Math.exp(-delta * 0.0025), e.clientX, e.clientY);
}

// ---- drag to move, pinch to zoom, double-tap to zoom ----
function lbDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function onLightboxPointerDown(e) {
  try { lbStage.setPointerCapture(e.pointerId); } catch (err) { /* fine to ignore */ }
  lb.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lbStage.classList.add('is-gesture');
  if (lb.pointers.size === 1) {
    lb.pan = { startX: e.clientX, startY: e.clientY, x: lb.x, y: lb.y, moved: false };
  } else if (lb.pointers.size === 2) {
    const pts = Array.from(lb.pointers.values());
    lb.pinch = { dist: lbDistance(pts[0], pts[1]), scale: lb.scale };
    lb.pan = null;
  }
}

function onLightboxPointerMove(e) {
  if (!lb.pointers.has(e.pointerId)) return;
  lb.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (lb.pointers.size === 2 && lb.pinch) {
    const pts = Array.from(lb.pointers.values());
    const d = lbDistance(pts[0], pts[1]);
    if (lb.pinch.dist > 0) {
      lbZoomAt(lb.pinch.scale * (d / lb.pinch.dist), (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    }
  } else if (lb.pan && lb.pointers.size === 1) {
    const dx = e.clientX - lb.pan.startX;
    const dy = e.clientY - lb.pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) lb.pan.moved = true;
    if (lb.scale > 1.001 && lb.pan.moved) {
      lb.x = lb.pan.x + dx;
      lb.y = lb.pan.y + dy;
      lbStage.classList.add('is-panning');
      lbApply();
    }
  }
}

function onLightboxPointerUp(e) {
  const wasTap = e.type === 'pointerup' && lb.pointers.size === 1 && lb.pan && !lb.pan.moved;
  lb.pointers.delete(e.pointerId);
  try { lbStage.releasePointerCapture(e.pointerId); } catch (err) { /* fine to ignore */ }

  if (lb.pointers.size < 2) lb.pinch = null;
  if (lb.pointers.size === 1) {
    // one finger left after a pinch: carry on dragging from where it is
    const p = Array.from(lb.pointers.values())[0];
    lb.pan = { startX: p.x, startY: p.y, x: lb.x, y: lb.y, moved: true };
  }
  if (lb.pointers.size === 0) {
    lb.pan = null;
    lbStage.classList.remove('is-gesture', 'is-panning');
  }
  if (wasTap) onLightboxTap(e);
}

function onLightboxTap(e) {
  const now = Date.now();
  const last = lb.lastTap;
  if (last && now - last.t < 320 && Math.abs(e.clientX - last.x) < 30 && Math.abs(e.clientY - last.y) < 30) {
    lb.lastTap = null;
    lbZoomAt(lb.scale > 1.001 ? 1 : 2.5, e.clientX, e.clientY);   // double-tap: zoom in / back out
    return;
  }
  lb.lastTap = { t: now, x: e.clientX, y: e.clientY };
  // a single tap on the dark area around the photo closes the viewer
  if (lb.scale <= 1.001 && !lbPointIsOnPhoto(e.clientX, e.clientY)) closeLightbox();
}

// ---- keyboard ----
function onLightboxKey(e) {
  const zoomed = lb.scale > 1.001;
  switch (e.key) {
    case 'Escape': closeLightbox(); break;
    case 'ArrowLeft':  if (zoomed) { lb.x += 80; lbApply(); } else showLightboxImage(lb.index - 1); break;
    case 'ArrowRight': if (zoomed) { lb.x -= 80; lbApply(); } else showLightboxImage(lb.index + 1); break;
    case 'ArrowUp':    if (zoomed) { lb.y += 80; lbApply(); } break;
    case 'ArrowDown':  if (zoomed) { lb.y -= 80; lbApply(); } break;
    case '+': case '=': lbZoomBy(1.5); break;
    case '-': case '_': lbZoomBy(1 / 1.5); break;
    case '0': lb.scale = 1; lb.x = 0; lb.y = 0; lbApply(); break;
    case 'Tab': {
      // keep keyboard focus inside the viewer while it is open
      const focusables = lbEl.querySelectorAll('button:not([disabled]):not([hidden])');
      if (!focusables.length) break;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    default: return;
  }
  e.preventDefault();
}

// =============================================================
// ICON LIBRARY
// Small inline-SVG icon set used by the calculator's service
// cards, so the page has no dependency on an external icon font.
// =============================================================
const ICONS = {
  car: '<path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13"/><path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
  roof: '<path d="M2.5 10 12 4l9.5 6"/><path d="M4 10.5v1.5h16v-1.5"/><path d="M7 16.5v1.5M12 16.5v2.5M17 16.5v1.5"/>',
  warehouse: '<path d="M2 10 12 4l10 6"/><path d="M4 10v10h16V10"/><rect x="9" y="14" width="6" height="6"/>',
  chair: '<path d="M6 4v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4"/><path d="M6 20v-3M18 20v-3M6 13h12"/>',
  droplet: '<path d="M12 3C9 7 6 10.5 6 14a6 6 0 0 0 12 0c0-3.5-3-7-6-11Z"/>',
  solar: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M3 14h18M9 6v12M15 6v12"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="1"/>'
};
function iconSvg(name, cls) {
  cls = cls || 'icon icon-lg';
  return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || ICONS.square) + '</svg>';
}

// =============================================================
// PRICING DATA
// Central Coast market-rate pricing dictionary. Two pricing
// categories live side by side here: flat-rate services
// (isFlatRate: true — priced per storey, not per m²) and
// per-unit services (priced by multiplying a base rate by the
// quantity the customer enters).
// =============================================================
const SERVICES_DATA = {
  driveway_concrete: {
    unavailable: false,
    name: 'Concrete Driveway Cleaning', unit: 'm²', basePrice: 5.00, minPrice: 150.00, icon: 'car',
    presets: [30, 50, 90], presetLabels: ['Small (30m²)', 'Standard (50m²)', 'Large (90m²)'],
    sliderRange: [10, 200, 5],
    desc: 'High-pressure surface cleaner application for dirt, tyre marks, and general grime.'
  },
  driveway_paver: {
    unavailable: false,
    name: 'Paver Driveway Cleaning', unit: 'm²', basePrice: 6.50, minPrice: 150.00, icon: 'grid',
    presets: [30, 50, 80], presetLabels: ['Small (30m²)', 'Standard (50m²)', 'Large (80m²)'],
    sliderRange: [10, 200, 5],
    desc: 'Deep paver gap cleaning to remove moss, weeds, and embedded silt.'
  },
  house_wash: {
    unavailable: false,
    name: 'Full House Exterior Wash', unit: 'storey', basePrice: 340.00, isFlatRate: true,
    doubleStoreyPrice: 520.00, minPrice: 340.00, icon: 'house',
    presets: [1, 2], presetLabels: ['Single Storey', 'Double Storey'], sliderRange: [1, 2, 1],
    desc: 'Low-pressure soft wash protecting paintwork, timber weatherboards, and render.'
  },
  facade_wall: {
    unavailable: false,
    name: 'Exterior Wall / Facade Wash', unit: 'm²', basePrice: 3.50, minPrice: 150.00, icon: 'building',
    presets: [50, 100, 150], presetLabels: ['Small (50m²)', 'Medium (100m²)', 'Large (150m²)'],
    sliderRange: [20, 300, 10],
    desc: 'Removes web buildup, dust, and mould from brickwork, stucco, or cladding.'
  },
  roof_clean: {
    unavailable: false,
    name: 'Roof Soft Wash & Pressure Wash', unit: 'm²', basePrice: 2.50, minPrice: 300.00, icon: 'roof',
    presets: [120, 180, 250], presetLabels: ['Small (120m²)', 'Medium (180m²)', 'Large (250m²)'],
    sliderRange: [50, 400, 10],
    desc: 'Eliminates moss, lichen, and black algae on tile or Colorbond roofs.'
  },
  commercial_floor: {
    unavailable: false,
    name: 'Commercial / Warehouse Floor', unit: 'm²', basePrice: 1.20, minPrice: 300.00, icon: 'warehouse',
    presets: [200, 500, 1000], presetLabels: ['200m²', '500m²', '1000m²'],
    sliderRange: [100, 2000, 50],
    desc: 'Industrial floor degreasing and large-scale hardstand pressure washing.'
  },
  deck_patio: {
    unavailable: false,
    name: 'Deck & Outdoor Patio Cleaning', unit: 'm²', basePrice: 4.50, minPrice: 150.00, icon: 'chair',
    presets: [25, 45, 70], presetLabels: ['Patio (25m²)', 'Deck (45m²)', 'Large (70m²)'],
    sliderRange: [10, 150, 5],
    desc: 'Prepares timber decks and stone patios for sealing or restaining.'
  },
  gutter_clean: {
    unavailable: true,
    name: 'Gutter Exterior & Debris Clean', unit: 'lm', basePrice: 6.00, minPrice: 150.00, icon: 'droplet',
    presets: [30, 50, 80], presetLabels: ['30 Linear m', '50 Linear m', '80 Linear m'],
    sliderRange: [10, 150, 5],
    desc: 'Debris clearing plus high-pressure washing of gutter face and downpipes.'
  },
  solar_panels: {
    unavailable: true,
    name: 'Solar Panel Cleaning', unit: 'panels', basePrice: 12.50, minPrice: 150.00, icon: 'solar',
    presets: [12, 20, 32], presetLabels: ['12 Panels', '20 Panels', '32 Panels'],
    sliderRange: [6, 60, 2],
    desc: 'Deionised pure-water wash restoring peak solar energy output.'
  },
  fence_wall: {
    unavailable: false,
    name: 'Fence / Retaining Wall Clean', unit: 'm²', basePrice: 4.00, minPrice: 150.00, icon: 'square',
    presets: [30, 60, 100], presetLabels: ['30m²', '60m²', '100m²'], sliderRange: [10, 200, 5],
    desc: 'Washing timber, Colorbond, or brick masonry retaining walls.'
  }
};
let currentServiceKey = 'driveway_concrete';
let currentStep = 1;
let lastCalculation = {};
let lastFocusedElement = null;

// =============================================================
// MODAL OPEN / CLOSE
// =============================================================
function openCalculator() {
  const overlay = document.getElementById('calcOverlay');
  if (!overlay) return;
  lastFocusedElement = document.activeElement;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', handleCalcKeydown);
  const closeBtn = document.getElementById('calcCloseBtn');
  if (closeBtn) closeBtn.focus();
}
function closeCalculator() {
  const overlay = document.getElementById('calcOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleCalcKeydown);
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}
function handleCalcKeydown(e) {
  if (e.key === 'Escape') { closeCalculator(); return; }
  if (e.key === 'Tab') { trapFocus(e); }
}
function trapFocus(e) {
  const modal = document.querySelector('.calc-modal');
  if (!modal) return;
  const focusables = modal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

// =============================================================
// RENDERING: service cards + quick-pick presets
// =============================================================
function renderServiceCards() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  Object.keys(SERVICES_DATA).forEach(key => {
    const s = SERVICES_DATA[key];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'calc-service-card' + (key === currentServiceKey ? ' is-selected' : '') + (s.unavailable ? ' is-disabled' : '');
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', key === currentServiceKey ? 'true' : 'false');
    card.innerHTML =
      '<span class="calc-service-card-icon">' + iconSvg(s.icon) + '</span>' +
      '<span class="calc-service-card-name">' + s.name + '</span>' +
      (s.unavailable ? '<span class="calc-service-card-tag">Currently Unavailable</span>' : '');

    if (s.unavailable) {
      card.disabled = true;
      card.setAttribute('aria-disabled', 'true');
    } else {
      card.addEventListener('click', function () { selectService(key); });
    }

    grid.appendChild(card);
  });
}
function renderPresets(data) {
  const container = document.getElementById('presetButtons');
  if (!container) return;
  container.innerHTML = '';
  data.presets.forEach((val, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.textContent = data.presetLabels[i];
    btn.addEventListener('click', function () {
      document.getElementById('areaInput').value = val;
      document.getElementById('areaSlider').value = val;
      calculateQuote();
    });
    container.appendChild(btn);
  });
}

// =============================================================
// SELECT A SERVICE
// =============================================================
function selectService(key) {
  currentServiceKey = key;
  const data = SERVICES_DATA[key];

  document.querySelectorAll('.calc-service-card').forEach((card, idx) => {
    const k = Object.keys(SERVICES_DATA)[idx];
    const isSelected = k === key;
    card.classList.toggle('is-selected', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });

  document.getElementById('serviceInfoTitle').textContent = data.name;
  document.getElementById('serviceInfoText').textContent = data.desc;

  const unitTag = document.getElementById('unitTag');
  const dimLabel = document.getElementById('dimensionLabel');
  const sliderContainer = document.getElementById('sliderContainer');

  if (data.isFlatRate) {
    unitTag.textContent = 'Storey';
    dimLabel.textContent = 'Building Height';
    sliderContainer.hidden = true;
    document.getElementById('areaInput').value = 1;
  } else {
    unitTag.textContent = data.unit;
    dimLabel.textContent = 'Total Area / Quantity (' + data.unit + ')';
    sliderContainer.hidden = false;

    const sMin = data.sliderRange[0], sMax = data.sliderRange[1], sStep = data.sliderRange[2];
    const slider = document.getElementById('areaSlider');
    slider.min = sMin; slider.max = sMax; slider.step = sStep;
    slider.value = data.presets[1];
    document.getElementById('areaInput').value = data.presets[1];
    document.getElementById('sliderMin').textContent = sMin + ' ' + data.unit;
    document.getElementById('sliderMax').textContent = sMax + ' ' + data.unit;
  }

  renderPresets(data);
  calculateQuote();
}

// =============================================================
// PRICING ENGINE
// (unchanged math: soiling and access are each a multiplier,
// a minimum call-out fee is enforced, and the displayed range
// is the average plus or minus a margin.)
// =============================================================
function calculateQuote() {
  const s = SERVICES_DATA[currentServiceKey];
  const quantity = parseFloat(document.getElementById('areaInput').value) || 0;
  const soilingMult = parseFloat(document.querySelector('input[name="soiling"]:checked').value);
  const accessMult = parseFloat(document.querySelector('input[name="access"]:checked').value);

  let chemSurcharge = 0;
  if (soilingMult > 1.25) chemSurcharge = 35.00;

  let baseSubtotal = 0;
  if (s.isFlatRate) {
    baseSubtotal = quantity > 1 ? s.doubleStoreyPrice : s.basePrice;
  } else {
    baseSubtotal = quantity * s.basePrice;
  }

  let calculatedTotal = (baseSubtotal * soilingMult * accessMult) + chemSurcharge;

  let minApplied = false;
  let finalAvg = calculatedTotal;
  if (calculatedTotal < s.minPrice) {
    finalAvg = s.minPrice;
    minApplied = true;
  }

  let finalLow = Math.max(finalAvg * 0.90, s.minPrice);
  let finalHigh = finalAvg * 1.15;

  let hoursEst = 1.5;
  if (!s.isFlatRate) {
    hoursEst = Math.max(1.0, Math.round((quantity / 45) * 10) / 10);
  } else {
    hoursEst = quantity > 1 ? 3.5 : 2.0;
  }

  let gstVal = finalAvg - (finalAvg / 1.1);

  lastCalculation = {
    serviceName: s.name,
    quantity: quantity,
    unit: s.unit,
    avgPrice: finalAvg,
    lowPrice: finalLow,
    highPrice: finalHigh,
    gst: gstVal,
    minApplied: minApplied,
    minFee: s.minPrice,
    duration: hoursEst + ' - ' + Math.round(hoursEst + 1) + ' hrs'
  };

  document.getElementById('quoteAvgPrice').textContent = formatAUD(finalAvg);
  document.getElementById('quoteLowPrice').textContent = formatAUD(finalLow);
  document.getElementById('quoteHighPrice').textContent = formatAUD(finalHigh);
  document.getElementById('summaryServiceName').textContent = s.name;
  document.getElementById('summaryScope').textContent = s.isFlatRate ? (quantity > 1 ? 'Double Storey' : 'Single Storey') : (quantity + ' ' + s.unit);
  document.getElementById('summaryDuration').textContent = lastCalculation.duration;
  document.getElementById('summaryGST').textContent = formatAUD(gstVal);

  const badge = document.getElementById('minCalloutBadge');
  if (minApplied) {
    badge.hidden = false;
    document.getElementById('minFeeVal').textContent = formatAUD(s.minPrice);
  } else {
    badge.hidden = true;
  }
}

function formatAUD(val) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val);
}

// =============================================================
// STEP NAVIGATION
// =============================================================
function goToStep(stepNum) {
  currentStep = stepNum;

  document.querySelectorAll('.step-panel').forEach((panel, idx) => {
    panel.classList.toggle('is-active', idx + 1 === stepNum);
  });

  for (let i = 1; i <= 3; i++) {
    const tab = document.getElementById('tab-step-' + i);
    tab.classList.remove('is-current', 'is-done');
    if (i === stepNum) tab.classList.add('is-current');
    else if (i < stepNum) tab.classList.add('is-done');
  }

  if (stepNum === 3) calculateQuote();

  const modal = document.querySelector('.calc-modal');
  if (modal) modal.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================
// FORM SUBMIT -> EMAILJS -> CONFIRMATION
// =============================================================
function handleFormSubmit(e) {
  e.preventDefault();

  const form = document.getElementById('bookingForm');
  if (!form.reportValidity()) return;

  const btn = document.getElementById('submitQuoteBtn');
  const btnText = document.getElementById('submitQuoteBtnText');
  btn.disabled = true;
  if (btnText) btnText.textContent = 'Sending…';

  const randomRef = 'AU-PW-' + Math.floor(10000 + Math.random() * 90000);
  const name = document.getElementById('custName').value;
  const email = document.getElementById('custEmail').value;
  const phone = document.getElementById('custPhone').value;
  const suburb = document.getElementById('custSuburb').value;
  const date = document.getElementById('custDate').value;
  const notes = document.getElementById('custNotes').value;

  const templateParams = {
    to_name: name,
    to_email: email,
    customer_phone: phone,
    customer_suburb: suburb,
    preferred_date: date || 'Not specified',
    notes: notes || 'None provided',
    service_name: lastCalculation.serviceName,
    scope: lastCalculation.quantity + ' ' + lastCalculation.unit,
    duration: lastCalculation.duration,
    estimate_avg: formatAUD(lastCalculation.avgPrice),
    estimate_low: formatAUD(lastCalculation.lowPrice),
    estimate_high: formatAUD(lastCalculation.highPrice),
    reference: randomRef,
    business_phone: BUSINESS_PHONE_DISPLAY
  };

  function finish(success) {
    document.getElementById('resRefNum').textContent = randomRef;
    document.getElementById('resService').textContent = lastCalculation.serviceName + ' (' + lastCalculation.quantity + ' ' + lastCalculation.unit + ')';
    document.getElementById('resEstimate').textContent = formatAUD(lastCalculation.avgPrice) + ' AUD';
    showSuccessState(success);
    btn.disabled = false;
    if (btnText) btnText.textContent = 'Lock In Estimate & Send';
  }

  if (!emailJsIsConfigured()) {
    console.warn('EmailJS is not configured yet (see "EMAILJS SETUP" at the top of script.js). Showing the confirmation screen without sending a real email.');
    finish(true);
    return;
  }

  emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, templateParams)
    .then(function () { finish(true); })
    .catch(function (err) {
      console.error('EmailJS send failed:', err);
      finish(false);
    });
}

function showSuccessState(success) {
  const overlay = document.getElementById('successOverlay');
  const iconWrap = overlay.querySelector('.calc-success-icon');
  const title = overlay.querySelector('.calc-success-title');
  const desc = overlay.querySelector('.calc-success-desc');

  if (success) {
    title.textContent = 'Your quote has been sent to your email!';
    desc.textContent = 'A member of our team will call you shortly to confirm your booking.';
    iconWrap.classList.remove('is-error');
  } else {
    title.textContent = "We've saved your details, but the email didn't send.";
    desc.textContent = 'No problem — just call us on ' + BUSINESS_PHONE_DISPLAY + ' and we\u2019ll confirm your booking directly.';
    iconWrap.classList.add('is-error');
  }
  overlay.hidden = false;
}

function resetCalculator() {
  document.getElementById('bookingForm').reset();
  document.getElementById('successOverlay').hidden = true;
  goToStep(1);
}

function copyQuoteSummary() {
  const textToCopy =
    'PRESSURE WASHING QUOTE SUMMARY\n' +
    'Reference: ' + document.getElementById('resRefNum').textContent + '\n' +
    'Service: ' + lastCalculation.serviceName + '\n' +
    'Scope: ' + lastCalculation.quantity + ' ' + lastCalculation.unit + '\n' +
    'Estimated Investment: ' + formatAUD(lastCalculation.avgPrice) + ' AUD (inc. GST)\n' +
    'Est. Duration: ' + lastCalculation.duration + '\n' +
    'Disclaimer: Quote is an instant estimate subject to final physical site check.';

  function fallbackCopy() {
    const tempInput = document.createElement('textarea');
    tempInput.value = textToCopy;
    tempInput.style.position = 'fixed';
    tempInput.style.opacity = '0';
    document.body.appendChild(tempInput);
    tempInput.select();
    try { document.execCommand('copy'); showToast(); }
    catch (err) { console.error('Copy failed:', err); }
    document.body.removeChild(tempInput);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(showToast).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function showToast() {
  const toast = document.getElementById('copyToast');
  toast.classList.add('is-visible');
  setTimeout(function () { toast.classList.remove('is-visible'); }, 3000);
}

// =============================================================
// WIRING — runs once the page's HTML has been parsed
// =============================================================
function initCalculator() {
  if (!document.getElementById('calcOverlay')) return;

  try {
    if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.publicKey.indexOf('YOUR_') !== 0) {
      emailjs.init(EMAILJS_CONFIG.publicKey);
    }
  } catch (err) {
    console.warn('EmailJS init skipped:', err);
  }

    // If the default service has been switched off, start on the first available one instead
  if (SERVICES_DATA[currentServiceKey].unavailable) {
    const firstAvailable = Object.keys(SERVICES_DATA).find(k => !SERVICES_DATA[k].unavailable);
    if (firstAvailable) currentServiceKey = firstAvailable;
  }

  renderServiceCards();
  selectService(currentServiceKey);

  document.getElementById('areaInput').addEventListener('input', function (e) {
    const val = parseFloat(e.target.value) || 0;
    document.getElementById('areaSlider').value = val;
    calculateQuote();
  });
  document.getElementById('areaSlider').addEventListener('input', function (e) {
    document.getElementById('areaInput').value = e.target.value;
    calculateQuote();
  });

  document.getElementById('bookingForm').addEventListener('submit', handleFormSubmit);

  // Open triggers
  ['openCalcHeader', 'openCalcHero', 'openCalcContact'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (el.tagName === 'A') e.preventDefault();
      openCalculator();
    });
  });

  // Close triggers: the X button, and clicking the dark backdrop itself
  document.getElementById('calcCloseBtn').addEventListener('click', closeCalculator);
  document.getElementById('calcOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeCalculator();
  });
}

function initSite() {
  initGallery();
  initLightbox();
  initCalculator();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSite);
} else {
  initSite();
}
