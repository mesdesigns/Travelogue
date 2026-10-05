/* ============================================================
   Travel Log — core: helpers, theming, data model, storage
   ============================================================ */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const uid = (p = 'p') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const VIEW_ONLY = 'You have view-only access to these trips.';
const APP_ID = 'travel-log';

/* ---------- preferences (per device) ---------- */
const PREFS_KEY = 'travel-log-prefs';
const prefs = (() => { try { return Object.assign({ motion: 'system', tourSeen: false, tourDismissed: false }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) { return { motion: 'system', tourSeen: false, tourDismissed: false }; } })();
function savePrefs(){ try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} }
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionOK = () => prefs.motion !== 'reduce' && !mqReduce.matches;
function applyMotionPref(){ document.documentElement.classList.toggle('reduce-motion', !motionOK()); }
applyMotionPref();
mqReduce.addEventListener && mqReduce.addEventListener('change', applyMotionPref);
const dur = ms => motionOK() ? ms : 0;

const svgi = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
  chev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
  left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>',
  dots: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.5" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.5" fill="currentColor" stroke="none"/></svg>',
  gear: svgi('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
  undo: svgi('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  flag: svgi('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  image: svgi('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  pencil: svgi('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  trash: svgi('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  download: svgi('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svgi('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  share: svgi('<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'),
  receive: svgi('<path d="M12 3v12M7.5 10.5L12 15l4.5-4.5"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'),
  help: svgi('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01"/>'),
  map: svgi('<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  pool: svgi('<path d="M4 8h16v12H4z"/><path d="M8 8V5h8v3"/>'),
  stamps: svgi('<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.3 2.3 4.7-5.3"/>'),
  rotl: svgi('<path d="M4 4v6h6"/><path d="M5 15a7 7 0 1 0 2-7.6L4 10"/>'),
  rotr: svgi('<path d="M20 4v6h-6"/><path d="M19 15a7 7 0 1 1-2-7.6L20 10"/>'),
  minus: svgi('<path d="M5 12h14"/>'),
  shape: svgi('<circle cx="9" cy="9" r="5"/><rect x="11" y="11" width="9" height="9" rx="2"/>'),
  motion: svgi('<path d="M4 12h3l3-7 4 14 3-7h3"/>'),
  stamp: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>'
};

/* ---------- colours: every trip themes the whole UI ---------- */
const DEFAULT_COLOR = '#57534e', OLD_DEFAULT = '#8a5a36';
const SWATCHES = ['#57534e', '#8a5a36', '#b4532a', '#a16207', '#4d7c3a', '#0f766e', '#2a4d8f', '#6b4fa0', '#b83280', '#be123c'];
const normHex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); return m ? '#' + m[1].toLowerCase() : null; };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const paletteCache = new Map();
function palette(color){
  const c = normHex(color) || DEFAULT_COLOR;
  if (paletteCache.has(c)) return paletteCache.get(c);
  const dark = '#1e1812';
  const p = {
    accent: c, soft: mix(c, '#ffffff', .84), bg: mix(c, '#f8f4ee', .9), bg2: mix(c, '#efe9e1', .84), line: mix(c, '#e3dbd0', .74),
    card: mix(c, '#ffffff', .965), field: mix(c, '#ffffff', .985), frame: mix(c, dark, .4)
  };
  // text in the accent colour must stay readable on the darkest tinted background
  let ink = c; for (let i = 0; i < 30 && (contrast(ink, p.bg2) < 4.6 || contrast(ink, p.soft) < 4.5); i++) ink = mix(ink, dark, .1);
  p.ink = ink;
  // secondary text must stay readable on the darkest tinted surface, whatever colour the trip uses
  let muted = '#5a5249'; for (let i = 0; i < 30 && contrast(muted, p.bg2) < 4.6; i++) muted = mix(muted, dark, .1);
  p.muted = muted;
  p.on = contrast(c, '#ffffff') >= 4.5 ? '#ffffff' : contrast(c, dark) >= contrast(c, '#ffffff') ? dark : '#ffffff';
  // stamps use the accent; if the accent is very light, use its readable ink instead
  p.stamp = contrast(c, p.card) >= 3 ? c : ink;
  p.stampSoft = mix(p.stamp, '#ffffff', .86);
  paletteCache.set(c, p);
  return p;
}
const VARS = p => ({ '--accent': p.accent, '--accent-ink': p.ink, '--on-accent': p.on, '--accent-soft': p.soft, '--bg': p.bg, '--bg-2': p.bg2, '--line': p.line, '--card': p.card, '--field': p.field, '--sign-frame': p.frame, '--stamp': p.stamp, '--stamp-soft': p.stampSoft, '--muted': p.muted });
function applyTheme(color){
  const v = VARS(palette(color)), r = document.documentElement.style;
  for (const k in v) r.setProperty(k, v[k]);
  const m = $('meta[name="theme-color"]'); if (m) m.content = v['--bg'];
}
const themeStyle = color => Object.entries(VARS(palette(color))).map(([k, v]) => `${k}:${v}`).join(';');
const cardStyle = color => { const p = palette(color); return `--tc:${p.accent};--tc-on:${p.on};--tc-frame:${p.frame};--tc-ink:${p.ink}`; };

/* ---------- reference data ---------- */
const KIND = { activity:'Activity', food:'Food and drink', sight:'Sight', museum:'Museum', park:'Nature', walk:'Walk', shop:'Shopping', other:'Other' };
const KIND_COLOR = { activity:'#d9a520', sight:'#5f88c8', museum:'#c9853c', food:'#d4637f', park:'#5f9f52', walk:'#37a19d', shop:'#9277cc', other:'#9a907f' };
const SLOT = { morning:'Morning', afternoon:'Afternoon', evening:'Evening' };
const SLOTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['', 'Any time']];
const slotRank = s => s === 'morning' ? 0 : s === 'afternoon' ? 1 : s === 'evening' ? 2 : 3;
const FEEL = { loved:'Loved it', fine:'It was fine', meh:'Not for us' };
const AGAIN = { yes:'Yes, definitely', maybe:'Maybe', no:'Once was enough' };
const MAX_DAYS = 60, MAX_TRIPS = 60, MAX_ITEMS = 400, MAX_STICKERS = 12;
const KEEP_STICKERS = MAX_STICKERS * 2;   // covers can briefly hold more when two people decorated the same one; no photo is dropped
/* guess a type from the name so food places can be picked as a favourite later */
const KIND_WORDS = [
  ['food', /\b(food|eat|eats|lunch|dinner|breakfast|brunch|supper|cafe|coffee|espresso|tea|bakery|boulangerie|patisserie|pastry|pastries|croissant|macaron|crepe|crepes|gelato|ice cream|dessert|chocolate|cheese|wine|beer|bar|pub|bistro|brasserie|restaurant|trattoria|osteria|taverna|tapas|pizza|pizzeria|pasta|sushi|ramen|noodle|noodles|dumpling|taco|tacos|burger|bbq|grill|steak|seafood|oyster|market|food hall|street food|tasting|nata|bagel|deli|diner|brewery|cocktail|winery|vineyard)\b/],
  ['museum', /\b(museum|musee|museo|gallery|galerie|exhibition|expo|collection)\b/],
  ['park', /\b(park|garden|gardens|jardin|beach|lake|forest|woods|hike|hiking|mountain|trail|waterfall|botanical|zoo|island)\b/],
  ['walk', /\b(walk|stroll|wander|tour|neighbourhood|neighborhood|old town|quarter|district|street|bridge|promenade)\b/],
  ['shop', /\b(shop|shops|shopping|store|boutique|mall|flea|vintage|bookshop|bookstore|souvenir)\b/],
  ['sight', /\b(tower|cathedral|church|basilica|chapel|temple|shrine|castle|palace|fort|monument|square|viewpoint|lookout|miradouro|sunset|sunrise|view|statue|arch|plaza|piazza|cemetery|opera|theatre|theater)\b/]
];
function guessKind(name){ const n = clean(name); for (const [k, re] of KIND_WORDS) if (re.test(n)) return k; return 'activity'; }
const isFoodish = p => p.kind === 'food' || (p.kind === 'activity' && guessKind(p.name) === 'food');

/* ---------- data model ---------- */
const KEY = 'paris-trip-v1', PREV_KEY = 'travel-log-previous', ACTIVE_KEY = 'travel-log-active';
const STATE_VERSION = 6;
let state = { v: STATE_VERSION, trips: [] }, trip = null;
const ui = { view: 'home', tab: 'today', day: 0, activeId: null, sheet: null, loaded: false, readOnly: false, booklet: null, skipFlip: null, newBook: null, justTick: null, progress: null };
try { ui.activeId = localStorage.getItem(ACTIVE_KEY) || null; } catch (e) {}
function rememberActive(){ try { localStorage.setItem(ACTIVE_KEY, ui.activeId || ''); } catch (e) {} }

const validId = x => typeof x === 'string' && /^[\w-]{1,40}$/.test(x);
function localStamp(d = new Date()){ const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
const ymd = d => localStamp(d).slice(0, 10);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
function normItem(p){
  if (!p || typeof p !== 'object') return null;
  const o = {
    id: validId(p.id) ? p.id : uid(),
    name: str(p.name, 120) || 'Untitled',
    kind: KIND[p.kind] ? p.kind : 'other',
    note: String(p.note || '').slice(0, 2000),
    day: Number.isInteger(p.day) && p.day >= 0 ? p.day : null,
    slot: SLOT[p.slot] ? p.slot : '',
    visited: null
  };
  if (typeof p.gurl === 'string' && /^https?:\/\//.test(p.gurl)) o.gurl = p.gurl.slice(0, 500);
  if (p.visited && typeof p.visited === 'object'){
    o.visited = {
      at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.visited.at) ? p.visited.at : localStamp(),
      note: String(p.visited.note || '').slice(0, 2000),
      feel: FEEL[p.visited.feel] ? p.visited.feel : ''
    };
  }
  return o;
}
function normSummary(a){
  a = a && typeof a === 'object' ? a : {};
  return { food: str(a.food, 120), spot: str(a.spot, 120), moment: str(a.moment, 600), surprise: str(a.surprise, 300), again: AGAIN[a.again] ? a.again : '', rating: clamp(Number(a.rating) | 0, 0, 5) };
}
function normSticker(s){
  if (!s || typeof s !== 'object' || !validId(s.img)) return null;
  const num = (v, a, b, d) => { v = Number(v); return isFinite(v) ? clamp(v, a, b) : d; };
  return { id: validId(s.id) ? s.id : uid('s'), img: s.img, x: num(s.x, 0, 1, .5), y: num(s.y, 0, 1, .6), s: num(s.s, .12, .9, .34), r: num(s.r, -180, 180, 0), shape: ['round', 'square', 'free'].includes(s.shape) ? s.shape : 'round' };
}
function normTrip(d, fallbackId){
  if (!d || typeof d !== 'object') return null;
  const days = Number(d.days);
  const t = {
    id: validId(d.id) ? d.id : (fallbackId || uid('trip')),
    title: str(d.title, 40) || 'My trip',
    color: normHex(d.color) || DEFAULT_COLOR,
    start: /^\d{4}-\d{2}-\d{2}$/.test(d.start) ? d.start : ymd(new Date(Date.now() + 30 * 86400000)),
    days: Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? days : 7,
    places: [], todos: [],
    // wrap-up answers live outside "concluded", so reopening a trip never loses them
    summary: normSummary(d.summary || (d.concluded && d.concluded.answers)),
    stickers: [],
    concluded: null
  };
  const seen = new Set();
  t.places = (Array.isArray(d.places) ? d.places : []).map(normItem).filter(p => { if (!p || seen.has(p.id)) return false; seen.add(p.id); return true; }).slice(0, MAX_ITEMS);
  t.places.forEach(p => { if (p.day != null && p.day >= t.days) p.day = null; });
  t.todos = (Array.isArray(d.todos) ? d.todos : []).filter(x => x && typeof x === 'object' && str(x.text, 140))
    .map(x => ({ id: validId(x.id) ? x.id : uid('t'), text: str(x.text, 140), done: !!x.done })).slice(0, 100);
  t.stickers = (Array.isArray(d.stickers) ? d.stickers : []).map(normSticker).filter(Boolean).slice(0, KEEP_STICKERS);
  if (d.concluded && typeof d.concluded === 'object') t.concluded = { at: typeof d.concluded.at === 'string' ? d.concluded.at.slice(0, 30) : new Date().toISOString() };
  return t;
}
/* Accepts every format the app has ever saved: single trip (v1–3), multi-trip (v4–6). */
function normState(d){
  const s = { v: STATE_VERSION, trips: [] };
  if (!d || typeof d !== 'object') return s;
  if (Array.isArray(d.trips)){
    const seen = new Set();
    s.trips = d.trips.map(t => normTrip(t)).filter(t => { if (!t || seen.has(t.id)) return false; seen.add(t.id); return true; }).slice(0, MAX_TRIPS);
    if (!(Number(d.v) >= 5)) s.trips.forEach(t => { if (t.color === OLD_DEFAULT) t.color = DEFAULT_COLOR; });
  } else if (Array.isArray(d.places) || typeof d.title === 'string'){
    const t = normTrip({ ...d, id: 'paris', color: d.color && normHex(d.color) !== OLD_DEFAULT ? d.color : DEFAULT_COLOR });
    if (t) s.trips = [t];
  }
  return s;
}
const getItem = id => trip && trip.places.find(p => p.id === id);
const getTrip = id => state.trips.find(t => t.id === id);
const activeTrips = () => state.trips.filter(t => !t.concluded);
const booklets = () => state.trips.filter(t => t.concluded).sort((a, b) => (b.concluded.at > a.concluded.at ? 1 : b.concluded.at < a.concluded.at ? -1 : 0));
const inDay = (p, d) => d === 'pool' ? p.day == null : p.day === d;
const placesIn = (d, t = trip) => t.places.filter(p => inDay(p, d));
function dayOrder(d, t = trip){ return placesIn(d, t).map((p, i) => [p, i]).sort((a, b) => slotRank(a[0].slot) - slotRank(b[0].slot) || a[1] - b[1]).map(x => x[0]); }
function syncActive(){
  trip = state.trips.find(t => t.id === ui.activeId && !t.concluded) || null;
  if (!trip && ui.view === 'trip') ui.view = 'home';
  if (trip && (typeof ui.day !== 'number' || ui.day >= trip.days)) ui.day = Math.max(0, todayIndex());
  applyTheme(ui.view === 'trip' && trip ? (ui.sheet && ui.sheet.previewColor) || trip.color : DEFAULT_COLOR);
}

/* ---------- dates ---------- */
const dFmt = new Intl.DateTimeFormat(undefined, { weekday:'short', day:'numeric', month:'short' });
const dLong = new Intl.DateTimeFormat(undefined, { weekday:'long', day:'numeric', month:'long' });
const rangeFmt = new Intl.DateTimeFormat(undefined, { day:'numeric', month:'short', year:'numeric' });
const shortFmt = new Intl.DateTimeFormat(undefined, { day:'numeric', month:'short' });
const wdFmt = new Intl.DateTimeFormat(undefined, { weekday:'short' });
const monFmt = new Intl.DateTimeFormat(undefined, { month:'short' });
const tFmt = new Intl.DateTimeFormat(undefined, { hour:'numeric', minute:'2-digit' });
const dtFmt = new Intl.DateTimeFormat(undefined, { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' });
function parseYMD(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); }
function dayDate(i, t = trip){ const d = parseYMD(t.start); d.setDate(d.getDate() + i); return d; }
const fmtDay = (i, t = trip) => dFmt.format(dayDate(i, t));
const targetLabel = x => typeof x === 'number' ? fmtDay(x) : 'the pool';
function parseStamp(s){ const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : new Date(); }
function daysUntilStart(t = trip){ const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((parseYMD(t.start) - n) / 86400000); }
function todayIndex(t = trip){ if (!t) return -1; const d = -daysUntilStart(t); return d >= 0 && d < t.days ? d : -1; }
const tripOver = (t = trip) => -daysUntilStart(t) >= t.days;
function tripRange(t){ const a = dayDate(0, t), b = dayDate(t.days - 1, t); try { return t.days === 1 ? rangeFmt.format(a) : rangeFmt.formatRange(a, b); } catch (e) { return rangeFmt.format(a) + ' – ' + rangeFmt.format(b); } }
function signSub(t){ const a = dayDate(0, t), b = dayDate(t.days - 1, t); try { return t.days === 1 ? shortFmt.format(a) : shortFmt.formatRange(a, b); } catch (e) { return shortFmt.format(a); } }
function countdown(t){
  const until = daysUntilStart(t), ti = todayIndex(t);
  if (until > 1) return `${until} days to go`;
  if (until === 1) return 'Tomorrow!';
  if (ti >= 0) return `Day ${ti + 1} of ${t.days}`;
  return 'Trip over';
}
const signHTML = (t, cls = '') => `<span class="sign ${cls}" aria-hidden="true"><span class="sign-sub">${esc(signSub(t))}</span><span class="sign-title">${esc(t.title)}</span></span>`;

/* ---------- sticker images (IndexedDB, so the main data stays small) ---------- */
const images = { db: null, cache: new Map(), ready: null, failed: false };
images.ready = new Promise(resolve => {
  try {
    const req = indexedDB.open('travel-log-images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onsuccess = () => { images.db = req.result; resolve(); };
    req.onerror = req.onblocked = () => { images.failed = true; resolve(); };
  } catch (e) { images.failed = true; resolve(); }
});
function idbReq(mode, fn){
  return images.ready.then(() => new Promise((resolve, reject) => {
    if (!images.db) return reject(new Error('no-db'));
    const tx = images.db.transaction('images', mode), st = tx.objectStore('images'), r = fn(st);
    tx.oncomplete = () => resolve(r && r.result); tx.onerror = tx.onabort = () => reject(tx.error || new Error('tx'));
  }));
}
async function putImage(id, dataUrl){ images.cache.set(id, dataUrl); try { await idbReq('readwrite', st => st.put(dataUrl, id)); return true; } catch (e) { return false; } }
async function getImage(id){
  if (images.cache.has(id)) return images.cache.get(id);
  try { const v = await idbReq('readonly', st => st.get(id)); if (typeof v === 'string') images.cache.set(id, v); return v || null; } catch (e) { return null; }
}
const isImageData = s => typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s.slice(0, 64) + s.slice(-16)) && s.length < 3_000_000;
/* fills in <img data-img="id"> placeholders once the image has loaded from storage */
function hydrateImages(root = document){
  $$('img[data-img]:not([src])', root).forEach(async img => {
    const v = await getImage(img.dataset.img);
    if (v && img.isConnected){ img.src = v; } else if (img.isConnected) img.closest('.sticker')?.setAttribute('hidden', '');
  });
}
/* resize an uploaded photo into a small sticker (keeps transparency) */
async function makeSticker(file){
  if (!file || !/^image\//.test(file.type)) throw new Error('not-image');
  if (file.size > 25 * 1024 * 1024) throw new Error('too-big');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    const max = 520, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    let out = cv.toDataURL('image/webp', .82);
    if (!out.startsWith('data:image/webp')) out = /png|gif|webp/.test(file.type) ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', .85);
    const alpha = /png|gif|webp/.test(file.type);
    return { data: out, alpha };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- saving ---------- */
const store = { mode: 'loading', ref: null, saving: false, dirty: false, again: false, timer: 0, retry: 0, lastSaved: null };
let statusTimer = 0;
function setStatus(text, kind){
  const el = $('#status'); el.textContent = text; el.classList.remove('fade'); el.classList.toggle('error', kind === 'error');
  clearTimeout(statusTimer);
  if (kind !== 'sticky' && kind !== 'error') statusTimer = setTimeout(() => el.classList.add('fade'), 1800);
}
const savedText = () => store.mode === 'db' ? 'Saved' : 'Saved on this device';
function writeLocal(){
  stampChanges();
  // the sync record is saved in the same write as the trips, so the two can never disagree
  const json = JSON.stringify(sync.meta ? { ...state, sync: sync.meta } : state);
  try {
    const prev = localStorage.getItem(KEY);
    if (prev && prev !== json) localStorage.setItem(PREV_KEY, prev);   // one step of history to recover from
    localStorage.setItem(KEY, json);
    store.lastSaved = new Date();
    return true;
  } catch (e) { return false; }
}
function save(){
  if (store.mode === 'local'){
    if (writeLocal()) setStatus(savedText());
    else { setStatus('Not saved: storage is full or blocked', 'error'); toast("Couldn't save on this device. Export your data from Settings to keep a copy."); }
    return;
  }
  if (store.mode !== 'db') return;
  store.dirty = true; setStatus('Saving…', 'sticky');
  clearTimeout(store.timer); store.timer = setTimeout(flush, 400);
}
async function flush(){
  if (store.mode !== 'db' || !store.dirty) return;
  if (store.saving){ store.again = true; return; }
  store.saving = true; store.dirty = false;
  let failed = null;
  try { await store.ref.set(JSON.parse(JSON.stringify(state))); } catch (e) { failed = e || { code: 'unavailable' }; }
  store.saving = false;
  if (failed){
    const code = failed.code;
    if (code === 'invalid_argument'){ ui.readOnly = true; setStatus('View only', 'sticky'); toast("You have view-only access, so changes aren't saved."); return; }
    if (code === 'quota_exceeded'){ setStatus('Storage is full. Remove a trip or two.', 'error'); return; }
    store.dirty = true; store.retry = Math.min(store.retry + 1, 5);
    setStatus(store.retry > 2 ? "Couldn't save yet. Still trying…" : 'Saving…', store.retry > 2 ? 'error' : 'sticky');
    clearTimeout(store.timer); store.timer = setTimeout(flush, 800 * 2 ** store.retry);
    return;
  }
  store.retry = 0; store.lastSaved = new Date();
  if (store.again || store.dirty){ store.again = false; store.dirty = true; flush(); return; }
  setStatus(savedText());
}
// never lose a pending write when the page is hidden or closed
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden'){ if (store.mode === 'db'){ clearTimeout(store.timer); flush(); } else if (store.mode === 'local') writeLocal(); } });
window.addEventListener('pagehide', () => { if (store.mode === 'local') writeLocal(); });
// keep several open tabs in step
window.addEventListener('storage', e => {
  if (store.mode !== 'local' || e.key !== KEY || !e.newValue) return;
  // another tab saved: this tab's undo snapshots predate that change, so restoring one would erase it
  try { const raw = JSON.parse(e.newValue); state = normState(raw); initSync(raw.sync); history.length = 0; renderAll({ transition: 'none' }); } catch (err) {}
});

/* ---------- undo: every change is recorded ---------- */
const history = [];
function pushHistory(label, snap, meta){ history.push({ label, snap, meta: meta || null }); if (history.length > 50) history.shift(); }
function mutate(fn, label = 'the last change', opts = {}){
  if (ui.readOnly){ toast(VIEW_ONLY); return false; }
  const snap = JSON.stringify(state);
  fn();
  if (JSON.stringify(state) !== snap) pushHistory(label, snap);
  save(); renderAll(opts); return true;
}
/* change data without an undo step (used for live-typed drafts; the undo step is added when editing ends) */
function quietSave(){ if (ui.readOnly) return false; save(); return true; }
function undo(){
  if (ui.readOnly){ toast(VIEW_ONLY); return; }
  const h = history.pop(); if (!h){ toast('Nothing left to undo'); return; }
  state = normState(JSON.parse(h.snap));
  // undoing a merge, a wipe or a replace forgets it entirely; undoing an edit is itself a new edit
  if (h.meta) restoreSyncMeta(h.meta);
  closeBooklet(true);
  save(); renderAll({ transition: 'none' });
  toast(`Undid ${h.label}`);
}

function readLocal(){
  for (const k of [KEY, PREV_KEY]){
    try { const raw = localStorage.getItem(k); if (!raw) continue; const o = JSON.parse(raw), s = normState(o); return { s, meta: o && o.sync, recovered: k === PREV_KEY }; } catch (e) {}
  }
  return { s: normState(null), meta: null, recovered: false };
}
function startLocal(){
  store.mode = 'local';
  const { s, meta, recovered } = readLocal();
  state = s;
  initSync(meta);
  onLoaded();
  checkInbox();
  if (recovered) toast('Your saved data was damaged, so the previous copy was restored.');
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}
function onLoaded(){
  ui.loaded = true;
  const t = getTrip(ui.activeId);
  if (t && !t.concluded) ui.view = 'trip';
  else {
    const act = activeTrips();
    if (act.length === 1 && !booklets().length){ ui.activeId = act[0].id; ui.view = 'trip'; rememberActive(); } else ui.view = 'home';
  }
  if (ui.readOnly) setStatus('View only', 'sticky');
  renderAll({ transition: 'none' });
}
async function initStore(){
  let db = null;
  if (window.claude && typeof window.claude.use === 'function'){ try { db = await window.claude.use('db'); } catch (e) { db = null; } }
  if (!db){ startLocal(); return; }
  try { const user = await window.claude.use('user'); if (user && (await user.can('data.write')) === false) ui.readOnly = true; } catch (e) {}
  store.mode = 'db';
  store.ref = db.doc('trips/paris');
  store.ref.onSnapshot(snap => {
    if (store.saving || store.dirty) return;
    const first = !ui.loaded;
    if (!snap.exists){ if (first){ state = normState(null); onLoaded(); } return; }
    const incoming = normState(snap.data());
    const same = JSON.stringify(incoming) === JSON.stringify(normState(state));
    state = incoming;
    if (first) onLoaded(); else if (!same) renderAll({ transition: 'none' });
  }, () => { setStatus('Sync stopped. Reload to reconnect.', 'error'); if (!ui.loaded) startLocal(); });
}

/* ---------- actions ---------- */
function addItem(name, kind, target, opts = {}){
  const nm = str(name, 120); if (!nm || !trip) return null;
  if (trip.places.some(q => clean(q.name) === clean(nm))){ toast(`“${nm}” is already on your list`); return null; }
  if (trip.places.length >= MAX_ITEMS){ toast(`A trip can hold ${MAX_ITEMS} things`); return null; }
  const day = typeof target === 'number' ? target : null;
  const p = normItem({ id: uid(), name: nm, kind: kind || guessKind(nm), day, slot: opts.slot, visited: opts.visited || null });
  if (!mutate(() => trip.places.push(p), `adding ${p.name}`)) return null;
  toast(opts.visited ? `Stamped “${p.name}”` : `Added “${p.name}” to ${targetLabel(day)}`, true);
  return p;
}
/* Move a card to a day (or the pool when day is null) and optionally a time of day, before another card. */
function placeCard(id, day, slot, beforeId, opts){
  const card = getItem(id);
  return mutate(() => {
    const arr = trip.places, i = arr.findIndex(q => q.id === id); if (i < 0) return;
    const [p] = arr.splice(i, 1);
    p.day = day;
    if (slot !== undefined) p.slot = SLOT[slot] ? slot : '';
    let at = beforeId ? arr.findIndex(q => q.id === beforeId) : -1;
    if (at < 0){
      let last = -1;
      arr.forEach((q, k) => { if (q.day === day && (q.slot || '') === (p.slot || '')) last = k; });
      if (last < 0) arr.forEach((q, k) => { if (q.day === day) last = k; });
      at = last >= 0 ? last + 1 : arr.length;
    }
    arr.splice(at, 0, p);
  }, `moving ${card ? card.name : 'a card'}`, opts);
}
function toggleStamp(id){
  const p = getItem(id); if (!p) return;
  const was = !!p.visited;
  if (!mutate(() => { p.visited = was ? null : { at: localStamp(), note: '', feel: '' }; }, was ? `unstamping ${p.name}` : `stamping ${p.name}`)) return;
  toast(was ? `${p.name} is no longer stamped` : `Stamped! ${p.name}`, true);
  if (!was) requestAnimationFrame(() => $$(`.stampbtn[data-stamp="${id}"]`).forEach(el => { el.classList.remove('stamping'); void el.offsetWidth; el.classList.add('stamping'); }));
}
function removeItem(id){
  const p = getItem(id); if (!p) return;
  if (ui.sheet && ui.sheet.id === id) closeSheet();
  if (mutate(() => { trip.places = trip.places.filter(q => q.id !== id); }, `deleting ${p.name}`)) toast(`Deleted ${p.name}`, true);
}
function toPool(id){ const p = getItem(id); if (p && placeCard(id, null)) toast(`${p.name} is back in the pool`, true); }
function createTrip(fields){
  if (activeTrips().length + booklets().length >= MAX_TRIPS){ toast(`You can keep up to ${MAX_TRIPS} trips`); return; }
  const t = normTrip({ id: uid('trip'), ...fields });
  if (!mutate(() => { state.trips.push(t); ui.activeId = t.id; ui.view = 'trip'; ui.tab = 'today'; ui.day = 0; }, `creating ${t.title}`, { transition: 'forward' })) return;
  rememberActive();
  toast(`${t.title} is ready to plan`, true);
}
function concludeTrip(t){
  if (!t) return;
  ui.newBook = t.id;
  if (mutate(() => { t.concluded = { at: new Date().toISOString() }; ui.view = 'home'; }, `concluding ${t.title}`, { transition: 'back' })) toast(`Your ${t.title} booklet is ready`, true);
}
function reopenTrip(id){
  const t = getTrip(id); if (!t) return;
  closeBooklet();
  if (mutate(() => { t.concluded = null; ui.activeId = t.id; ui.view = 'trip'; ui.tab = 'today'; }, `reopening ${t.title}`, { transition: 'forward' })){ rememberActive(); toast(`${t.title} is open again. Your answers are kept.`, true); }
}
function deleteTrip(id){
  const t = getTrip(id); if (!t) return;
  closeBooklet(); closeSheet();
  if (mutate(() => { state.trips = state.trips.filter(x => x.id !== id); ui.view = 'home'; }, `deleting ${t.title}`, { transition: 'back' })) toast(`Deleted ${t.title}`, true);
}
