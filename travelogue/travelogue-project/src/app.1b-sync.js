/* ============================================================
   Travel Log — travelling together without a server
   Every phone keeps a timestamp for each detail it changes (a trip's
   title, a place's note, a sticker's position…) and a marker for
   everything it deletes. Two people swap a file in any chat; bringing
   it in merges detail by detail: the newest change of each detail wins,
   an edit beats an older delete, and both phones end up identical.
   ============================================================ */

/* ---------- pure merge core (no DOM; tests/test_merge.js loads this part) ---------- */
/*@pure-start*/
const COLL = new Set(['trips', 'places', 'todos', 'stickers']);   // arrays of objects with ids
const OBJ = Object.freeze({ object: true });                         // "an object lives at this path"
const STAMP_RE = /^[0-9a-z]{13}$/, DEV_RE = /^[0-9a-z]{4}$/;
const PATH_RE = /^trips(#|\/[\w-]{1,40}(\/[\w-]{1,40}(#|\/[\w-]{1,40})*)?)$/;
const stampTime = s => parseInt(String(s).slice(0, 9), 36) || 0;
const sameVal = (a, b) => a === b || (a !== OBJ && b !== OBJ && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
const isElemPath = p => /(^|\/)(trips|places|todos|stickers)\/[\w-]+$/.test(p);
/* "trips/T/places/P/visited/note" → "T/P": one changed thing, however many of its details moved */
const thingKey = p => { const m = /^trips\/([\w-]+)(?:\/(?:places|todos|stickers)\/([\w-]+))?/.exec(p); return m ? m[1] + (m[2] ? '/' + m[2] : '') : p; };

function flatInto(out, prefix, obj){
  for (const k of Object.keys(obj)){
    if (k === 'id') continue;
    const v = obj[k], p = prefix + k;
    if (COLL.has(k) && Array.isArray(v)){
      out.set(p + '#', v.map(x => x.id));
      for (const x of v){ out.set(p + '/' + x.id, OBJ); flatInto(out, p + '/' + x.id + '/', x); }
    } else if (v && typeof v === 'object' && !Array.isArray(v)){ out.set(p, OBJ); flatInto(out, p + '/', v); }
    else out.set(p, v);
  }
  return out;
}
function flatTrip(t){ const out = new Map(), p = 'trips/' + t.id; out.set(p, OBJ); return flatInto(out, p + '/', t); }
/* true when ids that are in both lists come in a different order (adding or removing alone is not a move) */
function orderMoved(a, b){
  const inA = new Set(a), inB = new Set(b), x = a.filter(id => inB.has(id)), y = b.filter(id => inA.has(id));
  return x.some((id, i) => id !== y[i]);
}
function prune(stamps, p){ const pre = p + '/'; for (const k of Object.keys(stamps)) if (k.startsWith(pre)) delete stamps[k]; }
/* a snapshot of what was last stamped; each trip is kept as JSON and only flattened when it changes */
function shadowOf(st){ return { order: st.trips.map(t => t.id), trips: new Map(st.trips.map(t => [t.id, { json: JSON.stringify(t), flat: null }])) }; }
function diffFlat(before, now, stamps, tick){
  const gone = [];
  for (const [p, v] of now){
    if (before.has(p)){ const o = before.get(p); if (p.endsWith('#') ? !orderMoved(o, v) : sameVal(o, v)) continue; }
    stamps[p] = tick();
  }
  for (const [p, v] of before) if (!now.has(p)){ stamps[p] = tick(); if (v === OBJ && isElemPath(p)) gone.push(p); }
  gone.forEach(p => prune(stamps, p));   // a deleted thing keeps only its delete marker
}
/* stamps every detail that differs from the shadow, returns the new shadow */
function diffStamps(shadow, st, stamps, tick){
  const next = { order: st.trips.map(t => t.id), trips: new Map() };
  const flatOf = e => e.flat || (e.flat = flatTrip(JSON.parse(e.json)));
  if (orderMoved(shadow.order, next.order)) stamps['trips#'] = tick();
  for (const t of st.trips){
    const json = JSON.stringify(t), old = shadow.trips.get(t.id), entry = { json, flat: null };
    next.trips.set(t.id, entry);
    if (old && old.json === json){ entry.flat = old.flat; continue; }
    diffFlat(old ? flatOf(old) : new Map(), flatOf(entry), stamps, tick);
  }
  for (const id of shadow.order) if (!next.trips.has(id)){ const p = 'trips/' + id; stamps[p] = tick(); prune(stamps, p); }
  return next;
}
/* newest stamp at or below every path prefix */
function maxUnder(st){
  const m = {};
  for (const k in st){
    const v = st[k]; let i = -1;
    do { i = k.indexOf('/', i + 1); const pre = i < 0 ? k : k.slice(0, i); if (!(m[pre] >= v)) m[pre] = v; } while (i >= 0);
  }
  return m;
}
/* Merges two states. The result is the same whichever side is "a", so both phones agree. */
function mergeStates(a, as, b, bs){
  const ma = maxUnder(as), mb = maxUnder(bs), out = Object.assign({}, as), dead = [];
  for (const k in bs) if (!(out[k] >= bs[k])) out[k] = bs[k];
  const S = (st, p) => st[p] || '';
  const key = v => v === undefined ? '' : JSON.stringify(v);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function leaf(p, x, y){
    const sx = S(as, p), sy = S(bs, p);
    if (sx !== sy) return sx > sy ? x : y;
    return key(x) >= key(y) ? x : y;            // same age (data from before syncing): any fixed rule, so both sides pick alike
  }
  function node(p, x, y){
    const ox = isObj(x), oy = isObj(y);
    if (ox && oy){
      const r = {}, id = x.id || y.id; if (id) r.id = id;
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])){
        if (k === 'id') continue;
        const cp = p + '/' + k, xv = x[k], yv = y[k];
        if (COLL.has(k) && (Array.isArray(xv) || Array.isArray(yv))) r[k] = coll(cp, Array.isArray(xv) ? xv : [], Array.isArray(yv) ? yv : []);
        else { const v = node(cp, xv, yv); if (v !== undefined) r[k] = v; }
      }
      return r;
    }
    if (ox || oy){   // e.g. a stamp on one phone, removed on the other: anything edited after the removal keeps it
      const eff = ox ? (ma[p] || '') : (mb[p] || ''), other = ox ? S(bs, p) : S(as, p);
      return eff >= other ? node(p, ox ? x : {}, oy ? y : {}) : (ox ? y : x);
    }
    return leaf(p, x, y);
  }
  function coll(p, xs, ys){
    const X = new Map(xs.map(e => [e.id, e])), Y = new Map(ys.map(e => [e.id, e])), keep = new Map();
    for (const id of new Set([...X.keys(), ...Y.keys()])){
      const ep = p + '/' + id, ex = X.get(id), ey = Y.get(id);
      if (ex && ey){ keep.set(id, node(ep, ex, ey)); continue; }
      const eff = ex ? (ma[ep] || '') : (mb[ep] || ''), tomb = ex ? S(bs, ep) : S(as, ep);
      if (eff >= tomb) keep.set(id, node(ep, ex || {}, ey || {}));   // new, or edited after the other phone deleted it
      else dead.push(ep);
    }
    const ox = S(as, p + '#'), oy = S(bs, p + '#'), ix = xs.map(e => e.id), iy = ys.map(e => e.id);
    const xFirst = ox !== oy ? ox > oy : key(ix) >= key(iy);
    const base = xFirst ? ix : iy, other = xFirst ? iy : ix;
    const res = base.filter(id => keep.has(id)), placed = new Set(res);
    let next = null;
    for (let i = other.length - 1; i >= 0; i--){   // things only the other order knows go just before their neighbour there, so additions at the end stay at the end
      const id = other[i]; if (!keep.has(id)) continue;
      if (!placed.has(id)){ res.splice(next == null ? res.length : res.indexOf(next), 0, id); placed.add(id); }
      next = id;
    }
    return res.map(id => keep.get(id));
  }
  const trips = coll('trips', a.trips || [], b.trips || []);
  dead.forEach(p => prune(out, p));
  return { state: { v: a.v || b.v, trips }, stamps: out };
}
const maxStampTime = st => { let m = 0; for (const k in st){ const t = stampTime(st[k]); if (t > m) m = t; } return m; };
function cleanStamps(o){
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k.length < 300 && PATH_RE.test(k) && typeof v === 'string' && STAMP_RE.test(v)) out[k] = v;
  return out;
}
/* what would change, trip by trip, going from one state to another */
function changeSummary(from, to){
  const A = new Map(from.trips.map(t => [t.id, t])), B = new Map(to.trips.map(t => [t.id, t])), trips = [];
  let count = 0;
  const diffList = (xs, ys) => {
    const X = new Map(xs.map(e => [e.id, JSON.stringify(e)])), Y = new Map(ys.map(e => [e.id, JSON.stringify(e)]));
    let added = 0, removed = 0, edited = 0;
    Y.forEach((j, id) => { if (!X.has(id)) added++; else if (X.get(id) !== j) edited++; });
    X.forEach((j, id) => { if (!Y.has(id)) removed++; });
    const moved = !added && !removed && !edited && xs.map(e => e.id).join() !== ys.map(e => e.id).join();
    return { added, removed, edited, moved, n: added + removed + edited + (moved ? 1 : 0) };
  };
  for (const t of to.trips){
    const o = A.get(t.id);
    if (!o){ trips.push({ id: t.id, title: t.title, color: t.color, book: !!t.concluded, kind: 'new', notes: [] }); count++; continue; }
    if (JSON.stringify(o) === JSON.stringify(t)) continue;
    const notes = [], p = diffList(o.places, t.places), td = diffList(o.todos, t.todos), sk = diffList(o.stickers, t.stickers);
    let n = p.n + td.n + (sk.n ? 1 : 0);
    const things = [p.added && plural(p.added, 'new thing'), p.edited && `${p.edited} edited`, p.removed && `${p.removed} removed`].filter(Boolean);
    if (things.length) notes.push(things.join(', '));
    else if (p.moved) notes.push('plan reordered');
    if (['title', 'start', 'days', 'color'].some(k => o[k] !== t[k])){ notes.push('trip details'); n++; }
    if (!o.concluded !== !t.concluded){ notes.push(t.concluded ? 'made into a booklet' : 'reopened'); n++; }
    if (JSON.stringify(o.summary) !== JSON.stringify(t.summary)){ notes.push('wrap-up answers'); n++; }
    if (td.n) notes.push('to-dos');
    if (sk.n) notes.push('cover stickers');
    if (!n){ notes.push('small changes'); n = 1; }
    trips.push({ id: t.id, title: t.title, color: t.color, book: !!t.concluded, kind: 'changed', notes }); count += n;
  }
  for (const o of from.trips) if (!B.has(o.id)){ trips.push({ id: o.id, title: o.title, color: o.color, book: !!o.concluded, kind: 'deleted', notes: [] }); count++; }
  return { trips, count };
}
/*@pure-end*/

