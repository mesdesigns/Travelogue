/* Travelogue service worker: the app works offline after the first visit. */
const CACHE = 'travelogue-468afed824';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith('travelogue-') || k.startsWith('travel-log-')) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const fromCache = req => caches.match(req, { ignoreSearch: true });
// Android: a file shared to the installed app from a chat arrives as a POST; keep it and open the app on it
const INBOX = 'travelogue-inbox';
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')){
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const f = [form.get('file'), ...form.getAll('file')].find(v => v && typeof v !== 'string');
        if (f){
          const c = await caches.open(INBOX);
          await c.put(new URL('shared-file', self.registration.scope).href, new Response(f, { headers: { 'content-type': 'text/plain', 'x-file-name': encodeURIComponent(f.name || 'Shared file') } }));
        }
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
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
