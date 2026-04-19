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

function renderCards(projects) {
  const hub = document.getElementById('centerHub');
  if (!hub) return;

  // Build lookup map used by openDetail
  window._projectMap = Object.create(null);
  projects.forEach(p => { window._projectMap[p.title] = p; });

  function makeCard(p) {
    const catDisplay = p.category.charAt(0).toUpperCase() + p.category.slice(1);
    const tags = Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || '');
    const thumbSrc = p.thumb || '';
    const ytFallback = getYouTubeThumbnail(p.video || '');
    const isYT = (p.video || '').includes('youtu');
    // Only include <video> for local (non-YouTube) sources
    const videoEl = (!isYT && p.video)
      ? `<video class="card-video" muted loop playsinline preload="none" src="${escapeHtml(p.video)}"></video>`
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
      `<div class="card-info">` +
      `<span class="card-info-title">${escapeHtml(p.title)}</span>` +
      `<span class="card-info-cat">${catDisplay}</span>` +
      `</div></div></a>`;
  }

  // Record original split so updateHubSpan can restore when column count changes
  window._originalBeforeCount = projects.filter(p => p.slot === 'before').length;

  const beforeHTML = projects.filter(p => p.slot === 'before').map(makeCard).join('\n      ');
  const afterHTML  = projects.filter(p => p.slot === 'after').map(makeCard).join('\n      ');

  if (beforeHTML) hub.insertAdjacentHTML('beforebegin', beforeHTML);
  if (afterHTML)  hub.insertAdjacentHTML('afterend',    afterHTML);
}

