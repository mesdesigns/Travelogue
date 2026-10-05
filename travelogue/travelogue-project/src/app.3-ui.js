/* ============================================================
   Travel Log — sheets, gestures, input, import/export, startup
   ============================================================ */

/* ---------- drag and drop in the plan (touch: press and hold, mouse: drag) ---------- */
const dnd = { pending: null, active: null, suppress: false, raf: 0, dirty: false };
function dndCancelPending(){ if (dnd.pending){ clearTimeout(dnd.pending.timer); dnd.pending = null; } }
function dndStart(x, y){
  const pd = dnd.pending; if (!pd) return; clearTimeout(pd.timer); dnd.pending = null;
  if (pager.active) return;
  const el = pd.el; if (!el.isConnected) return;
  const r = el.getBoundingClientRect();
  const ghost = document.createElement('div'); ghost.className = 'drag-ghost';
  ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
  const inner = document.createElement('div'); inner.className = 'ghost-inner';
  const clone = el.cloneNode(true); clone.removeAttribute('data-card'); clone.removeAttribute('data-flip'); clone.style.height = r.height + 'px';
  inner.appendChild(clone); ghost.appendChild(inner);
  ghost.setAttribute('style', ghost.getAttribute('style') + ';' + themeStyle(trip.color));
  document.body.appendChild(ghost);
  if (el.classList.contains('card')){ el.style.height = r.height + 'px'; void el.offsetHeight; el.classList.add('drag-src'); el.style.height = '0px'; el.style.marginBottom = '-8px'; }
  else el.classList.add('drag-src');
  document.body.classList.add('dragging');
  dnd.active = { id: pd.id, el, ghost, pid: pd.pid, offX: x - r.left, offY: y - r.top, x, y, h: r.height, w: r.width, target: null, src: r, hot: null, slot: null, slotIdx: -1, needs: false };
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  dndMove(); dnd.raf = requestAnimationFrame(dndAuto);
}
function resetSlot(slot){ if (slot) slot.querySelectorAll('.card').forEach(c => { if (c._ty){ c._ty = 0; c.style.transform = ''; } }); }
function dndClearHot(){ $$('.drop-hot').forEach(n => n.classList.remove('drop-hot')); $$('.slot').forEach(resetSlot); }
function dndMove(){
  const a = dnd.active; if (!a) return;
  a.ghost.style.transform = `translate3d(${a.x - a.offX}px, ${a.y - a.offY}px, 0)`;
  const hitEl = document.elementFromPoint(a.x, a.y);
  const chip = hitEl && hitEl.closest('#s-plan .daychip');
  const slot = !chip && hitEl && hitEl.closest('#s-plan [data-drop-slot]');
  const pool = !chip && !slot && hitEl && hitEl.closest('#pool');
  const hot = chip || slot || pool || null;
  if (a.hot !== hot){ if (a.hot) a.hot.classList.remove('drop-hot'); if (hot) hot.classList.add('drop-hot'); a.hot = hot; }
  if (a.slot && a.slot !== slot){ resetSlot(a.slot); a.slotIdx = -1; }
  a.slot = slot || null;
  let target = null;
  if (chip) target = { day: chip.dataset.day === 'pool' ? null : +chip.dataset.day, chip };
  else if (slot){
    const gap = a.h + 8;
    slot.style.setProperty('--gap', gap + 'px');
    const cards = [...slot.querySelectorAll('.card')].filter(c => c.dataset.card !== a.id);
    const mids = cards.map(c => { const r = c.getBoundingClientRect(), m = new DOMMatrixReadOnly(getComputedStyle(c).transform); return r.top - m.m42 + r.height / 2; });
    let idx = mids.findIndex(m => a.y < m); if (idx < 0) idx = cards.length;
    if (idx !== a.slotIdx){
      cards.forEach((c, k) => { const ty = k >= idx ? gap : 0; if ((c._ty || 0) !== ty){ c._ty = ty; c.style.transform = ty ? `translate3d(0,${ty}px,0)` : ''; } });
      a.slotIdx = idx;
    }
    target = { day: +slot.dataset.dropDay, slot: slot.dataset.dropSlot, before: cards[idx] ? cards[idx].dataset.card : null };
  } else if (pool) target = { day: null, pool };
  a.target = target;
}
function dndAuto(){
  const a = dnd.active; if (!a) return;
  const sc = $('#s-plan'), r = sc.getBoundingClientRect(), strip = $('#daystrip');
  const sr = strip ? strip.getBoundingClientRect() : null, top = sr ? sr.bottom : r.top, bottom = r.bottom - 120;
  let moved = false;
  if (sr && a.y >= sr.top - 4 && a.y <= sr.bottom + 4){
    const dx = a.x < sr.left + 44 ? -9 : a.x > sr.right - 44 ? 9 : 0;
    if (dx){ strip.scrollLeft += dx; moved = true; }
  } else if (a.y < top + 50 && sc.scrollTop > 0){ sc.scrollTop -= Math.ceil((top + 50 - a.y) / 4); moved = true; }
  else if (a.y > bottom){ sc.scrollTop += Math.ceil((a.y - bottom) / 4); moved = true; }
  if (moved || a.needs){ a.needs = false; dndMove(); }
  dnd.raf = requestAnimationFrame(dndAuto);
}
function flyGhost(a, rect, opts = {}){
  const g = a.ghost, from = g.style.transform;
  if (!motionOK()){ g.remove(); opts.done && opts.done(); return; }
  const to = opts.shrink
    ? `translate3d(${rect.left + rect.width / 2 - a.w / 2}px, ${rect.top + rect.height / 2 - a.h / 2}px, 0) scale(.2)`
    : `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  const frames = [{ transform: from, width: a.w + 'px', height: a.h + 'px', opacity: 1 }, { transform: to, width: (opts.shrink ? a.w : rect.width) + 'px', height: (opts.shrink ? a.h : rect.height) + 'px', opacity: opts.shrink ? 0 : 1 }];
  g.firstChild.animate([{ transform: 'scale(1.04) rotate(2deg)' }, { transform: 'none' }], { duration: 220, fill: 'forwards', easing: 'cubic-bezier(.22,1,.36,1)' });
  g.animate(frames, { duration: opts.shrink ? 280 : 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).onfinish = () => { g.remove(); opts.done && opts.done(); };
}
function dndEnd(commit){
  const a = dnd.active; if (!a) return;
  cancelAnimationFrame(dnd.raf);
  dnd.active = null; dnd.suppress = true; setTimeout(() => { dnd.suppress = false; }, 350);
  document.body.classList.remove('dragging');
  const t = commit ? a.target : null, p = getItem(a.id);
  const wasDirty = dnd.dirty; dnd.dirty = false;
  const noChange = !t || !p || (t.slot === undefined && p.day === t.day);
  if (noChange){
    dndClearHot();
    const el = a.el, isCard = el.classList.contains('card');
    el.style.visibility = 'hidden';
    if (isCard){ el.classList.add('drag-restore'); el.style.height = a.h + 'px'; el.style.marginBottom = ''; }
    el.classList.remove('drag-src');
    const r = el.isConnected ? el.getBoundingClientRect() : a.src;
    flyGhost(a, { left: r.left, top: r.top, width: r.width || a.w, height: a.h }, { done: () => {
      el.style.visibility = ''; el.classList.remove('drag-restore'); el.style.height = '';
      if (wasDirty) renderAll({ transition: 'none' });
    } });
    return;
  }
  const fromDay = p.day, name = p.name;
  ui.skipFlip = a.id;
  if (t.slot !== undefined) placeCard(a.id, t.day, t.slot, t.before); else placeCard(a.id, t.day);
  ui.skipFlip = null;
  const landed = document.querySelector(`#s-plan [data-flip="c-${a.id}"]`);
  const lr = landed && landed.getBoundingClientRect(), sc = $('#s-plan').getBoundingClientRect();
  if (landed && lr.height && lr.bottom > sc.top && lr.top < sc.bottom - 80 && !t.chip){
    landed.style.visibility = 'hidden';
    flyGhost(a, lr, { done: () => { landed.style.visibility = ''; } });
  } else {
    const chip = t.chip ? document.querySelector(`#s-plan .daychip[data-day="${t.day == null ? 'pool' : t.day}"]`) : null;
    const cr = chip ? chip.getBoundingClientRect() : { left: a.x - 20, top: a.y - 20, width: 40, height: 40 };
    flyGhost(a, cr, { shrink: true, done: () => { if (chip){ chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); } } });
  }
  if (t.slot !== undefined) toast(fromDay !== t.day ? `Added ${name} to ${fmtDay(t.day)}${t.slot ? ', ' + SLOT[t.slot].toLowerCase() : ''}` : `Moved ${name}`, true);
  else toast(t.day == null ? `${name} is back in the pool` : `Moved ${name} to ${fmtDay(t.day)}`, true);
}
$('#s-plan').addEventListener('pointerdown', e => {
  if (ui.readOnly || dnd.active) return;
  const card = e.target.closest('[data-card]'); if (!card) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('.pcard-add')) return;
  dnd.pending = { id: card.dataset.card, el: card, x: e.clientX, y: e.clientY, pid: e.pointerId, type: e.pointerType, timer: 0 };
  if (e.pointerType !== 'mouse') dnd.pending.timer = setTimeout(() => { if (dnd.pending && !pager.active) dndStart(dnd.pending.x, dnd.pending.y); }, 320);
});
window.addEventListener('pointermove', e => {
  const a = dnd.active;
  if (a){ if (e.pointerId === a.pid){ a.x = e.clientX; a.y = e.clientY; a.needs = true; } return; }
  const pd = dnd.pending; if (!pd || e.pointerId !== pd.pid) return;
  const dist = Math.hypot(e.clientX - pd.x, e.clientY - pd.y);
  if (pd.type === 'mouse'){ if (dist > 6) dndStart(e.clientX, e.clientY); }
  else if (dist > 9) dndCancelPending();
});
window.addEventListener('pointerup', e => { if (dnd.active && e.pointerId === dnd.active.pid) dndEnd(true); else dndCancelPending(); });
window.addEventListener('pointercancel', e => { if (dnd.active && e.pointerId === dnd.active.pid) dndEnd(false); else dndCancelPending(); });
document.addEventListener('touchmove', e => { if (dnd.active || swipe.active || pager.active || stk.start || toastDrag.s) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (dnd.active || dnd.pending) e.preventDefault(); });
document.addEventListener('click', e => {
  if (dnd.suppress || swipe.suppress || performance.now() < clickBlockUntil){ dnd.suppress = swipe.suppress = false; clickBlockUntil = 0; e.stopPropagation(); e.preventDefault(); }
}, true);

