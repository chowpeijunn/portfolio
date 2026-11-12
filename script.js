/* ============================================
   DATA LOADING & CARD RENDERING
   ============================================ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getYouTubeId(url) {
  if (!url) return '';
  if (url.includes('youtu.be/'))    return url.split('youtu.be/')[1].split('?')[0];
  if (url.includes('/shorts/'))     return url.split('/shorts/')[1].split('?')[0];
  if (url.includes('watch?v='))     return url.split('watch?v=')[1].split('&')[0];
  return '';
}

function getYouTubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : '';
}

// Display names for categories where the label shown to visitors differs from the
// internal value stored in data.json (kept as-is so the admin's tag→category sync
// and existing tags keep working). Falls back to a simple capitalisation.
const CATEGORY_LABELS = { branded: 'Branded Content', tvc: 'TVC' };
function categoryLabel(cat) {
  cat = cat || '';
  return CATEGORY_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
}

// Shareable filter links (?filter=weddings). Friendly slugs in the URL map to the
// internal filter values, so a link stays readable (e.g. ?filter=branded-content).
const FILTER_SLUGS = { weddings: 'weddings', branded: 'branded-content', events: 'events', tvc: 'tvc' };
const SLUG_TO_FILTER = { weddings: 'weddings', 'branded-content': 'branded', branded: 'branded', events: 'events', tvc: 'tvc' };
function getUrlFilter() {
  try {
    const s = (new URLSearchParams(location.search).get('filter') || '').toLowerCase().trim();
    return SLUG_TO_FILTER[s] || null;
  } catch (_) { return null; }
}
function syncFilterUrl(category) {
  try {
    const url = new URL(location.href);
    if (category) url.searchParams.set('filter', FILTER_SLUGS[category] || category);
    else url.searchParams.delete('filter');
    history.replaceState(null, '', url);
  } catch (_) { /* history/URL unavailable — ignore */ }
}

function renderCards(projects) {
  const hub = document.getElementById('centerHub');
  if (!hub) return;

  // Skip projects hidden from the public site (toggled in the admin). They stay
  // in data.json so they can be un-hidden later — they're just not rendered here.
  projects = projects.filter(p => !p.hidden);

  // Build lookup map used by openDetail
  window._projectMap = Object.create(null);
  projects.forEach(p => { window._projectMap[p.title] = p; });

  function makeCard(p) {
    const catDisplay = categoryLabel(p.category);
    const tags = Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || '');
    const thumbSrc = p.thumb || '';
    const ytFallback = getYouTubeThumbnail(p.video || '');
    const isYT = (p.video || '').includes('youtu');
    // Local video element (non-YouTube only)
    const videoEl = (!isYT && p.video)
      ? `<video class="card-video" muted loop playsinline preload="none" src="${escapeHtml(p.video)}"></video>`
      : '';
    // Hover preview — lazy loaded via data-src, shown on hover/tap (no YouTube UI).
    // Source priority: explicit p.preview override → first sourceVideos[] entry → legacy p.sourceVideo.
    const previewSrc = p.preview
      || (Array.isArray(p.sourceVideos) && p.sourceVideos[0])
      || p.sourceVideo
      || '';
    const isPreviewVideo = /\.(mp4|webm|mov)$/i.test(previewSrc);
    const gifEl = previewSrc
      ? (isPreviewVideo
          ? `<video class="card-gif" data-src="${escapeHtml(previewSrc)}" muted loop playsinline preload="none"></video>`
          : `<img class="card-gif" data-src="${escapeHtml(previewSrc)}" alt="">`)
      : '';
    const onerrorAttr = ytFallback
      ? ` onerror="this.onerror=null;this.src='${ytFallback}'"`
      : '';
    return `<a href="#" class="project-card" ` +
      `data-category="${escapeHtml(p.category)}" ` +
      `data-tags="${escapeHtml(tags)}" ` +
      `data-title="${escapeHtml(p.title)}" ` +
      `data-thumb="${escapeHtml(thumbSrc)}" ` +
      `data-video="${escapeHtml(p.video || '')}">` +
      `<div class="card-media">` +
      `<img class="card-thumb" src="${thumbSrc}" alt="${escapeHtml(p.title)}" loading="lazy"${onerrorAttr}>` +
      videoEl +
      gifEl +
      `<div class="card-info">` +
      `<span class="card-info-title">${escapeHtml(p.title)}</span>` +
      `<span class="card-info-cat">${catDisplay}</span>` +
      `</div></div></a>`;
  }

  // Record original split so updateHubSpan can restore when column count changes.
  // _globalBeforeCount is the unfiltered hub position, restored when a filter clears.
  window._originalBeforeCount = projects.filter(p => p.slot === 'before').length;
  window._globalBeforeCount = window._originalBeforeCount;

  const beforeHTML = projects.filter(p => p.slot === 'before').map(makeCard).join('\n      ');
  const afterHTML  = projects.filter(p => p.slot === 'after').map(makeCard).join('\n      ');

  if (beforeHTML) hub.insertAdjacentHTML('beforebegin', beforeHTML);
  if (afterHTML)  hub.insertAdjacentHTML('afterend',    afterHTML);
}

