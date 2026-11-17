/* WRA STEM Kits: small shared behaviour for every page that loads assets/css/site.css.
   No scroll listeners: everything here waits on IntersectionObserver, so it costs nothing
   while the page is still. Written in plain older JavaScript so it also runs on old iPads. */
(function () {
  var d = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IO = 'IntersectionObserver' in window;

  // The header turns to solid paper once the green top of the page has scrolled under it.
  // (The home page runs its own version of this, tied to its scroll story.)
  var head = document.querySelector('.site-head');
  var hero = document.querySelector('[data-head-over]');
  if (head && hero && IO) {
    new IntersectionObserver(function (es) {
      head.classList.toggle('solid', !es[0].isIntersecting);
    }, { rootMargin: '-' + (head.offsetHeight || 68) + 'px 0px 0px 0px' }).observe(hero);
  }

  // Small-screen menu: close it with Escape, by clicking outside, or after picking a link.
  var menu = document.querySelector('.site-head .menu');
  if (menu) {
    var close = function () { menu.open = false; };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) { close(); menu.querySelector('summary').focus(); }
    });
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) close(); });
    menu.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.menu-panel a')) close(); });
    // when the window widens and the menu button goes away, the menu closes too
    var summary = menu.querySelector('summary');
    ['(min-width: 861px)', '(min-width: 1101px)'].forEach(function (q) {
      var mq = window.matchMedia(q);
      var onChange = function () { if (!summary.offsetParent) close(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    });
  }

  // A few blocks settle in the first time they reach the screen. Each fires once, then is forgotten.
  var items = document.querySelectorAll('[data-reveal]');
  if (items.length && IO && !reduce) {
    d.classList.add('reveal-on');
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        ro.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    [].forEach.call(items, function (el) { ro.observe(el); });
  }

  // A contents list that underlines the section you are reading ([data-spy] on the list).
  var spy = document.querySelector('[data-spy]');
  if (spy && IO) {
    var links = {};
    [].forEach.call(spy.querySelectorAll('a[href^="#"]'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var shown = {};
    var pick = function () {
      var first = null;
      Object.keys(links).forEach(function (id) { if (shown[id] && !first) first = id; });
      Object.keys(links).forEach(function (id) {
        if (id === first) links[id].setAttribute('aria-current', 'location'); else links[id].removeAttribute('aria-current');
      });
    };
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) { shown[e.target.id] = e.isIntersecting; });
      pick();
    }, { rootMargin: '-20% 0px -55% 0px' });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) so.observe(s); });
  }

  // Keep a copy of the pages and files already opened on this device (see /sw.js), so the site
  // comes back fast on a slow network and the worksheet generator works offline. Registered
  // after the page has loaded, so it never competes with what the page needs first.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
