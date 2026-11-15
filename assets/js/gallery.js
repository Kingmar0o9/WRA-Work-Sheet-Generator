/* Kit photo gallery, used on the home page ("Request a set.") and the request page.
   A link to the first photo becomes a full-screen viewer: swipe, use the arrows or arrow keys,
   or tap a thumbnail. Esc, the close button, or the phone's Back button closes it.
   Nothing loads until the viewer opens, and without dialog support the link simply opens the
   photo. Written in plain older JavaScript so it also runs on old iPads. */
(function () {
  var BASE = '/assets/img/photos/';
  var VER = '?v=20261115c';
  var PHOTOS = [
    { f: 'kit-laid-out', alt: 'Every piece of the plant cell kit laid out: the green cell wall, the white cell membrane, the yellow cytoplasm tray, and the organelles beside them.' },
    { f: 'kit-assembled', alt: 'The assembled plant cell kit: each organelle seated in its slot in the yellow cytoplasm, inside the white membrane and green cell wall.' },
    { f: 'kit-assembled-angle', alt: 'The assembled plant cell kit from a slightly different angle.' },
    { f: 'kit-in-case-assembled', alt: 'The assembled cell resting in an open storage case.' },
    { f: 'kit-in-case-front', alt: 'An open storage case seen from the front, with the cell wall and organelles packed inside.' },
    { f: 'kit-in-case-1', alt: 'The kit packed in its open storage case, seen from the left.' },
    { f: 'kit-in-case-2', alt: 'The kit packed in its open storage case, from a slightly different angle.' },
    { f: 'kit-in-case-3', alt: 'The kit packed in its open storage case, seen from the right.' }
  ];
  var probe = document.createElement('dialog');
  if (typeof probe.showModal !== 'function') return; // old browser: the link opens the photo

  var CSS =
    'html.g-lock{overflow:hidden}' +
    '.g-dlg{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--ink,#13261C);color:var(--stock,#F6F7F2);font-family:var(--sans,system-ui,sans-serif)}' +
    '.g-dlg::backdrop{background:var(--ink,#13261C)}' +
    '.g-dlg[open]{display:flex;flex-direction:column}' +
    '.g-top{flex:none;display:flex;align-items:center;gap:12px;padding:12px clamp(12px,3vw,28px)}' +
    '.g-title{font-weight:800;letter-spacing:-.02em;font-size:1.05rem}' +
    '.g-count{font-weight:700;font-size:.9rem;opacity:.85;font-variant-numeric:tabular-nums}' +
    '.g-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:0 16px;border-radius:999px;border:2px solid var(--stock,#F6F7F2);background:transparent;color:var(--stock,#F6F7F2);font:700 .92rem/1 var(--sans,system-ui,sans-serif);cursor:pointer}' +
    '.g-btn:hover{background:var(--stock,#F6F7F2);color:var(--ink,#13261C)}' +
    '.g-btn:focus-visible,.g-thumb:focus-visible{outline:3px solid var(--sun,#F6C343);outline-offset:3px}' +
    '.g-btn svg{width:18px;height:18px}' +
    '.g-close{margin-left:auto}' +
    '.g-stage{flex:1;min-height:0;position:relative}' +
    '.g-track{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0;padding:0;list-style:none;overscroll-behavior:contain}' +
    '.g-track::-webkit-scrollbar{display:none}' +
    '.g-track li{flex:0 0 100%;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;padding:0 clamp(12px,7vw,96px)}' +
    '.g-track img{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:16px;background:#dcdcdc}' +
    '.g-prev,.g-next{position:absolute;top:50%;transform:translateY(-50%);padding:0;width:52px;height:52px;background:var(--ink,#13261C)}' +
    '.g-prev{left:clamp(8px,2vw,24px)}.g-next{right:clamp(8px,2vw,24px)}' +
    '.g-prev[disabled],.g-next[disabled]{opacity:.3;cursor:default;pointer-events:none}' +
    '.g-strip{flex:none;display:flex;gap:8px;overflow-x:auto;padding:12px clamp(12px,3vw,28px) calc(14px + env(safe-area-inset-bottom));scrollbar-width:thin;justify-content:safe center}' +
    '.g-thumb{flex:none;padding:0;border:2px solid transparent;border-radius:10px;background:none;cursor:pointer;opacity:.6;transition:opacity .2s}' +
    '.g-thumb img{display:block;width:84px;height:63px;border-radius:8px;object-fit:cover}' +
    '.g-thumb:hover{opacity:1}' +
    '.g-thumb[aria-current="true"]{border-color:var(--sun,#F6C343);opacity:1}' +
    '@media (max-width:640px){.g-prev,.g-next{display:none}.g-track li{padding:0 10px}.g-thumb img{width:64px;height:48px}.g-title{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.g-track{scroll-behavior:auto}}';

  var dlg, track, prevBtn, nextBtn, countEl, thumbs = [], current = 0, opener = null, pushed = false, built = false;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ARROW = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };

  function build() {
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    dlg = document.createElement('dialog');
    dlg.className = 'g-dlg';
    dlg.setAttribute('aria-label', 'Photos of the plant cell kit');
    var slides = '', strip = '';
    for (var i = 0; i < PHOTOS.length; i++) {
      slides += '<li><img alt="' + PHOTOS[i].alt + '" data-src="' + BASE + PHOTOS[i].f + '.jpg' + VER + '" width="1600" height="1200" decoding="async"></li>';
      strip += '<button type="button" class="g-thumb" data-i="' + i + '" aria-label="Photo ' + (i + 1) + ' of ' + PHOTOS.length + '"><img alt="" src="' + BASE + PHOTOS[i].f + '-thumb.jpg' + VER + '" width="320" height="240"></button>';
    }
    dlg.innerHTML =
      '<div class="g-top"><span class="g-title">The Plant Cell Kit</span><span class="g-count" aria-live="polite"></span>' +
      '<button type="button" class="g-btn g-close">' + ARROW('M6 6l12 12M18 6L6 18') + 'Close</button></div>' +
      '<div class="g-stage"><ul class="g-track">' + slides + '</ul>' +
      '<button type="button" class="g-btn g-prev" aria-label="Previous photo">' + ARROW('M15 5l-7 7 7 7') + '</button>' +
      '<button type="button" class="g-btn g-next" aria-label="Next photo">' + ARROW('M9 5l7 7-7 7') + '</button></div>' +
      '<div class="g-strip">' + strip + '</div>';
    document.body.appendChild(dlg);
    track = dlg.querySelector('.g-track');
    prevBtn = dlg.querySelector('.g-prev'); nextBtn = dlg.querySelector('.g-next');
    countEl = dlg.querySelector('.g-count');
    thumbs = dlg.querySelectorAll('.g-thumb');
    dlg.querySelector('.g-close').addEventListener('click', function () { dlg.close(); });
    prevBtn.addEventListener('click', function () { go(current - 1, true); });
    nextBtn.addEventListener('click', function () { go(current + 1, true); });
    for (var t = 0; t < thumbs.length; t++) thumbs[t].addEventListener('click', function () { go(+this.getAttribute('data-i'), true); });
    var ticking = false;
    track.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { ticking = false; mark(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))); });
    }, { passive: true });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1, true); }
    });
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('g-lock');
      if (pushed) { pushed = false; history.back(); }
      if (opener) { try { opener.focus({ preventScroll: true }); } catch (err) { opener.focus(); } }
    });
    window.addEventListener('popstate', function () { if (dlg.open) { pushed = false; dlg.close(); } });
    window.addEventListener('resize', function () { if (dlg.open) go(current, false); });
    built = true;
  }

  // load a photo and its neighbours only when they are about to be seen
  function load(i) {
    for (var k = i - 1; k <= i + 1; k++) {
      if (k < 0 || k >= PHOTOS.length) continue;
      var img = track.children[k].firstChild;
      if (img.getAttribute('data-src')) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
    }
  }
  function mark(i) {
    i = Math.max(0, Math.min(PHOTOS.length - 1, i));
    current = i; load(i);
    countEl.textContent = (i + 1) + ' of ' + PHOTOS.length;
    prevBtn.disabled = i === 0; nextBtn.disabled = i === PHOTOS.length - 1;
    for (var t = 0; t < thumbs.length; t++) thumbs[t].setAttribute('aria-current', t === i ? 'true' : 'false');
    var th = thumbs[i], strip = th.parentNode;
    var left = th.offsetLeft - (strip.clientWidth - th.offsetWidth) / 2;
    if (strip.scrollTo) strip.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' }); else strip.scrollLeft = left;
  }
  function go(i, smooth) {
    i = Math.max(0, Math.min(PHOTOS.length - 1, i));
    mark(i);
    var left = i * track.clientWidth;
    if (track.scrollTo) track.scrollTo({ left: left, behavior: smooth && !reduce ? 'smooth' : 'auto' }); else track.scrollLeft = left;
  }
  function open(i, trigger) {
    if (!built) build();
    opener = trigger;
    document.documentElement.classList.add('g-lock');
    dlg.showModal();
    try { history.pushState({ wraGallery: true }, ''); pushed = true; } catch (err) { pushed = false; }
    go(i, false);
    dlg.querySelector('.g-close').focus();
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-gallery]') : null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    open(+(a.getAttribute('data-index') || 0), a);
  });
})();