// Fetch project data immediately so cards are ready before the loader finishes
const _dataReady = fetch('data.json')
  .then(r => r.json())
  .then(data => {
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
    // Always show return button
    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) returnBtn.classList.add('visible');
    // Small delay so loader fade starts before letters animate
    setTimeout(animateHubLetters, 500);
    // Warm up YouTube player API so first hover loads faster
    setTimeout(warmYouTubeAPI, 1500);
  }

  function warmYouTubeAPI() {
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
/* Global footer visibility — show only at bottom scroll limit */
function checkFooterVisibility() {
  const inner = document.getElementById('canvasInner');
  const introCard = document.getElementById('introCard');
  if (!inner || !introCard) return;
  const ty = inner._ty || 0;
  const innerH = inner.scrollHeight;
  const viewH = window.innerHeight;
  const minY = viewH - innerH - 40;
  if (ty <= minY + 40) {
    introCard.classList.add('visible');
  } else {
    introCard.classList.remove('visible');
  }
}

function centerOnHub(smooth) {
  const inner = document.getElementById('canvasInner');
  const hub = document.getElementById('centerHub');
  if (!hub || !inner) return;

  const hubCenterY = hub.offsetTop + hub.offsetHeight / 2;

  // Horizontal: center the hub card
  const offsetX = window.innerWidth / 2 - hub.offsetLeft - hub.offsetWidth / 2;
  const offsetY = window.innerHeight / 2 - hubCenterY;
  inner._hubCenterTx = offsetX; // store so clamp can allow this position

  if (smooth) {
    inner.classList.remove('no-transition');
  } else {
    inner.classList.add('no-transition');
  }
  inner.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  inner._tx = offsetX;
  inner._ty = offsetY;

  if (!smooth) {
    requestAnimationFrame(() => {
      inner.classList.remove('no-transition');
    });
  }
  checkFooterVisibility();
}

// Re-center on resize
window.addEventListener('resize', () => {
  centerOnHub(false);
});

/* ============================================
   SCROLL PROGRESS
   ============================================ */
(function () {
  const progressBar = document.getElementById('scrollProgress');
  const inner = document.getElementById('canvasInner');

  function updateProgress() {
    if (!inner) return;
    const innerW = inner.scrollWidth;
    const innerH = inner.scrollHeight;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const tx = inner._tx || 0;
    const ty = inner._ty || 0;

    // Calculate how far we've scrolled through the total scrollable area
    const maxScrollX = innerW - viewW + 28;
    const maxScrollY = innerH - viewH + 28;

    const scrolledX = maxScrollX > 0 ? (-tx + 14) / maxScrollX : 0;
    const scrolledY = maxScrollY > 0 ? (-ty + 14) / maxScrollY : 0;

    // Use the average of both axes, clamped 0-1
    const progress = Math.max(0, Math.min(1, (scrolledX + scrolledY) / 2));
    progressBar.style.width = (progress * 100) + '%';
  }

  // Observe transform changes via MutationObserver on style attribute
  const observer = new MutationObserver(updateProgress);
  observer.observe(inner, { attributes: true, attributeFilter: ['style'] });

  // Also update on resize
  window.addEventListener('resize', updateProgress);
})();

/* ============================================
   DRAG TO SCROLL with MOMENTUM & BOUNDARIES
   ============================================ */
(function () {
  const canvas = document.getElementById('canvas');
  const inner = document.getElementById('canvasInner');
  const returnBtn = document.getElementById('returnBtn');

  let isDragging = false;
  let startX, startY;
  let currentX = 0, currentY = 0;
  let velocityX = 0, velocityY = 0;
  let lastMoveX = 0, lastMoveY = 0;
  let lastMoveTime = 0;
  let momentumRAF = null;

  // Hub center position (computed once after centerOnHub runs)
  let hubCenterTx = null, hubCenterTy = null;

  function getTranslate() {
    return { x: inner._tx || 0, y: inner._ty || 0 };
  }

  function clamp(x, y) {
    const innerW = inner.scrollWidth;
    const innerH = inner.scrollHeight;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    // Horizontal: allow panning to hub-centered position and back to natural 0
    const hubTx = inner._hubCenterTx || 0;
    const minX = Math.min(0, viewW - innerW, hubTx);
    const maxX = Math.max(0, viewW - innerW, hubTx);
    const minY = viewH - innerH - 14;
    const maxY = 14;

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y))
    };
  }

  function setTranslate(x, y, smooth) {
    const clamped = clamp(x, y);
    inner._tx = clamped.x;
    inner._ty = clamped.y;
    if (smooth) {
      inner.classList.remove('no-transition');
    } else {
      inner.classList.add('no-transition');
    }
    inner.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
    if (!smooth) {
      requestAnimationFrame(() => inner.classList.remove('no-transition'));
    }
    updateReturnButton();
    checkFooterVisibility();
  }

  // Check if we're near center hub and toggle return button
  function updateReturnButton() {
    returnBtn.classList.add('visible');
  }

  // Return to center — also resets filters
  returnBtn.addEventListener('click', () => {
    stopMomentum();
    setTimeout(updateReturnButton, 700);
    if (window.resetFilter) {
      window.resetFilter();
    } else {
      centerOnHub(true);
    }
  });

  function stopMomentum() {
    if (momentumRAF) {
      cancelAnimationFrame(momentumRAF);
      momentumRAF = null;
    }
  }

  function applyMomentum() {
    const friction = 0.988;
    velocityX *= friction;
    velocityY *= friction;

    if (Math.abs(velocityX) < 0.3 && Math.abs(velocityY) < 0.3) {
      momentumRAF = null;
      return;
    }

    const pos = getTranslate();
    setTranslate(pos.x + velocityX, pos.y + velocityY);
    momentumRAF = requestAnimationFrame(applyMomentum);
  }

  // Mouse drag
  canvas.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, .hub-card, .detail-overlay')) return;
    if (document.getElementById('detailOverlay')?.classList.contains('open')) return;
    stopMomentum();
    isDragging = true;
    document.body.classList.add('dragging');
    const pos = getTranslate();
    currentX = pos.x;
    currentY = pos.y;
    startX = e.clientX;
    startY = e.clientY;
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
    lastMoveTime = performance.now();
    velocityX = 0;
    velocityY = 0;
    inner.style.willChange = 'transform';
    inner.classList.add('no-transition');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const now = performance.now();
    const dt = now - lastMoveTime;
    if (dt > 0) {
      velocityX = (e.clientX - lastMoveX) * (16 / dt);
      velocityY = (e.clientY - lastMoveY) * (16 / dt);
    }
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
    lastMoveTime = now;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    setTranslate(currentX + dx, currentY + dy);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.classList.remove('dragging');
      inner.classList.remove('no-transition');
      inner.style.willChange = 'auto';
      // Apply momentum
      if (Math.abs(velocityX) > 1 || Math.abs(velocityY) > 1) {
        momentumRAF = requestAnimationFrame(applyMomentum);
      }
    }
  });

  // Touch drag
  canvas.addEventListener('touchstart', (e) => {
    // Allow dragging from anywhere except UI controls (not <a> — cards are links but draggable)
    if (e.target.closest('button, .hub-card, .detail-overlay')) return;
    if (document.getElementById('detailOverlay')?.classList.contains('open')) return;
    stopMomentum();
    isDragging = true;
    const pos = getTranslate();
    currentX = pos.x;
    currentY = pos.y;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastMoveX = e.touches[0].clientX;
    lastMoveY = e.touches[0].clientY;
    lastMoveTime = performance.now();
    velocityX = 0;
    velocityY = 0;
    inner.style.willChange = 'transform';
    inner.classList.add('no-transition');
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault(); // stop browser scroll while canvas is being dragged
    const now = performance.now();
    const dt = now - lastMoveTime;
    if (dt > 0) {
      velocityX = (e.touches[0].clientX - lastMoveX) * (16 / dt);
      velocityY = (e.touches[0].clientY - lastMoveY) * (16 / dt);
    }
    lastMoveX = e.touches[0].clientX;
    lastMoveY = e.touches[0].clientY;
    lastMoveTime = now;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    setTranslate(currentX + dx, currentY + dy);
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      inner.classList.remove('no-transition');
      inner.style.willChange = 'auto';
      if (Math.abs(velocityX) > 1 || Math.abs(velocityY) > 1) {
        momentumRAF = requestAnimationFrame(applyMomentum);
      }
    }
  });

  // Scroll wheel — smooth with momentum
  let wheelTimeout = null;
  let wheelVx = 0, wheelVy = 0;

  canvas.addEventListener('wheel', (e) => {
    if (document.getElementById('detailOverlay')?.classList.contains('open')) return;
    e.preventDefault();
    stopMomentum();

    const pos = getTranslate();
    const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
    const dy = e.shiftKey ? 0 : -e.deltaY;

    // Accumulate velocity from wheel
    wheelVx = dx * 0.8;
    wheelVy = dy * 0.8;

    setTranslate(pos.x + dx, pos.y + dy);

    // After wheel stops, apply momentum glide
    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      velocityX = wheelVx * 0.8;
      velocityY = wheelVy * 0.8;
      if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
        momentumRAF = requestAnimationFrame(applyMomentum);
      }
    }, 60);
  }, { passive: false });
})();