/* ---------- this phone's sync record ---------- */
const sync = { meta: null, shadow: null };
const newDev = () => (Math.random().toString(36).slice(2) + '0000').slice(0, 4);
function normMeta(m){
  m = m && typeof m === 'object' ? m : {};
  const peers = {};
  if (m.peers && typeof m.peers === 'object') for (const [d, p] of Object.entries(m.peers)) if (DEV_RE.test(d) && p && typeof p === 'object') peers[d] = { name: str(p.name, 30), got: typeof p.got === 'string' ? p.got.slice(0, 30) : '' };
  const clock = Number(m.clock);
  return {
    dev: DEV_RE.test(m.dev) ? m.dev : newDev(),
    name: str(m.name, 30),
    clock: isFinite(clock) && clock > 0 ? clock : 0,
    stamps: cleanStamps(m.stamps),
    peers,
    sent: m.sent && typeof m.sent === 'object' && typeof m.sent.at === 'string' && isFinite(Number(m.sent.clock)) ? { at: m.sent.at.slice(0, 30), clock: Number(m.sent.clock) } : null
  };
}
function initSync(raw){ sync.meta = normMeta(raw); sync.shadow = shadowOf(state); }
function nextStamp(){
  const m = sync.meta, t = Math.max(Date.now(), m.clock + 1);
  m.clock = t;
  return t.toString(36).padStart(9, '0').slice(-9) + m.dev;
}
const syncOn = () => store.mode === 'local' && !!sync.meta;
/* called before every save: records which details changed since the last call */
function stampChanges(){
  if (!syncOn() || !sync.shadow) return;
  let s = null;
  sync.shadow = diffStamps(sync.shadow, state, sync.meta.stamps, () => s || (s = nextStamp()));
}
function restoreSyncMeta(json){
  if (!sync.meta || !json) return;
  const old = normMeta(JSON.parse(json));
  sync.meta.stamps = old.stamps; sync.meta.peers = old.peers;
  sync.meta.clock = Math.max(sync.meta.clock, old.clock);
  sync.shadow = shadowOf(state);
}
/* Changes that only concern this phone (deleting everything here, replacing everything from a file).
   They reset the record instead of stamping deletions, so they never reach the other phone. */