/* ---------- journal rows: swipe right to stamp, left for "back to pool" and "delete" ---------- */
const swipe = { active: false, pending: null, suppress: false, open: null, raf: 0 };
function rowParts(row){ return { main: row.querySelector('.jrow-main'), tray: row.querySelector('.jrow-right') }; }
function setRow(row, x, animate){
  const { main } = rowParts(row); if (!main) return;
  main.style.transition = animate === false ? 'none' : '';
  main.style.transform = x ? `translate3d(${x}px,0,0)` : '';
  const btn = row.querySelector('[data-jmore]'); if (btn) btn.setAttribute('aria-expanded', String(x < 0));
  row.querySelectorAll('.jrow-right button').forEach(b => { b.tabIndex = x < 0 ? 0 : -1; });
}
function closeOpenRow(except){ if (swipe.open && swipe.open !== except && swipe.open.isConnected) setRow(swipe.open, 0); if (swipe.open !== except) swipe.open = null; }
function openRow(row){ closeOpenRow(row); const w = rowParts(row).tray.getBoundingClientRect().width; setRow(row, -w); swipe.open = row; }
$('#s-journal').addEventListener('pointerdown', e => {
  if (swipe.open && !swipe.open.contains(e.target)) closeOpenRow();
  const main = e.target.closest('.jrow-main'); if (!main || ui.readOnly) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const edge = e.clientX < 28 || e.clientX > window.innerWidth - 28; if (edge && e.pointerType !== 'mouse') return; // edge swipes switch sections
  const row = main.closest('.jrow');
  swipe.pending = { row, x: e.clientX, y: e.clientY, pid: e.pointerId, base: swipe.open === row ? -rowParts(row).tray.getBoundingClientRect().width : 0, dx: 0 };
});
window.addEventListener('pointermove', e => {
  const s = swipe.pending; if (!s || e.pointerId !== s.pid) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!swipe.active){
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)){ swipe.pending = null; return; }
    if (Math.abs(dx) < 10) return;
    swipe.active = true; s.row.classList.add('swiping'); closeOpenRow(s.row);
    s.w = s.row.getBoundingClientRect().width;
  }
  const done = s.row.classList.contains('done');
  s.dx = clamp(s.base + dx, -s.w * .85, done ? 0 : 150);
  if (!swipe.raf) swipe.raf = requestAnimationFrame(() => {
    swipe.raf = 0; const q = swipe.pending; if (!q || !swipe.active) return;
    setRow(q.row, q.dx, false);
    q.row.classList.toggle('swiping-right', q.dx > 0);
    q.row.classList.toggle('arm-left', !q.row.classList.contains('done') && q.dx < -q.w * .55);
  });
});
function endSwipe(e, cancel){
  const s = swipe.pending; if (!s || e.pointerId !== s.pid) return;
  swipe.pending = null;
  if (!swipe.active) return;
  swipe.active = false; swipe.suppress = true; setTimeout(() => { swipe.suppress = false; }, 300);
  if (swipe.raf){ cancelAnimationFrame(swipe.raf); swipe.raf = 0; }
  const row = s.row, id = row.dataset.row, width = s.w || row.getBoundingClientRect().width, done = row.classList.contains('done');
  row.classList.remove('swiping', 'swiping-right', 'arm-left');
  const tw = rowParts(row).tray.getBoundingClientRect().width;
  if (cancel){ setRow(row, 0); return; }
  if (s.dx > 90 && !done){ setRow(row, 0); toggleStamp(id); }
  else if (!done && s.dx < -width * .55) collapseOut(row, -1, () => removeItem(id));
  else if (s.dx < -tw / 2){ setRow(row, -tw); swipe.open = row; }
  else { setRow(row, 0); if (swipe.open === row) swipe.open = null; }
}
window.addEventListener('pointerup', e => endSwipe(e, false));
window.addEventListener('pointercancel', e => endSwipe(e, true));

