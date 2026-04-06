/* ============================================
   COUNTER LOADER → LETTER-BY-LETTER NAME (on actual hub card)
   ============================================ */
(function () {
  const loader    = document.getElementById('loader');
  const counter   = document.getElementById('loaderCounter');
  const canvasEl  = document.getElementById('canvas');
  const nav       = document.getElementById('nav');
  const bottomBar = document.getElementById('bottomBar');

  const LETTER_DELAY    = 52;   // ms between each letter
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

  function revealSite() {
    loader.classList.add('done');
    canvasEl.classList.add('visible');
    nav.classList.add('visible');
    bottomBar.classList.add('visible');
    centerOnHub();
    // Always show return button
    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) returnBtn.classList.add('visible');
    // Small delay so loader fade starts before letters animate
    setTimeout(animateHubLetters, 80);
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

    // Horizontal: inner is 100vw (border-box), padding provides the 14px gap.
    // Allow panning only when content is wider than viewport; otherwise lock to 0.
    const minX = Math.min(0, viewW - innerW);
    const maxX = Math.max(0, viewW - innerW);
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
(function () {
  document.querySelectorAll('.project-card').forEach((card) => {
    const video = card.querySelector('.card-video');
    if (!video) return;

    card.addEventListener('mouseenter', () => {
      video.play().catch(() => {});
    });

    card.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  });
})();

/* ============================================
   FILTER — Hub card buttons
   ============================================ */
(function () {
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
})();

/* ============================================
   PROJECT DETAIL OVERLAY
   ============================================ */
(function () {
  const overlay     = document.getElementById('detailOverlay');
  const detailThumb = document.getElementById('detailThumb');
  const catBadge    = document.getElementById('detailCategoryBadge');
  const titleEl     = document.getElementById('detailTitle');
  const clientEl    = document.getElementById('detailClient');
  const creditsEl   = document.getElementById('detailCredits');
  const galleryEl   = document.getElementById('detailGallery');
  const bottomBar   = document.getElementById('bottomBar');
  const backBtn     = document.getElementById('backBtn');   // bottom bar back btn
  const canvasInner = document.getElementById('canvasInner');

  // Client / agency per project title
  const CLIENT_BY_TITLE = {
    'Vogue x MBS':                   'Vogue × Marina Bay Sands',
    'Shopee VIP':                    'Shopee',
    'KFC Brand Video':               'KFC',
    'Shopee 10.10':                  'Shopee',
    'Thrive BT':                     'The Business Times',
    'Age Strong':                    'Health Promotion Board (HPB)',
    'Kia x Discovery':               'Kia × Discovery Channel',
    'Shopee 3.3':                    'Shopee',
    'FAS':                           'Shopee',
    'Samyang Buldak Carbonara':      'KFC',
    'Solo Sliders':                  'Pizza Hut',
    'Service SG':                    'ServiceSG',
    'Progressive Wages':             'Ministry of Manpower (MOM)',
    'Shopee 9.9':                    'Shopee',
    'Thai Curry':                    'Pizza Hut',
    'Subway Everyday Value':         'Subway',
    'Xmas':                          'Pizza Hut',
    // Events
    'Beautés du Monde':              'Cartier',
    'Foodflix':                      'SATS',
    'Heart of the Spirit':           'The Macallan',
    'Macallan House Launch':         'The Macallan',
    'The Reach VIP Launch':          'The Macallan',
    'Ritz Carlton Wedding Showcase': "Heaven's Gift",
    // Corporate
    'GoBusiness':                    'GovTech',
    'My Big Fat Web3 Wedding':       'VICE',
    'Portraits of HTA':              'Home Team Academy (HTA)',
    'Ubin Kakis':                    'Singapore Management University (SMU)',
    // Weddings
    'Ryan + Cheryl':       'AndroidsinBoots',
    'Yi Chang + Clara':    'AndroidsinBoots',
    'Mel + Jadey':         'AndroidsinBoots',
    'Weilun + Sandy':      'AndroidsinBoots',
    'Ivan + Jocelyn':      'AndroidsinBoots',
    'Wilson + Chelsea':    'AndroidsinBoots',
    'Kenneth + Natalie':   'AndroidsinBoots',
    'Kyle + Ysien':        'AndroidsinBoots',
    'Eugene + Annabelle':  'AndroidsinBoots',
    'Samuel + Hui Qi':     'AndroidsinBoots',
    'Norman + Xin Ru':     'AndroidsinBoots',
    'Nianhua + Debbie':    'AndroidsinBoots',
    'Jeric + Lydia':       'AndroidsinBoots',
  };

  // Per-title credits (take priority over category defaults)
  const CREDITS_BY_TITLE = {
    // TVC
    'Vogue x MBS':               [['Work', 'Online | Cleanups'],                                              ['Production', 'Abundant Productions']],
    'Shopee VIP':                [['Work', 'Online | Look Comp | Screen Replacements | Cleanups'],            ['Production', 'Abundant Productions']],
    'KFC Brand Video':           [['Work', 'Online | Cleanups | Skin retouching'],                            ['Production', 'Abundant Productions']],
    'Shopee 10.10':              [['Work', 'Online | Cleanups | Key & Rotoscoping | Set extensions'],         ['Production', 'Abundant Productions']],
    'Thrive BT':                 [['Work', 'Online | Transitions | 3D Tracking & Rotoscoping | Cleanups'],    ['Production', 'Abundant Productions']],
    'Age Strong':                [['Work', 'Online | Screen Replacements | Cleanups'],                        ['Production', 'Abundant Productions']],
    'Kia x Discovery':           [['Work', 'Online | Cleanups | Licence Plate Replacements | Rotoscoping'],   ['Production', 'Abundant Productions']],
    'Shopee 3.3':                [['Work', 'Online | Comp | Screen Replacements | Cleanups'],                 ['Production', 'Abundant Productions']],
    'FAS':                       [['Work', 'Online | Screen Replacements | Set Extension'],                    ['Production', 'Abundant Productions']],
    'Samyang Buldak Carbonara':  [['Work', 'Online | Cleanups | Skin retouching'],                            ['Production', 'Abundant Productions']],
    'Solo Sliders':              [['Work', 'Online | Transitions | Tracking & Rotoscoping | Cleanups'],       ['Production', 'Abundant Productions']],
    'Service SG':                [['Work', 'Online | Cleanups'],                                              ['Production', 'Abundant Productions']],
    'Progressive Wages':         [['Work', 'Online | Cleanups | Tracking & Rotoscoping | Graphics'],          ['Production', 'Abundant Productions']],
    'Shopee 9.9':                [['Work', 'Online | Cleanups | Partial Key & Rotoscoping'],                  ['Production', 'Abundant Productions']],
    'Thai Curry':                [['Work', 'Online | Screen Replacements | Cleanups'],                        ['Production', 'Abundant Productions']],
    'Subway Everyday Value':     [['Work', 'Online | Cleanups'],                                              ['Production', 'Abundant Productions']],
    'Xmas':                      [['Work', 'Online | Cleanups | Skin retouching'],                            ['Production', 'Abundant Productions']],
    // Events
    'Beautés du Monde':              [['Work', '2nd Videographer | Producer'],      ['Production', 'Optical Films']],
    'Heart of the Spirit':           [['Work', '1st Videographer | Producer'],      ['Production', 'Optical Films']],
    'Macallan House Launch':         [['Work', '1st Videographer | Producer'],      ['Production', 'Optical Films']],
    'The Reach VIP Launch':          [['Work', '2nd Videographer | Producer'],      ['Production', 'Optical Films']],
    'Ritz Carlton Wedding Showcase': [['Work', '2nd Videographer | Producer'],      ['Production', 'AndroidsinBoots']],
    // Corporate
    'GoBusiness':              [['Work', 'Assistant Producer'],               ['Production', 'Optical Films']],
    'My Big Fat Web3 Wedding': [['Work', 'Producer'],                         ['Production', 'Optical Films']],
    'Portraits of HTA':        [['Work', 'Producer'],                         ['Production', 'Optical Films']],
    'Ubin Kakis':              [['Work', 'Producer'],                         ['Production', 'Optical Films']],
    'Foodflix':                [['Work', 'Assistant Producer'],               ['Production', 'Optical Films']],
    // Weddings
    'Ryan + Cheryl':      [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
    'Yi Chang + Clara':   [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
    'Mel + Jadey':        [['Work', '2nd Videographer | Editor'],                ['Production', 'AndroidsinBoots']],
    'Weilun + Sandy':     [['Work', 'Project Lead | 1st Videographer'],          ['Production', 'AndroidsinBoots']],
    'Ivan + Jocelyn':     [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
    'Wilson + Chelsea':   [['Work', '2nd Videographer | Editor'],                ['Production', 'AndroidsinBoots']],
    'Kenneth + Natalie':  [['Work', 'Project Lead | 1st Videographer'],          ['Production', 'AndroidsinBoots']],
    'Kyle + Ysien':       [['Work', 'Editor'],                                   ['Production', 'AndroidsinBoots']],
    'Eugene + Annabelle': [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
    'Samuel + Hui Qi':    [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
    'Norman + Xin Ru':    [['Work', 'Project Lead | 1st Videographer'],          ['Production', 'AndroidsinBoots']],
    'Nianhua + Debbie':   [['Work', 'Project Lead | 1st Videographer'],          ['Production', 'AndroidsinBoots']],
    'Jeric + Lydia':      [['Work', 'Project Lead | 1st Videographer | Editor'], ['Production', 'AndroidsinBoots']],
  };

  // Default credits per category (fallback)
  const CREDITS_BY_CAT = {
    weddings: [
      ['Cinematography', 'Chow Pei Jun'],
      ['Direction',      'Chow Pei Jun'],
      ['Editing',        'Chow Pei Jun'],
      ['Colour Grade',   'Chow Pei Jun'],
      ['Music',          'Licensed'],
    ],
    corporate: [
      ['Cinematography', 'Chow Pei Jun'],
      ['Direction',      'Chow Pei Jun'],
      ['Editing',        'Chow Pei Jun'],
    ],
    'social content': [
      ['Direction',      'Chow Pei Jun'],
      ['Cinematography', 'Chow Pei Jun'],
      ['Editing',        'Chow Pei Jun'],
    ],
    'branded content': [
      ['Creative Direction', 'Chow Pei Jun'],
      ['Cinematography',     'Chow Pei Jun'],
      ['Editing',            'Chow Pei Jun'],
      ['Colour Grade',       'Chow Pei Jun'],
    ],
  };

  // Multi-video projects — all video URLs for the detail player section
  const VIDEOS_BY_TITLE = {
    'Subway Everyday Value': [
      'videos/TVC/2025/Subway%20Everyday%20value%20-%20Subway/251015_Subway_Film%201_15s_16x9_Digital_Superless_Master.mp4',
      'videos/TVC/2025/Subway%20Everyday%20value%20-%20Subway/251015_Subway_Film%202_15s_16x9_Digital_Superless_Master.mp4',
      'videos/TVC/2025/Subway%20Everyday%20value%20-%20Subway/251015_Subway_Film%203_15s_16x9_Digital_Superless_Master.mp4',
      'videos/TVC/2025/Subway%20Everyday%20value%20-%20Subway/251015_Subway_Film%204_15s_16x9_Digital_Superless_Master.mp4',
      'videos/TVC/2025/Subway%20Everyday%20value%20-%20Subway/251015_Subway_Film%205_15s_16x9_Digital_Superless_Master.mp4',
    ],
    'Portraits of HTA': [
      'videos/Corporate/Portraits%20of%20the%20Home%20Team%20Academy%20-%20Home%20Team%20Academy%20(HTA)/home_team_academy__portraits_of_the_home_team_(featuring_annie_%26_kanthan)%20(1080p).mp4',
      'videos/Corporate/Portraits%20of%20the%20Home%20Team%20Academy%20-%20Home%20Team%20Academy%20(HTA)/home_team_academy__portraits_of_the_home_team_(featuring_nagoor_%26_jason)%20(1080p).mp4',
      'videos/Corporate/Portraits%20of%20the%20Home%20Team%20Academy%20-%20Home%20Team%20Academy%20(HTA)/home_team_academy__portraits_of_the_home_team_(featuring_nicole_%26_charlene)%20(1080p).mp4',
      'videos/Corporate/Portraits%20of%20the%20Home%20Team%20Academy%20-%20Home%20Team%20Academy%20(HTA)/home_team_academy__portraits_of_the_home_team_(featuring_sharmala_%26_taufiq)%20(1080p).mp4',
      'videos/Corporate/Portraits%20of%20the%20Home%20Team%20Academy%20-%20Home%20Team%20Academy%20(HTA)/home_team_academy__portraits_of_the_home_team_(trailer)%20(1080p).mp4',
    ],
    'Age Strong': [
      'videos/TVC/2026/Age%20Strong%20-%20HPB/260114_HPB%20AS_Meet%20the%20parents_15s_16x9_EN_Digital_Master.mp4',
      'videos/TVC/2026/Age%20Strong%20-%20HPB/260114_HPB%20AS_Walk%20the%20talk_15s_16x9_EN_Digital_Master.mp4',
      'videos/TVC/2026/Age%20Strong%20-%20HPB/260114_HPB%20AS_Win%20for%20yourself_15s_16x9_EN_Digital_Master.mp4',
    ],
  };

  function getCredits(title, cat) {
    return CREDITS_BY_TITLE[title] || CREDITS_BY_CAT[cat] || [
      ['Cinematography', 'Chow Pei Jun'],
      ['Direction',      'Chow Pei Jun'],
      ['Editing',        'Chow Pei Jun'],
    ];
  }

  function openDetail(card) {
    const title    = card.dataset.title    || '';
    const category = card.dataset.category || '';
    const thumbSrc = card.querySelector('.card-thumb')?.src || '';

    // Badge
    catBadge.textContent = category.charAt(0).toUpperCase() + category.slice(1);

    // Title
    titleEl.textContent = title;

    // Thumbnail
    detailThumb.src = thumbSrc;
    detailThumb.alt = title;

    // Client
    clientEl.textContent = CLIENT_BY_TITLE[title] || '';

    // Credits
    const rows = getCredits(title, category);
    creditsEl.innerHTML = rows.map(([label, val]) =>
      `<span class="detail-credit-label">${label}</span>` +
      `<span class="detail-credit-value">${val}</span>`
    ).join('');

    // Gallery — cleared until real stills are ready
    galleryEl.innerHTML = '';

    // Additional videos for multi-video projects
    const detailVideosEl = document.getElementById('detailVideos');
    if (detailVideosEl) {
      const extraVideos = VIDEOS_BY_TITLE[title];
      if (extraVideos && extraVideos.length > 0) {
        detailVideosEl.innerHTML = extraVideos.map(src =>
          `<video class="detail-video-player" controls preload="metadata" src="${src}"></video>`
        ).join('');
        detailVideosEl.style.display = 'flex';
      } else {
        detailVideosEl.innerHTML = '';
        detailVideosEl.style.display = 'none';
      }
    }

    // Reset scroll, open
    overlay.scrollTop = 0;
    overlay.classList.add('open');
    bottomBar.classList.add('detail-mode');
    bottomBar.style.animation = 'none';
    bottomBar.offsetHeight; // reflow
    bottomBar.style.animation = '';
  }

  function closeDetail() {
    overlay.classList.remove('open');
    // Pause any additional videos
    const detailVideosEl = document.getElementById('detailVideos');
    if (detailVideosEl) {
      detailVideosEl.querySelectorAll('video').forEach(v => v.pause());
    }
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

  let resizeRAF = null;
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

  // Detect column count and position hub in center column
  function updateHubSpan() {
    const hub = document.getElementById('centerHub');
    if (!hub) return;
    const cols = getComputedStyle(inner).gridTemplateColumns.split(' ').length;

    if (cols <= 2) {
      hub.style.gridColumn = 'span 2';
    } else {
      // Count items before the hub to find its natural column position
      const children = Array.from(inner.children);
      const hubIndex = children.indexOf(hub);
      const naturalCol = (hubIndex % cols) + 1;
      const targetCol = Math.ceil(cols / 2);

      if (naturalCol === targetCol) {
        // Already centered — let grid flow naturally, no gap
        hub.style.gridColumn = '';
      } else {
        // Force to center column (may leave a gap, but centers hub)
        hub.style.gridColumn = String(targetCol);
      }
    }
    setTimeout(() => centerOnHub(false), 0);
  }

  // Continuously capture positions
  prevPositions = capturePositions();
  updateHubSpan();

  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    // Capture before reflow
    if (!resizeTimeout) {
      prevPositions = capturePositions();
    }
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateHubSpan();
      animateFlip(prevPositions);
      resizeTimeout = null;
    }, 16);
  });
})();
