/* WRA STEM Kits service worker: keeps a copy of the pages and files you have already opened,
   so the site comes back quickly on a slow school network and the worksheet generator keeps
   working with no network at all.

   - Pages: try the network first, so you always get the newest version. If the network has not
     answered in 3 seconds (or is down) and a saved copy exists, show the saved copy instead; the
     fresh page still lands in the cache for next time.
   - Files whose address has a version (?v=...): saved the first time and served from the device
     after that. A new version has a new address, so nothing goes stale.
   - Scripts and data without a version (for example standards-ai/search.js, ngss.json): handled
     like pages, so new code never runs next to an old copy of a file it depends on.
   - Other files on this site (fonts, pictures): served from the device right away, and refreshed
     in the background.
   - Nothing from other sites (Standards AI answers, the request form) is touched or saved.

   To ship a change to this file's rules, bump VERSION: old caches are deleted on the next visit. */
var VERSION = '2026-11-17a';
var PAGES = 'wra-pages-' + VERSION;
var FILES = 'wra-files-' + VERSION;
var MAX_FILES = 120;
var PAGE_TIMEOUT = 3000;

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keep = [PAGES, FILES];
    var names = await caches.keys();
    await Promise.all(names.filter(function (n) { return n.indexOf('wra-') === 0 && keep.indexOf(n) < 0; })
      .map(function (n) { return caches.delete(n); }));
    // Start fetching the page while this worker is still waking up (slow devices gain the most).
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, PAGES, pageKey(req)));
  } else if (/[?&]v=/.test(url.search)) {
    event.respondWith(versioned(req));
  } else if (/\.(m?js|json)$/.test(url.pathname)) {
    event.respondWith(networkFirst(event, FILES, req.url));
  } else {
    event.respondWith(fresh(event));
  }
});

// A page is saved under its address without the query (?3d=off is the same page as no query).
function pageKey(req) {
  var u = new URL(req.url);
  return u.origin + u.pathname;
}

async function networkFirst(event, cacheName, key) {
  var req = event.request;
  var cache = await caches.open(cacheName);
  var net = (async function () {
    var res = (req.mode === 'navigate' && (await event.preloadResponse)) || (await fetch(req));
    if (res && res.ok && res.type === 'basic' && res.status === 200) await cache.put(key, res.clone());
    return res;
  })();
  event.waitUntil(net.catch(function () {}));

  var saved = await cache.match(key);
  if (!saved) return net;

  // Race the network against a short timer; a slow network loses to the saved copy.
  var timer;
  var late = new Promise(function (resolve) { timer = setTimeout(function () { resolve(saved); }, PAGE_TIMEOUT); });
  try {
    return await Promise.race([net, late]);
  } catch (e) {
    return saved;
  } finally {
    clearTimeout(timer);
  }
}

async function versioned(req) {
  var cache = await caches.open(FILES);
  var hit = await cache.match(req);
  if (hit) return hit;
  var res = await fetch(req);
  if (res.ok && res.type === 'basic') { await cache.put(req, res.clone()); trim(cache); }
  return res;
}

async function fresh(event) {
  var req = event.request;
  var cache = await caches.open(FILES);
  var hit = await cache.match(req);
  var net = fetch(req).then(async function (res) {
    if (res.ok && res.type === 'basic' && res.status === 200) { await cache.put(req, res.clone()); trim(cache); }
    return res;
  });
  if (hit) {
    event.waitUntil(net.catch(function () {}));
    return hit;
  }
  return net;
}

// Keep the cache to a sensible size: drop the oldest entries first.
async function trim(cache) {
  var keys = await cache.keys();
  for (var i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}
