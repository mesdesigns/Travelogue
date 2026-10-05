/* Travel Log service worker: the app works offline after the first visit. */
const CACHE = 'travel-log-376d879ab8';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('travel-log-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const fromCache = req => caches.match(req, { ignoreSearch: true });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // pages: try the network for updates, fall back to the cached app when offline
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
        const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
        if (res.ok){ const c = await caches.open(CACHE); c.put('./index.html', res.clone()); }
        return res;
      } catch (err) { return (await fromCache('./index.html')) || (await fromCache('./')) || Response.error(); }
    })());
    return;
  }
  // fonts: show the cached copy straight away and refresh it in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  // the app's own files: cache first
  if (url.origin === self.location.origin){
    e.respondWith(fromCache(req).then(hit => hit || fetch(req).then(res => { if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});
