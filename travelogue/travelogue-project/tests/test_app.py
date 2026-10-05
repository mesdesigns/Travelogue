#!/usr/bin/env python3
"""End-to-end tests for Travel Log (Playwright + Chromium).
Run:  python3 build.py && python3 tests/test_app.py
Serves dist/ over HTTP on a free port, like GitHub Pages would."""
import asyncio, functools, http.server, json, os, pathlib, socketserver, sys, tempfile, threading, traceback
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
TMP = pathlib.Path(tempfile.mkdtemp())

# ---------- tiny server ----------
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    handler = functools.partial(Quiet, directory=str(DIST))
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler); httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'

# ---------- fixtures ----------
LEGACY_V1 = {"title": "Paris", "start": "2027-03-06", "days": 14, "places": [
    {"id": "a1", "name": "Louvre", "kind": "museum", "day": 0, "slot": "morning", "lat": 48.86, "lng": 2.33},
    {"id": "a2", "name": "Seine cruise", "kind": "activity", "day": None}], "todos": [{"id": "t1", "text": "Passport", "done": True}]}
def trip(id, title, color='#57534e', start='2027-03-06', days=5, places=(), concluded=None, summary=None, todos=()):
    t = {"id": id, "title": title, "color": color, "start": start, "days": days, "places": list(places), "todos": list(todos)}
    if concluded: t["concluded"] = {"at": concluded}
    if summary: t["summary"] = summary
    return t
def state(*trips): return {"v": 6, "trips": list(trips)}
def stamped(id, name, kind, day, at='2026-09-26T10:00', feel=''):
    return {"id": id, "name": name, "kind": kind, "day": day, "slot": "", "visited": {"at": at, "note": "", "feel": feel}}

async def new_page(browser, url, seed=None, w=390, h=844, touch=True, extra_init=None, raw_seed=None, locale=None):
    ctx = await browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, accept_downloads=True, **({'locale': locale} if locale else {}))
    if seed is not None or raw_seed is not None:
        val = json.dumps(raw_seed if raw_seed is not None else json.dumps(seed))
        await ctx.add_init_script(f"if(!sessionStorage.getItem('seeded')){{localStorage.setItem('paris-trip-v1', {val}); sessionStorage.setItem('seeded','1');}}")
    if extra_init: await ctx.add_init_script(extra_init)
    pg = await ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    await pg.goto(url); await pg.wait_for_timeout(700)
    return ctx, pg

async def touch_swipe(ctx, pg, x0, y0, x1, y1, steps=12, hold=0):
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
    if hold: await pg.wait_for_timeout(hold)
    for i in range(1, steps + 1):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * i / steps, 'y': y0 + (y1 - y0) * i / steps}]})
        await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(550)

async def title(pg): return (await pg.inner_text('#title')).strip()
async def texts(pg, sel): return await pg.evaluate(f"[...document.querySelectorAll({sel!r})].map(e=>e.textContent.trim())")
async def stored(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('paris-trip-v1') || 'null')")
def check(cond, msg):
    if not cond: raise AssertionError(msg)

TESTS = []
def test(fn): TESTS.append(fn); return fn

# ---------- persistence ----------
@test
async def legacy_single_trip_format_is_migrated(b, url):
    ctx, pg = await new_page(b, url, seed=LEGACY_V1)
    check(await title(pg) == 'Today', 'single trip opens straight into Today')
    check('PARIS' in (await pg.inner_text('#eyebrow')).upper(), 'trip name shown in header')
    await pg.click('[data-todo-toggle]'); await pg.wait_for_timeout(200)
    s = await stored(pg)
    check(s['v'] == 6 and len(s['trips']) == 1 and len(s['trips'][0]['places']) == 2, f'saved in the new format with all places: {s and s.get("v")}')
    await ctx.close()

@test
async def data_survives_refresh(b, url):
    ctx, pg = await new_page(b, url)
    await pg.click('.empty [data-sheet="newtrip"]'); await pg.wait_for_timeout(500)
    await pg.fill('#fTitle', 'Lisbon'); await pg.fill('#fDays', '5')
    await pg.click('[data-trip-create]'); await pg.wait_for_timeout(700)
    check(await title(pg) == 'Today', 'new trip opens Today')
    await pg.fill('#todoInput', 'Book tram pass'); await pg.click('[data-todo-add]'); await pg.wait_for_timeout(200)
    await pg.click('#tabbar [data-tab="plan"]'); await pg.wait_for_timeout(500)
    await pg.fill('#qaInput', 'Pastéis de nata'); await pg.click('[data-qa-add]'); await pg.wait_for_timeout(200)
    await pg.fill('#qaInput', 'Alfama walk'); await pg.press('#qaInput', 'Enter'); await pg.wait_for_timeout(200)
    await pg.click('#pool .pcard:has-text("Alfama") .pcard-add'); await pg.wait_for_timeout(300)
    await pg.click('#tabbar [data-tab="journal"]'); await pg.wait_for_timeout(500)
    await pg.click('.stampbtn'); await pg.wait_for_timeout(300)
    await pg.reload(); await pg.wait_for_timeout(800)
    s = await stored(pg); t = s['trips'][0]
    names = {p['name']: p for p in t['places']}
    check(t['title'] == 'Lisbon' and t['days'] == 5, 'trip saved')
    check(set(names) == {'Pastéis de nata', 'Alfama walk'}, f'pool items saved: {names.keys()}')
    check(names['Alfama walk']['day'] == 0 and names['Alfama walk']['visited'], 'planned and stamped item saved')
    check(names['Pastéis de nata']['kind'] == 'food', 'type guessed from the name')
    check([x['text'] for x in t['todos']] == ['Book tram pass'], 'to-do saved')
    check(await title(pg) == 'Journal' or await title(pg) == 'Today', 'app reopens into the trip')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def damaged_data_recovers_from_previous_copy(b, url):
    good = json.dumps(state(trip('t1', 'Rome')))
    init = f"if(!sessionStorage.getItem('seeded')){{localStorage.setItem('paris-trip-v1','{{not json'); localStorage.setItem('travel-log-previous', {json.dumps(good)}); sessionStorage.setItem('seeded','1');}}"
    ctx, pg = await new_page(b, url, extra_init=init)
    check('ROME' in (await pg.inner_text('#eyebrow')).upper(), 'previous copy restored')
    check('restored' in await pg.inner_text('#toast'), 'user is told')
    await ctx.close()