// Fetch project data immediately so cards are ready before the loader finishes.
// Cache-bust so freshly published edits (e.g. a new Year) show without a hard refresh.
const _dataReady = fetch('data.json?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.json())
  .then(data => {
    window._filterLayouts = data.filterLayouts || {};
    renderCards(data.projects);
    // Propagate showreel URL to the button
    const showreelBtn = document.getElementById('showreelBtn');
    if (showreelBtn && data.showreel) showreelBtn.dataset.video = data.showreel;
    if (showreelBtn && data.showreelVideo) showreelBtn.dataset.directVideo = data.showreelVideo;
    const showreelCopyEl = document.getElementById('showreelCopy');
    if (showreelCopyEl && data.showreelCopy) showreelCopyEl.textContent = data.showreelCopy;
    // Cards are now in the DOM — safe to compute hub centering
    if (window._updateHubSpan) window._updateHubSpan();
    initHoverToPlay();
    initFilter();
    return data;
  })
  .catch(err => console.error('Failed to load data.json:', err));

/* ============================================
   COUNTER LOADER → LETTER-BY-LETTER NAME (on actual hub card)
   ============================================ */
(function () {
  const loader    = document.getElementById('loader');
  const counter   = document.getElementById('loaderCounter');
  const canvasEl  = document.getElementById('canvas');
  const nav       = document.getElementById('nav');
  const bottomBar = document.getElementById('bottomBar');

  const LETTER_DELAY    = 55;   // ms between each letter
  const LETTER_DURATION = 440;  // ms per letter animation (matches CSS)
  const HOLD_AFTER      = 400;  // ms to hold after last letter lands
  const COUNTER_DUR     = 2000; // ms to count 0→100

  // --- Split the actual hub h1 into per-letter clip wrappers immediately ---
  // Letters start at opacity:0, hidden behind the loader overlay.
  const hubName = document.querySelector('.hub-name');
  const hubText = hubName ? hubName.textContent : '';
  if (hubName && hubText) {
    hubName.textContent = '';
    [...hubText].forEach(ch => {
      const wrap = document.createElement('span');
      wrap.className = 'hub-letter-wrap' + (ch === ' ' ? ' space' : '');
      if (ch !== ' ') {
        const span = document.createElement('span');
        span.className = 'hub-letter';
        span.textContent = ch;
        wrap.appendChild(span);
      }
      hubName.appendChild(wrap);
    });
  }
  const hubLetters = hubName ? hubName.querySelectorAll('.hub-letter') : [];

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2.2);
  }

  function animateHubLetters() {
    hubLetters.forEach((letter, i) => {
      setTimeout(() => {
        letter.classList.add('animate');
      }, i * LETTER_DELAY);
    });
  }

  async function revealSite() {
    await _dataReady;
    // Instantly remove loader (display:none) — never semi-transparent, never a grey band.
    loader.classList.add('done');
    // Put canvas in rendering tree then fade it in.
    canvasEl.style.display = 'block';
    canvasEl.getBoundingClientRect(); // force layout so opacity transition fires from 0
    canvasEl.classList.add('visible');
    nav.classList.add('visible');
    bottomBar.style.display = 'flex';
    bottomBar.getBoundingClientRect();
    bottomBar.classList.add('visible');
    centerOnHub();
    // Deep link: if the URL names a filter (?filter=weddings), land on it directly
    // so a shared link opens straight to that category.
    const urlFilter = getUrlFilter();
    if (urlFilter && window._applyFilter) {
      window._applyFilter(urlFilter, { instant: true });
      centerOnHub(false);
    }
    // Always show return button
    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) returnBtn.classList.add('visible');
    // Small delay so loader fade starts before letters animate
    setTimeout(animateHubLetters, 500);
    // Warm up YouTube player API so first hover loads faster
    setTimeout(warmYouTubeAPI, 1500);
  }

  function warmYouTubeAPI() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;   // phones: skip, it loads ~1 MB of player JS
    const firstYT = document.querySelector('[data-video*="youtu"]');
    if (!firstYT) return;
    const id = getYouTubeId(firstYT.dataset.video || '');
    if (!id) return;
    const primer = document.createElement('iframe');
    primer.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
    primer.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&mute=1`;
    primer.setAttribute('frameborder', '0');
    document.body.appendChild(primer);
    setTimeout(() => { if (primer.parentNode) primer.parentNode.removeChild(primer); }, 12000);
  }

  // Count up
  let start = null;
  function tick(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;
    const progress = Math.min(elapsed / COUNTER_DUR, 1);
    counter.textContent = Math.round(easeOut(progress) * 100);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      // Fade counter out, then reveal site
      counter.style.opacity = '0';
      setTimeout(revealSite, 350);
    }
  }

  requestAnimationFrame(tick);
})();

/* ============================================
   CENTER ON HUB
   ============================================ */
/* Global footer visibility — show only at the bottom of the scroll */
function checkFooterVisibility() {
  const canvas = document.getElementById('canvas');
  const introCard = document.getElementById('introCard');
  if (!canvas || !introCard) return;
  // While a filter is active the grid is short and centred on the hub, which
  // would otherwise read as "scrolled to the bottom" and pop the footer over
  // the cards. Keep it hidden until the filter is cleared.
  if (window._activeFilter) {
    introCard.classList.remove('visible');
    return;
  }
  const atBottom = canvas.scrollTop >= canvas.scrollHeight - canvas.clientHeight - 40;
  introCard.classList.toggle('visible', atBottom);
}

// The grid scrolls natively inside #canvas. When the hub has to stay at a spot
// the grid is too short to scroll to (a filter with few cards), the grid gets
// extra top/bottom padding — empty space, so the hub can still sit there.
function setHubPad(top, bottom) {
  const inner = document.getElementById('canvasInner');
  inner.style.paddingTop = '';
  inner.style.paddingBottom = '';
  inner._padTop = top;
  if (!top && !bottom) return;
  const cs = getComputedStyle(inner);
  if (top) inner.style.paddingTop = (parseFloat(cs.paddingTop) + top) + 'px';
  if (bottom) inner.style.paddingBottom = (parseFloat(cs.paddingBottom) + bottom) + 'px';
}

// Scroll so the hub's top edge sits `screenY` px below the top of the screen.
// With allowPad the grid is padded when it can't scroll that far; without, the
// scroll just stops at the grid's ends.
function placeHub(screenY, smooth, allowPad) {
  const canvas = document.getElementById('canvas');
  const inner = document.getElementById('canvasInner');
  const hub = document.getElementById('centerHub');
  if (!canvas || !inner || !hub) return;
  const s0 = canvas.scrollTop, oldTop = inner._padTop || 0;
  setHubPad(0, 0);
  const hubTop = hub.offsetTop;
  let target = hubTop - screenY, top = 0, bottom = 0;
  if (allowPad) {
    top = Math.max(0, Math.ceil(-target));
    target += top;
    // Measure the grid itself — the scroll height never drops below the screen.
    bottom = Math.max(0, Math.ceil(target - (inner.offsetHeight + top - canvas.clientHeight)));
  }
  setHubPad(top, bottom);
  target = Math.max(0, Math.min(canvas.scrollHeight - canvas.clientHeight, target));
  if (smooth) {
    // Padding added or removed above the view shifts the grid; cancel that out
    // first so only the glide moves it.
    canvas.scrollTop = s0 + top - oldTop;
    canvas.scrollTo({ top: target, behavior: 'smooth' });
  } else {
    canvas.scrollTop = target;
  }
  checkFooterVisibility();
}
window._placeHub = placeHub;

function centerOnHub(smooth) {
  const canvas = document.getElementById('canvas');
  const hub = document.getElementById('centerHub');
  if (!canvas || !hub) return;
  // A filter's grid is short, so let it pad to put the hub dead centre; the main
  // grid just scrolls as close to centred as it can.
  placeHub((canvas.clientHeight - hub.offsetHeight) / 2, smooth, !!window._activeFilter);
}

/* ============================================
   SCROLL PROGRESS
   ============================================ */
(function () {
  const progressBar = document.getElementById('scrollProgress');
  const canvas = document.getElementById('canvas');
  if (!progressBar || !canvas) return;

  function updateProgress() {
    const max = canvas.scrollHeight - canvas.clientHeight;
    const progress = max > 0 ? Math.max(0, Math.min(1, canvas.scrollTop / max)) : 0;
    progressBar.style.width = (progress * 100) + '%';
  }

  window._updateScrollProgress = updateProgress;
})();

/* ============================================
   SCROLL — the phone's / browser's own native scrolling inside #canvas
   ============================================ */
(function () {
  const canvas = document.getElementById('canvas');
  const returnBtn = document.getElementById('returnBtn');
  if (!canvas) return;

  // Side effects of scrolling, batched to once per frame.
  let queued = false;
  canvas.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (window._updateScrollProgress) window._updateScrollProgress();
      checkFooterVisibility();
    });
  }, { passive: true });

  // Return to center — just glide back to the hub, leaving any active filter as-is.
  if (returnBtn) returnBtn.addEventListener('click', () => centerOnHub(true));

})();

/* ============================================
   HOVER-TO-PLAY VIDEO / GIF
   ============================================ */
function initHoverToPlay() {
  // Pre-load src+metadata for card-gif videos as they scroll into view,
  // so the video is already buffered before the user hovers.
  const preloadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const gif = entry.target;
      if (gif.dataset.src && !gif.src) {
        gif.preload = 'metadata';
        gif.src = gif.dataset.src;
      }
      preloadObserver.unobserve(gif);
    });
  }, { rootMargin: '200px' }); // start loading 300px before card enters view

  // Previews are a desktop (hover) feature. Phones and iPads — whose main pointer
  // is a finger and can't hover — get no preview at all: a tap opens the project.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.querySelectorAll('.card-gif[data-src]').forEach(gif => {
    preloadObserver.observe(gif);
  });

  document.querySelectorAll('.project-card').forEach((card) => {
    const media = card.querySelector('.card-media');
    const gif   = card.querySelector('.card-gif');

    if (gif) {
      const isVideo = gif.tagName === 'VIDEO';
      card.addEventListener('mouseenter', () => {
        if (!gif.src && gif.dataset.src) gif.src = gif.dataset.src; // fallback if not yet observed
        gif.style.opacity = '1';
        if (isVideo) gif.play().catch(() => {});
      });
      card.addEventListener('mouseleave', () => {
        gif.style.opacity = '0';
        if (isVideo) gif.pause();
      });
      return;
    }

    const videoUrl = card.dataset.video || '';
    const ytId = getYouTubeId(videoUrl);

    if (ytId) {
      // YouTube-only project with no source/preview video: keep the thumbnail still
      // on hover. Embedding YouTube here flashed its title, avatar and logo.
      return;
    } else {
      // Local video element
      const video = card.querySelector('.card-video');
      if (!video || !video.getAttribute('src')) return;
      card.addEventListener('mouseenter', () => video.play().catch(() => {}));
      card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    }
  });
}

/* ============================================
   FILTER — Hub card buttons
   ============================================ */
function initFilter() {
  const filterBtns = document.querySelectorAll('.hub-filter-btn');
  const inner = document.getElementById('canvasInner');
  const hub = document.getElementById('centerHub');
  if (!inner || !hub) return;

  let activeFilter = null;

  // Stable original ordering — lets us restore each side's relative order on reset.
  inner.querySelectorAll('.project-card').forEach((c, i) => {
    if (c.dataset.order == null) c.dataset.order = i;
  });
  const byOrder = (a, b) => (+a.dataset.order) - (+b.dataset.order);

  function cardMatchesFilter(card, filter) {
    if (!filter) return true;
    const tags = (card.dataset.tags || '').split(',').map(t => t.trim().toLowerCase());
    return card.dataset.category === filter || tags.includes(filter);
  }

  // Filtering packs matching cards into the cells NEAREST the hub and fades the
  // rest out. Non-matching cards keep a (now outer) grid cell via .hidden =
  // opacity:0, and we only reorder WITHIN each side of the hub, so the card count
  // per side is unchanged and the hub cell never moves. A card that ends up in a
  // new cell is crossfaded (hidden across the instant grid reflow, then faded in
  // at its new spot); a card already in the right place is left untouched — so
  // nothing ever slides.
  // Switching filters is a quick crossfade: the cards on screen fade out, the grid
  // swaps while they're invisible, then the new set fades in around the hub, which
  // stays put. Nothing slides. A newer click supersedes one still mid-fade.
  const FADE_OUT_MS = 140, FADE_IN_MS = 200;
  let _filterRun = 0;

  function applyFilter(category, opts = {}) {
    activeFilter = category;
    window._activeFilter = category;
    syncFilterUrl(category);   // keep the URL shareable (?filter=…)
    filterBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === category));

    const run = ++_filterRun;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shown = Array.from(inner.querySelectorAll('.project-card')).filter(c => c.style.display !== 'none');
    // Deep links and resizes lay out straight away; clicks fade the old set out first.
    if (opts.instant || reduce || !shown.length) {
      relayout(category);
      fadeIn(run, opts.noFade || reduce);
      return;
    }
    shown.forEach(c => { c.style.transition = `opacity ${FADE_OUT_MS}ms ease`; c.style.opacity = '0'; });
    setTimeout(() => {
      if (run !== _filterRun) return;   // a newer click took over
      relayout(category);
      fadeIn(run);
    }, FADE_OUT_MS);
  }

  // Rebuild the grid for `category` (null = everything) and keep the hub where it is
  // on screen. Touches layout only — opacity belongs to the fade.
  function relayout(category) {
    const cards = Array.from(inner.querySelectorAll('.project-card'));
    const hubScreen = hub.getBoundingClientRect();   // the hub stays exactly here

    if (!category) {
      // RESET → the main-page arrangement: every card visible, canonical order, the
      // hub back at its unfiltered position.
      cards.forEach(c => { c.style.display = ''; c.classList.remove('hidden'); });
      const all = cards.slice().sort(byOrder);
      const cut = Math.max(0, Math.min(all.length, window._globalBeforeCount || 0));
      all.slice(0, cut).forEach(c => inner.insertBefore(c, hub));
      let ref = hub;
      all.slice(cut).forEach(c => { inner.insertBefore(c, ref.nextSibling); ref = c; });
      window._originalBeforeCount = cut;
    } else {
      // FILTER → render like the main page but on the matching subset. Matching cards
      // take their saved per-filter order (row-major, exactly as arranged in the admin);
      // the rest leave the grid (display:none) so the block is compact with no gaps. A
      // saved layout supplies the order + hub position the user arranged; with none, we
      // fall back to canonical order and a centred hub.
      const match = c => cardMatchesFilter(c, category);
      const matching = cards.filter(match);
      const matchSet = new Set(matching);
      const layout = (window._filterLayouts || {})[category];

      let ordered;
      if (layout && Array.isArray(layout.order) && layout.order.length) {
        const byTitle = Object.create(null);
        matching.forEach(c => { byTitle[c.dataset.title] = c; });
        ordered = [];
        const seen = new Set();
        layout.order.forEach(t => { const c = byTitle[t]; if (c && !seen.has(c)) { ordered.push(c); seen.add(c); } });
        matching.forEach(c => { if (!seen.has(c)) { ordered.push(c); seen.add(c); } });  // new projects appended
      } else {
        ordered = matching.slice().sort(byOrder);
      }
      const nonMatching = cards.filter(c => !matchSet.has(c));

      let hubBefore = (layout && Number.isInteger(layout.hubBefore)) ? layout.hubBefore : Math.ceil(ordered.length / 2);
      hubBefore = Math.max(0, Math.min(ordered.length, hubBefore));

      nonMatching.forEach(c => { c.style.display = 'none'; c.classList.remove('hidden'); });
      ordered.forEach(c => { c.style.display = ''; c.classList.remove('hidden'); });

      ordered.slice(0, hubBefore).forEach(c => inner.insertBefore(c, hub));
      let ref = hub;
      ordered.slice(hubBefore).forEach(c => { inner.insertBefore(c, ref.nextSibling); ref = c; });
      nonMatching.forEach(c => inner.appendChild(c));   // parked at the end, out of the grid

      window._originalBeforeCount = hubBefore;
    }

    // Centre the hub among the VISIBLE cards for the current column count — without
    // re-centring the view, since that made the hub jump.
    if (window._updateHubSpan) window._updateHubSpan(true);
    void inner.offsetWidth;
    // The re-layout moved the hub to a different grid cell. Scroll by the same
    // amount, instantly, so the hub stays put on screen (the buttons stay under the
    // cursor) — padding the grid if it's too short to scroll there.
    if (hubScreen.width && hub.offsetWidth) {   // skip if the grid isn't laid out yet
      const canvas = document.getElementById('canvas');
      // Clicking tab after tab without scrolling reuses the same spot, so sub-pixel
      // rounding can't creep the hub along click by click.
      const unmoved = inner._pinAnchor != null && canvas.scrollTop === inner._pinScroll;
      const anchor = unmoved ? inner._pinAnchor : hubScreen.top - canvas.getBoundingClientRect().top;
      window._placeHub(anchor, false, true);
      inner._pinAnchor = anchor;
      inner._pinScroll = canvas.scrollTop;
    }
  }

  function fadeIn(run, instant) {
    const vis = Array.from(inner.querySelectorAll('.project-card')).filter(c => c.style.display !== 'none');
    if (instant) { vis.forEach(c => { c.style.transition = ''; c.style.opacity = ''; }); return; }
    vis.forEach(c => { c.style.transition = 'none'; c.style.opacity = '0'; });
    void inner.offsetWidth;   // commit opacity:0 so the change below animates from it
    // Start the fade straight away rather than on the next animation frame, which a
    // background tab may never deliver (that left cards stuck invisible).
    vis.forEach(c => { c.style.transition = `opacity ${FADE_IN_MS}ms ease`; c.style.opacity = ''; });
    // Hand transitions back to the stylesheet (card hover effects) once faded in.
    setTimeout(() => { if (run === _filterRun) vis.forEach(c => { c.style.transition = ''; }); }, FADE_IN_MS + 40);
  }

  function resetFilter() {
    if (activeFilter) applyFilter(null);   // restore order, fade moved cards back in
    else centerOnHub(true);                // nothing filtered — glide back to the hub
  }

  window.resetFilter = resetFilter;
  window._applyFilter = applyFilter;

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      applyFilter(activeFilter === filter ? null : filter);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resetFilter();
  });
}


/* ============================================
   SHOWREEL OVERLAY
   ============================================ */
function initShowreel() {
  const btn      = document.getElementById('showreelBtn');
  const overlay  = document.getElementById('showreelOverlay');
  const wrap     = document.getElementById('showreelVideoWrap');
  const closeBtn = document.getElementById('showreelClose');
  if (!btn || !overlay) return;

  let fallbackTimer = null;

  function revealVideo() {
    clearTimeout(fallbackTimer);
    const mask = document.getElementById('showreelMask');
    if (mask) { mask.classList.add('fade'); setTimeout(() => mask.remove(), 520); }
  }

  function openShowreel() {
    const directSrc = btn.dataset.directVideo || '';
    const url       = btn.dataset.video || '';
    const id        = getYouTubeId(url);

    if (directSrc) {
      wrap.innerHTML = `<video class="showreel-native" src="${directSrc}" autoplay playsinline loop muted></video>`;
      const v = wrap.querySelector('video');
      v.muted = false;
      v.play().catch(() => { v.muted = true; v.play(); });
    } else if (id) {
      wrap.innerHTML = `
        <div class="showreel-mask" id="showreelMask"></div>
        <iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=1&rel=0&modestbranding=1&iv_load_policy=3" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;

      // Lift the mask once the iframe has loaded and autoplay begun
      const iframe = wrap.querySelector('iframe');
      iframe.addEventListener('load', () => { fallbackTimer = setTimeout(revealVideo, 700); });
      // Hard fallback in case load event is slow
      setTimeout(revealVideo, 4000);
    }

    overlay.style.display = 'flex';
    overlay.getBoundingClientRect();
    overlay.classList.add('open');
  }

  function closeShowreel() {
    clearTimeout(fallbackTimer);
    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; wrap.innerHTML = ''; }, 380);
  }

  btn.addEventListener('click', (e) => { e.preventDefault(); openShowreel(); });
  if (closeBtn) closeBtn.addEventListener('click', closeShowreel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeShowreel(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeShowreel();
  });
}
initShowreel();