function mutateLocal(fn, label, opts = {}){
  if (ui.readOnly){ toast(VIEW_ONLY); return false; }
  stampChanges();
  const snap = JSON.stringify(state), metaSnap = sync.meta ? JSON.stringify(sync.meta) : null;
  fn();
  if (sync.meta) sync.shadow = shadowOf(state);
  pushHistory(label, snap, metaSnap);
  save(); renderAll(opts); return true;
}
function unsentCount(){
  const m = sync.meta; if (!syncOn()) return 0;
  const since = m.sent ? m.sent.clock : 0, things = new Set();
  for (const [p, st] of Object.entries(m.stamps)) if (st.slice(9) === m.dev && stampTime(st) > since) things.add(thingKey(p));
  return things.size;
}
function partner(){
  const ps = Object.values(sync.meta ? sync.meta.peers : {}).sort((a, b) => (b.got > a.got ? 1 : b.got < a.got ? -1 : 0));
  return ps[0] || null;
}
const partnerName = () => { const p = partner(); return p && p.name ? p.name : ''; };
const whoText = (fallback = 'them') => esc(partnerName() || fallback);
function whenText(iso){ const d = new Date(iso); return isNaN(d) ? '' : dtFmt.format(d); }

/* ---------- sending: a file the other person brings in ---------- */
const fileSafe = s => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
function canShareFile(f){ try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; } }
function openSend(){
  if (!syncOn()) return;
  const s = { type: 'send', ready: false };
  openSheet(s);
  prepareSend(s);
}
/* the file is made ahead of time, so tapping Share opens the share sheet straight away (Safari needs that) */
let sendTimer = 0;
async function prepareSend(s){
  const token = s.token = (s.token || 0) + 1;
  s.ready = false; updateSendButtons(s);
  const payload = await buildExport();
  if (ui.sheet !== s || s.token !== token) return;
  const text = JSON.stringify(payload), d = new Date(), z = n => String(n).padStart(2, '0');
  const who = fileSafe(sync.meta.name);
  const base = `Travel Log changes${who ? ' from ' + who : ''} ${ymd(d)} ${z(d.getHours())}${z(d.getMinutes())}`;
  // Chrome only shares certain file types, so a plain-text copy of the same file is the fallback
  const tries = [new File([text], base + '.json', { type: 'application/json' }), new File([text], base + '.txt', { type: 'text/plain' })];
  s.file = tries.find(canShareFile) || null;
  s.text = text; s.fileName = base + '.json'; s.clock = sync.meta.clock; s.size = text.length;
  s.ready = true;
  if (ui.sheet === s) renderSheet(false);
}
function updateSendButtons(s){
  $$('[data-sync-share], [data-sync-save]', panel).forEach(b => {
    b.classList.toggle('busy', !s.ready); b.setAttribute('aria-disabled', String(!s.ready));
  });
}
function markSent(s){
  sync.meta.sent = { at: new Date().toISOString(), clock: s.clock || sync.meta.clock };
  writeLocal(); renderAll({ transition: 'none' });
}
async function shareSync(s){
  if (!s.ready) return;
  if (!s.file) return saveSync(s);
  try {
    await navigator.share({ files: [s.file] });
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // closed the share sheet
    if (e && e.name === 'NotAllowedError'){ toast('Tap Share again to send the file.'); return; }
    return saveSync(s);
  }
  markSent(s);
  closeSheet();
  toast(`Shared your changes. ${partnerName() ? partnerName() + ' brings' : 'They bring'} them in with Get their changes.`);
}
async function saveSync(s){
  if (!s.ready) return;
  const r = await saveFile(s.fileName, s.text, 'application/json');
  if (r !== 'saved'){ toast(r === 'declined' ? 'Not saved' : r === 'busy' ? 'A download prompt is already open.' : "Couldn't save a file here."); return; }
  markSent(s);
  closeSheet();
  toast('Saved the file. Send it to the other person in any chat or email.');
}
function sendSheet(){
  const s = ui.sheet, m = sync.meta, n = unsentCount(), who = partnerName();
  const c = { trips: activeTrips().length, books: booklets().length, stickers: state.trips.reduce((k, t) => k + t.stickers.length, 0) };
  const status = m.sent
    ? (n ? `${plural(n, 'change')} not sent yet. You last sent them ${esc(whenText(m.sent.at))}.` : `Nothing new since you last sent them, ${esc(whenText(m.sent.at))}. Sending again is fine.`)
    : 'The file has all your trips and booklets. After this, each file you send brings the other phone up to date.';
  const size = s.size ? ` (${s.size > 1e6 ? (s.size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(s.size / 1e3)) + ' KB'})` : '';
  const shareable = s.ready ? !!s.file : !!navigator.share;
  const busy = s.ready ? '' : ' busy', dis = s.ready ? '' : ' aria-disabled="true"';
  return `<p class="hint" style="margin-top:0">Send it to ${who ? esc(who) : 'the person you travel with'} in Messages, WhatsApp, AirDrop or email. They bring it in from Settings with <b>Get their changes</b>.</p>
    <label class="field group"><span>Your name</span><input id="syName" type="text" maxlength="30" value="${esc(m.name)}" placeholder="So they know it's from you" autocomplete="given-name" enterkeyhint="done"></label>
    <div class="importsum"><div><b>${c.trips}</b><small>${c.trips === 1 ? 'trip' : 'trips'}</small></div><div><b>${c.books}</b><small>${c.books === 1 ? 'booklet' : 'booklets'}</small></div><div><b>${c.stickers}</b><small>${c.stickers === 1 ? 'sticker' : 'stickers'}</small></div></div>
    <p class="notice" role="status">${status}</p>
    <div class="group">${shareable
      ? `<button type="button" class="btn primary block${busy}"${dis} data-sync-share>${ICON.share}Share the file${s.ready ? size : ''}</button>
         <div class="row-actions center"><button type="button" class="btn small ghost${busy}"${dis} data-sync-save>${ICON.download}Save it instead</button></div>`
      : `<button type="button" class="btn primary block${busy}"${dis} data-sync-save>${ICON.download}Save the file${s.ready ? size : ''}</button>`}</div>`;
}