# ---------- import / export ----------
def make_png(path, color=(220, 80, 60, 255)):
    from PIL import Image, ImageDraw
    im = Image.new('RGBA', (300, 300), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([20, 20, 280, 280], fill=color); im.save(path)

@test
async def export_then_import_round_trip_with_stickers(b, url):
    seed = state(trip('lis', 'Lisbon', '#0f766e', '2026-09-26', 5, [stamped('b1', 'Pastéis de nata', 'food', 0)], concluded='2026-10-01T10:00:00Z', summary={"food": "Pastéis de nata", "rating": 4}),
                 trip('rom', 'Rome', '#b4532a'))
    ctx, pg = await new_page(b, url, seed=seed)
    await pg.click('.bookcover'); await pg.wait_for_timeout(600)
    await pg.click('[data-book-menu]'); await pg.click('#bookMenu [data-book-decorate]'); await pg.wait_for_timeout(300)
    png = TMP / 'sticker.png'; make_png(png)
    await pg.set_input_files('#stickerFile', str(png)); await pg.wait_for_timeout(900)
    check(await pg.evaluate("document.querySelectorAll('#book .sticker img[src^=\"data:image\"]').length") == 1, 'sticker shows on the cover')
    await pg.click('[data-stk="bigger"]'); await pg.click('[data-stk="done"]'); await pg.click('[data-book-close]'); await pg.wait_for_timeout(400)
    # sticker survives a reload (stored in IndexedDB)
    await pg.reload(); await pg.wait_for_timeout(900)
    check(await pg.evaluate("document.querySelectorAll('.bookcover .sticker img[src^=\"data:image\"]').length") == 1, 'sticker still on the shelf cover after reload')
    await pg.click('#barSettings'); await pg.wait_for_timeout(400)
    async with pg.expect_download() as dl:
        await pg.click('[data-export]')
    path = TMP / 'export.json'; await (await dl.value).save_as(path)
    data = json.loads(path.read_text())
    check(data['app'] == 'travel-log' and len(data['state']['trips']) == 2, 'export has both trips')
    check(len(data['images']) == 1 and list(data['images'].values())[0].startswith('data:image/'), 'export includes the sticker image')
    await ctx.close()
    # import into an empty device
    ctx, pg = await new_page(b, url)
    await pg.click('#barSettings'); await pg.wait_for_timeout(300)
    await pg.click('[data-sheet="import"]'); await pg.wait_for_timeout(300)
    await pg.set_input_files('#importFile', str(path)); await pg.wait_for_timeout(600)
    check('1' in await pg.inner_text('.importsum'), 'preview shows counts')
    await pg.click('[data-import-go]'); await pg.wait_for_timeout(700)
    check(len((await stored(pg))['trips']) == 2, 'both trips imported')
    check(await pg.evaluate("document.querySelectorAll('.bookcover .sticker img[src^=\"data:image\"]').length") == 1, 'sticker image imported')
    # replace needs a confirmation, and can be undone
    await pg.click('[data-sheet="newtrip"]'); await pg.wait_for_timeout(300); await pg.fill('#fTitle', 'Oslo'); await pg.click('[data-trip-create]'); await pg.wait_for_timeout(600)
    await pg.click('#barTrips'); await pg.wait_for_timeout(500)
    await pg.click('#barSettings'); await pg.wait_for_timeout(300); await pg.click('[data-sheet="import"]'); await pg.wait_for_timeout(300)
    await pg.set_input_files('#importFile', str(path)); await pg.wait_for_timeout(600)
    await pg.click('[data-imode="replace"]'); await pg.click('[data-import-go]'); await pg.wait_for_timeout(200)
    check(await pg.is_visible('.confirm-box.danger'), 'replace asks for confirmation')
    check(len((await stored(pg))['trips']) == 3, 'nothing replaced before confirming')
    await pg.click('.confirm-box [data-import-go]'); await pg.wait_for_timeout(600)
    check(sorted(t['title'] for t in (await stored(pg))['trips']) == ['Lisbon', 'Rome'], 'replaced')
    await pg.click('#toast [data-undo]'); await pg.wait_for_timeout(500)
    check('Oslo' in [t['title'] for t in (await stored(pg))['trips']], 'undo brings the replaced trips back')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def invalid_import_changes_nothing(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')))
    before = await stored(pg)
    for name, content in [('bad.json', '{not json'), ('other.json', json.dumps({"hello": "world"})), ('empty.json', '')]:
        f = TMP / name; f.write_text(content)
        if await pg.is_visible('#barTrips'): await pg.click('#barTrips'); await pg.wait_for_timeout(400)
        await pg.click('#barSettings'); await pg.wait_for_timeout(300); await pg.click('[data-sheet="import"]'); await pg.wait_for_timeout(300)
        await pg.set_input_files('#importFile', str(f)); await pg.wait_for_timeout(500)
        check(await pg.is_visible('.notice.error'), f'{name}: error shown')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    check(await stored(pg) == before, 'data unchanged')
    await ctx.close()

# ---------- gestures ----------
@test
async def swipe_moves_between_sections(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome', places=[{"id": "a", "name": "Colosseum", "kind": "sight", "day": 0}])))
    order = []
    for _ in range(3):
        await touch_swipe(ctx, pg, 300, 420, 60, 425); order.append(await title(pg))
    check(order == ['Plan', 'Journal', 'Journal'], f'left swipes: {order}')
    back = []
    for _ in range(3):
        await touch_swipe(ctx, pg, 80, 420, 340, 425); back.append(await title(pg))
    check(back == ['Plan', 'Today', 'Trips'], f'right swipes: {back}')
    await touch_swipe(ctx, pg, 300, 500, 60, 505)
    check(await title(pg) == 'Today', 'swiping left on Trips enters the trip')
    # vertical scrolling never switches sections
    await touch_swipe(ctx, pg, 200, 600, 215, 250)
    check(await title(pg) == 'Today', 'vertical gesture ignored')
    # sideways scrollers keep their own swipe
    await pg.click('#tabbar [data-tab="plan"]'); await pg.wait_for_timeout(500)
    box = await pg.evaluate("(()=>{const r=document.querySelector('#daystrip').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()")
    await touch_swipe(ctx, pg, box[0] + 80, box[1], box[0] - 80, box[1])
    check(await title(pg) == 'Plan', 'swiping the day strip scrolls it instead of switching')
    # no section swipes while a sheet is open
    await pg.click('#barSettings'); await pg.wait_for_timeout(400)
    await touch_swipe(ctx, pg, 300, 700, 60, 700)
    check(await pg.evaluate("document.querySelector('#sheet').open") and await title(pg) == 'Plan', 'sheet blocks section swipes')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def journal_rows_and_toast_swipes(b, url):
    places = [{"id": "a", "name": "Colosseum", "kind": "sight", "day": 0}, {"id": "c", "name": "Forum", "kind": "sight", "day": 0}]
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome', places=places)))
    await pg.click('#tabbar [data-tab="journal"]'); await pg.wait_for_timeout(500)
    r = await pg.evaluate("(()=>{const e=document.querySelector('[data-row=\"a\"] .jopen').getBoundingClientRect(); return [e.x+e.width/2, e.y+e.height/2]})()")
    await touch_swipe(ctx, pg, r[0] + 40, r[1], r[0] - 90, r[1])
    check(await pg.get_attribute('[data-row="a"] [data-jmore]', 'aria-expanded') == 'true', 'left swipe opens the actions')
    check(await title(pg) == 'Journal', 'row swipe did not switch section')
    await pg.click('[data-row="a"] [data-jact="pool"]'); await pg.wait_for_timeout(700)
    check([p['day'] for p in (await stored(pg))['trips'][0]['places'] if p['id'] == 'a'] == [None], 'back to the pool')
    r = await pg.evaluate("(()=>{const e=document.querySelector('[data-row=\"c\"] .jopen').getBoundingClientRect(); return [e.x+30, e.y+e.height/2]})()")
    await touch_swipe(ctx, pg, r[0], r[1], r[0] + 140, r[1])
    check([p for p in (await stored(pg))['trips'][0]['places'] if p['id'] == 'c'][0]['visited'], 'right swipe stamps')
    check(await pg.evaluate("document.querySelector('#toast').classList.contains('show')"), 'toast shown')
    tb = await pg.evaluate("(()=>{const e=document.querySelector('#toast span').getBoundingClientRect(); return [e.x+20, e.y+e.height/2]})()")
    await touch_swipe(ctx, pg, tb[0], tb[1], tb[0] + 180, tb[1])
    check(not await pg.evaluate("document.querySelector('#toast').classList.contains('show')"), 'toast swiped away')
    await ctx.close()

@test
async def booklets_page_and_switch_by_swipe(b, url):
    books = [trip('k', 'Kyoto', '#6b4fa0', '2025-04-01', 2, [stamped('k1', 'Fushimi Inari', 'sight', 0)], concluded='2025-04-10T10:00:00Z'),
             trip('o', 'Oslo', '#2a4d8f', '2024-06-01', 2, concluded='2024-06-10T10:00:00Z')]
    ctx, pg = await new_page(b, url, seed=state(*books))
    await pg.click('.bookcover'); await pg.wait_for_timeout(700)
    first = await pg.inner_text('.book-title b')
    total = int((await pg.inner_text('#bookCount')).split('/')[1])
    box = await pg.evaluate("(()=>{const r=document.querySelector('#book').getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()")
    for _ in range(total - 1): await touch_swipe(ctx, pg, box[0] + 90, box[1], box[0] - 90, box[1], steps=6)
    check((await pg.inner_text('#bookCount')).startswith(f'{total} /'), 'paged to the last page')
    await touch_swipe(ctx, pg, box[0] + 90, box[1], box[0] - 90, box[1], steps=6); await pg.wait_for_timeout(500)
    check(await pg.inner_text('.book-title b') != first, 'swiping past the end opens the next booklet')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    check(await pg.is_hidden('#booklet'), 'Escape closes')
    await ctx.close()

# ---------- theming ----------
def _lum(h):
    h = h.strip().lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def _contrast(a, b): x, y = _lum(a), _lum(b); return (max(x, y) + .05) / (min(x, y) + .05)

@test
async def trip_colour_themes_the_whole_ui(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome', '#57534e')))
    for colour in ['#0f766e', '#f5e6a0', '#ffffff', '#be123c']:
        await pg.click('#barSettings'); await pg.wait_for_timeout(400)
        await pg.evaluate(f"(()=>{{const i=document.querySelector('#fColor'); i.value='{colour}'; i.dispatchEvent(new Event('input',{{bubbles:true}}));}})()")
        await pg.click('[data-trip-save]'); await pg.wait_for_timeout(500)
        v = await pg.evaluate("(()=>{const cs=getComputedStyle(document.querySelector('#s-today')); return ['--accent','--accent-ink','--bg','--bg-2','--card','--stamp','--accent-soft','--muted'].map(k=>cs.getPropertyValue(k).trim())})()")
        accent, ink, bg, bg2, card, stamp, soft, muted = v
        check(_contrast(muted, bg2) >= 4.5 and _contrast(muted, bg) >= 4.5, f'{colour}: secondary text readable ({_contrast(muted, bg2):.2f})')
        check(accent == colour, f'{colour}: screen accent {accent}')
        check(_contrast(ink, bg2) >= 4.5 and _contrast(ink, soft) >= 4.5, f'{colour}: accent text readable ({_contrast(ink, bg2):.2f})')
        check(bg != '#efebe5' and card != '#fdfcfb', f'{colour}: backgrounds and cards tinted')
        tab = await pg.evaluate("getComputedStyle(document.querySelector('#tabInd')).backgroundColor")
        check(tab not in ('', 'rgba(0, 0, 0, 0)'), 'tab indicator themed')
    await ctx.close()

@test
async def tab_bar_is_a_landmark_with_arrow_key_tabs(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')), touch=False, w=1280, h=800)
    check(await title(pg) == 'Today', 'opens the trip')
    check(await pg.evaluate("!!document.querySelector('nav[aria-label] #tabbar[role=tablist]')"), 'tablist sits inside a navigation landmark')
    check(await pg.evaluate("[...document.querySelectorAll('#tabbar [role=tab]')].map(b=>b.tabIndex).join()") == '0,-1,-1', 'only the selected tab is in the Tab order')
    await pg.focus('#tabbar [data-tab="today"]'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(500)
    check(await title(pg) == 'Plan', 'ArrowRight moves to Plan')
    check(await pg.evaluate("document.activeElement.dataset.tab") == 'plan', 'focus follows the selected tab')
    await pg.keyboard.press('End'); await pg.wait_for_timeout(500)
    check(await title(pg) == 'Journal', 'End jumps to the last tab')
    await pg.keyboard.press('Home'); await pg.wait_for_timeout(500)
    check(await title(pg) == 'Today', 'Home jumps to the first tab')
    check(await pg.evaluate("document.getElementById('s-today').getAttribute('aria-labelledby')") == 'tab-today', 'panels are labelled by their tabs')
    await pg.click('#barTrips'); await pg.wait_for_timeout(500)
    check(await pg.evaluate("document.getElementById('tabbar').inert"), 'hidden tab bar is out of reach on the Trips screen')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def undo_never_erases_changes_from_another_tab(b, url):
    ctx, a = await new_page(b, url, seed=state(trip('t1', 'Rome')))
    bb = await ctx.new_page(); await bb.goto(url); await bb.wait_for_timeout(700)
    for pg in (a, bb): await pg.click('#tabbar [data-tab="plan"]'); await pg.wait_for_timeout(400)
    await a.fill('#qaInput', 'From tab A'); await a.press('#qaInput', 'Enter'); await a.wait_for_timeout(400)
    await bb.fill('#qaInput', 'From tab B'); await bb.press('#qaInput', 'Enter'); await bb.wait_for_timeout(600)
    check(await a.is_hidden('#barUndo'), 'undo is withdrawn once another tab has saved')
    names = [p['name'] for p in (await stored(a))['trips'][0]['places']]
    check(set(names) == {'From tab A', 'From tab B'}, f'both tabs\' changes kept: {names}')
    await bb.click('#barUndo'); await bb.wait_for_timeout(400)
    check([p['name'] for p in (await stored(bb))['trips'][0]['places']] == ['From tab A'], 'the tab that made the latest change can still undo it')
    await ctx.close()

# ---------- conclusion details and booklet editing ----------
@test
async def conclusion_answers_persist_and_booklet_is_editable(b, url):
    places = [stamped('f1', 'Pastéis de nata', 'activity', 0), stamped('f2', 'Time Out Market', 'food', 0), stamped('s1', 'Miradouro sunset', 'sight', 1), {"id": "x", "name": "Fado night", "kind": "activity", "day": 1}]
    ctx, pg = await new_page(b, url, seed=state(trip('lis', 'Lisbon', '#0f766e', '2026-09-20', 5, places)))
    check(await pg.is_visible('.conclude-card'), 'trip over: conclude prompt on Today')
    await pg.click('.hero'); await pg.wait_for_timeout(400)
    check(await pg.inner_text('#sheetTitle') == 'Trip settings', 'tapping the trip card opens trip settings')
    await pg.click('#sheet [data-sheet="conclude"]'); await pg.wait_for_timeout(400)
    foods = await texts(pg, '[data-pick="food"]'); spots = await texts(pg, '[data-pick="spot"]')
    check('Pastéis de nata' in foods and 'Time Out Market' in foods and 'Miradouro sunset' not in foods, f'food picks from visited food places: {foods}')
    check('Miradouro sunset' in spots, 'spot picks')
    await pg.click('[data-pick="food"][data-val="Pastéis de nata"]'); await pg.click('[data-pick="spot"]')
    await pg.fill('#cMoment', 'Tram 28 at dusk'); await pg.click('[data-again="yes"]'); await pg.click('[data-rate="4"]'); await pg.wait_for_timeout(500)
    await pg.click('[data-conclude]'); await pg.wait_for_timeout(200)
    check(len((await stored(pg))['trips'][0].get('concluded') or {}) == 0, 'not concluded before confirming')
    await pg.click('[data-conclude-yes]'); await pg.wait_for_timeout(900)
    s = (await stored(pg))['trips'][0]
    check(s['concluded'] and s['summary']['food'] == 'Pastéis de nata' and s['summary']['moment'] == 'Tram 28 at dusk' and s['summary']['rating'] == 4, f'answers saved: {s["summary"]}')
    check(await title(pg) == 'Trips' and await pg.is_visible('.bookcover'), 'booklet on the home screen')
    # edit the booklet directly
    await pg.click('.bookcover'); await pg.wait_for_timeout(600)
    await pg.click('[data-book-edit]'); await pg.wait_for_timeout(400)
    await pg.fill('#cMoment', 'Getting lost in Alfama'); await pg.wait_for_timeout(500)
    await pg.click('[data-close-sheet]'); await pg.wait_for_timeout(500)
    check((await stored(pg))['trips'][0]['summary']['moment'] == 'Getting lost in Alfama', 'booklet edit saved')
    await pg.click('[data-book-next]'); await pg.wait_for_timeout(500); await pg.click('[data-book-next]'); await pg.wait_for_timeout(500)
    check('Getting lost in Alfama' in await pg.inner_text('#book'), 'favourites page shows the edit')
    # reopening keeps the answers
    await pg.click('[data-book-menu]'); await pg.click('#bookMenu [data-book-reopen]'); await pg.wait_for_timeout(300)
    await pg.click('[data-confirm-yes]'); await pg.wait_for_timeout(800)
    check(await title(pg) == 'Today', 'reopened')
    await pg.reload(); await pg.wait_for_timeout(800)
    await pg.click('.conclude-card [data-sheet="conclude"]'); await pg.wait_for_timeout(400)
    check(await pg.input_value('#cMoment') == 'Getting lost in Alfama' and await pg.get_attribute('[data-pick="food"][data-val="Pastéis de nata"]', 'aria-pressed') == 'true', 'answers still there after reopening and reloading')
    check(not pg.errors, pg.errors)
    await ctx.close()

# ---------- keyboard ----------
@test
async def sheet_stays_anchored_when_layout_shrinks_for_keyboard(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')))
    await pg.click('#barSettings'); await pg.wait_for_timeout(500)
    await pg.focus('#fTitle'); await pg.set_viewport_size({"width": 390, "height": 470}); await pg.wait_for_timeout(600)
    r = await pg.evaluate("(()=>{const p=document.querySelector('#panel').getBoundingClientRect(), f=document.querySelector('#fTitle').getBoundingClientRect(); return [p.top,p.bottom,f.top,f.bottom,innerHeight]})()")
    check(abs(r[1] - r[4]) <= 2, f'panel sits on the keyboard (bottom {r[1]} vs {r[4]})')
    check(r[0] >= 0 and r[2] >= r[0] and r[3] <= r[1], f'focused field visible inside the panel {r}')
    await ctx.close()

FAKE_VV = """
(() => {
  const vv = new EventTarget(); vv.width = innerWidth; vv.height = innerHeight; vv.offsetTop = 0; vv.offsetLeft = 0; vv.scale = 1; vv.pageTop = 0;
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  window.__kb = (h, top = 0) => { vv.height = h; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')); };
})();"""
@test
async def ios_style_keyboard_keeps_app_and_sheet_in_view(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')), extra_init=FAKE_VV)
    await pg.focus('#todoInput'); await pg.evaluate("window.__kb(470)"); await pg.wait_for_timeout(300)
    r = await pg.evaluate("(()=>({app: document.querySelector('#app').getBoundingClientRect().height, typing: document.querySelector('#app').classList.contains('typing'), field: document.querySelector('#todoInput').getBoundingClientRect().bottom}))()")
    check(abs(r['app'] - 470) <= 2, f'app sized to the visible area ({r["app"]})')
    check(r['typing'] and r['field'] <= 470, f'tab bar hidden and field visible {r}')
    await pg.evaluate("document.activeElement.blur(); window.__kb(844)"); await pg.wait_for_timeout(300)
    await pg.click('#barSettings'); await pg.wait_for_timeout(500)
    await pg.focus('#fDays'); await pg.evaluate("window.__kb(470)"); await pg.wait_for_timeout(500)
    p = await pg.evaluate("(()=>{const l=document.querySelector('#sheet').getBoundingClientRect(), p=document.querySelector('#panel').getBoundingClientRect(), f=document.querySelector('#fDays').getBoundingClientRect(); return [l.height,p.bottom,f.bottom]})()")
    check(abs(p[0] - 470) <= 2 and p[1] <= 471 and p[2] <= 471, f'sheet layer matches the visible area {p}')
    await ctx.close()

# ---------- layout ----------
@test
async def layout_fits_phone_tablet_desktop(b, url):
    seed = state(trip('t1', 'A very long destination name here', '#2a4d8f', places=[{"id": "a", "name": "An extremely long activity name that should never push the layout wider than the screen", "kind": "sight", "day": 0}, {"id": "b", "name": "Pool idea", "kind": "food", "day": None}], todos=[{"id": "x", "text": "Averyveryveryveryveryverylongwordwithoutspaces", "done": False}]))
    for w, h in [(320, 568), (390, 844), (768, 1024), (1280, 800)]:
        ctx, pg = await new_page(b, url, seed=seed, w=w, h=h, touch=w < 1000)
        for sec in ['today', 'plan', 'journal']:
            await pg.click(f'#tabbar [data-tab="{sec}"]'); await pg.wait_for_timeout(450)
            bad = await pg.evaluate("""(()=>{const out=[]; const sc=document.querySelector('.screen:not([hidden])');
              if (sc.scrollWidth > sc.clientWidth + 1) out.push('overflow-x '+sc.scrollWidth+'>'+sc.clientWidth);
              document.querySelectorAll('.screen:not([hidden]) button, .appbar button:not([hidden]), .tabbar button').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width && r.height && (r.height<40 || r.width<40) && !e.closest('.hscroll')) out.push((e.className||e.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height));});
              const ab=document.querySelector('.appbar').getBoundingClientRect(); if (ab.top < 0) out.push('header off screen');
              return out.slice(0,5);})()""")
            check(not bad, f'{w}x{h} {sec}: {bad}')
        await pg.screenshot(path=str(TMP / f'layout_{w}.png'))
        await ctx.close()

@test
async def no_demo_or_example_content(b, url):
    ctx, pg = await new_page(b, url)
    await pg.click('.empty [data-sheet="newtrip"]'); await pg.wait_for_timeout(400); await pg.fill('#fTitle', 'Bern'); await pg.click('[data-trip-create]'); await pg.wait_for_timeout(600)
    seen = ''
    for sec in ['today', 'plan', 'journal']:
        await pg.click(f'#tabbar [data-tab="{sec}"]'); await pg.wait_for_timeout(400); seen += (await pg.inner_text('#stage')).lower()
    for phrase in ['example', 'ideas to start', 'need ideas', 'sunset viewpoint', 'local breakfast', 'passport expiry']:
        check(phrase not in seen, f'found "{phrase}"')
    check(not await pg.query_selector('#barAdd'), 'no add button in the header')
    await ctx.close()

# ---------- settings, tour, journal menu, undo ----------
@test
async def tour_settings_and_motion_preference(b, url):
    ctx, pg = await new_page(b, url)
    await pg.click('[data-tour]'); await pg.wait_for_timeout(400)
    while not await pg.query_selector('[data-tour-done]'): await pg.click('[data-tour-step]:not([disabled]):last-child'); await pg.wait_for_timeout(250)
    await pg.click('[data-tour-done]'); await pg.wait_for_timeout(500)
    check(not await pg.query_selector('.tour-card'), 'tour suggestion gone after finishing')
    await pg.click('#barSettings'); await pg.wait_for_timeout(300)
    check(await pg.is_visible('#sheet [data-tour]'), 'tour can be reopened from settings')
    await pg.click('[data-motion="reduce"]'); await pg.wait_for_timeout(200)
    await pg.reload(); await pg.wait_for_timeout(600)
    check(await pg.evaluate("document.documentElement.classList.contains('reduce-motion')"), 'reduce motion remembered')
    await ctx.close()

@test
async def journal_menu_filters_and_sorts_stamps(b, url):
    places = [stamped('a', 'Zeta bar', 'food', 0, '2026-09-26T20:00'), stamped('b', 'Alpha cafe', 'food', 0, '2026-09-26T09:00'), stamped('c', 'Castle', 'sight', 1, '2026-09-27T11:00', 'loved')]
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome', start='2026-09-26', places=places)))
    await pg.click('#tabbar [data-tab="journal"]'); await pg.wait_for_timeout(400)
    await pg.click('[data-sheet="stamps"]'); await pg.wait_for_timeout(400)
    check(await texts(pg, '.stamplist b') == ['Castle', 'Zeta bar', 'Alpha cafe'], 'newest first')
    await pg.click('[data-sfilter="food"]'); await pg.wait_for_timeout(200)
    check(await texts(pg, '.stamplist b') == ['Zeta bar', 'Alpha cafe'], 'filtered to food')
    await pg.click('[data-ssort="az"]'); await pg.wait_for_timeout(200)
    check(await texts(pg, '.stamplist b') == ['Alpha cafe', 'Zeta bar'], 'sorted A to Z')
    await pg.click('.stamplist button'); await pg.wait_for_timeout(400)
    check(await pg.inner_text('#sheetTitle') == 'Details', 'opens details')
    await pg.click('[data-close-sheet]'); await pg.wait_for_timeout(400)
    check(await pg.inner_text('#sheetTitle') == 'All stamps', 'back returns to the list')
    await ctx.close()

@test
async def details_delete_and_undo(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome', places=[{"id": "a", "name": "Colosseum", "kind": "sight", "day": 0}])))
    await pg.click('.cards [data-open]'); await pg.wait_for_timeout(400)
    await pg.click('[data-set-kind="museum"]'); await pg.click('[data-set-slot="evening"]'); await pg.wait_for_timeout(200)
    await pg.fill('#pName', 'Colosseum tour'); await pg.click('#pNote'); await pg.wait_for_timeout(200)
    await pg.click('[data-remove]'); await pg.wait_for_timeout(500)
    check(not (await stored(pg))['trips'][0]['places'], 'deleted')
    await pg.click('#toast [data-undo]'); await pg.wait_for_timeout(400)
    p = (await stored(pg))['trips'][0]['places'][0]
    check(p['name'] == 'Colosseum tour' and p['kind'] == 'museum' and p['slot'] == 'evening', f'undo restores the edited item {p}')
    await pg.click('#barUndo'); await pg.wait_for_timeout(300)
    check((await stored(pg))['trips'][0]['places'][0]['name'] == 'Colosseum', 'header undo steps back through the rename')
    await ctx.close()

# ---------- header, trip card and journal postmarks ----------
@test
async def google_maps_import_is_gone(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')))
    await pg.click('#tabbar [data-tab="plan"]'); await pg.wait_for_timeout(400)
    await pg.click('#barSettings'); await pg.wait_for_timeout(400)
    html = await pg.evaluate("document.documentElement.outerHTML")
    check('data-sheet="gmaps"' not in html and 'Import from Google Maps' not in html, 'no Google Maps import buttons anywhere')
    src = await pg.evaluate("[...document.scripts].map(s=>s.textContent).join('')")
    check('gmapsSheet' not in src and 'takeout.google.com' not in src, 'import code removed from the app')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def header_has_room_at_the_top_and_trip_card_has_no_cog(b, url):
    for w, h in [(360, 740), (390, 844), (768, 1024), (1280, 800)]:
        ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')), w=w, h=h, touch=w < 1000)
        gap = await pg.evaluate("(()=>{const e=document.querySelector('#eyebrow').getBoundingClientRect(), a=document.querySelector('#app').getBoundingClientRect(); return e.top-a.top})()")
        check(gap >= 18, f'{w}px: trip name sits {gap:.0f}px below the top edge')
        check(await pg.locator('.hero').count() == 1 and await pg.locator('.hero svg, .hero-gear').count() == 0, f'{w}px: no cog in the trip card')
        await pg.click('.hero'); await pg.wait_for_timeout(400)
        check(await pg.inner_text('#sheetTitle') == 'Trip settings', 'trip card still opens trip settings')
        await ctx.close()

POSTMARK_CHECK = """[...document.querySelectorAll('#s-journal .postmark')].map(pm=>{
  const tf=pm.style.transform; pm.style.transform='none';
  const r=pm.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, R=r.width/2-6.5; let worst=-99;
  pm.querySelectorAll('b,i').forEach(t=>{const q=t.getBoundingClientRect();
    for (const [x,y] of [[q.left,q.top],[q.right,q.top],[q.left,q.bottom],[q.right,q.bottom]]) worst=Math.max(worst, Math.hypot(x-cx,y-cy)-R)});
  pm.style.transform=tf; return [pm.textContent, worst]})"""

@test
async def journal_postmarks_keep_text_inside_the_ring(b, url):
    # four 60-day trips with stamps on days 0, 30 and 59 draw all twelve month labels, in several languages
    for loc in ['en-GB', 'de-DE', 'fr-FR', 'ru-RU', 'pt-PT']:
        for start in ['2026-01-28', '2026-04-28', '2026-07-28', '2026-10-28']:   # days 0, 30, 59 land in consecutive months
            seed = state(trip('t1', 'Long trip', start=start, days=60, places=[stamped('a', 'A', 'sight', 0), stamped('b', 'B', 'sight', 30), stamped('c', 'C', 'sight', 59)]))
            ctx, pg = await new_page(b, url, seed=seed, locale=loc)
            await pg.click('#tabbar [data-tab="journal"]'); await pg.wait_for_timeout(500)
            marks = await pg.evaluate(POSTMARK_CHECK)
            check(len(marks) == 3, f'{loc}: three postmarks drawn')
            for text, worst in marks:
                check(worst <= 0, f'{loc} {start}: "{text}" pokes {worst:.1f}px past the inner ring')
            check(not pg.errors, pg.errors)
            await ctx.close()

# ---------- installable app ----------
@test
async def pwa_manifest_service_worker_and_offline(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('t1', 'Rome')))
    man = await pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check(man['display'] == 'standalone' and any(i.get('purpose') == 'maskable' for i in man['icons']), 'manifest ok')
    for i in man['icons']:
        st = await pg.evaluate(f"fetch({i['src']!r}).then(r=>r.status)"); check(st == 200, f'icon {i["src"]}')
    await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(800)
    check(await pg.evaluate("!!navigator.serviceWorker.controller"), 'service worker controls the page')
    await ctx.set_offline(True); await pg.reload(); await pg.wait_for_timeout(800)
    check(await title(pg) == 'Today' and 'ROME' in (await pg.inner_text('#eyebrow')).upper(), 'works offline with saved data')
    await ctx.close()

# ---------- travelling together: two phones swapping files ----------
import subprocess
@test
async def merge_engine_unit_tests(b, url):
    r = subprocess.run(['node', str(ROOT / 'tests' / 'test_merge.js')], capture_output=True, text=True, timeout=120)
    check(r.returncode == 0, r.stdout[-1500:] + r.stderr[-500:])

async def open_settings(pg):
    if await pg.evaluate("document.querySelector('#sheet').open"): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    if await pg.is_visible('#barTrips'): await pg.click('#barTrips'); await pg.wait_for_timeout(450)
    await pg.click('#barSettings'); await pg.wait_for_timeout(400)

async def send_file(pg, name=None, fname='changes.json'):
    """Settings → Send your changes → save the file (headless Chromium has no share sheet)."""
    await open_settings(pg)
    await pg.click('#sheet [data-sheet="send"]'); await pg.wait_for_timeout(300)
    if name is not None: await pg.fill('#syName', name); await pg.wait_for_timeout(500)
    await pg.wait_for_selector('[data-sync-save]:not(.busy)')
    async with pg.expect_download() as dl:
        await pg.click('[data-sync-save]')
    d = await dl.value; path = TMP / fname; await d.save_as(path); await pg.wait_for_timeout(300)
    SUGGESTED[str(path)] = d.suggested_filename
    return path
SUGGESTED = {}

async def receive_file(pg, path, apply=True):
    await open_settings(pg)
    await pg.click('#sheet [data-sheet="receive"]'); await pg.wait_for_timeout(300)
    await pg.set_input_files('#importFile', str(path)); await pg.wait_for_timeout(500)
    if apply and await pg.query_selector('#sheet [data-import-go]'):
        await pg.click('#sheet [data-import-go]'); await pg.wait_for_timeout(600)

def trips_of(s): return sorted(s['trips'], key=lambda t: t['id'])

@test
async def two_phones_share_changes_both_ways(b, url):
    seed = state(trip('lis', 'Lisbon', '#0f766e', places=[{"id": "p1", "name": "Alfama walk", "kind": "walk", "day": 0}, {"id": "p2", "name": "Tram 28", "kind": "activity", "day": None}]))
    ca, a = await new_page(b, url, seed=seed)
    cb, bb = await new_page(b, url)
    f1 = await send_file(a, 'Alex', 'first.json')
    check(json.loads(f1.read_text())['sync']['name'] == 'Alex', 'the file carries the sender name')
    check('Alex' in SUGGESTED[str(f1)] and SUGGESTED[str(f1)].endswith('.json'), f'file name says who it is from: {SUGGESTED[str(f1)]}')
    await receive_file(bb, f1, apply=False)
    check('From Alex' in await bb.inner_text('#sheet'), 'preview says who sent it')
    check('New trip' in await bb.inner_text('.changelist'), 'preview lists the new trip')
    check(not (await stored(bb) or {}).get('trips'), 'nothing changes before bringing it in')
    await bb.click('#sheet [data-import-go]'); await bb.wait_for_timeout(600)
    check('same trips' in await bb.inner_text('#sheet'), f'done screen: {await bb.inner_text("#sheet")}')
    await bb.click('[data-sync-ok]'); await bb.wait_for_timeout(400)
    check([t['title'] for t in (await stored(bb))['trips']] == ['Lisbon'], 'trip arrived on the second phone')
    # both change things, independently
    await a.click('[data-open-trip="lis"]'); await a.wait_for_timeout(500)
    await a.click('#tabbar [data-tab="plan"]'); await a.wait_for_timeout(400)
    await a.fill('#qaInput', 'Time Out Market'); await a.press('#qaInput', 'Enter'); await a.wait_for_timeout(300)
    await bb.click('[data-open-trip="lis"]'); await bb.wait_for_timeout(500)
    await bb.fill('#todoInput', 'Buy Viva Viagem card'); await bb.press('#todoInput', 'Enter'); await bb.wait_for_timeout(300)
    await bb.click('#tabbar [data-tab="journal"]'); await bb.wait_for_timeout(400)
    await bb.click('.jrow:has-text("Alfama") .stampbtn'); await bb.wait_for_timeout(300)
    f2 = await send_file(bb, 'Sam', 'second.json')
    await receive_file(a, f2)
    txt = await a.inner_text('#sheet')
    check('Sam' in txt and "doesn't have" in txt, f'asks to send back the changes Sam lacks: {txt}')
    await a.click('[data-sync-back]'); await a.wait_for_timeout(400)
    check(await a.is_visible('#sheet [data-sync-save]'), 'send sheet opens straight from there')
    await a.keyboard.press('Escape'); await a.wait_for_timeout(400)
    sa = await stored(a); t = sa['trips'][0]
    check(any(p['name'] == 'Time Out Market' for p in t['places']) and [x['text'] for x in t['todos']] == ['Buy Viva Viagem card'], 'both people\'s changes on phone A')
    check(next(p for p in t['places'] if p['id'] == 'p1')['visited'], "Sam's stamp arrived")
    # the home screen reminds A that Sam hasn't got A's changes
    check('not sent to Sam' in await a.inner_text('#s-home'), 'home shows the unsent reminder')
    f3 = await send_file(a, None, 'third.json')
    check('not sent' not in await a.inner_text('#s-home'), 'reminder gone once sent')
    await receive_file(bb, f3)
    check('same trips' in await bb.inner_text('#sheet'), 'B is told both are in step')
    check(trips_of(await stored(a)) == trips_of(await stored(bb)), 'both phones hold identical trips')
    # a delete travels too, and survives a refresh
    await bb.click('[data-sync-ok]'); await bb.wait_for_timeout(300)
    await bb.click('[data-open-trip="lis"]'); await bb.wait_for_timeout(400)
    await bb.click('#barSettings'); await bb.wait_for_timeout(400); await bb.click('[data-trip-delete]'); await bb.wait_for_timeout(300)
    check('also removed for Alex' in await bb.inner_text('#sheet'), 'deleting a shared trip says it reaches the other phone')
    await bb.click('[data-confirm-yes]'); await bb.wait_for_timeout(500)
    await bb.reload(); await bb.wait_for_timeout(800)
    check((await stored(bb))['sync']['stamps'].get('trips/lis'), 'the delete is remembered after a refresh')
    f4 = await send_file(bb, None, 'fourth.json')
    await receive_file(a, f4, apply=False)
    check('Deleted' in await a.inner_text('.changelist'), 'A sees the delete in the preview')
    await a.click('#sheet [data-import-go]'); await a.wait_for_timeout(600)
    check(not (await stored(a))['trips'], 'trip deleted on A as well')
    check(not a.errors and not bb.errors, a.errors + bb.errors)
    await ca.close(); await cb.close()

@test
async def bringing_in_changes_can_be_undone_and_redone(b, url):
    ca, a = await new_page(b, url, seed=state(trip('rom', 'Rome')))
    cb, bb = await new_page(b, url, seed=state(trip('osl', 'Oslo')))
    f = await send_file(a, 'Alex', 'undo.json')
    await receive_file(bb, f)
    check(sorted(t['title'] for t in (await stored(bb))['trips']) == ['Oslo', 'Rome'], 'combined, own trip kept')
    await bb.click('[data-sync-ok]'); await bb.wait_for_timeout(300)
    await bb.click('#barUndo'); await bb.wait_for_timeout(500)
    sb = await stored(bb)
    check([t['title'] for t in sb['trips']] == ['Oslo'], 'undo removes what was brought in')
    check(not any(k.startswith('trips/rom') for k in sb['sync']['stamps']), 'and forgets it, so it is not sent back as deleted')
    await receive_file(bb, f)
    check(sorted(t['title'] for t in (await stored(bb))['trips']) == ['Oslo', 'Rome'], 'the same file can be brought in again')
    await ca.close(); await cb.close()

@test
async def wrong_file_and_own_file_are_handled(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('rom', 'Rome')))
    await pg.click('[data-todo-toggle]') if await pg.query_selector('[data-todo-toggle]') else None
    await pg.fill('#todoInput', 'Tickets'); await pg.press('#todoInput', 'Enter'); await pg.wait_for_timeout(300)
    before = await stored(pg)
    bad = TMP / 'notes.txt'; bad.write_text('just some notes')
    await receive_file(pg, bad)
    check(await pg.is_visible('.notice.error'), 'error shown for a file that is not from the app')
    await pg.set_input_files('#importFile', str(TMP / 'notes.txt')); await pg.wait_for_timeout(400)
    check(await stored(pg) == before, 'nothing changed')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    own = await send_file(pg, None, 'own.json')
    await receive_file(pg, own, apply=False)
    txt = await pg.inner_text('#sheet')
    check('this phone' in txt and 'already have everything' in txt, f'own file: {txt}')
    await pg.click('[data-sync-ok]'); await pg.wait_for_timeout(300)
    check((await stored(pg))['trips'] == before['trips'], 'trips unchanged')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def deleting_everything_here_never_deletes_on_the_other_phone(b, url):
    ca, a = await new_page(b, url, seed=state(trip('rom', 'Rome'), trip('osl', 'Oslo')))
    cb, bb = await new_page(b, url)
    await receive_file(bb, await send_file(a, 'Alex', 'w1.json'))
    await bb.click('[data-sync-ok]'); await bb.wait_for_timeout(300)
    await bb.click('#barSettings'); await bb.wait_for_timeout(300)
    check('Alex keeps theirs' in await bb.inner_text('.danger-zone'), 'wipe explains the other phone keeps its copy')
    await bb.click('[data-wipe]'); await bb.wait_for_timeout(300); await bb.click('[data-confirm-yes]'); await bb.wait_for_timeout(500)
    check(not (await stored(bb))['trips'], 'wiped here')
    await receive_file(a, await send_file(bb, 'Sam', 'w2.json'), apply=False)
    check('already have everything' in await a.inner_text('#sheet'), f'the wiped phone\'s file is read and deletes nothing: {await a.inner_text("#sheet")}')
    check(len((await stored(a))['trips']) == 2, 'the other phone keeps every trip')
    await receive_file(bb, await send_file(a, None, 'w3.json'))
    check(len((await stored(bb))['trips']) == 2, 'and can send them back')
    await ca.close(); await cb.close()

SHARE_STUB = """window.__shared = []; navigator.canShare = f => !!(f && f.files && f.files.every(x => x.type === 'text/plain'));
navigator.share = async d => { window.__shared.push({ name: d.files[0].name, text: await d.files[0].text() }); };"""
@test
async def share_sheet_is_used_when_available(b, url):
    ctx, pg = await new_page(b, url, seed=state(trip('rom', 'Rome')), extra_init=SHARE_STUB)
    await open_settings(pg)
    await pg.click('#sheet [data-sheet="send"]'); await pg.wait_for_selector('[data-sync-share]:not(.busy)')
    check(await pg.is_visible('[data-sync-save]'), 'saving stays available as a second option')
    await pg.click('[data-sync-share]'); await pg.wait_for_timeout(500)
    shared = await pg.evaluate('window.__shared')
    check(len(shared) == 1 and shared[0]['name'].endswith('.txt'), f'falls back to a text file when JSON cannot be shared: {shared and shared[0]["name"]}')
    check(json.loads(shared[0]['text'])['state']['trips'][0]['title'] == 'Rome', 'shared file holds the trips')
    check(not await pg.is_visible('#sheet'), 'sheet closes after sharing')
    await pg.click('#barSettings'); await pg.wait_for_timeout(300)
    check('Last sent' in await pg.inner_text('#sheet'), 'settings show when changes were last sent')
    await ctx.close()

@test
async def android_share_target_opens_the_preview(b, url):
    ca, a = await new_page(b, url, seed=state(trip('rom', 'Rome')))
    f = await send_file(a, 'Alex', 'shared.json'); await ca.close()
    ctx, pg = await new_page(b, url, seed=state(trip('osl', 'Oslo')))
    man = await pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check(man['share_target']['method'] == 'POST' and man['share_target']['params']['files'][0]['name'] == 'file', 'manifest declares the share target')
    await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(700)
    await pg.evaluate("""(()=>{const f=document.createElement('form'); f.method='POST'; f.enctype='multipart/form-data'; f.action='share-target';
      const i=document.createElement('input'); i.type='file'; i.name='file'; i.id='stf'; f.appendChild(i); document.body.appendChild(f);})()""")
    await pg.set_input_files('#stf', str(f))
    await pg.evaluate("document.querySelector('#stf').form.submit()"); await pg.wait_for_timeout(1500)
    txt = await pg.inner_text('#sheet')
    check('From Alex' in txt and 'Rome' in txt, f'preview opens with the shared file: {txt[:200]}')
    check('shared=' not in pg.url, f'address cleaned up: {pg.url}')
    await pg.click('#sheet [data-import-go]'); await pg.wait_for_timeout(600)
    check(sorted(t['title'] for t in (await stored(pg))['trips']) == ['Oslo', 'Rome'], 'brought in')
    check(not pg.errors, pg.errors)
    await ctx.close()

@test
async def sync_sheets_fit_every_width_and_keyboard(b, url):
    ca, a = await new_page(b, url, seed=state(trip('rom', 'A rather long destination name', '#6b4fa0', places=[{"id": "p", "name": "x", "kind": "food", "day": 0}])))
    f = await send_file(a, 'Alexandra-Maria', 'fit.json'); await ca.close()
    for w, h in [(320, 568), (768, 1024), (1280, 800)]:
        ctx, pg = await new_page(b, url, seed=state(trip('osl', 'Oslo')), w=w, h=h, touch=w < 1000)
        await receive_file(pg, f, apply=False)
        for phase in ['preview', 'done', 'send']:
            if phase == 'done': await pg.click('#sheet [data-import-go]'); await pg.wait_for_timeout(600)
            if phase == 'send': await pg.click('[data-sync-back]'); await pg.wait_for_selector('[data-sync-save]:not(.busy)')
            bad = await pg.evaluate("""(()=>{const out=[], p=document.querySelector('#panel'), body=document.querySelector('#sheetBody');
              if (body.scrollWidth > body.clientWidth + 1) out.push('overflow-x');
              p.querySelectorAll('button, label.btn, input').forEach(e=>{const r=e.getBoundingClientRect(); if (r.width && (r.height < 40 || r.width < 40)) out.push((e.className||e.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height));});
              return out;})()""")
            check(not bad, f'{w} {phase}: {bad}')
            await pg.screenshot(path=str(TMP / f'sync_{phase}_{w}.png'))
        # keyboard open over the name field
        await pg.focus('#syName'); await pg.set_viewport_size({"width": w, "height": int(h * .55)}); await pg.wait_for_timeout(600)
        r = await pg.evaluate("(()=>{const p=document.querySelector('#panel').getBoundingClientRect(), f=document.querySelector('#syName').getBoundingClientRect(); return [p.top,p.bottom,f.top,f.bottom,innerHeight]})()")
        check(r[2] >= r[0] and r[3] <= r[1] and r[1] <= r[4] + 1, f'{w}: name field visible with the keyboard open {r}')
        check(not pg.errors, pg.errors)
        await ctx.close()

# ---------- runner ----------
async def main():
    httpd, url = serve()
    only = sys.argv[1:]
    results = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for t in TESTS:
            if only and not any(o in t.__name__ for o in only): continue
            try:
                await asyncio.wait_for(t(b, url), 60); results.append((t.__name__, True, ''))
                print(f'PASS  {t.__name__}')
            except Exception as e:
                results.append((t.__name__, False, str(e))); print(f'FAIL  {t.__name__}: {e}')
                if os.environ.get('TRACE'): traceback.print_exc()
        await b.close()
    httpd.shutdown()
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)} passed, {len(failed)} failed')
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    asyncio.run(main())