/* ============================================
   PROJECT DETAIL OVERLAY
   ============================================ */
(function () {
  const overlay     = document.getElementById('detailOverlay');
  const catBadge    = document.getElementById('detailCategoryBadge');
  const titleEl     = document.getElementById('detailTitle');
  const clientEl    = document.getElementById('detailClient');
  const creditsEl   = document.getElementById('detailCredits');
  const galleryEl   = document.getElementById('detailGallery');
  const bottomBar   = document.getElementById('bottomBar');
  const backBtn     = document.getElementById('backBtn');   // bottom bar back btn
  const canvasInner = document.getElementById('canvasInner');

  function isYouTube(url) {
    return url && (url.includes('youtube.com') || url.includes('youtu.be'));
  }

  function youtubeEmbedUrl(url, autoplay = false) {
    const id = getYouTubeId(url);
    if (!id) return '';
    // controls=0 on autoplay = no YouTube UI on first play (title bar, control bar hidden)
    // modestbranding=1 = minimal YouTube logo; iv_load_policy=3 = no annotations
    const params = ['rel=0', 'modestbranding=1', 'iv_load_policy=3'];
    if (autoplay) { params.push('autoplay=1'); }
    return `https://www.youtube-nocookie.com/embed/${id}?${params.join('&')}`;
  }

  function makeVideoEl(src) {
    if (isYouTube(src)) {
      return `<iframe class="detail-iframe" src="${youtubeEmbedUrl(src)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
    }
    return `<video class="detail-video-player" controls preload="metadata" src="${src}"></video>`;
  }

  // "M:SS", "H:MM:SS" or plain seconds — keeping fractions, since the admin
  // scrubber stores frame-accurate times like "18.11".
  function parseTimecode(val) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parts = val.trim().split(':').map(Number);
      if (parts.some(n => Number.isNaN(n))) return 0;
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return parts[0] || 0;
    }
    return 0;
  }

  function makeClipEl(clip, i) {
    const label = clip.label ? `<span class="detail-clip-label">${escapeHtml(clip.label)}</span>` : '';
    let media = '';
    if (clip.clipFile && /\.gif$/i.test(clip.clipFile)) {
      // Uploaded GIF kept as-is (the browser couldn't convert it) — loops on its own.
      media = `<img class="detail-clip-still" src="${escapeHtml(clip.clipFile)}" alt="${escapeHtml(clip.label || '')}">`;
    } else if (clip.clipFile) {
      // Extracted clip — a short muted mp4 that loops on its own.
      media = `<video autoplay muted loop playsinline preload="auto" src="${escapeHtml(clip.clipFile)}"></video>`;
    } else if (clip._src && clip._end > clip._start) {
      // Not extracted yet — loop the in/out range straight from the project's own
      // source video. A plain muted <video>, so no YouTube title/logo/pause chrome;
      // initClipPlayers keeps playback inside the range.
      media = `<video class="clip-seg" autoplay muted playsinline preload="metadata" ` +
        `data-start="${clip._start}" data-end="${clip._end}" ` +
        `src="${escapeHtml(clip._src)}#t=${clip._start},${clip._end}"></video>`;
    } else if (clip._thumb) {
      // Nothing playable — show a still rather than an embedded YouTube player.
      media = `<img class="detail-clip-still" src="${escapeHtml(clip._thumb)}" alt="${escapeHtml(clip.label || '')}">`;
    }
    return `<div class="detail-clip">
      <div class="detail-clip-inner">${media}</div>
      ${label}
    </div>`;
  }

  // Loop each source-segment clip between its in and out points. The check runs
  // every frame — timeupdate only fires ~4×/s, which let a few frames of the next
  // shot slip past the out point — and stops once closing the overlay removes them.
  function initClipPlayers(root) {
    const segs = Array.from(root.querySelectorAll('video.clip-seg'));
    if (!segs.length) return;
    segs.forEach(v => {
      v._segStart = parseFloat(v.dataset.start) || 0;
      v._segEnd   = parseFloat(v.dataset.end)   || 0;
      const restart = () => { try { v.currentTime = v._segStart; } catch (_) {} v.play().catch(() => {}); };
      v.addEventListener('loadedmetadata', restart, { once: true });
      // The #t= media fragment pauses at the out point; carry on from the in point.
      v.addEventListener('pause', () => { if (v.isConnected && v.currentTime >= v._segEnd - 0.15) restart(); });
      v.addEventListener('ended', restart);
    });
    const tick = () => {
      const live = segs.filter(v => v.isConnected);
      if (!live.length) return;
      live.forEach(v => {
        if (v.currentTime >= v._segEnd - 0.04 || v.currentTime < v._segStart - 0.25) {
          try { v.currentTime = v._segStart; } catch (_) {}
        }
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // For extra videos: wrapped in 16:9 container
  function makeExtraVideoEl(src) {
    if (isYouTube(src)) {
      return `<div class="detail-video-wrap"><iframe class="detail-iframe" src="${youtubeEmbedUrl(src)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe></div>`;
    }
    if (/\.gif$/i.test(src)) {
      return `<div class="detail-video-wrap"><img class="detail-gif" src="${src}" alt="" loading="lazy"></div>`;
    }
    return `<video class="detail-video-player" controls preload="metadata" src="${src}"></video>`;
  }

  function openDetail(card) {
    const title    = card.dataset.title    || '';
    const category = card.dataset.category || '';
    const thumbSrc = card.dataset.thumb    || '';
    const project  = (window._projectMap || {})[title] || {};

    // Badge
    catBadge.textContent = categoryLabel(category);

    // Title
    titleEl.textContent = title;

    // Main video section — YouTube iframe (autoplay) or fallback thumbnail
    const videoSection = document.querySelector('.detail-video-section');
    const mainSrc = project.video || '';
    if (isYouTube(mainSrc)) {
      videoSection.innerHTML = `<iframe class="detail-iframe" src="${youtubeEmbedUrl(mainSrc, true)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
    } else {
      videoSection.innerHTML = `<img class="detail-thumb" id="detailThumb" alt="${escapeHtml(title)}" src="${thumbSrc}">`;
    }

    // Client
    clientEl.textContent = project.client || '';

    // Credits
    const defaultCredits = [
      ['Cinematography', 'Chow Pei Jun'],
      ['Direction',      'Chow Pei Jun'],
      ['Editing',        'Chow Pei Jun'],
    ];
    const rows = project.credits || defaultCredits;
    // A "Year" segment renders first — above Work/Production — as an ordinary
    // credit row, so it shares the exact label/value styling of the others.
    const allRows = project.year ? [['Year', project.year], ...rows] : rows;
    creditsEl.innerHTML = allRows.map(([label, val]) =>
      `<span class="detail-credit-label">${label}</span>` +
      `<span class="detail-credit-value">${val}</span>`
    ).join('');

    // Gallery — cleared until real stills are ready
    galleryEl.innerHTML = '';

    // Additional videos for multi-video projects
    const detailVideosEl = document.getElementById('detailVideos');
    if (detailVideosEl) {
      const extraVideos = project.videos;
      if (extraVideos && extraVideos.length > 0) {
        detailVideosEl.innerHTML = extraVideos.map(makeExtraVideoEl).join('');
        detailVideosEl.style.display = 'flex';
      } else {
        detailVideosEl.innerHTML = '';
        detailVideosEl.style.display = 'none';
      }
    }

    // Clips — autoplay looping segments from the main video
    const detailClipsEl = document.getElementById('detailClips');
    if (detailClipsEl) {
      const clips = project.clips;
      const ytId = getYouTubeId(project.video || '');
      const projSrc = (Array.isArray(project.sourceVideos) && project.sourceVideos[0]) || project.sourceVideo || '';
      if (clips && clips.length > 0) {
        // Annotate clips with what makeClipEl needs: the source to loop if the clip
        // hasn't been extracted yet, the resolved in/out seconds, and a still fallback.
        const resolved = clips.map(c => ({
          ...c,
          _src: c.sourceVideo || projSrc,
          _start: parseTimecode(c.start || 0),
          _end:   parseTimecode(c.end   || 0),
          _thumb: ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : (project.thumb || '')
        }));
        detailClipsEl.innerHTML = resolved.map((c, i) => makeClipEl(c, i)).join('');
        detailClipsEl.style.display = 'grid';
        initClipPlayers(detailClipsEl);
      } else {
        detailClipsEl.innerHTML = '';
        detailClipsEl.style.display = 'none';
      }
    }

    // Reset scroll, open — set display:flex before transition so backdrop-filter
    // doesn't exist in the rendering tree until the overlay is actually needed
    overlay.scrollTop = 0;
    overlay.style.display = 'flex';
    overlay.getBoundingClientRect();
    overlay.classList.add('open');
    bottomBar.classList.add('detail-mode');
    bottomBar.style.animation = 'none';
    bottomBar.offsetHeight; // reflow
    bottomBar.style.animation = '';
  }

  function closeDetail() {
    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 420);
    // Destroy iframes to stop playback
    const videoSection = document.querySelector('.detail-video-section');
    if (videoSection) videoSection.innerHTML = '';
    const detailVideosEl = document.getElementById('detailVideos');
    if (detailVideosEl) {
      detailVideosEl.querySelectorAll('video').forEach(v => v.pause());
      detailVideosEl.querySelectorAll('iframe').forEach(f => { f.src = ''; });
    }
    const detailClipsEl = document.getElementById('detailClips');
    if (detailClipsEl) detailClipsEl.innerHTML = '';
    bottomBar.classList.remove('detail-mode');
    bottomBar.style.animation = 'none';
    bottomBar.offsetHeight; // reflow
    bottomBar.style.animation = '';
  }

  // Back button → close
  backBtn.addEventListener('click', closeDetail);

  // Click outside panel (on the blurred scrim) → close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDetail();
  });

  // ESC → close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeDetail();
  });

  // Card click — intercept before browser navigates
  // A touch that moved (a swipe, not a tap) shouldn't open the detail
  let _touchDownX = 0, _touchDownY = 0, _touchDragged = false;
  document.addEventListener('touchstart', (e) => {
    _touchDownX = e.touches[0].clientX;
    _touchDownY = e.touches[0].clientY;
    _touchDragged = false;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (Math.abs(e.touches[0].clientX - _touchDownX) > 8 ||
        Math.abs(e.touches[0].clientY - _touchDownY) > 8) {
      _touchDragged = true;
    }
  }, { passive: true });

  canvasInner.addEventListener('click', (e) => {
    if (_touchDragged) return;
    const card = e.target.closest('.project-card');
    if (!card) return;
    e.preventDefault();

    openDetail(card);
  });

})();

/* ============================================
   FLIP ANIMATION ON RESIZE
   Smooth repositioning when grid reflows
   ============================================ */
(function () {
  const inner = document.getElementById('canvasInner');
  if (!inner) return;

  let prevPositions = new Map();

  function capturePositions() {
    const items = inner.children;
    const positions = new Map();
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      // Skip cards a filter has removed from the grid — their rect is zero, which
      // would make a card re-appearing later FLIP in from the top-left corner.
      if (el.style && el.style.display === 'none') continue;
      if (el.classList && el.classList.contains('hidden')) continue;
      const rect = el.getBoundingClientRect();
      positions.set(el, { x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    }
    return positions;
  }

  function animateFlip(oldPositions) {
    const items = inner.children;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const oldPos = oldPositions.get(el);
      if (!oldPos) continue;
      // Skip cards that were just filtered out (display:none/opacity → zero-size rect).
      if (el.classList && el.classList.contains('hidden')) continue;
      if (el.style && el.style.display === 'none') continue;

      const newRect = el.getBoundingClientRect();
      const dx = oldPos.x - newRect.left;
      const dy = oldPos.y - newRect.top;
      const sw = oldPos.w / newRect.width;
      const sh = oldPos.h / newRect.height;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sw - 1) < 0.01) continue;

      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`;
      el.style.transformOrigin = '0 0';
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.transform = '';
        el.style.transformOrigin = '';

        el.addEventListener('transitionend', function cleanup() {
          el.style.transition = '';
          el.removeEventListener('transitionend', cleanup);
        }, { once: true });
      });
    }
  }

  // Mirror CSS breakpoints exactly
  function getGridCols() {
    const w = window.innerWidth;
    if (w > 1099) return 4;
    if (w > 799)  return 3;
    return 2;
  }

  // 2-col: span 2 full-width. 4-col: span 2 wrapper, inner stays 1-card wide.
  // 3 & 5-col: natural flow, 1 card wide. Cards are moved to fill the cell
  // immediately left of the hub so there's never an empty gap.
  function updateHubSpan(keepView) {
    const hub = document.getElementById('centerHub');
    const inner = document.getElementById('canvasInner');
    if (!hub || !inner) return;
    const cols = getGridCols();
    const span2 = cols === 2 || cols === 4;

    hub.style.gridColumn = span2 ? 'span 2' : '';
    hub.classList.toggle('hub-span-2', cols === 4);

    // Compute how many before-cards are needed so hub lands on the centre column
    const originalBefore = window._originalBeforeCount || 0;
    let targetBefore = originalBefore;
    if (cols === 4) {
      // Hub spans 2 cols — centre it at cols 2-3 (need targetBefore%4 === 1)
      let shift4 = (1 - originalBefore % 4 + 4) % 4;
      if (shift4 > 2) shift4 -= 4; // prefer fewer card moves
      targetBefore = originalBefore + shift4;
    } else if (!span2 && originalBefore > 0) {
      const remainder = originalBefore % cols;
      const center    = Math.floor((cols - 1) / 2);
      const shift     = (center - remainder + cols) % cols;
      targetBefore    = originalBefore + shift;
    }

    // Split current children into before/after relative to hub. Skip cards hidden
    // by a per-filter layout (display:none) — the hub centres among VISIBLE cards.
    const beforeCards = [], afterCards = [];
    let past = false;
    for (const el of inner.children) {
      if (el === hub) { past = true; continue; }
      if (!el.classList.contains('project-card')) continue;
      if (el.style.display === 'none') continue;
      (past ? afterCards : beforeCards).push(el);
    }

    const delta = targetBefore - beforeCards.length;
    if (delta > 0) {
      // Pull first `delta` after-cards to immediately before hub
      for (let i = 0; i < delta && afterCards[i]; i++) {
        inner.insertBefore(afterCards[i], hub);
      }
    } else if (delta < 0) {
      // Push last `|delta|` before-cards to immediately after hub
      const insertRef = hub.nextSibling;
      for (let i = beforeCards.length + delta; i < beforeCards.length; i++) {
        if (beforeCards[i]) inner.insertBefore(beforeCards[i], insertRef);
      }
    }

    if (!keepView) setTimeout(() => centerOnHub(false), 0);
  }

  // Expose so the data-loader can call updateHubSpan AFTER cards are in the DOM,
  // and so the filter (separate scope) can reuse centering + FLIP animation.
  window._updateHubSpan = updateHubSpan;
  window._getGridCols = getGridCols;
  window._capturePositions = capturePositions;
  window._animateFlip = animateFlip;

  // Only re-run when the column count actually crosses a breakpoint
  let activeCols = getGridCols();
  let lastW = window.innerWidth;
  let resizeRAF = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      // Height-only resizes (a phone's toolbar showing/hiding) leave the view
      // alone — re-centring then would yank the page mid-scroll.
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      const newCols = getGridCols();
      if (newCols !== activeCols) {
        prevPositions = capturePositions();
        activeCols = newCols;
        updateHubSpan();
        // With a filter active, re-pack for the new column count (crossfade,
        // no slide) instead of the FLIP layout animation.
        if (window._activeFilter && window._applyFilter) {
          window._applyFilter(window._activeFilter, { instant: true, noFade: true });
        } else {
          animateFlip(prevPositions);
        }
      } else {
        centerOnHub(false);
      }
    });
  });
})();