/* ============================================
   HOVER-TO-PLAY VIDEO
   ============================================ */
function initHoverToPlay() {
  document.querySelectorAll('.project-card').forEach((card) => {
    const media = card.querySelector('.card-media');
    const videoUrl = card.dataset.video || '';
    const ytId = getYouTubeId(videoUrl);

    if (ytId) {
      // YouTube: inject muted autoplay iframe on hover
      let hoverIframe = null;

      card.addEventListener('mouseenter', () => {
        if (hoverIframe) return;
        hoverIframe = document.createElement('iframe');
        hoverIframe.className = 'card-hover-iframe';
        hoverIframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0&playsinline=1`;
        hoverIframe.allow = 'autoplay; encrypted-media';
        hoverIframe.setAttribute('frameborder', '0');
        media.appendChild(hoverIframe);
      });

      card.addEventListener('mouseleave', () => {
        if (hoverIframe) {
          hoverIframe.src = '';
          hoverIframe.remove();
          hoverIframe = null;
        }
      });
    } else {
      // Local video
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
  const cards = document.querySelectorAll('.project-card');

  let activeFilter = null;

  function cardMatchesFilter(card, filter) {
    if (!filter) return true;
    const tags = (card.dataset.tags || '').split(',').map(t => t.trim().toLowerCase());
    return card.dataset.category === filter || tags.includes(filter);
  }

  function applyFilter(category) {
    activeFilter = category;
    cards.forEach((card) => {
      if (!cardMatchesFilter(card, category)) {
        card.classList.add('hidden');
      } else {
        card.classList.remove('hidden');
      }
    });

    filterBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === category);
    });
  }

  function resetFilter() {
    applyFilter(null);
    centerOnHub(true);
  }

  window.resetFilter = resetFilter;

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
    if (ytMsgListener) { window.removeEventListener('message', ytMsgListener); ytMsgListener = null; }
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

  function parseTimecode(val) {
    if (typeof val === 'number') return Math.round(val);
    if (typeof val === 'string') {
      const parts = val.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return parseInt(val) || 0;
    }
    return 0;
  }

  // YouTube IFrame API — loaded once on demand
  const _clipYTPlayers = [];
  function ensureYTApi(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    if (!window._ytApiCallbacks) {
      window._ytApiCallbacks = [];
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
      window.onYouTubeIframeAPIReady = () => {
        window._ytApiCallbacks.forEach(fn => fn());
        window._ytApiCallbacks = [];
      };
    }
    window._ytApiCallbacks.push(cb);
  }

  function makeClipEl(clip, i) {
    const id = clip._ytId;
    const start = clip._start;
    const thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
    const label = clip.label ? `<span class="detail-clip-label">${escapeHtml(clip.label)}</span>` : '';
    return `<div class="detail-clip">
      <div class="detail-clip-inner">
        <div class="clip-yt-target" id="clip-yt-${i}"></div>
        <img class="detail-clip-thumb" src="${thumb}" alt="${escapeHtml(clip.label || '')}">
      </div>
      ${label}
    </div>`;
  }

  function initClipPlayers(clips, videoUrl) {
    // Destroy any existing players
    _clipYTPlayers.forEach(p => { try { p.destroy(); } catch(e){} });
    _clipYTPlayers.length = 0;

    const ytId = getYouTubeId(videoUrl);
    clips.forEach((clip, i) => {
      const start = parseTimecode(clip.start || 0);
      const end   = parseTimecode(clip.end   || 0);
      ensureYTApi(() => {
        const divId = `clip-yt-${i}`;
        if (!document.getElementById(divId)) return;
        const p = new YT.Player(divId, {
          videoId: ytId,
          playerVars: {
            autoplay: 1, mute: 1, controls: 0, rel: 0, playsinline: 1,
            modestbranding: 1, iv_load_policy: 3, start, end
          },
          events: {
            onStateChange(e) {
              // On ended (0): loop back to start
              if (e.data === YT.PlayerState.ENDED) {
                e.target.seekTo(start, true);
                e.target.playVideo();
              }
            },
            onReady(e) {
              e.target.seekTo(start, true);
              e.target.playVideo();
            }
          }
        });
        _clipYTPlayers.push(p);
      });
    });
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
    catBadge.textContent = category.charAt(0).toUpperCase() + category.slice(1);

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
    creditsEl.innerHTML = rows.map(([label, val]) =>
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
      const mainVideoUrl = project.video || '';
      const ytId = getYouTubeId(mainVideoUrl);
      if (clips && clips.length > 0 && ytId) {
        // Annotate clips with resolved values for makeClipEl
        const resolved = clips.map(c => ({
          ...c,
          _ytId: ytId,
          _start: parseTimecode(c.start || 0),
          _end:   parseTimecode(c.end   || 0)
        }));
        detailClipsEl.innerHTML = resolved.map((c, i) => makeClipEl(c, i)).join('');
        detailClipsEl.style.display = 'grid';
        initClipPlayers(resolved, mainVideoUrl);
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
    _clipYTPlayers.forEach(p => { try { p.destroy(); } catch(e){} });
    _clipYTPlayers.length = 0;
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
  // Track drag distance so a genuine drag doesn't open the detail
  let _downX = 0, _downY = 0, _wasDragged = false;
  document.addEventListener('mousedown', (e) => {
    _downX = e.clientX; _downY = e.clientY; _wasDragged = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!e.buttons) return;
    if (Math.abs(e.clientX - _downX) > 6 || Math.abs(e.clientY - _downY) > 6) {
      _wasDragged = true;
    }
  });
  // Touch equivalent
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
    if (_wasDragged || _touchDragged) return;
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
    if (w > 1499) return 5;
    if (w > 1099) return 4;
    if (w > 799)  return 3;
    return 2;
  }

  // 2-col: span 2 full-width. 4-col: span 2 wrapper, inner stays 1-card wide.
  // 3 & 5-col: natural flow, 1 card wide. Cards are moved to fill the cell
  // immediately left of the hub so there's never an empty gap.
  function updateHubSpan() {
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
    if (!span2 && originalBefore > 0) {
      const remainder = originalBefore % cols;
      const center    = Math.floor((cols - 1) / 2);
      const shift     = (center - remainder + cols) % cols;
      targetBefore    = originalBefore + shift;
    }

    // Split current children into before/after relative to hub
    const beforeCards = [], afterCards = [];
    let past = false;
    for (const el of inner.children) {
      if (el === hub) { past = true; continue; }
      if (!el.classList.contains('project-card')) continue;
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

    setTimeout(() => centerOnHub(false), 0);
  }

  // Expose so the data-loader can call updateHubSpan AFTER cards are in the DOM
  window._updateHubSpan = updateHubSpan;

  // Only re-run when the column count actually crosses a breakpoint
  let activeCols = getGridCols();
  let resizeRAF = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const newCols = getGridCols();
      if (newCols !== activeCols) {
        prevPositions = capturePositions();
        activeCols = newCols;
        updateHubSpan();
        animateFlip(prevPositions);
      } else {
        centerOnHub(false);
      }
    });
  });
})();