/* ---------- toast: undo, close, or swipe it away ---------- */
let toastTimer = 0;
const toastDrag = { s: null };
function toast(msg, undoable, action){
  const t = $('#toast'), canUndo = !!undoable && history.length > 0 && !ui.readOnly;
  const btn = action ? `<button type="button" data-toast-action>${esc(action.label)}</button>` : canUndo ? '<button type="button" data-undo>Undo</button>' : '';
  t.innerHTML = `<span>${esc(msg)}</span>${btn}<button type="button" class="tx" data-toast-close aria-label="Dismiss">${ICON.x}</button>`;
  t._action = action ? action.fn : null;
  t.style.transform = ''; t.style.opacity = '';
  t.classList.remove('show', 'dragging'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, canUndo || action ? 7000 : 3200);
}
function hideToast(dir){
  const t = $('#toast'); clearTimeout(toastTimer);
  if (dir && motionOK()){
    const from = t.style.transform || 'none';
    const a = t.animate([{ transform: from, opacity: 1 }, { transform: dir === 'down' ? 'translateY(60px)' : `translateX(${dir === 'left' ? -110 : 110}%)`, opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => { t.classList.remove('show'); t.style.transform = ''; t.style.opacity = ''; a.cancel(); };
  } else { t.classList.remove('show'); t.style.transform = ''; }
}
$('#toast').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; toastDrag.s = { x: e.clientX, y: e.clientY, pid: e.pointerId, dx: 0, dy: 0 }; clearTimeout(toastTimer); });
window.addEventListener('pointermove', e => {
  const s = toastDrag.s; if (!s || e.pointerId !== s.pid) return;
  s.dx = e.clientX - s.x; s.dy = Math.max(0, e.clientY - s.y);
  const t = $('#toast'); t.classList.add('dragging');
  t.style.transform = `translate3d(${s.dx}px,${s.dy * .6}px,0)`; t.style.opacity = String(1 - Math.min(1, Math.abs(s.dx) / 260 + s.dy / 160));
});
function endToastDrag(e){
  const s = toastDrag.s; if (!s || e.pointerId !== s.pid) return; toastDrag.s = null;
  const t = $('#toast'); t.classList.remove('dragging');
  if (Math.abs(s.dx) > 70) hideToast(s.dx < 0 ? 'left' : 'right');
  else if (s.dy > 30) hideToast('down');
  else { t.style.transform = ''; t.style.opacity = ''; toastTimer = setTimeout(hideToast, 4000); }
}
window.addEventListener('pointerup', endToastDrag);
window.addEventListener('pointercancel', endToastDrag);

/* ---------- sheets ---------- */
const sheetLayer = $('#sheet'), panel = $('#panel');
let sheetAnim = null, sheetFade = null;
function openSheet(s){
  if (sheetAnim){ sheetAnim.cancel(); sheetAnim = null; }
  if (sheetFade){ sheetFade.cancel(); sheetFade = null; }
  panel.style.transform = ''; panel.style.transition = '';
  const prev = ui.sheet;
  if (prev && prev !== s.back) finishSheetEdits(prev);
  ui.sheet = s; s.snap = JSON.stringify(state);
  renderSheet(true);
  if (!sheetLayer.open){ if (typeof sheetLayer.showModal === 'function') sheetLayer.showModal(); else sheetLayer.setAttribute('open', ''); }
  else if (motionOK()) panel.animate([{ opacity: .4, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
  const focusId = { newtrip: 'fTitle' }[s.type];
  if (focusId) setTimeout(() => { const i = document.getElementById(focusId); if (i) i.focus(); }, 120);
  else setTimeout(() => { const h = $('#sheetTitle'); if (h && !panel.contains(document.activeElement)) h.focus({ preventScroll: true }); }, 60);
}
/* typed edits (names, notes, wrap-up answers) save as you type; one undo step is added when the sheet closes */
function finishSheetEdits(s){
  if (!s || !s.live || !s.snap) return;
  if (JSON.stringify(state) !== s.snap) pushHistory(s.type === 'editbook' ? 'editing the booklet' : 'editing the wrap-up', s.snap);
  s.snap = null;
}
function closeSheet(){
  const had = ui.sheet; ui.sheet = null;
  if (had){ finishSheetEdits(had); if (editSnapState.snap) commitEditSnap(); }
  if (had && had.back){ openSheet(had.back); return; }
  if (had && had.previewColor) syncActive();
  if (!sheetLayer.open || sheetAnim) return;
  const from = panel.style.transform || 'none';
  const finish = () => {
    const a = sheetAnim; sheetAnim = null;
    panel.style.transform = ''; panel.style.transition = '';
    if (!ui.sheet) sheetLayer.close();
    if (a) a.cancel(); if (sheetFade){ sheetFade.cancel(); sheetFade = null; }
  };
  if (!motionOK()){ finish(); return; }
  sheetAnim = panel.animate([{ transform: from }, { transform: 'translateY(105%)' }], { duration: 240, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' });
  try { sheetFade = sheetLayer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, pseudoElement: '::backdrop', fill: 'forwards' }); } catch (e) {}
  sheetAnim.onfinish = finish;
}
sheetLayer.addEventListener('close', () => { ui.sheet = null; renderAll({ transition: 'none' }); });
sheetLayer.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
sheetLayer.addEventListener('click', e => { if (e.target === sheetLayer && !sheetDrag.justDragged) closeSheet(); });
const sheetDrag = { s: null, justDragged: false };
sheetLayer.addEventListener('pointerdown', e => {
  if (!e.target.closest('.grab, .sheet-head') || e.target.closest('button')) return;
  sheetDrag.s = { y: e.clientY, pid: e.pointerId, dy: 0, vy: 0, ly: e.clientY, lt: performance.now(), moved: false };
});
window.addEventListener('pointermove', e => {
  const s = sheetDrag.s; if (!s || e.pointerId !== s.pid) return;
  const now = performance.now(); s.vy = (e.clientY - s.ly) / Math.max(now - s.lt, 1); s.ly = e.clientY; s.lt = now;
  const raw = e.clientY - s.y; if (!s.moved && Math.abs(raw) < 6) return;
  s.moved = true; s.dy = raw > 0 ? raw : raw / 6;
  panel.style.transition = 'none'; panel.style.transform = `translate3d(0,${s.dy}px,0)`;
});
function endSheetDrag(e){
  const s = sheetDrag.s; if (!s || e.pointerId !== s.pid) return;
  sheetDrag.s = null;
  if (!s.moved) return;
  sheetDrag.justDragged = true; setTimeout(() => { sheetDrag.justDragged = false; }, 300);
  if (s.dy > 120 || (s.vy > .6 && s.dy > 24)){ const b = ui.sheet; if (b) b.back = null; closeSheet(); }
  else { panel.style.transition = 'transform .4s var(--spring)'; panel.style.transform = ''; setTimeout(() => { if (!sheetAnim) panel.style.transition = ''; }, 420); }
}
window.addEventListener('pointerup', endSheetDrag);
window.addEventListener('pointercancel', endSheetDrag);
function sheetFrame(title, body, foot){
  return `<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheetTitle" tabindex="-1">${title}</h2><button type="button" class="iconbtn" data-close-sheet aria-label="${ui.sheet && ui.sheet.back ? 'Back' : 'Close'}">${ui.sheet && ui.sheet.back ? ICON.left : ICON.x}</button></div><div class="sheet-body" id="sheetBody">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
}
const SHEETS = {
  item: () => { const p = getItem(ui.sheet.id); return p ? ['Details', itemSheet(p)] : null; },
  trip: () => trip ? ['Trip settings', tripForm(trip), tripFoot(true)] : null,
  newtrip: () => ['New trip', tripForm(null), tripFoot(false)],
  conclude: () => trip ? [`Conclude ${esc(trip.title)}`, summarySheet(trip, false)] : null,
  editbook: () => { const t = getTrip(ui.sheet.id); return t ? ['Edit booklet', summarySheet(t, true)] : null; },
  settings: () => ['Settings', settingsSheet()],
  import: () => [ui.sheet.purpose === 'sync' ? 'Get their changes' : 'Import data', importSheet()],
  send: () => syncOn() ? ['Send your changes', sendSheet()] : null,
  tutorial: () => ['Quick tour', tutorialSheet(), tutorialFoot()],
  stamps: () => trip ? ['All stamps', stampsSheet()] : null,
  confirm: () => [esc(ui.sheet.title), confirmSheet(), confirmFoot()]
};
function renderSheet(fresh){
  const s = ui.sheet; if (!s || !SHEETS[s.type]) return;
  const made = SHEETS[s.type](); if (!made){ closeSheet(); return; }
  const bodyEl = $('#sheetBody'), scroll = bodyEl && !fresh ? bodyEl.scrollTop : 0;
  const a = document.activeElement, keep = a && panel.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const themeColor = s.type === 'editbook' ? getTrip(s.id).color : s.type === 'newtrip' ? (s.previewColor || s.color) : null;
  panel.setAttribute('style', themeColor ? themeStyle(themeColor) : '');
  panel.innerHTML = sheetFrame(made[0], made[1], made[2]);
  const nb = $('#sheetBody'); if (nb) nb.scrollTop = scroll;
  if (keep){ const n = document.getElementById(keep.id); if (n){ n.focus({ preventScroll: true }); try { if (keep.s != null) n.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
}
const dayChoices = () => [['pool', 'Pool']].concat(Array.from({ length: trip.days }, (_, i) => [i, fmtDay(i)]));
const gmapsUrl = p => p.gurl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ', ' + trip.title)}`;

/* item details: grouped and in the order people need them */
function itemSheet(p){
  const v = p.visited, planned = p.day != null;
  const status = v ? `Stamped ${dtFmt.format(parseStamp(v.at))}` : planned ? `Planned for ${fmtDay(p.day)}${p.slot ? ', ' + SLOT[p.slot].toLowerCase() : ''}` : 'In the pool, not on a day yet';
  const days = dayChoices().map(([k, t]) => `<button type="button" class="chip" data-set-day="${k}" aria-pressed="${k === 'pool' ? !planned : p.day === k}">${esc(t)}</button>`).join('');
  const slots = SLOTS.map(([k, t]) => `<button type="button" data-set-slot="${k}" aria-pressed="${p.slot === k}">${t}</button>`).join('');
  const kinds = Object.entries(KIND).map(([k, t]) => `<button type="button" class="chip" data-set-kind="${k}" aria-pressed="${p.kind === k}"><i class="kdot" style="--kc:${KIND_COLOR[k]}" aria-hidden="true"></i>${t}</button>`).join('');
  return `<label for="pName" class="sr-only">Name</label>
    <input id="pName" class="titleinput" type="text" maxlength="120" value="${esc(p.name)}" data-pf="name" autocomplete="off">
    <span class="status-pill${v ? ' done' : ''}">${v ? ICON.stamp.replace('<svg', '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:3"') : ''}${esc(status)}</span>
    ${planned || v ? `<div class="group"><button type="button" class="btn block ${v ? '' : 'primary'}" data-stamp="${p.id}">${v ? 'Remove the stamp' : 'Stamp as done'}</button></div>` : ''}
    ${v ? `<div class="visitbox">
      <span class="group-label">How was it?</span>
      <div class="chips" role="group" aria-label="How was it?">${Object.entries(FEEL).map(([k, t]) => `<button type="button" class="chip" data-feel="${k}" aria-pressed="${v.feel === k}">${t}</button>`).join('')}</div>
      <label class="field"><span>What you want to remember</span><textarea id="pMemo" rows="3" maxlength="2000" data-pf="visited.note" placeholder="What you ate, what surprised you">${esc(v.note)}</textarea></label>
      <label class="field"><span>When</span><input id="pWhen" type="datetime-local" value="${esc(v.at)}" data-pf="visited.at"></label>
    </div>` : ''}
    <div class="box">
      <div class="group"><span class="group-label">Day</span><div class="hscroll">${days}</div></div>
      <div class="group"><span class="group-label">Time of day</span><div class="seg">${slots}</div></div>
    </div>
    <div class="group"><span class="group-label">Type</span><div class="chips">${kinds}</div></div>
    <div class="group"><label class="field"><span>Notes</span><textarea id="pNote" rows="3" maxlength="2000" data-pf="note" placeholder="Tickets, opening hours, who recommended it">${esc(p.note)}</textarea></label></div>
    <div class="row-actions"><a class="btn small soft" href="${esc(gmapsUrl(p))}" target="_blank" rel="noopener">${ICON.map}Find in Google Maps</a>${planned ? `<button type="button" class="btn small" data-item-pool>${ICON.pool}Back to the pool</button>` : ''}</div>
    <div class="danger-zone"><button type="button" class="btn small danger" data-remove="${p.id}">${ICON.trash}Delete</button></div>`;
}
/* trip settings and new trip share one form */
function tripForm(t){
  const s = ui.sheet, color = s.previewColor || (t ? t.color : s.color) || DEFAULT_COLOR;
  const preset = SWATCHES.includes(color);
  const start = s.start || (t ? t.start : ymd(new Date(Date.now() + 30 * 86400000)));
  const days = s.days || (t ? t.days : 7), title = s.title != null ? s.title : t ? t.title : '';
  const err = s.err || {};
  return `<div class="stack">
    <label class="field"><span>Destination</span><input id="fTitle" type="text" maxlength="40" placeholder="Lisbon, Tokyo, the coast…" value="${esc(title)}" autocomplete="off" enterkeyhint="next"${err.title ? ' aria-invalid="true"' : ''}>${err.title ? `<span class="err">${esc(err.title)}</span>` : ''}</label>
    <div class="two-fields">
      <label class="field"><span>First day</span><input id="fStart" type="date" value="${esc(start)}"${err.start ? ' aria-invalid="true"' : ''}>${err.start ? `<span class="err">${esc(err.start)}</span>` : ''}</label>
      <label class="field"><span>Days</span><input id="fDays" type="number" inputmode="numeric" min="1" max="${MAX_DAYS}" value="${days}" enterkeyhint="done"${err.days ? ' aria-invalid="true"' : ''}>${err.days ? `<span class="err">${esc(err.days)}</span>` : ''}</label>
    </div>
  </div>
  <div class="group"><span class="group-label" id="colourLabel">Colour</span>
    <div class="swatches" role="group" aria-labelledby="colourLabel">${SWATCHES.map(c => `<button type="button" class="swatch" data-swatch="${c}" style="--sw:${c}" aria-pressed="${c === color}" aria-label="Colour ${c}"></button>`).join('')}
      <label class="swatch custom" style="${preset ? '' : `--sw:${color};`}" title="Pick any colour"><input type="color" id="fColor" value="${color}" aria-label="Pick any colour"><span>${ICON.plus}</span></label></div>
    <div class="preview" style="${themeStyle(color)}">${signHTML(normTrip({ title: title || 'Your trip', start, days, color }))}</div>
  </div>
  ${t ? `<div class="group"><span class="group-label">Finish the trip</span><div class="menu"><button type="button" class="menu-row" data-sheet="conclude"><span class="mi">${ICON.flag}</span><span class="grow"><b>Conclude trip…</b><small>Answer a few questions and keep it as a booklet</small></span>${ICON.chev}</button></div></div>
  <div class="danger-zone"><p>Deleting removes this trip and everything in it.</p><button type="button" class="btn small danger" data-trip-delete>${ICON.trash}Delete this trip…</button></div>` : ''}`;
}
const tripFoot = existing => `<button type="button" class="btn primary" ${existing ? 'data-trip-save' : 'data-trip-create'}>${existing ? 'Save changes' : 'Create trip'}</button>`;
/* wrap-up questions, used both when concluding and when editing a booklet later */
function summarySheet(t, isBook){
  const s = ui.sheet, a = t.summary, stamped = t.places.filter(p => p.visited);
  const foods = stamped.filter(isFoodish).slice(0, 10), spots = stamped.filter(p => !isFoodish(p)).slice(0, 10);
  const picks = (list, key, emptyText) => list.length
    ? `<div class="picks" role="group" aria-label="Pick from where you went">${list.map(p => `<button type="button" class="chip" data-pick="${key}" data-val="${esc(p.name)}" aria-pressed="${a[key] === p.name}"><i class="kdot" style="--kc:${KIND_COLOR[p.kind]}" aria-hidden="true"></i>${esc(p.name)}</button>`).join('')}</div>`
    : `<p class="hint" style="margin:0 0 8px">${emptyText}</p>`;
  return `${isBook ? `<label class="field"><span>Booklet title</span><input id="bTitle" type="text" maxlength="40" value="${esc(t.title)}" data-btitle autocomplete="off"></label>` : `<p class="hint" style="margin-top:0">Answer as many as you like. Your answers are saved as you go and stay with the trip, even if you reopen it.</p>`}
    <div class="group field"><label for="cFood">Favourite food</label>${picks(foods, 'food', 'Food places you stamp in the journal show up here to pick from.')}<input id="cFood" data-sum="food" type="text" maxlength="120" placeholder="${foods.length ? 'Pick one above, or type it' : 'The best thing you ate'}" value="${esc(a.food)}"></div>
    <div class="group field"><label for="cSpot">Favourite spot</label>${picks(spots, 'spot', 'Places you stamp show up here to pick from.')}<input id="cSpot" data-sum="spot" type="text" maxlength="120" placeholder="${spots.length ? 'Pick one above, or type it' : 'The place you loved most'}" value="${esc(a.spot)}"></div>
    <div class="group"><label class="field"><span>Best moment</span><textarea id="cMoment" data-sum="moment" rows="3" maxlength="600" placeholder="The bit you'll tell people about">${esc(a.moment)}</textarea></label></div>
    <div class="group"><label class="field"><span>Biggest surprise</span><input id="cSurprise" data-sum="surprise" type="text" maxlength="300" value="${esc(a.surprise)}"></label></div>
    <div class="group"><span class="group-label">Would you go back?</span><div class="seg" style="--n:3">${[['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']].map(([k, l]) => `<button type="button" data-again="${k}" aria-pressed="${a.again === k}">${l}</button>`).join('')}</div></div>
    <div class="group"><span class="group-label" id="rateLabel">Rate the trip</span><div class="stars" role="group" aria-labelledby="rateLabel">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-rate="${i}" aria-pressed="${i <= a.rating}" aria-label="${i} of 5"></button>`).join('')}</div></div>
    ${isBook
      ? `<div class="group"><span class="group-label">Cover</span><div class="menu"><button type="button" class="menu-row" data-book-decorate data-id="${t.id}"><span class="mi">${ICON.image}</span><span class="grow"><b>Decorate the cover</b><small>${t.stickers.length ? plural(t.stickers.length, 'sticker') + ' so far' : 'Add your photos as stickers'}</small></span>${ICON.chev}</button></div></div>`
      : s.confirming
        ? `<div class="confirm-box" role="alertdialog" aria-labelledby="cfTitle"><b id="cfTitle">Turn ${esc(t.title)} into a booklet?</b><p>It moves from your trips to your booklets. Your answers and stamps are kept, and you can reopen the trip at any time.</p><div class="row-actions"><button type="button" class="btn" data-conclude-cancel>Not yet</button><button type="button" class="btn primary" data-conclude-yes>${ICON.flag}Conclude trip</button></div></div>`
        : `<div class="group"><button type="button" class="btn primary block" data-conclude>${ICON.flag}Make the booklet…</button></div>`}`;
}
function togetherGroup(){
  if (!syncOn()) return '';
  const m = sync.meta, n = unsentCount(), pr = partner(), who = partnerName();
  const sendNote = m.sent ? (n ? `${plural(n, 'change')} not sent yet` : `Last sent ${whenText(m.sent.at)}`) : 'Share a file with the person you travel with';
  const getNote = pr && pr.got ? `Last from ${who || 'them'}, ${whenText(pr.got)}` : 'Open the file they sent you';
  return `<span class="group-label">Travel together</span>
    <div class="menu">
      <button type="button" class="menu-row" data-sheet="send"><span class="mi">${ICON.share}</span><span class="grow"><b>Send your changes</b><small>${esc(sendNote)}</small></span>${n && m.sent ? `<span class="badge" aria-label="${plural(n, 'change')} not sent">${n}</span>` : ''}${ICON.chev}</button>
      <button type="button" class="menu-row" data-sheet="receive"><span class="mi">${ICON.receive}</span><span class="grow"><b>Get their changes</b><small>${esc(getNote)}</small></span>${ICON.chev}</button>
    </div>
    ${pr || m.sent ? '' : '<p class="notice">No account needed. You send each other a file in any chat, and each of you brings in the other\'s. Both phones then show the same trips, stamps and booklets.</p>'}`;
}
function settingsSheet(){
  const last = store.lastSaved ? tFmt.format(store.lastSaved) : null;
  const tg = togetherGroup();
  return `${tg}<span class="group-label${tg ? ' spaced' : ''}">Your data</span>
    <div class="menu">
      <button type="button" class="menu-row" data-export><span class="mi">${ICON.download}</span><span class="grow"><b>Export a backup</b><small>Save a file with all trips, booklets and stickers</small></span>${ICON.chev}</button>
      <button type="button" class="menu-row" data-sheet="import"><span class="mi">${ICON.upload}</span><span class="grow"><b>Import a backup</b><small>Load a file exported from this app</small></span>${ICON.chev}</button>
    </div>
    <p class="notice">${store.mode === 'db' ? 'Your trips are saved to your account.' : `Your trips are saved in this browser on this device${last ? `, last at ${esc(last)}` : ''}.`} Export now and then to keep a copy, or to move to another phone.</p>
    <div class="group"><span class="group-label">Help</span><div class="menu"><button type="button" class="menu-row" data-tour><span class="mi">${ICON.help}</span><span class="grow"><b>Show the quick tour</b><small>How trips, the pool, stamps and booklets work</small></span>${ICON.chev}</button></div></div>
    <div class="group"><span class="group-label" id="motionLabel">Animations</span><div class="seg" style="--n:2" role="group" aria-labelledby="motionLabel"><button type="button" data-motion="system" aria-pressed="${prefs.motion !== 'reduce'}">Follow device</button><button type="button" data-motion="reduce" aria-pressed="${prefs.motion === 'reduce'}">Reduce motion</button></div></div>
    <div class="danger-zone"><p>Remove every trip and booklet from this device${partner() ? `. ${whoText('The other person')} keeps theirs` : ''}. You can undo it straight after.</p><button type="button" class="btn small danger" data-wipe>${ICON.trash}Delete all data…</button></div>`;
}
const IS_ANDROID = /Android/i.test(navigator.userAgent);
function importSheet(){
  const s = ui.sheet, sy = s.purpose === 'sync';
  const pick = (label = 'Choose a file') => `<label class="btn primary block">${sy ? ICON.receive : ICON.upload}${label}<input type="file" id="importFile" accept=".json,.txt,application/json,text/plain" class="sr-only"></label>`;
  if (s.phase === 'reading') return '<p class="loading" role="status">Reading the file…</p>';
  if (s.phase === 'error') return `<p class="notice error" role="alert">${esc(s.error)}</p><p class="hint">Nothing was changed.</p><div class="group">${pick('Choose another file')}</div>`;
  if (sy && s.phase === 'done') return syncDoneHTML(s);
  if (sy && s.phase === 'preview') return syncPreviewHTML(s);
  if (sy) return `<p class="hint" style="margin-top:0">Choose the file ${whoText('they')} sent you. You'll see what changes before anything does.</p><div class="group">${pick('Choose their file')}</div>
    <p class="hint">Got it in a chat? Save the file to your phone first${IS_ANDROID ? ', or share it from the chat straight to Travel Log' : ', for example to Files'}, then choose it here.</p>`;
  if (s.phase === 'preview'){
    const c = s.data.counts;
    return `<p class="hint" style="margin-top:0">${esc(s.fileName)}</p>
      <div class="importsum"><div><b>${c.trips}</b><small>${c.trips === 1 ? 'trip' : 'trips'}</small></div><div><b>${c.books}</b><small>${c.books === 1 ? 'booklet' : 'booklets'}</small></div><div><b>${c.stickers}</b><small>${c.stickers === 1 ? 'sticker' : 'stickers'}</small></div></div>
      <span class="group-label" id="modeLabel">How to import</span>
      <div class="seg" style="--n:2" role="group" aria-labelledby="modeLabel"><button type="button" data-imode="add" aria-pressed="${s.mode === 'add'}">Combine with mine</button><button type="button" data-imode="replace" aria-pressed="${s.mode === 'replace'}">Replace everything</button></div>
      <p class="hint">${s.mode === 'add' ? 'Your trips stay. New ones are added, and trips that are in both are combined, keeping the newer version of each detail.' : `Your current ${plural(state.trips.length, 'trip')} will be replaced. You can undo it straight after.`}</p>
      ${s.confirming
        ? `<div class="confirm-box danger" role="alertdialog" aria-labelledby="riTitle"><b id="riTitle">Replace everything?</b><p>All trips and booklets on this device are replaced by the file's ${plural(c.trips + c.books, 'trip')}.</p><div class="row-actions"><button type="button" class="btn" data-import-cancel>Cancel</button><button type="button" class="btn danger-solid" data-import-go>Replace</button></div></div>`
        : `<div class="group"><button type="button" class="btn primary block" data-import-go>${s.mode === 'add' ? 'Import' : 'Replace everything…'}</button></div>`}`;
  }
  return `<p class="hint" style="margin-top:0">Choose a file you exported from Travel Log. You'll see what's in it before anything changes.</p><div class="group">${pick()}</div>`;
}
const TOUR = [
  ['Trips', 'Every trip gets its own colour and its own plan. Swipe right from Today, or tap Trips at the top, to see all of them.', `<div class="art-row"><span class="sign" style="${themeStyle('#0f766e')}"><span class="sign-sub">5 days</span><span class="sign-title">Lisbon</span></span><span class="sign" style="${themeStyle('#b4532a')}"><span class="sign-sub">2 weeks</span><span class="sign-title">Rome</span></span></div>`],
  ['The pool', 'Collect anything you might want to do in the pool. Press and hold a card, then drag it onto a day and a time.', `<div class="art-row"><span class="art-card"><i class="kdot" style="--kc:#d4637f"></i>Market lunch</span><span class="art-arrow">→</span><span class="daychip" style="box-shadow:var(--shadow-md)"><span class="dw">Sat</span><span class="dn">6</span></span></div>`],
  ['Stamps', 'In the journal, tap the stamp once you have done something. Swipe a row left to send it back to the pool or delete it.', `<div class="art-row"><span class="stampbtn" aria-hidden="true"><span class="ring" style="border:2.5px solid var(--stamp);background:var(--stamp-soft);color:var(--stamp);transform:rotate(-12deg)">${ICON.stamp}</span></span><span class="art-card">Sunset viewpoint</span></div>`],
  ['Booklets', 'When you are back, conclude the trip in its settings. It becomes a booklet with your favourites, and you can decorate its cover with photos.', `<div class="cover" style="${cardStyle('#6b4fa0')};width:96px"><span class="cover-text"><span class="bc-kicker">Booklet</span><span class="bc-title" style="font-size:16px">Kyoto</span></span><span class="bc-sub">Apr</span></div>`],
  ['Travel together', 'Planning with someone? In Settings, send your changes as a file in any chat. They bring it in and send theirs back, and both phones show the same trips.', `<div class="art-row"><span class="art-card">${ICON.share.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.2"')}You</span><span class="art-arrow">⇄</span><span class="art-card">Them</span></div>`],
  ['Swipe around', 'Swipe left and right to move between Trips, Today, Plan and Journal. Every change can be undone with the arrow at the top.', `<div class="art-row"><span class="art-arrow">←</span><span class="art-card">Today</span><span class="art-card">Plan</span><span class="art-arrow">→</span></div>`]
];
function tutorialSheet(){
  const i = ui.sheet.step || 0, [h, p, art] = TOUR[i];
  return `<div class="tour" data-tour-swipe><div class="tour-art" aria-hidden="true">${art}</div><h3>${esc(h)}</h3><p>${esc(p)}</p>
    <div class="tour-dots" aria-label="Step ${i + 1} of ${TOUR.length}">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
function tutorialFoot(){
  const i = ui.sheet.step || 0, last = i === TOUR.length - 1;
  return `<button type="button" class="btn" data-tour-step="${i - 1}"${i === 0 ? ' disabled' : ''}>Back</button><button type="button" class="btn primary" ${last ? 'data-tour-done' : `data-tour-step="${i + 1}"`}>${last ? 'Done' : 'Next'}</button>`;
}
/* the journal menu: every stamp, filterable by category and sortable */
function stampsSheet(){
  const s = ui.sheet, all = trip.places.filter(p => p.visited);
  const counts = {}; all.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
  const f = s.filter || 'all', sort = s.sort || 'new';
  let list = all.filter(p => f === 'all' || p.kind === f);
  const by = { new: (a, b) => (a.visited.at < b.visited.at ? 1 : -1), old: (a, b) => (a.visited.at > b.visited.at ? 1 : -1), az: (a, b) => a.name.localeCompare(b.name), loved: (a, b) => ((b.visited.feel === 'loved') - (a.visited.feel === 'loved')) || (a.visited.at < b.visited.at ? 1 : -1) };
  list = list.slice().sort(by[sort]);
  return `<span class="group-label" id="fLabel">Category</span>
    <div class="hscroll" role="group" aria-labelledby="fLabel"><button type="button" class="chip" data-sfilter="all" aria-pressed="${f === 'all'}">All <span class="count">${all.length}</span></button>${Object.keys(KIND).filter(k => counts[k]).map(k => `<button type="button" class="chip" data-sfilter="${k}" aria-pressed="${f === k}"><i class="kdot" style="--kc:${KIND_COLOR[k]}" aria-hidden="true"></i>${KIND[k]} <span class="count">${counts[k]}</span></button>`).join('')}</div>
    <div class="group"><span class="group-label" id="sLabel">Sort</span><div class="seg" role="group" aria-labelledby="sLabel">${[['new', 'Newest'], ['old', 'Oldest'], ['az', 'A to Z'], ['loved', 'Loved']].map(([k, l]) => `<button type="button" data-ssort="${k}" aria-pressed="${sort === k}">${l}</button>`).join('')}</div></div>
    ${list.length ? `<ul class="stamplist">${list.map(p => `<li><button type="button" data-open="${p.id}" data-from-stamps><i class="kdot" style="--kc:${KIND_COLOR[p.kind]}" aria-hidden="true"></i><b>${esc(p.name)}</b><small>${esc(dtFmt.format(parseStamp(p.visited.at)))}, ${esc(KIND[p.kind].toLowerCase())}${p.visited.feel ? ', ' + esc(FEEL[p.visited.feel].toLowerCase()) : ''}</small>${p.visited.note ? `<q>${esc(p.visited.note)}</q>` : ''}</button></li>`).join('')}</ul>` : '<p class="notice">No stamps in this category yet.</p>'}`;
}
function confirmSheet(){ const s = ui.sheet; return `<p style="margin:0;font-size:16px">${esc(s.body)}</p>`; }
function confirmFoot(){ const s = ui.sheet; return `<button type="button" class="btn" data-confirm-no>Cancel</button><button type="button" class="btn ${s.danger ? 'danger-solid' : 'primary'}" data-confirm-yes>${esc(s.confirmLabel)}</button>`; }
function askConfirm(opts){ openSheet({ type: 'confirm', ...opts }); }

/* ---------- import and export ---------- */
async function saveFile(filename, text, mime){
  let dl = null;
  try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl){
    try { await dl.save({ filename, data: text }); return 'saved'; }
    catch (e) { return e && e.code === 'declined' ? 'declined' : e && e.code === 'rate_limited' ? 'busy' : 'failed'; }
  }
  if (!window.claude){
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      return 'saved';
    } catch (e) {}
  }
  return 'failed';
}
async function buildExport(){
  stampChanges();
  const ids = new Set(state.trips.flatMap(t => t.stickers.map(s => s.img))), imgs = {};
  for (const id of ids){ const d = await getImage(id); if (d) imgs[id] = d; }
  const out = { app: APP_ID, format: STATE_VERSION, exported: new Date().toISOString(), state: JSON.parse(JSON.stringify(state)), images: imgs };
  if (syncOn()) out.sync = { dev: sync.meta.dev, name: sync.meta.name, stamps: sync.meta.stamps };
  return out;
}
async function exportData(btn){
  if (btn) btn.classList.add('busy');
  try {
    const payload = await buildExport();
    const r = await saveFile(`Travel Log export ${ymd(new Date())}.json`, JSON.stringify(payload), 'application/json');
    toast(r === 'saved' ? `Exported ${plural(state.trips.length, 'trip')}` : r === 'busy' ? 'A download prompt is already open.' : r === 'declined' ? 'Export cancelled' : "Couldn't save a file here.");
  } finally { if (btn) btn.classList.remove('busy'); }
}
/* validates an import file; throws a readable message, never touches the current data */
function parseImport(text){
  if (typeof text !== 'string' || !text.trim()) throw new Error('That file is empty.');
  if (text.length > 40_000_000) throw new Error('That file is too large to be a Travel Log export.');
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error("That file isn't a Travel Log export (it couldn't be read)."); }
  if (!o || typeof o !== 'object') throw new Error("That file isn't a Travel Log export.");
  const raw = o.app === APP_ID ? (o.state || o.trip || null) : o;
  if (!raw || typeof raw !== 'object' || !(Array.isArray(raw.trips) || Array.isArray(raw.places))) throw new Error("That file doesn't contain any trips from this app.");
  if (o.app === APP_ID && Number(o.format) > STATE_VERSION) throw new Error('That file comes from a newer version of the app. Reload to update, then try again.');
  const parsed = normState(raw);
  // a file from a phone that has deleted every trip is still a valid set of changes
  if (!parsed.trips.length && !(o.app === APP_ID && o.sync && typeof o.sync === 'object')) throw new Error("That file doesn't contain any trips.");
  const imgs = {};
  if (o.images && typeof o.images === 'object') for (const [id, d] of Object.entries(o.images)) if (validId(id) && isImageData(d)) imgs[id] = d;
  const counts = { trips: parsed.trips.filter(t => !t.concluded).length, books: parsed.trips.filter(t => t.concluded).length, stickers: parsed.trips.reduce((n, t) => n + t.stickers.length, 0) };
  let peer = null;
  if (o.app === APP_ID && o.sync && typeof o.sync === 'object') peer = { dev: DEV_RE.test(o.sync.dev) ? o.sync.dev : '', name: str(o.sync.name, 30), stamps: cleanStamps(o.sync.stamps) };
  const sent = o.app === APP_ID && typeof o.exported === 'string' && !isNaN(new Date(o.exported)) ? o.exported : null;
  return { parsed, images: imgs, counts, peer, sent };
}
async function readImportFile(file){
  const s = ui.sheet; if (!s || s.type !== 'import') return;
  s.phase = 'reading'; s.fileName = file.name; renderSheet(false);
  try {
    if (file.size > 40_000_000) throw new Error('That file is too large to be a Travel Log export.');
    readImportText(await file.text(), file.name);
  } catch (e) { s.phase = 'error'; s.error = e && e.message ? e.message : "That file couldn't be read."; if (ui.sheet === s) renderSheet(false); }
}
function readImportText(text, name){
  const s = ui.sheet; if (!s || s.type !== 'import') return;
  s.fileName = name;
  try {
    s.data = parseImport(text); s.mode = 'add'; s.phase = 'preview'; s.confirming = false;
    if (s.purpose === 'sync') s.plan = planCombine(s.data);
  } catch (e) { s.phase = 'error'; s.error = e && e.message ? e.message : "That file couldn't be read."; }
  if (ui.sheet === s){ renderSheet(false); focusSheetTitle(); }
}
function focusSheetTitle(id){ setTimeout(() => { const h = document.getElementById(id || 'sheetTitle'); if (h) h.focus({ preventScroll: true }); }, 30); }
async function applyImport(){
  const s = ui.sheet; if (!s || s.phase !== 'preview' || s.applying) return;
  if (ui.readOnly){ toast(VIEW_ONLY); return; }
  if (s.mode === 'replace' && s.purpose !== 'sync' && !s.confirming){ s.confirming = true; renderSheet(false); return; }
  s.applying = true;
  try {
    if (s.mode === 'replace' && s.purpose !== 'sync'){
      for (const [id, d] of Object.entries(s.data.images)) await putImage(id, d);
      const incoming = normState(JSON.parse(JSON.stringify(s.data.parsed)));
      try { localStorage.setItem('travel-log-before-import', JSON.stringify(state)); } catch (e) {}
      // this phone becomes a copy of the file, history included; nothing is sent anywhere as deleted
      mutateLocal(() => {
        state = incoming; ui.view = 'home';
        if (sync.meta){ sync.meta.stamps = Object.assign({}, s.data.peer ? s.data.peer.stamps : {}); sync.meta.clock = Math.max(sync.meta.clock, maxStampTime(sync.meta.stamps)); rememberPeer(s.data); }
      }, 'replacing your data', { transition: 'back' });
      const c = s.data.counts;
      ui.sheet = null; sheetLayer.close();
      toast(`Replaced with ${plural(c.trips + c.books, 'trip')}`, true);
      return;
    }
    const r = await applyCombine(s);
    if (s.purpose === 'sync'){
      if (ui.sheet !== s) return;
      s.phase = 'done'; s.result = r; renderSheet(false); focusSheetTitle('syncDone');
      if (r.changed) toast(`Brought in ${plural(r.mine.count, 'change')}`, true);
      return;
    }
    const c = s.data.counts;
    ui.sheet = null; sheetLayer.close();
    toast(r.changed ? `Imported ${plural(c.trips + c.books, 'trip')}` : 'You already had everything in that file', r.changed);
  } finally { s.applying = false; }
}

/* ---------- typed inputs ---------- */
function quickAdd(){
  const i = $('#qaInput'), txt = i ? i.value.trim() : '';
  if (!txt){ if (i) i.focus(); return; }
  i.value = '';
  addItem(txt, null, null);
  const n = $('#qaInput'); if (n) n.focus({ preventScroll: true });
}
function addTodo(){
  const i = $('#todoInput'), text = i ? str(i.value, 140) : '';
  if (!text){ if (i) i.focus(); return; }
  if (mutate(() => trip.todos.push({ id: uid('t'), text, done: false }), 'adding a to-do')){ toast(`Added “${text}”`, true); const n = $('#todoInput'); if (n) n.focus({ preventScroll: true }); }
}
function journalLog(){
  const i = $('#jlogInput'), txt = i ? i.value.trim() : '';
  if (!txt){ if (i) i.focus(); return; }
  const ti = todayIndex(), day = ti >= 0 ? ti : trip.days - 1;
  if (addItem(txt, null, day, { visited: { at: localStamp(), note: '', feel: '' } })){ const n = $('#jlogInput'); if (n) n.focus({ preventScroll: true }); }
}
function keepTripForm(){ const s = ui.sheet, ti = $('#fTitle'), st = $('#fStart'), dy = $('#fDays'); if (ti) s.title = ti.value; if (st) s.start = st.value; if (dy) s.days = dy.value; }
function readTripForm(){
  keepTripForm();
  const s = ui.sheet, err = {};
  const title = str(s.title, 40), days = parseInt(s.days, 10);
  if (!title) err.title = 'Add a destination';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.start || '')) err.start = 'Pick the first day';
  if (!(days >= 1 && days <= MAX_DAYS)) err.days = `1 to ${MAX_DAYS}`;
  s.err = err;
  if (Object.keys(err).length){ renderSheet(false); const f = $('[aria-invalid="true"]', panel); if (f) f.focus(); return null; }
  return { title, start: s.start, days, color: s.previewColor || (trip && s.type === 'trip' ? trip.color : s.color) || DEFAULT_COLOR };
}
function saveTripSettings(){
  const f = readTripForm(); if (!f) return;
  const t = trip; let moved = 0;
  ui.sheet.previewColor = null;
  const ok = mutate(() => {
    t.title = f.title; t.start = f.start; t.days = f.days; t.color = normHex(f.color) || t.color;
    t.places.forEach(p => { if (p.day != null && p.day >= f.days){ p.day = null; moved++; } });
  }, 'the trip settings');
  closeSheet();
  if (ok) toast(moved ? `Saved. ${plural(moved, 'thing')} moved back to the pool.` : 'Trip saved', true);
}
let summaryTimer = 0;
function summaryTarget(){ const s = ui.sheet; return s && (s.type === 'conclude' ? trip : s.type === 'editbook' ? getTrip(s.id) : null); }
function saveSummarySoon(){ clearTimeout(summaryTimer); summaryTimer = setTimeout(() => { quietSave(); renderUndoButton(); }, 350); }
/* undo steps for text edits in the details sheet: one per field, when you leave it */
const editSnapState = { snap: null, label: '' };
function commitEditSnap(){ if (editSnapState.snap && editSnapState.snap !== JSON.stringify(state)) pushHistory(editSnapState.label, editSnapState.snap); editSnapState.snap = null; renderUndoButton(); }

/* ---------- clicks ---------- */
const asTarget = v => v === 'pool' ? 'pool' : +v;
document.addEventListener('click', e => {
  const t = e.target.closest('button, a'); if (!t || t.disabled) return;
  const d = t.dataset, s = ui.sheet;
  if (d.toastClose != null) return hideToast();
  if (d.undo != null){ hideToast(); return undo(); }
  if (d.toastAction != null){ const fn = $('#toast')._action; hideToast(); if (fn) fn(); return; }
  if (d.tab) return goTab(d.tab);
  if (d.go) return goTab(d.go);
  if (d.home != null) return openHome();
  if (d.openTrip) return openTrip(d.openTrip);
  if (d.openBook) return openBooklet(d.openBook);
  if (d.open){ const back = s && s.type === 'stamps' && d.fromStamps != null ? s : null; return openSheet({ type: 'item', id: d.open, back }); }
  if (d.stamp) return toggleStamp(d.stamp);
  if (d.tour != null){ prefs.tourSeen = true; savePrefs(); return openSheet({ type: 'tutorial', step: 0 }); }
  if (d.tourDismiss != null){ prefs.tourDismissed = true; savePrefs(); return renderAll({ transition: 'none' }); }
  if (d.sheet){
    if (d.sheet === 'conclude'){ if (!trip) return; return openSheet({ type: 'conclude', live: true }); }
    if (d.sheet === 'newtrip') return openSheet({ type: 'newtrip', color: DEFAULT_COLOR });
    if (d.sheet === 'send') return openSend();
    if (d.sheet === 'receive') return openSheet({ type: 'import', purpose: 'sync', phase: 'pick' });
    if (d.sheet === 'trip' && !trip) return;
    return openSheet({ type: d.sheet, phase: 'pick' });
  }
  if (d.closeSheet != null) return closeSheet();
  if (d.planDay != null){ ui.day = +d.planDay; return goTab('plan'); }
  if (d.todoToggle){ const x = trip.todos.find(y => y.id === d.todoToggle); ui.justTick = x && !x.done ? x.id : null; if (x && mutate(() => { x.done = !x.done; }, x.done ? 'unticking a to-do' : 'ticking a to-do')) toast(x.done ? `Ticked off “${x.text}”` : `“${x.text}” is open again`, true); return; }
  if (d.todoDel){ const x = trip.todos.find(y => y.id === d.todoDel); if (x && mutate(() => { trip.todos = trip.todos.filter(y => y !== x); }, 'deleting a to-do')) toast(`Deleted “${x.text}”`, true); return; }
  if (d.todoAdd != null) return addTodo();
  if (d.qaAdd != null) return quickAdd();
  if (d.jlog != null) return journalLog();
  if (d.day != null && t.closest('#s-plan')){
    if (d.day === 'pool'){ scrollPlanTo($('#pool'), true); return; }
    ui.day = +d.day; renderAll({ transition: 'fade' }); $('#s-plan').scrollTop = 0; return;
  }
  if (d.toDay){ const p = getItem(d.toDay); if (p && placeCard(p.id, ui.day)) toast(`Added ${p.name} to ${fmtDay(ui.day)}`, true); return; }
  if (d.jmore){ const row = t.closest('.jrow'); if (swipe.open === row){ setRow(row, 0); swipe.open = null; } else openRow(row); return; }
  if (d.jact){
    const row = t.closest('.jrow'), id = d.id;
    if (d.jact === 'unstamp'){ setRow(row, 0); swipe.open = null; return toggleStamp(id); }
    swipe.open = null;
    return collapseOut(row, -1, () => d.jact === 'pool' ? toPool(id) : removeItem(id));
  }
  // booklet viewer
  if (d.bookClose != null) return closeBooklet();
  if (d.bookNext != null) return showPage(ui.booklet.page + 1, 1);
  if (d.bookPrev != null) return showPage(ui.booklet.page - 1, -1);
  if (d.bookOther) return otherBooklet(+d.bookOther);
  if (d.bookMenu != null){ const m = $('#bookMenu'); m.hidden = !m.hidden; t.setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) m.querySelector('button').focus(); return; }
  if (d.bookEdit != null){ $('#bookMenu').hidden = true; return openSheet({ type: 'editbook', id: ui.booklet.id, live: true }); }
  if (d.bookDecorate != null){
    const id = d.id || (ui.booklet && ui.booklet.id);
    if (s) { ui.sheet = null; finishSheetEdits(s); sheetLayer.close(); }
    if (!ui.booklet || ui.booklet.id !== id) openBooklet(id);
    $('#bookMenu').hidden = true; ui.booklet.edit = true; ui.booklet.sel = null; showPage(0, 0); renderBookChrome(); return;
  }
  if (d.bookReopen != null){ const id = ui.booklet.id, tt = getTrip(id); return askConfirm({ title: `Reopen ${tt.title}?`, body: 'It moves back to your trips so you can keep planning and stamping. The booklet comes back when you conclude it again.', confirmLabel: 'Reopen trip', onConfirm: () => reopenTrip(id) }); }
  if (d.bookDelete != null){ const id = ui.booklet.id, tt = getTrip(id); $('#bookMenu').hidden = true; return askConfirm({ title: `Delete the ${tt.title} booklet?`, body: `The booklet and everything in it are removed.${partner() ? ` It's also removed for ${partnerName() || 'the other person'} when they get your changes.` : ''} You can undo it straight after.`, confirmLabel: 'Delete booklet', danger: true, onConfirm: () => deleteTrip(id) }); }
  if (d.stk) return stickerAction(d.stk);
  // settings
  if (d.export != null) return exportData(t);
  if (d.motion){ prefs.motion = d.motion; savePrefs(); applyMotionPref(); renderSheet(false); return; }
  if (d.wipe != null) return askConfirm({ title: 'Delete all data?', body: `All ${plural(state.trips.length, 'trip')} and booklets on this device are removed. Export first if you want a copy.`, confirmLabel: 'Delete everything', danger: true, onConfirm: () => { if (mutateLocal(() => { state.trips = []; ui.view = 'home'; if (sync.meta) sync.meta.stamps = {}; }, 'deleting all data', { transition: 'back' })) toast('All data deleted', true); } });
  if (!s) return;
  if (s.type === 'confirm'){
    if (d.confirmYes != null){ const fn = s.onConfirm; ui.sheet = null; sheetLayer.close(); if (fn) fn(); return; }
    if (d.confirmNo != null) return closeSheet();
  }
  if (s.type === 'item'){
    const p = getItem(s.id); if (!p) return;
    if (d.setDay != null) return void placeCard(p.id, d.setDay === 'pool' ? null : +d.setDay);
    if (d.setSlot != null) return void mutate(() => { p.slot = SLOT[d.setSlot] ? d.setSlot : ''; }, 'changing the time of day');
    if (d.setKind) return void mutate(() => { p.kind = KIND[d.setKind] ? d.setKind : 'other'; }, 'changing the type');
    if (d.feel){ if (p.visited) mutate(() => { p.visited.feel = p.visited.feel === d.feel ? '' : d.feel; }, 'the rating'); return; }
    if (d.itemPool != null){ s.back = null; closeSheet(); return toPool(p.id); }
    if (d.remove){ s.back = null; return removeItem(d.remove); }
  }
  if (s.type === 'trip' || s.type === 'newtrip'){
    if (d.swatch){ keepTripForm(); s.previewColor = d.swatch; if (s.type === 'newtrip') s.color = d.swatch; else applyTheme(d.swatch); renderSheet(false); return; }
    if (d.tripCreate != null){ const f = readTripForm(); if (!f) return; ui.sheet = null; sheetLayer.close(); return createTrip(f); }
    if (d.tripSave != null) return saveTripSettings();
    if (d.tripDelete != null){ const id = trip.id, tt = trip.title; return askConfirm({ title: `Delete ${tt}?`, body: `The trip, its plan, stamps and to-dos are removed.${partner() ? ` It's also removed for ${partnerName() || 'the other person'} when they get your changes.` : ''} You can undo it straight after.`, confirmLabel: 'Delete trip', danger: true, onConfirm: () => deleteTrip(id) }); }
  }
  if (s.type === 'conclude' || s.type === 'editbook'){
    const tt = summaryTarget(); if (!tt) return;
    if (d.pick){ tt.summary[d.pick] = tt.summary[d.pick] === d.val ? '' : d.val; saveSummarySoon(); renderSheet(false); return; }
    if (d.again){ tt.summary.again = tt.summary.again === d.again ? '' : d.again; saveSummarySoon(); renderSheet(false); return; }
    if (d.rate){ tt.summary.rating = tt.summary.rating === +d.rate ? 0 : +d.rate; saveSummarySoon(); renderSheet(false); return; }
    if (d.conclude != null){ s.confirming = true; renderSheet(false); const y = $('[data-conclude-yes]'); if (y) y.focus(); return; }
    if (d.concludeCancel != null){ s.confirming = false; renderSheet(false); return; }
    if (d.concludeYes != null){ clearTimeout(summaryTimer); finishSheetEdits(s); ui.sheet = null; sheetLayer.close(); return concludeTrip(tt); }
  }
  if (s.type === 'send'){
    if (d.syncShare != null) return shareSync(s);
    if (d.syncSave != null) return saveSync(s);
  }
  if (s.type === 'import' && s.purpose === 'sync'){
    if (d.syncOk != null) return closeSheet();
    if (d.syncBack != null){ ui.sheet = null; return openSend(); }
  }
  if (s.type === 'import'){
    if (d.imode){ s.mode = d.imode; s.confirming = false; renderSheet(false); return; }
    if (d.importGo != null) return applyImport();
    if (d.importCancel != null){ s.confirming = false; renderSheet(false); return; }
  }
  if (s.type === 'tutorial'){
    if (d.tourStep != null){ s.step = clamp(+d.tourStep, 0, TOUR.length - 1); renderSheet(false); if (motionOK()) $('.tour').animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' }); return; }
    if (d.tourDone != null){ prefs.tourSeen = true; savePrefs(); closeSheet(); renderAll({ transition: 'none' }); return; }
  }
  if (s.type === 'stamps'){
    if (d.sfilter){ s.filter = d.sfilter; renderSheet(false); return; }
    if (d.ssort){ s.sort = d.ssort; renderSheet(false); return; }
  }
});
$('#barUndo').addEventListener('click', () => undo());
$('#barSettings').addEventListener('click', () => { if (currentSection() === 'home') openSheet({ type: 'settings' }); else if (trip) openSheet({ type: 'trip' }); });
/* tutorial: swipe between steps */
const tourSwipe = { s: null };
sheetLayer.addEventListener('pointerdown', e => { if (ui.sheet && ui.sheet.type === 'tutorial' && e.target.closest('[data-tour-swipe]')) tourSwipe.s = { x: e.clientX, y: e.clientY, pid: e.pointerId }; });
window.addEventListener('pointerup', e => {
  const s = tourSwipe.s; if (!s || e.pointerId !== s.pid) return; tourSwipe.s = null;
  const dx = e.clientX - s.x; if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.2 || !ui.sheet || ui.sheet.type !== 'tutorial') return;
  const step = clamp((ui.sheet.step || 0) + (dx < 0 ? 1 : -1), 0, TOUR.length - 1);
  if (step !== ui.sheet.step){ ui.sheet.step = step; renderSheet(false); if (motionOK()) $('.tour').animate([{ opacity: 0, transform: `translateX(${dx < 0 ? 18 : -18}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' }); }
});

/* ---------- keys ---------- */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing){
    const id = e.target && e.target.id;
    if (id === 'qaInput'){ e.preventDefault(); quickAdd(); }
    else if (id === 'todoInput'){ e.preventDefault(); addTodo(); }
    else if (id === 'jlogInput'){ e.preventDefault(); journalLog(); }
    else if ((id === 'fTitle' || id === 'fDays') && ui.sheet){ e.preventDefault(); const b = $(ui.sheet.type === 'trip' ? '[data-trip-save]' : '[data-trip-create]'); if (b) b.click(); }
    return;
  }
  if (e.key === 'Escape'){
    if (dnd.active) dndEnd(false);
    else if (ui.booklet && !sheetLayer.open){ const m = $('#bookMenu'); if (m && !m.hidden){ m.hidden = true; return; } if (ui.booklet.edit){ stickerAction('done'); return; } closeBooklet(); }
    return;
  }
  if (ui.booklet && !sheetLayer.open && !ui.booklet.edit && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.altKey){ const d = e.key === 'ArrowRight' ? 1 : -1, n = ui.booklet.page + d; if (n < 0 || n >= ui.booklet.pages.length) otherBooklet(d); else showPage(n, d); return; }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target.closest && e.target.closest('input, textarea, select'))){ e.preventDefault(); undo(); }
});