/* ---------- receiving: preview, then bring the changes in ---------- */
/* works out the merge without changing anything, so the preview shows exactly what will happen */
function planCombine(data){
  stampChanges();
  const res = mergeStates(state, sync.meta ? sync.meta.stamps : {}, data.parsed, data.peer ? data.peer.stamps : {});
  const next = normState(res.state);
  return { res, next, mine: changeSummary(state, next), theirs: changeSummary(data.parsed, next) };
}
function rememberPeer(data){
  const pr = data.peer; if (!sync.meta || !pr || !pr.dev || pr.dev === sync.meta.dev) return;
  const old = sync.meta.peers[pr.dev];
  sync.meta.peers[pr.dev] = { name: pr.name || (old && old.name) || '', got: new Date().toISOString() };
}
async function applyCombine(s){
  for (const [id, d] of Object.entries(s.data.images)) await putImage(id, d);   // images first, so nothing points at missing pictures
  const plan = planCombine(s.data), snap = JSON.stringify(state), metaSnap = sync.meta ? JSON.stringify(sync.meta) : null;
  try { localStorage.setItem('travel-log-before-import', snap); } catch (e) {}
  const changed = JSON.stringify(plan.next) !== snap;
  state = plan.next;
  if (sync.meta){
    sync.meta.stamps = plan.res.stamps;
    sync.meta.clock = Math.max(sync.meta.clock, maxStampTime(plan.res.stamps));
    sync.shadow = shadowOf(plan.res.state);   // anything tidied up after merging is stamped as a fix made here
    rememberPeer(s.data);
  }
  if (changed) pushHistory(s.purpose === 'sync' ? `bringing in ${partnerName() ? partnerName() + "'s" : 'their'} changes` : 'the import', snap, metaSnap);
  closeBooklet(true);
  if (s.purpose !== 'sync') ui.view = 'home';
  save(); renderAll({ transition: s.purpose !== 'sync' ? 'back' : 'none' });
  return { changed, mine: plan.mine, theyLack: plan.theirs.count };
}
function changeListHTML(sum){
  return `<ul class="changelist">${sum.trips.slice(0, 30).map(c => {
    const what = c.kind === 'new' ? (c.book ? 'New booklet' : 'New trip') : c.kind === 'deleted' ? 'Deleted' : c.notes.join(', ');
    return `<li style="${cardStyle(c.color)}"><i class="tdot" aria-hidden="true"></i><span><b>${esc(c.title)}${c.book && c.kind !== 'new' ? ' booklet' : ''}</b><small>${esc(what)}</small></span></li>`;
  }).join('')}</ul>${sum.trips.length > 30 ? `<p class="hint">and ${plural(sum.trips.length - 30, 'more trip')}</p>` : ''}`;
}
function fromLine(data){
  const pr = data.peer, mine = pr && sync.meta && pr.dev === sync.meta.dev;
  const who = mine ? 'this phone' : pr && pr.name ? esc(pr.name) : 'another phone';
  const when = data.sent ? whenText(data.sent) : '';
  return `<p class="from"><b>From ${who}</b>${when ? `<small>Made ${esc(when)}</small>` : ''}</p>`;
}
function syncPreviewHTML(s){
  const p = s.plan, nothing = !p.mine.trips.length;
  return `${fromLine(s.data)}
    ${nothing ? '<p class="notice" role="status">You already have everything in this file.</p>' : `<span class="group-label">What changes here</span>${changeListHTML(p.mine)}<p class="hint">Where you both changed the same detail, the newer change is kept. You can undo this straight after.</p>`}
    <div class="group">${nothing
      ? `<button type="button" class="btn primary block" data-sync-ok>Done</button>`
      : `<button type="button" class="btn primary block" data-import-go>${ICON.receive}Bring in ${plural(p.mine.count, 'change')}</button>`}</div>`;
}
function syncDoneHTML(s){
  const r = s.result, who = whoText();
  return `<div class="done-mark" aria-hidden="true">${ICON.stamp}</div>
    <h3 class="done-title" id="syncDone" tabindex="-1">${r.changed ? 'Changes brought in' : 'All up to date'}</h3>
    ${r.theyLack
      ? `<p class="notice">${who === 'them' ? 'They don' : who + ' doesn'}'t have ${plural(r.theyLack, 'change')} of yours yet. Send yours back so you both see the same trips.</p>
         <div class="group"><button type="button" class="btn primary block" data-sync-back>${ICON.share}Send yours back</button></div>
         <div class="row-actions center"><button type="button" class="btn small ghost" data-sync-ok>Later</button></div>`
      : `<p class="notice">You and ${who} now have the same trips.</p><div class="group"><button type="button" class="btn primary block" data-sync-ok>Done</button></div>`}`;
}

/* ---------- Android: files shared straight to the installed app arrive here ---------- */
const INBOX = 'travel-inbox';
async function checkInbox(){
  if (!/[?&]shared=1(&|$)/.test(location.search)) return;
  try { window.history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  let text = null, name = 'Shared file';
  try {
    const c = await caches.open(INBOX), u = new URL('shared-file', location.href).href, r = await c.match(u);
    if (r){ text = await r.text(); name = decodeURIComponent(r.headers.get('x-file-name') || '') || name; await c.delete(u); }
  } catch (e) {}
  if (!syncOn()) return;
  openSheet({ type: 'import', purpose: 'sync', phase: 'pick' });
  if (text != null) readImportText(text, name);
  else { ui.sheet.phase = 'error'; ui.sheet.error = "The shared file didn't come through. Choose it here instead."; renderSheet(false); }
}
