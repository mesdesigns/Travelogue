/* ============================================================
   Travel Log — navigation, screens, booklet viewer
   ============================================================ */
const SECTIONS = ['home', 'today', 'plan', 'journal'];
const TRIP_SECTIONS = ['today', 'plan', 'journal'];
const TITLES = { home: 'Trips', today: 'Today', plan: 'Plan', journal: 'Journal' };
const currentSection = () => (ui.view === 'home' || !trip) ? 'home' : ui.tab;
function entryTrip(){ const t = getTrip(ui.activeId); return t && !t.concluded ? t : activeTrips()[0] || null; }
function neighborOf(sec, dir){
  const n = SECTIONS[SECTIONS.indexOf(sec) + dir];
  if (!n) return null;
  if (n !== 'home' && sec === 'home' && !entryTrip()) return null;
  return n;
}
/* render a section with temporary view state (used to show the next screen while swiping) */
function withSection(sec, fn){
  const keep = { view: ui.view, tab: ui.tab, activeId: ui.activeId, trip };
  if (sec === 'home') ui.view = 'home';
  else { ui.view = 'trip'; ui.tab = sec; if (!trip){ const t = entryTrip(); ui.activeId = t && t.id; trip = t; } }
  try { fn(); } finally { ui.view = keep.view; ui.tab = keep.tab; ui.activeId = keep.activeId; trip = keep.trip; }
}
/* ---------- postmarks: date text must stay inside the inner ring in every language ---------- */
const postmarkMonth = d => monFmt.format(d).replace(/\.$/, '').toUpperCase();   // "Sept." → "SEPT"
function fitPostmarks(root = document){
  $$('.postmark', root).forEach(pm => {
    const W = pm.offsetWidth; if (!W) return;                // not laid out yet (hidden screen); fitted when shown
    const R = W / 2 - 6.5 - 2.5, c = pm.offsetHeight / 2;    // inner ring radius, minus a little breathing room
    pm.querySelectorAll('b, i').forEach(t => t.style.fontSize = '');
    // shrink each line only as much as it needs; repeat because a smaller line moves the other one
    for (let pass = 0; pass < 4; pass++){
      let changed = false;
      pm.querySelectorAll('b, i').forEach(t => {
        const dy = Math.max(Math.abs(t.offsetTop - c), Math.abs(t.offsetTop + t.offsetHeight - c));
        const k = 2 * Math.sqrt(Math.max(0, R * R - dy * dy)) / Math.max(t.offsetWidth, 1);
        if (k < .995){ t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * Math.max(k, .7)) + 'px'; changed = true; }
      });
      if (!changed) break;
    }
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPostmarks());
function renderSection(sec){
  const el = $('#s-' + sec);
  el.setAttribute('style', themeStyle(sec === 'home' || !trip ? DEFAULT_COLOR : trip.color));
  if (sec === 'home') renderHome(); else if (sec === 'today') renderToday(); else if (sec === 'plan') renderPlan(); else renderJournal();
  hydrateImages(el);
  if (sec === 'journal') fitPostmarks(el);
}
function openTrip(id){ const t = getTrip(id); if (!t || t.concluded) return; ui.activeId = id; rememberActive(); ui.view = 'trip'; ui.tab = 'today'; ui.day = Math.max(0, todayIndex(t)); renderAll({ transition: 'forward' }); }
function openHome(){ ui.view = 'home'; renderAll({ transition: 'back' }); }
function goTab(tab){
  if (ui.view === 'trip' && ui.tab === tab) return;
  ui.tab = tab; ui.view = 'trip';
  const scr = $('#s-' + tab); if (scr) scr.scrollTop = 0;
  renderAll({ transition: 'auto' });
}

/* ---------- animation helpers ---------- */
let lastScope = null, lastSec = null;
function captureRects(root){ const m = new Map(); $$('[data-flip]', root).forEach(el => m.set(el.dataset.flip, el.getBoundingClientRect())); return m; }
function playFlip(before, root){
  if (!motionOK() || !before) return;
  $$('[data-flip]', root).forEach(el => {
    const key = el.dataset.flip; if (ui.skipFlip && key.endsWith(ui.skipFlip)) return;
    const a = before.get(key), b = el.getBoundingClientRect();
    if (!a){ el.animate([{ opacity: 0, transform: 'translateY(6px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }); return; }
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
  });
}
function animateIn(el, kind){
  if (!motionOK() || !el) return;
  el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
}
function slideScreens(from, to, hint){
  const a = $('#s-' + from), b = $('#s-' + to);
  if (!a || !b || from === to) return;
  if (!motionOK()){ a.hidden = true; return; }
  const dir = hint === 'forward' ? 1 : hint === 'back' ? -1 : Math.sign(SECTIONS.indexOf(to) - SECTIONS.indexOf(from)) || 1;
  a.hidden = false; a.classList.add('is-moving'); b.classList.add('is-moving');
  const o = { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' };
  const out = a.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-dir * 100}%,0,0)` }], { ...o, fill: 'forwards' });
  b.animate([{ transform: `translate3d(${dir * 100}%,0,0)` }, { transform: 'none' }], o);
  out.onfinish = () => { out.cancel(); a.classList.remove('is-moving'); b.classList.remove('is-moving'); if (currentSection() !== from) a.hidden = true; };
}
function collapseOut(el, dir, done){
  if (!motionOK() || !el){ done(); return; }
  const h = el.getBoundingClientRect().height;
  el.style.overflow = 'hidden';
  el.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${dir * 105}%)`, opacity: .6 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
    el.animate([{ height: h + 'px', marginBottom: '0px' }, { height: '0px', marginBottom: '-8px' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = done;
  };
}

/* ---------- header and tab bar ---------- */
$('#tabbar').addEventListener('keydown', e => {
  const keys = { ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last' };
  if (!(e.key in keys) || e.altKey || e.ctrlKey || e.metaKey || ui.view !== 'trip') return;
  const i = TRIP_SECTIONS.indexOf(ui.tab), k = keys[e.key];
  const n = k === 'first' ? 0 : k === 'last' ? TRIP_SECTIONS.length - 1 : clamp(i + k, 0, TRIP_SECTIONS.length - 1);
  e.preventDefault();
  if (n !== i) goTab(TRIP_SECTIONS[n]);
  const b = $(`#tabbar [data-tab="${TRIP_SECTIONS[n]}"]`); if (b) b.focus();
});
function renderHeader(sec){
  const home = sec === 'home';
  $('#barTrips').hidden = home;
  $('.appbar').classList.toggle('in-trip', !home);
  const eyebrow = home ? 'Travel log' : trip.title, title = TITLES[sec];
  const tEl = $('#title'), eEl = $('#eyebrow');
  if (tEl.textContent !== title || eEl.textContent !== eyebrow){
    tEl.textContent = title; eEl.textContent = eyebrow;
    if (motionOK() && ui.loaded) $('.appbar-titles').animate([{ opacity: .2, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  $('#barSettings').setAttribute('aria-label', home ? 'App settings' : `Trip settings for ${trip.title}`);
  renderUndoButton();
}
function renderUndoButton(){
  const b = $('#barUndo'), last = history[history.length - 1];
  b.hidden = !ui.loaded || ui.readOnly || !last;
  if (last){ b.setAttribute('aria-label', `Undo ${last.label}`); b.title = `Undo ${last.label}`; }
}
function renderTabbar(sec){
  const home = sec === 'home';
  $('#app').classList.toggle('home', home);
  $('#tabbar').classList.toggle('away', home); $('#tabbar').inert = home;
  $$('#tabbar [data-tab]').forEach(b => { const on = !home && b.dataset.tab === sec; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const ind = $('#tabInd'); ind.classList.remove('dragging');
  ind.style.transform = `translateX(${Math.max(0, TRIP_SECTIONS.indexOf(sec)) * 100}%)`;
}
function renderAll(opts = {}){
  syncActive();
  const sec = currentSection();
  const scope = sec === 'home' ? 'home' : `${trip.id}:${sec}:${sec === 'plan' ? ui.day : ''}`;
  const el = $('#s-' + sec);
  const before = scope === lastScope && !opts.noFlip ? captureRects(el) : null;
  renderHeader(sec);
  SECTIONS.forEach(s => { const x = $('#s-' + s); if (s !== sec && !x.classList.contains('is-moving')) x.hidden = true; });
  el.hidden = false;
  if (!ui.loaded){ el.innerHTML = '<p class="loading" role="status">Loading your trips…</p>'; return; }
  if (swipe.open && !swipe.open.isConnected) swipe.open = null;
  renderSection(sec);
  if (before) playFlip(before, el);
  else if (lastSec && lastSec !== sec && opts.transition && opts.transition !== 'none') slideScreens(lastSec, sec, opts.transition);
  else if (lastScope && lastScope !== scope && lastSec === sec && opts.transition !== 'none') animateIn(el);
  if (lastSec && lastSec !== sec && (!opts.transition || opts.transition === 'none')) $('#s-' + lastSec).hidden = true;
  lastScope = scope; lastSec = sec;
  renderTabbar(sec);
  if (ui.sheet && sheetLayer.open) renderSheet(false);
  if (ui.booklet) refreshBooklet();
}

/* ---------- swipe between sections (touch): Trips ↔ Today ↔ Plan ↔ Journal ---------- */
const pager = { p: null, active: false, raf: 0 };
const pagerBlocked = () => !ui.loaded || dnd.active || swipe.active || sheetLayer.open || !!ui.booklet || document.body.classList.contains('dragging');
$('#stage').addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || pagerBlocked()) return;
  const t = e.target, edge = e.clientX < 28 || e.clientX > window.innerWidth - 28;
  if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (!edge && t.closest('.hscroll, .shelf, .jrow')) return;   // these scroll or swipe sideways themselves
  pager.p = { x: e.clientX, y: e.clientY, pid: e.pointerId, lx: e.clientX, lt: performance.now(), vx: 0, dx: 0 };
}, { passive: true });
function pagerSetTarget(s, dir){
  if (s.to){ const old = $('#s-' + s.to); old.classList.remove('is-moving'); old.style.transform = ''; if (s.to !== currentSection()) old.hidden = true; }
  s.dir = dir; s.to = neighborOf(s.from, dir);
  if (s.to){
    withSection(s.to, () => renderSection(s.to));
    const b = $('#s-' + s.to); b.scrollTop = 0; b.hidden = false; b.classList.add('is-moving');
    if (s.to === 'journal') fitPostmarks(b);
  }
}
function pagerPose(){
  const s = pager.p; if (!s || !pager.active) return;
  const x = s.to ? s.dx : s.dx / 3;
  s.a.style.transform = `translate3d(${x}px,0,0)`;
  if (s.to) $('#s-' + s.to).style.transform = `translate3d(${x + s.dir * s.w}px,0,0)`;
  if (TRIP_SECTIONS.includes(s.from) && TRIP_SECTIONS.includes(s.to || '')){
    const ind = $('#tabInd'); ind.classList.add('dragging');
    ind.style.transform = `translateX(${(TRIP_SECTIONS.indexOf(s.from) - x / s.w) * 100}%)`;
  }
}
window.addEventListener('pointermove', e => {
  const s = pager.p; if (!s || e.pointerId !== s.pid) return;
  if (dnd.active || swipe.active){ pager.p = null; return; }
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!pager.active){
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)){ pager.p = null; return; }
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    dndCancelPending(); swipe.pending = null;
    pager.active = true;
    s.from = currentSection(); s.a = $('#s-' + s.from); s.a.classList.add('is-moving');
    s.w = $('#stage').getBoundingClientRect().width || 360;
    pagerSetTarget(s, dx < 0 ? 1 : -1);
  }
  const now = performance.now(); s.vx = (e.clientX - s.lx) / Math.max(now - s.lt, 1); s.lx = e.clientX; s.lt = now;
  const dir = dx < 0 ? 1 : -1; if (dir !== s.dir && Math.abs(dx) > 4) pagerSetTarget(s, dir);
  s.dx = dx;
  if (!pager.raf) pager.raf = requestAnimationFrame(() => { pager.raf = 0; pagerPose(); });
});
function endPager(e, cancel){
  const s = pager.p; if (!s || e.pointerId !== s.pid) return;
  pager.p = null;
  if (!pager.active) return;
  pager.active = false;
  if (pager.raf){ cancelAnimationFrame(pager.raf); pager.raf = 0; }
  pagerPose();
  suppressNextClick();
  const fling = Math.abs(s.vx) > .45 && Math.sign(s.vx) === Math.sign(s.dx);
  const commit = !cancel && s.to && (Math.abs(s.dx) > s.w * .28 || fling);
  const b = s.to ? $('#s-' + s.to) : null;
  const x0 = s.to ? s.dx : s.dx / 3;
  const finish = () => {
    s.a.classList.remove('is-moving'); s.a.style.transform = '';
    if (b){ b.classList.remove('is-moving'); b.style.transform = ''; }
    if (commit){
      if (s.to === 'home') ui.view = 'home';
      else { if (s.from === 'home'){ const t = entryTrip(); ui.activeId = t.id; rememberActive(); ui.day = Math.max(0, todayIndex(t)); } ui.view = 'trip'; ui.tab = s.to; }
      lastSec = s.to;   // the screen is already in place; don't slide it again
      renderAll({ transition: 'none', noFlip: true });
      s.a.hidden = true;
    } else { if (b) b.hidden = true; renderTabbar(s.from); }
  };
  if (!motionOK()){ finish(); return; }
  const remaining = commit ? s.w - Math.abs(x0) : Math.abs(x0);
  const d = clamp(remaining / s.w * 420, 160, 340);
  const o = { duration: d, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' };
  const endX = commit ? -s.dir * s.w : 0;
  const anims = [s.a.animate([{ transform: `translate3d(${x0}px,0,0)` }, { transform: `translate3d(${endX}px,0,0)` }], o)];
  if (b) anims.push(b.animate([{ transform: `translate3d(${x0 + s.dir * s.w}px,0,0)` }, { transform: `translate3d(${endX + s.dir * s.w}px,0,0)` }], o));
  if (TRIP_SECTIONS.includes(s.from) && TRIP_SECTIONS.includes(s.to || '')){
    const ind = $('#tabInd'), target = commit ? TRIP_SECTIONS.indexOf(s.to) : TRIP_SECTIONS.indexOf(s.from);
    ind.classList.remove('dragging'); ind.style.transform = `translateX(${target * 100}%)`;
  }
  anims[0].onfinish = () => { anims.forEach(a => a.cancel()); finish(); };
}
window.addEventListener('pointerup', e => endPager(e, false));
window.addEventListener('pointercancel', e => endPager(e, true));
/* keyboard: Alt+Left / Alt+Right switches sections on desktop */
document.addEventListener('keydown', e => {
  if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || pagerBlocked()) return;
  const to = neighborOf(currentSection(), e.key === 'ArrowRight' ? 1 : -1); if (!to) return;
  e.preventDefault();
  if (to === 'home') openHome(); else if (currentSection() === 'home') { const t = entryTrip(); if (t) openTrip(t.id); } else goTab(to);
});
let clickBlockUntil = 0;
function suppressNextClick(ms = 350){ clickBlockUntil = performance.now() + ms; }

/* ---------- cards ---------- */
const cardMeta = (p, withSlot) => `<i class="kdot" style="--kc:${KIND_COLOR[p.kind]}" aria-hidden="true"></i>${esc(KIND[p.kind] + (withSlot && p.slot ? ', ' + SLOT[p.slot].toLowerCase() : ''))}`;
function dayCardHTML(p, n, opts = {}){
  return `<li class="card${p.visited ? ' done' : ''}"${opts.static ? '' : ` data-card="${p.id}"`} data-flip="c-${p.id}">
    <button type="button" class="card-open" data-open="${p.id}" aria-label="${esc(p.name)}, ${p.visited ? 'stamped' : 'not stamped yet'}. Open details"><span class="num" aria-hidden="true">${n}</span><span class="card-text"><span class="name">${esc(p.name)}</span><span class="meta">${cardMeta(p, opts.withSlot)}</span></span></button>
    ${p.visited ? `<span class="stamp-mini" title="Stamped" aria-hidden="true">${ICON.stamp}</span>` : ''}
  </li>`;
}
function poolCardHTML(p, day){
  return `<li class="pcard" data-card="${p.id}" data-flip="c-${p.id}">
    <button type="button" class="card-open" data-open="${p.id}" aria-label="${esc(p.name)}. Open details"><span class="name">${esc(p.name)}</span><span class="meta">${cardMeta(p)}</span></button>
    <button type="button" class="pcard-add" data-to-day="${p.id}" aria-label="Add ${esc(p.name)} to ${esc(fmtDay(day))}">${ICON.plus}</button>
  </li>`;
}
function stickerHTML(s){
  const src = images.cache.get(s.img);
  return `<span class="sticker ${s.shape}" data-sticker="${s.id}" style="left:${(s.x * 100).toFixed(2)}%;top:${(s.y * 100).toFixed(2)}%;width:${(s.s * 100).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${s.r.toFixed(1)}deg)"><img data-img="${s.img}" alt=""${src ? ` src="${src}"` : ''} draggable="false"></span>`;
}
function coverHTML(t, tag = 'div', attrs = '', cls = ''){
  return `<${tag} class="cover ${cls}" style="${cardStyle(t.color)}" ${attrs}>
    <span class="cover-text"><span class="bc-kicker">Travel booklet</span><span class="bc-title">${esc(t.title)}</span></span>
    <span class="stickers" aria-hidden="true">${t.stickers.map(stickerHTML).join('')}</span>
    <span class="bc-sub">${esc(signSub(t))}, ${dayDate(0, t).getFullYear()}</span>
  </${tag}>`;
}

/* ---------- home ---------- */
function tripStats(t){
  const planned = t.places.filter(p => p.day != null).length, stamped = t.places.filter(p => p.visited).length, pool = t.places.length - planned;
  if (!t.places.length) return 'Nothing planned yet';
  return `${planned} planned, ${pool} in the pool${stamped ? `, ${stamped} stamped` : ''}`;
}
/* a gentle reminder on the trips screen once two phones are sharing, so changes don't sit unsent */
function syncNudge(){
  if (!syncOn() || !partner() || ui.readOnly) return '';
  const n = unsentCount(); if (!n) return '';
  const who = partnerName();
  return `<div class="tour-card sync-card" role="note"><p>${n === 1 ? 'One change' : n + ' changes'} not sent${who ? ' to ' + esc(who) : ''} yet<small>Send ${n === 1 ? 'it' : 'them'} so ${who ? esc(who) + ' sees' : 'they see'} what you've changed.</small></p><button type="button" class="btn small primary" data-sheet="send">${ICON.share}Send</button></div>`;
}
function renderHome(){
  const el = $('#s-home'), act = activeTrips(), books = booklets();
  let html = '';
  if (!prefs.tourSeen && !prefs.tourDismissed) html += `<div class="tour-card" role="note"><p>New here?<small>A 30-second tour of how trips, the pool, stamps and booklets work.</small></p><button type="button" class="btn small primary" data-tour>Show me</button><button type="button" class="iconbtn" data-tour-dismiss aria-label="Hide the tour suggestion">${ICON.x}</button></div>`;
  html += syncNudge();
  if (!state.trips.length){
    html += `<section class="section"><div class="empty"><h3>Where are you off to?</h3><p>Make a trip for each place you're going. Plan what to do, stamp it once you've done it, then keep the whole trip as a booklet.</p><button type="button" class="btn primary" data-sheet="newtrip">${ICON.plus}Plan a trip</button></div></section>`;
  } else {
    html += `<section class="section"><div class="section-head"><h2 class="section-title">Your trips</h2>${act.length ? `<span class="muted">${act.length}</span>` : ''}</div>
      ${act.length ? `<div class="tripcards">${act.map(t => `
        <button type="button" class="tripcard" data-open-trip="${t.id}" data-flip="h-${t.id}" style="${cardStyle(t.color)}" aria-label="${esc(t.title)}, ${esc(countdown(t))}. Open trip">
          ${signHTML(t)}
          <span class="tripcard-text"><b>${esc(countdown(t))}</b><small>${esc(tripRange(t))}</small><small>${esc(tripStats(t))}</small></span>${ICON.chev}
        </button>`).join('')}</div>` : '<p class="muted" style="margin:0">No trips in progress. Start a new one below.</p>'}
      <div style="margin-top:12px"><button type="button" class="newtrip" data-sheet="newtrip">${ICON.plus}<span>New trip</span></button></div>
    </section>`;
    if (books.length) html += `<section class="section"><div class="section-head"><h2 class="section-title">Booklets</h2><span class="muted">${books.length}</span></div>
      <div class="shelf">${books.map(t => coverHTML(t, 'button', `type="button" data-open-book="${t.id}" data-flip="b-${t.id}" aria-label="Open the ${esc(t.title)} booklet"`, 'bookcover' + (ui.newBook === t.id ? ' new' : ''))).join('')}</div>
      ${books.length > 2 ? '<p class="shelf-hint">Swipe the shelf to see them all.</p>' : ''}</section>`;
  }
  el.innerHTML = html;
  ui.newBook = null;
}

/* ---------- today ---------- */
function renderToday(){
  const el = $('#s-today');
  const until = daysUntilStart(), ti = todayIndex(), over = tripOver();
  const sub = ti >= 0 ? dLong.format(dayDate(ti)) : tripRange(trip);
  const n = trip.places.length;
  const parts = [`<button type="button" class="hero" data-sheet="trip" aria-label="${esc(trip.title)}: ${esc(countdown(trip))}. Open trip settings">
    ${signHTML(trip)}
    <span class="hero-text"><span class="count">${esc(countdown(trip))}</span><span class="hero-sub">${esc(sub)}</span>${n ? `<span class="hero-stats">${esc(tripStats(trip))}</span>` : ''}</span>
  </button>`];
  if (over) parts.push(`<section class="conclude-card"><p><b>Welcome back!</b>Keep this trip as a booklet with your favourites.</p><button type="button" class="btn primary small" data-sheet="conclude">${ICON.flag}Conclude</button></section>`);
  if (!n){
    parts.push(`<section class="section"><div class="empty compact"><p><b style="color:var(--ink)">Your plan is empty.</b> Add things you'd like to do to the pool, then drag them onto days.</p><div class="row-actions" style="margin-top:14px"><button type="button" class="btn soft small" data-go="plan">Open the plan</button></div></div></section>`);
  } else if (!over){
    const d = ti >= 0 ? ti : 0, list = dayOrder(d);
    parts.push(`<section class="section">
      <div class="section-head"><h2 class="section-title">${ti >= 0 ? 'Today' : 'Your first day'}</h2><button type="button" class="linkbtn" data-plan-day="${d}">Open plan${ICON.chev}</button></div>
      ${list.length ? `<ol class="cards static">${list.map((p, i) => dayCardHTML(p, i + 1, { static: true, withSlot: true })).join('')}</ol>`
        : `<div class="empty compact"><p>Nothing planned for ${esc(fmtDay(d))} yet.</p></div>`}
    </section>`);
  }
  const todos = trip.todos, left = todos.filter(t => !t.done).length;
  parts.push(`<section class="section">
    <div class="section-head"><h2 class="section-title">To-do</h2>${todos.length ? `<span class="muted">${left ? `${left} left` : 'All done'}</span>` : ''}</div>
    ${todos.length ? `<ul class="todos">${todos.map(t => `<li class="todo${t.done ? ' done' : ''}" data-flip="t-${t.id}">
      <button type="button" class="tcheck${ui.justTick === t.id ? ' just' : ''}" data-todo-toggle="${t.id}" aria-pressed="${t.done}" aria-label="${esc(t.text)}"><span class="box">${ICON.check}</span></button>
      <span class="ttext">${esc(t.text)}</span>
      <button type="button" class="tdel" data-todo-del="${t.id}" aria-label="Delete ${esc(t.text)}">${ICON.x}</button>
    </li>`).join('')}</ul>` : '<p class="hint" style="margin:0 0 6px">Things to sort out before you go, like tickets or a passport check.</p>'}
    <div class="inline-add"><label for="todoInput" class="sr-only">New to-do</label><input id="todoInput" type="text" maxlength="140" placeholder="Add a to-do" autocomplete="off" enterkeyhint="done"><button class="round primary" type="button" data-todo-add aria-label="Add to-do">${ICON.plus}</button></div>
  </section>`);
  el.innerHTML = parts.join('');
  ui.justTick = null;
}

/* ---------- plan ---------- */
function scrollPlanTo(el, smooth){
  const sc = $('#s-plan'); if (!el || !sc) return;
  const strip = $('#daystrip'), off = strip ? strip.getBoundingClientRect().height + 16 : 16;
  sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - off, behavior: smooth && motionOK() ? 'smooth' : 'auto' });
}
function stripHTML(sel){
  const ti = todayIndex();
  const chip = d => {
    const list = placesIn(d);
    if (d === 'pool') return `<button type="button" class="daychip pooltk" data-day="pool" aria-label="Activity pool, ${plural(list.length, 'thing')}. Jump to the pool"><span class="dw">Pool</span><span class="dn">${list.length}</span><span class="dots"></span></button>`;
    const dt = dayDate(d), dots = list.slice(0, 5).map(p => `<i${p.visited ? ' class="v"' : ''}></i>`).join('');
    return `<button type="button" class="daychip${ti === d ? ' today' : ''}" data-day="${d}" aria-pressed="${sel === d}" aria-label="${esc(dLong.format(dt))}${ti === d ? ', today' : ''}, ${plural(list.length, 'thing')}"><span class="dw">${ti === d ? 'Today' : esc(wdFmt.format(dt))}</span><span class="dn">${dt.getDate()}</span><span class="dots">${dots}</span></button>`;
  };
  return `<div class="strip"><div class="hscroll" id="daystrip" role="toolbar" aria-label="Days">${chip('pool')}${Array.from({ length: trip.days }, (_, i) => chip(i)).join('')}</div></div>`;
}
function renderPlan(){
  const el = $('#s-plan');
  if (dnd.active){ dnd.dirty = true; return; }
  const d = ui.day, list = dayOrder(d), pool = placesIn('pool'), done = list.filter(p => p.visited).length;
  const keepScroll = $('#daystrip', el) ? $('#daystrip', el).scrollLeft : null;
  const refocus = document.activeElement && document.activeElement.id === 'qaInput';
  let n = 0;
  const slots = SLOTS.map(([k, label]) => {
    const items = list.filter(p => (p.slot || '') === k);
    return `<div class="slot${items.length ? '' : ' is-empty'}" data-drop-day="${d}" data-drop-slot="${k}" role="group" aria-label="${label}">
      <div class="slot-label">${label}${items.length ? ` <span>${items.length}</span>` : ''}</div>
      ${items.length ? `<ol class="cards">${items.map(p => dayCardHTML(p, ++n)).join('')}</ol>` : '<div class="slot-empty">Drop here</div>'}
    </div>`;
  }).join('');
  const hint = list.length ? '' : `<p class="day-hint">${pool.length ? 'Press and hold a card in the pool, then drag it into a time of day. Or tap its + button.' : 'Add things to the pool below, then drag them onto this day.'}</p>`;
  el.innerHTML = stripHTML(d) + `
    <section class="dayview">
      <div class="dayhead"><h2>${esc(dLong.format(dayDate(d)))}</h2><p>Day ${d + 1} of ${trip.days}${list.length ? `, ${plural(list.length, 'thing')}${done ? `, ${done} stamped` : ''}` : ''}</p></div>
      ${hint}
      <div class="slots">${slots}</div>
    </section>
    <section class="pool" id="pool" aria-label="Activity pool">
      <div class="pool-head"><h2 class="section-title">Activity pool</h2><span class="badge">${pool.length}</span>${pool.length ? '<small>Hold and drag to plan</small>' : ''}</div>
      <div class="quickadd"><label for="qaInput" class="sr-only">Add something to do</label><input id="qaInput" type="text" maxlength="120" autocomplete="off" enterkeyhint="done" placeholder="Add something to do…"><button class="round primary" type="button" data-qa-add aria-label="Add to the pool">${ICON.plus}</button></div>
      ${pool.length ? `<ul class="pool-cards">${pool.map(p => poolCardHTML(p, d)).join('')}</ul>` : '<p class="pool-empty">Nothing here yet. Add places and things you might want to do, and plan them later.</p>'}
    </section>`;
  const strip = $('#daystrip', el);
  if (strip){
    if (keepScroll != null) strip.scrollLeft = keepScroll;
    const on = strip.querySelector('[aria-pressed="true"]');
    if (on){ const sr = strip.getBoundingClientRect(), r = on.getBoundingClientRect(); if (sr.width && (r.left < sr.left || r.right > sr.right)) strip.scrollLeft += (r.left - sr.left) - (sr.width - r.width) / 2; }
  }
  if (refocus){ const i = $('#qaInput'); if (i) i.focus({ preventScroll: true }); }
}

/* ---------- journal ---------- */
function jrowHTML(p){
  const done = !!p.visited;
  const meta = done ? `Stamped ${tFmt.format(parseStamp(p.visited.at))}${p.visited.feel ? ', ' + FEEL[p.visited.feel].toLowerCase() : ''}` : (p.slot ? SLOT[p.slot] : 'Any time') + ', ' + KIND[p.kind].toLowerCase();
  return `<li class="jrow${done ? ' done' : ''}" data-row="${p.id}" data-flip="j-${p.id}">
    <div class="jrow-under" aria-hidden="true"><div class="jrow-left">${done ? 'Unstamp' : 'Stamp'}</div>
      <div class="jrow-right">${done ? `<button type="button" tabindex="-1" data-jact="unstamp" data-id="${p.id}">Unstamp</button>` : `<button type="button" tabindex="-1" data-jact="pool" data-id="${p.id}">Back to pool</button><button type="button" tabindex="-1" class="del" data-jact="delete" data-id="${p.id}">Delete</button>`}</div></div>
    <div class="jrow-main">
      <div class="jrow-top">
        <button type="button" class="stampbtn" data-stamp="${p.id}" aria-pressed="${done}" aria-label="${done ? 'Stamped, tap to remove the stamp' : 'Stamp as done'}: ${esc(p.name)}"><span class="ring">${ICON.stamp}</span></button>
        <button type="button" class="jopen" data-open="${p.id}"><span class="jname">${esc(p.name)}</span><span class="jmeta">${esc(meta)}</span></button>
        <button type="button" class="iconbtn" data-jmore="${p.id}" aria-label="More for ${esc(p.name)}" aria-expanded="false">${ICON.dots}</button>
      </div>
      ${done && p.visited.note ? `<p class="jnote">${esc(p.visited.note)}</p>` : ''}
    </div>
  </li>`;
}
function renderJournal(){
  const el = $('#s-journal');
  const planned = trip.places.filter(p => p.day != null), stampedAll = trip.places.filter(p => p.visited), stamped = planned.filter(p => p.visited).length;
  const extra = trip.places.filter(p => p.day == null && p.visited);
  const ti = todayIndex(), over = tripOver(), started = ti >= 0 || over, lastDay = over ? trip.days : ti;
  const days = Array.from({ length: trip.days }, (_, i) => i).filter(d => placesIn(d).length);
  let html = '<section class="section">';
  if (planned.length){
    const pct = Math.round(stamped / planned.length * 100), from = ui.progress && ui.progress.id === trip.id ? ui.progress.pct : pct;
    ui.progress = { id: trip.id, pct };
    html += `<p class="jsum"><strong>${stamped}</strong> of ${plural(planned.length, 'planned thing')} stamped</p><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Stamped"><i id="jprog" style="width:${from}%" data-to="${pct}"></i></div>`;
  }
  html += `<div class="jtools"><button type="button" class="btn small soft" data-sheet="stamps"${stampedAll.length ? '' : ' disabled'}>${ICON.stamps}All stamps${stampedAll.length ? ` (${stampedAll.length})` : ''}</button></div>`;
  if (started) html += `<div class="inline-add jlog"><label for="jlogInput" class="sr-only">Log something you did</label><input id="jlogInput" type="text" maxlength="120" placeholder="Did something unplanned? Log it…" autocomplete="off" enterkeyhint="done"><button class="round primary" type="button" data-jlog aria-label="Log it">${ICON.plus}</button></div>`;
  if (planned.length) html += '<p class="hint">Tap the stamp once you\'ve done something. Swipe a row left to send it back to the pool or delete it.</p>';
  html += '</section>';
  if (!planned.length && !extra.length) html += `<section class="section"><div class="empty"><h3>Nothing to stamp yet</h3><p>Everything you put on a day in the plan shows up here, ready to stamp once you've done it.</p><button type="button" class="btn soft small" data-go="plan">Open the plan</button></div></section>`;
  html += days.map(d => {
    const items = dayOrder(d), any = items.some(p => p.visited), open = items.filter(p => !p.visited).length, dt = dayDate(d);
    return `<section class="jday" aria-label="${esc(dLong.format(dt))}">
      <div class="jday-head"><div><h2>${esc(dLong.format(dt))}</h2><small>Day ${d + 1}</small></div><span class="postmark${any ? '' : ' empty'}" aria-hidden="true"><b>${dt.getDate()}</b><i>${esc(postmarkMonth(dt))}</i></span></div>
      ${started && d < lastDay && open ? `<p class="jnudge">${plural(open, 'thing')} not stamped yet. Stamp what you did, or swipe left to tidy up.</p>` : ''}
      <ul class="jrows">${items.map(jrowHTML).join('')}</ul>
    </section>`;
  }).join('');
  if (extra.length) html += `<section class="jday"><div class="jday-head"><div><h2>Also stamped</h2><small>Not on a day</small></div></div><ul class="jrows">${extra.map(jrowHTML).join('')}</ul></section>`;
  el.innerHTML = html;
  const bar = $('#jprog', el); if (bar && bar.style.width !== bar.dataset.to + '%') requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.to + '%'; }));
}

/* ---------- booklet viewer ---------- */
function bookPages(t){
  const a = t.summary, stampedAll = t.places.filter(p => p.visited), planned = t.places.filter(p => p.day != null);
  const pages = [{ cover: true }];
  pages.push({ html: `<h3 class="pg-h">In short</h3><p class="pg-date">${esc(tripRange(t))}</p>
    <div class="pg-stats"><div><b>${stampedAll.length}</b><small>stamped</small></div><div><b>${planned.length}</b><small>planned</small></div><div><b>${t.days}</b><small>${t.days === 1 ? 'day' : 'days'}</small></div></div>
    ${a.rating ? `<div class="pg-q"><small>The trip, in stamps</small><div class="pg-rating" role="img" aria-label="${a.rating} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= a.rating ? 'on' : ''}"></i>`).join('')}</div></div>` : ''}
    ${a.again ? `<div class="pg-q"><small>Would you go back?</small><p>${esc(AGAIN[a.again])}</p></div>` : ''}` });
  const favs = [['Favourite food', a.food], ['Favourite spot', a.spot], ['Best moment', a.moment], ['Biggest surprise', a.surprise]].filter(x => x[1]);
  if (favs.length) pages.push({ html: `<h3 class="pg-h">Favourites</h3><p class="pg-date">Chosen when you wrapped up</p>${favs.map(([q, v]) => `<div class="pg-q"><small>${q}</small><p>${esc(v)}</p></div>`).join('')}` });
  for (let d = 0; d < t.days; d++){
    const items = dayOrder(d, t); if (!items.length) continue;
    const done = items.filter(p => p.visited), skipped = items.filter(p => !p.visited);
    pages.push({ html: `<h3 class="pg-h">Day ${d + 1}</h3><p class="pg-date">${esc(dLong.format(dayDate(d, t)))}</p>
      ${done.length ? `<ul class="pg-list">${done.map(p => `<li><span class="tick">${ICON.check}</span><div><b>${esc(p.name)}</b><small>${esc(tFmt.format(parseStamp(p.visited.at)))}${p.visited.feel ? ', ' + esc(FEEL[p.visited.feel].toLowerCase()) : ''}</small>${p.visited.note ? `<q>${esc(p.visited.note)}</q>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">A slow day. Nothing stamped.</p>'}
      ${skipped.length ? `<p class="pg-skipped">Didn't happen: ${skipped.map(p => esc(p.name)).join(', ')}</p>` : ''}` });
  }
  const extra = t.places.filter(p => p.day == null && p.visited);
  if (extra.length) pages.push({ html: `<h3 class="pg-h">Also stamped</h3><ul class="pg-list">${extra.map(p => `<li><span class="tick">${ICON.check}</span><div><b>${esc(p.name)}</b>${p.visited.note ? `<q>${esc(p.visited.note)}</q>` : ''}</div></li>`).join('')}</ul>` });
  const later = t.places.filter(p => !p.visited);
  if (later.length) pages.push({ html: `<h3 class="pg-h">For next time</h3><p class="pg-date">Ideas you didn't get to</p><div class="chips">${later.map(p => `<span class="chip">${esc(p.name)}</span>`).join('')}</div>` });
  if (t.todos.length) pages.push({ html: `<h3 class="pg-h">Before you left</h3><ul class="pg-list">${t.todos.map(x => `<li><span class="tick" style="${x.done ? '' : 'opacity:.3'}">${ICON.check}</span><div><b>${esc(x.text)}</b></div></li>`).join('')}</ul>` });
  pages.push({ html: `<div class="pg-end"><h2>The end</h2><p class="muted">Concluded ${esc(rangeFmt.format(new Date(t.concluded.at)))}</p><button type="button" class="btn small soft" data-book-reopen style="margin-top:12px">Reopen this trip</button></div>` });
  return pages;
}
function openBooklet(id, opts = {}){
  const t = getTrip(id); if (!t || !t.concluded) return;
  const fresh = !ui.booklet;
  ui.booklet = { id, page: opts.page || 0, pages: bookPages(t), edit: !!opts.edit, sel: null };
  const ov = $('#booklet');
  ov.setAttribute('style', themeStyle(t.color));
  ov.innerHTML = `<div class="book-top"><button type="button" class="iconbtn" data-book-close aria-label="Close the booklet">${ICON.x}</button><div class="book-title"><b>${esc(t.title)}</b><small id="bookWhich"></small></div><button type="button" class="iconbtn" data-book-edit aria-label="Edit booklet">${ICON.pencil}</button><button type="button" class="iconbtn" data-book-menu aria-label="Booklet options" aria-expanded="false" aria-haspopup="true">${ICON.dots}</button></div>
    <div class="book-menu" id="bookMenu" role="menu" hidden>
      <button type="button" role="menuitem" data-book-edit>${ICON.pencil}Edit favourites</button>
      <button type="button" role="menuitem" data-book-decorate>${ICON.image}Decorate the cover</button>
      <button type="button" role="menuitem" data-book-reopen>${ICON.undo}Reopen trip</button>
      <button type="button" role="menuitem" class="danger" data-book-delete>${ICON.trash}Delete booklet…</button></div>
    <div class="book-wrap" id="bookWrap"><div class="book" id="book" aria-live="polite"></div></div>
    <div class="sticker-bar" id="stickerBar" hidden></div>
    <div class="book-nav" id="bookNav"><button type="button" class="round" data-book-prev aria-label="Previous page">${ICON.left}</button><span class="count-pill" id="bookCount"></span><button type="button" class="round" data-book-next aria-label="Next page">${ICON.chev}</button></div>
    <div class="book-switch" id="bookSwitch"><button type="button" data-book-other="-1">‹ Previous booklet</button><button type="button" data-book-other="1">Next booklet ›</button></div>`;
  ov.hidden = false;
  if (fresh) ui.bookReturn = document.activeElement;
  sizeBook();
  showPage(ui.booklet.page, 0);
  renderBookChrome();
  if (fresh){
    setTimeout(() => { const c = $('[data-book-close]'); if (c) c.focus({ preventScroll: true }); }, 30);
    const cover = document.querySelector(`[data-open-book="${id}"]`);
    if (cover && motionOK()){ const r = cover.getBoundingClientRect(), b = $('#book').getBoundingClientRect(); if (r.width && b.width) $('#book').animate([{ transform: `translate(${r.left - b.left}px,${r.top - b.top}px) scale(${r.width / b.width})`, opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' }); }
  }
}
function sizeBook(){
  const wrap = $('#bookWrap'), book = $('#book'); if (!wrap || !book) return;
  const r = wrap.getBoundingClientRect(), w = Math.max(200, Math.min(400, r.width - 32, (r.height - 8) * .75));
  book.style.width = w + 'px'; book.style.height = (w / .75) + 'px';
}
window.addEventListener('resize', () => { if (ui.booklet) sizeBook(); });
function renderBookChrome(){
  const bk = ui.booklet; if (!bk) return;
  const books = booklets(), i = books.findIndex(b => b.id === bk.id);
  $('#bookWhich').textContent = books.length > 1 ? `Booklet ${i + 1} of ${books.length}` : 'Travel booklet';
  $('#bookSwitch').hidden = books.length < 2 || bk.edit;
  $$('[data-book-other]').forEach(b => { b.disabled = (+b.dataset.bookOther < 0 ? i <= 0 : i >= books.length - 1); });
  $('#bookNav').hidden = bk.edit;
  $('#book').classList.toggle('editing', bk.edit);
  const bar = $('#stickerBar'); bar.hidden = !bk.edit;
  if (bk.edit){
    const t = getTrip(bk.id), sel = t && t.stickers.find(s => s.id === bk.sel), dis = sel ? '' : ' disabled';
    bar.innerHTML = `<label class="btn small soft filebtn"${t.stickers.length >= MAX_STICKERS ? ' aria-disabled="true"' : ''}>${ICON.image}Add photo<input type="file" id="stickerFile" accept="image/*" multiple aria-label="Add a photo sticker"${t.stickers.length >= MAX_STICKERS ? ' disabled' : ''}></label>
      <button type="button" class="round" data-stk="smaller" aria-label="Make smaller"${dis}>${ICON.minus}</button>
      <button type="button" class="round" data-stk="bigger" aria-label="Make bigger"${dis}>${ICON.plus}</button>
      <button type="button" class="round" data-stk="rotl" aria-label="Rotate left"${dis}>${ICON.rotl}</button>
      <button type="button" class="round" data-stk="rotr" aria-label="Rotate right"${dis}>${ICON.rotr}</button>
      <button type="button" class="round" data-stk="shape" aria-label="Change shape"${dis}>${ICON.shape}</button>
      <button type="button" class="round" data-stk="remove" aria-label="Remove sticker"${dis}>${ICON.trash}</button>
      <button type="button" class="btn small primary" data-stk="done">Done</button>`;
    $$('.sticker', $('#book')).forEach(el => el.classList.toggle('sel', el.dataset.sticker === bk.sel));
  }
}
function pageEl(i){
  const bk = ui.booklet, t = getTrip(bk.id), pg = bk.pages[i], d = document.createElement('div');
  if (pg.cover){ d.className = 'page cover-page'; d.innerHTML = coverHTML(t); }
  else { d.className = 'page'; d.innerHTML = pg.html; }
  return d;
}
function showPage(i, dir){
  const bk = ui.booklet; if (!bk) return;
  i = clamp(i, 0, bk.pages.length - 1);
  const book = $('#book'), old = book.querySelector('.page');
  if (old && i === bk.page && dir){ old.animate([{ transform: 'none' }, { transform: `translateX(${dir * -10}px)` }, { transform: 'none' }], { duration: dur(240) }); return; }
  const next = pageEl(i);
  bk.page = i;
  $('#bookCount').textContent = `${i + 1} / ${bk.pages.length}`;
  $('[data-book-prev]').disabled = i === 0; $('[data-book-next]').disabled = i === bk.pages.length - 1;
  if (!old || !motionOK() || !dir){ book.innerHTML = ''; book.appendChild(next); hydrateImages(book); return; }
  if (dir > 0){
    book.insertBefore(next, old); old.style.zIndex = 2;
    old.animate([{ transform: 'rotateY(0)', opacity: 1 }, { transform: 'rotateY(-100deg)', opacity: .2 }], { duration: 420, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => old.remove();
  } else {
    book.appendChild(next); next.style.zIndex = 2;
    next.animate([{ transform: 'rotateY(-100deg)', opacity: .2 }, { transform: 'rotateY(0)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => old.remove();
  }
  hydrateImages(book);
}
/* go to the neighbouring booklet, sliding the book across */
function otherBooklet(dir){
  const bk = ui.booklet; if (!bk) return;
  const books = booklets(), i = books.findIndex(b => b.id === bk.id), next = books[i + dir];
  const book = $('#book');
  if (!next){ if (book && motionOK()) book.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 14}px)` }, { transform: 'none' }], { duration: 260 }); return; }
  const go = () => openBooklet(next.id, { page: dir > 0 ? 0 : 0 });
  if (!motionOK()) return go();
  book.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 60}%) rotate(${-dir * 4}deg)`, opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
    go();
    $('#book').animate([{ transform: `translateX(${dir * 60}%) rotate(${dir * 4}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
  };
}
function refreshBooklet(){
  const bk = ui.booklet; if (!bk) return;
  const t = getTrip(bk.id);
  if (!t || !t.concluded){ closeBooklet(true); return; }
  bk.pages = bookPages(t);
  const i = clamp(bk.page, 0, bk.pages.length - 1), book = $('#book');
  bk.page = i;
  book.innerHTML = ''; book.appendChild(pageEl(i)); hydrateImages(book);
  $('#bookCount').textContent = `${i + 1} / ${bk.pages.length}`;
  $('[data-book-prev]').disabled = i === 0; $('[data-book-next]').disabled = i === bk.pages.length - 1;
  $('.book-title b').textContent = t.title;
  $('#booklet').setAttribute('style', themeStyle(t.color));
  renderBookChrome();
}
function closeBooklet(instant){
  const ov = $('#booklet'); if (ov.hidden){ ui.booklet = null; return; }
  const done = () => {
    ov.hidden = true; ov.innerHTML = ''; ui.booklet = null;
    const back = ui.bookReturn; ui.bookReturn = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };
  if (instant || !motionOK()){ done(); return; }
  const bk = $('#book'); if (bk) bk.animate([{ transform: 'none' }, { transform: 'translateY(24px) scale(.94)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
  const fade = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
  fade.onfinish = () => { done(); fade.cancel(); };
}
/* page swipes (and switching booklets at either end) */
const bookSwipe = { s: null };
$('#booklet').addEventListener('pointerdown', e => {
  if (!ui.booklet || ui.booklet.edit || !e.target.closest('#book')) return;
  bookSwipe.s = { x: e.clientX, y: e.clientY, pid: e.pointerId };
});
window.addEventListener('pointerup', e => {
  const s = bookSwipe.s; if (!s || e.pointerId !== s.pid) return; bookSwipe.s = null;
  const bk = ui.booklet; if (!bk || bk.edit) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  suppressNextClick();
  const dir = dx < 0 ? 1 : -1, target = bk.page + dir;
  if (target < 0 || target >= bk.pages.length){ otherBooklet(dir); return; }
  showPage(target, dir);
});
/* sticker editing: drag to move, pinch to resize and rotate, or use the buttons */
const stk = { pts: new Map(), start: null };
$('#booklet').addEventListener('pointerdown', e => {
  const bk = ui.booklet; if (!bk || !bk.edit) return;
  const el = e.target.closest('.sticker'), cover = $('#book .cover');
  if (!cover) return;
  if (!el && !stk.pts.size){ if (e.target.closest('#book')){ bk.sel = null; renderBookChrome(); } return; }
  const t = getTrip(bk.id);
  if (el && !stk.pts.size){ bk.sel = el.dataset.sticker; renderBookChrome(); }
  const s = t.stickers.find(x => x.id === bk.sel); if (!s) return;
  e.preventDefault();
  try { (el || cover).setPointerCapture(e.pointerId); } catch (err) {}
  stk.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const cr = cover.getBoundingClientRect(), [p1, p2] = [...stk.pts.values()];
  stk.start = { snap: stk.start ? stk.start.snap : JSON.stringify(state), s0: { ...s }, cr, p1: { ...p1 }, d0: p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : 0, a0: p2 ? Math.atan2(p2.y - p1.y, p2.x - p1.x) : 0, mid0: p2 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : { ...p1 } };
});
window.addEventListener('pointermove', e => {
  if (!stk.pts.has(e.pointerId) || !stk.start) return;
  stk.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const bk = ui.booklet, t = bk && getTrip(bk.id), s = t && t.stickers.find(x => x.id === bk.sel); if (!s) return;
  const st = stk.start, pts = [...stk.pts.values()];
  if (pts.length >= 2 && st.d0){
    const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    s.s = clamp(st.s0.s * d / st.d0, .12, .9);
    s.r = ((st.s0.r + (a - st.a0) * 180 / Math.PI + 540) % 360) - 180;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    s.x = clamp(st.s0.x + (mid.x - st.mid0.x) / st.cr.width, 0, 1); s.y = clamp(st.s0.y + (mid.y - st.mid0.y) / st.cr.height, 0, 1);
  } else {
    s.x = clamp(st.s0.x + (pts[0].x - st.p1.x) / st.cr.width, 0, 1); s.y = clamp(st.s0.y + (pts[0].y - st.p1.y) / st.cr.height, 0, 1);
  }
  const el = $(`#book .sticker[data-sticker="${s.id}"]`);
  if (el){ el.style.left = (s.x * 100) + '%'; el.style.top = (s.y * 100) + '%'; el.style.width = (s.s * 100) + '%'; el.style.transform = `translate(-50%,-50%) rotate(${s.r}deg)`; }
});
function endSticker(e){
  if (!stk.pts.has(e.pointerId)) return;
  stk.pts.delete(e.pointerId);
  if (stk.pts.size){ // one finger lifted during a pinch: restart from the remaining finger
    const bk = ui.booklet, t = bk && getTrip(bk.id), s = t && t.stickers.find(x => x.id === bk.sel), p = [...stk.pts.values()][0];
    if (s && stk.start) stk.start = { ...stk.start, s0: { ...s }, p1: { ...p }, d0: 0, mid0: { ...p } };
    return;
  }
  const st = stk.start; stk.start = null;
  if (st && st.snap !== JSON.stringify(state)){ pushHistory('moving a sticker', st.snap); save(); renderUndoButton(); }
}
window.addEventListener('pointerup', endSticker);
window.addEventListener('pointercancel', endSticker);
async function addStickers(files){
  const bk = ui.booklet, t = bk && getTrip(bk.id); if (!t) return;
  const room = MAX_STICKERS - t.stickers.length;
  const list = [...files].slice(0, Math.max(0, room));
  if (!list.length){ toast(`A cover can hold ${MAX_STICKERS} stickers`); return; }
  let added = 0, lastId = null;
  for (const f of list){
    try {
      const { data, alpha } = await makeSticker(f);
      const img = uid('img');
      if (!(await putImage(img, data)) && images.failed) toast('Stickers are kept until you close the page, because this browser blocks storage.');
      const s = normSticker({ id: uid('s'), img, x: .3 + Math.random() * .4, y: .5 + Math.random() * .28, s: .34, r: Math.round(Math.random() * 24 - 12), shape: alpha ? 'free' : 'round' });
      mutate(() => { t.stickers.push(s); }, 'adding a sticker');
      added++; lastId = s.id;
    } catch (err) { toast(err && err.message === 'too-big' ? 'That photo is too large (over 25 MB).' : "That file couldn't be used as a sticker."); }
  }
  if (added && ui.booklet){ ui.booklet.sel = lastId; renderBookChrome(); toast(added === 1 ? 'Sticker added. Drag it into place.' : `${added} stickers added`, true); }
}
function stickerAction(kind){
  const bk = ui.booklet, t = bk && getTrip(bk.id); if (!t) return;
  if (kind === 'done'){ bk.edit = false; bk.sel = null; renderBookChrome(); return; }
  const s = t.stickers.find(x => x.id === bk.sel); if (!s) return;
  const shapes = ['round', 'square', 'free'];
  mutate(() => {
    if (kind === 'smaller') s.s = clamp(s.s / 1.18, .12, .9);
    else if (kind === 'bigger') s.s = clamp(s.s * 1.18, .12, .9);
    else if (kind === 'rotl') s.r = Math.max(-180, s.r - 15);
    else if (kind === 'rotr') s.r = Math.min(180, s.r + 15);
    else if (kind === 'shape') s.shape = shapes[(shapes.indexOf(s.shape) + 1) % shapes.length];
    else if (kind === 'remove'){ t.stickers = t.stickers.filter(x => x !== s); bk.sel = null; }
  }, kind === 'remove' ? 'removing a sticker' : 'changing a sticker');
  if (kind === 'remove') toast('Sticker removed', true);
}