/* ---------- sheet inputs ---------- */
sheetLayer.addEventListener('focusin', e => { const f = e.target.dataset && e.target.dataset.pf; if (['name', 'note', 'visited.note'].includes(f)){ editSnapState.snap = JSON.stringify(state); editSnapState.label = f === 'name' ? 'renaming' : 'editing notes'; } });
sheetLayer.addEventListener('focusout', e => { const f = e.target.dataset && e.target.dataset.pf; if (['name', 'note', 'visited.note'].includes(f)) commitEditSnap(); });
sheetLayer.addEventListener('input', e => {
  const t = e.target, s = ui.sheet; if (!s) return;
  if (t.id === 'syName' && s.type === 'send'){
    sync.meta.name = str(t.value, 30); clearTimeout(sendTimer);
    s.ready = false; updateSendButtons(s);
    sendTimer = setTimeout(() => { writeLocal(); prepareSend(s); }, 300);
    return;
  }
  if (t.id === 'fColor' && (s.type === 'trip' || s.type === 'newtrip')){
    keepTripForm(); s.previewColor = normHex(t.value); if (s.type === 'newtrip') s.color = s.previewColor; else applyTheme(s.previewColor);
    const pv = $('.preview', panel); if (pv) pv.setAttribute('style', themeStyle(s.previewColor));
    if (s.type === 'newtrip') panel.setAttribute('style', themeStyle(s.previewColor));
    const lab = t.closest('.swatch'); if (lab) lab.style.setProperty('--sw', s.previewColor);
    $$('[data-swatch]', panel).forEach(b => b.setAttribute('aria-pressed', 'false'));
    return;
  }
  if (t.id === 'fTitle' && (s.type === 'trip' || s.type === 'newtrip')){ s.title = t.value; const st = $('.preview .sign-title', panel); if (st) st.textContent = t.value || 'Your trip'; if (s.err && s.err.title && t.value.trim()){ s.err.title = null; t.removeAttribute('aria-invalid'); const er = t.parentElement.querySelector('.err'); if (er) er.remove(); } return; }
  if (t.dataset.sum && (s.type === 'conclude' || s.type === 'editbook')){ const tt = summaryTarget(); if (!tt) return; tt.summary[t.dataset.sum] = t.value.slice(0, t.maxLength > 0 ? t.maxLength : 600); saveSummarySoon(); return; }
  if (t.dataset.btitle != null && s.type === 'editbook'){ const tt = getTrip(s.id); if (tt){ tt.title = str(t.value, 40) || tt.title; saveSummarySoon(); } return; }
  if (s.type !== 'item') return;
  const fld = t.dataset.pf; if (!['name', 'note', 'visited.note'].includes(fld)) return;
  const p = getItem(s.id); if (!p) return;
  if (ui.readOnly){ toast(VIEW_ONLY); return; }
  if (fld === 'name') p.name = str(t.value, 120) || 'Untitled';
  else if (fld === 'note') p.note = t.value;
  else if (p.visited) p.visited.note = t.value;
  quietSave();
  if (fld === 'name') renderSection(currentSection());
});
sheetLayer.addEventListener('change', e => {
  const t = e.target, s = ui.sheet;
  if (t.id === 'importFile'){ const f = t.files && t.files[0]; t.value = ''; if (f) readImportFile(f); return; }
  if (!s || s.type !== 'item') return;
  const p = getItem(s.id); if (!p) return;
  if (t.dataset.pf === 'visited.at' && p.visited && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t.value)) mutate(() => { p.visited.at = t.value.slice(0, 16); }, 'changing the time');
});
$('#booklet').addEventListener('change', e => { if (e.target.id === 'stickerFile'){ const files = e.target.files; if (files && files.length) addStickers([...files]); e.target.value = ''; } });

/* ---------- on-screen keyboard: keep everything inside the visible viewport ----------
   Chrome on Android resizes the layout for the keyboard (interactive-widget=resizes-content).
   iOS only shrinks the visual viewport, so the app is sized and shifted to match it. */
const vp = { base: window.innerHeight };
function isTextField(el){ return !!el && el.matches && el.matches('input:not([type=file]):not([type=color]):not([type=checkbox]):not([type=radio]), textarea, select'); }
function updateViewport(){
  const vv = window.visualViewport, root = document.documentElement, st = root.style;
  const h = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
  st.setProperty('--vvh', Math.round(h) + 'px'); st.setProperty('--vvt', Math.round(top) + 'px');
  const focused = isTextField(document.activeElement);
  if (!focused) vp.base = Math.max(vp.base, window.innerHeight);
  const visualKb = Math.max(0, window.innerHeight - h), layoutKb = Math.max(0, vp.base - window.innerHeight);
  const open = focused && (visualKb > 120 || layoutKb > 120);
  root.classList.toggle('kb-open', open);
  if (open && visualKb > 120){ st.setProperty('--app-h', Math.round(h) + 'px'); document.body.style.transform = top ? `translateY(${Math.round(top)}px)` : ''; }
  else { st.removeProperty('--app-h'); document.body.style.transform = ''; }
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  $('#app').classList.toggle('typing', open && !sheetLayer.contains(document.activeElement));
  if (open) requestAnimationFrame(ensureFocusedVisible);
}
function ensureFocusedVisible(){
  const el = document.activeElement; if (!isTextField(el)) return;
  const box = el.closest('.sheet-body, .screen'); if (!box) return;
  const br = box.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 16;
  const bottomLimit = br.bottom - (box.classList.contains('screen') && !$('#app').classList.contains('typing') ? 100 : pad);
  if (r.bottom > bottomLimit) box.scrollTo({ top: box.scrollTop + r.bottom - bottomLimit, behavior: motionOK() ? 'smooth' : 'auto' });
  else if (r.top < br.top + pad) box.scrollTo({ top: box.scrollTop - (br.top + pad - r.top) });
}
if (window.visualViewport){ window.visualViewport.addEventListener('resize', updateViewport); window.visualViewport.addEventListener('scroll', updateViewport); }
window.addEventListener('resize', updateViewport);
window.addEventListener('orientationchange', () => { vp.base = 0; setTimeout(() => { vp.base = window.innerHeight; updateViewport(); }, 400); });
document.addEventListener('focusin', e => { if (isTextField(e.target)){ setTimeout(updateViewport, 60); setTimeout(updateViewport, 450); } });
document.addEventListener('focusout', () => setTimeout(updateViewport, 80));

/* ---------- installable app (only on the hosted PWA build) ---------- */
function registerServiceWorker(){
  if (!('serviceWorker' in navigator) || window.claude || !/^https?:$/.test(location.protocol)) return;
  if (!document.querySelector('link[rel="manifest"]')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version of the app is ready.', false, { label: 'Reload', fn: () => location.reload() }); });
      });
    }).catch(() => {});
  });
}

/* ---------- start ---------- */
updateViewport();
renderAll({ transition: 'none' });
initStore();
registerServiceWorker();
