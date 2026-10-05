#!/usr/bin/env node
/* Tests the sync merge with the app's own code (core + the pure part of the sync module).
   Run: node tests/test_merge.js   (test_app.py runs it too) */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const core = fs.readFileSync(path.join(SRC, 'app.1-core.js'), 'utf8');
const syncSrc = fs.readFileSync(path.join(SRC, 'app.1b-sync.js'), 'utf8');
const pure = syncSrc.slice(syncSrc.indexOf('/*@pure-start*/'), syncSrc.indexOf('/*@pure-end*/'));
if (!pure) throw new Error('pure markers missing');
const noop = () => {};
const stubs = {
  window: { matchMedia: () => ({ matches: false, addEventListener: noop }), addEventListener: noop },
  document: { documentElement: { classList: { toggle: noop }, style: { setProperty: noop } }, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, indexedDB: undefined
};
const api = new Function(...Object.keys(stubs), core + '\n' + pure + '\nreturn { normState, mergeStates, diffStamps, shadowOf, maxStampTime, changeSummary, thingKey, cleanStamps };')(...Object.values(stubs));
const { normState, mergeStates, diffStamps, shadowOf, maxStampTime, changeSummary, cleanStamps } = api;

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = a => a[Math.floor(rnd() * a.length)];
let fakeNow = Date.parse('2026-10-01T10:00:00Z');
const clone = o => JSON.parse(JSON.stringify(o));

class Phone {
  constructor(dev, st, skew = 0){
    this.dev = dev; this.skew = skew; this.clock = 0; this.stamps = {};
    this.state = normState(clone(st || { v: 6, trips: [] })); this.shadow = shadowOf(this.state);
  }
  tick(){ const t = Math.max(fakeNow + this.skew, this.clock + 1); this.clock = t; return t.toString(36).padStart(9, '0') + this.dev; }
  stamp(){ let s = null; this.shadow = diffStamps(this.shadow, this.state, this.stamps, () => s || (s = this.tick())); }
  edit(fn){ fakeNow += 1000; fn(this.state); this.state = normState(this.state); this.stamp(); return this; }
  file(){ this.stamp(); return clone({ state: this.state, stamps: this.stamps }); }
  receive(f){
    fakeNow += 1000;
    const res = mergeStates(this.state, this.stamps, normState(f.state), cleanStamps(f.stamps));
    this.state = normState(res.state); this.stamps = res.stamps;
    this.clock = Math.max(this.clock, maxStampTime(res.stamps));
    this.shadow = shadowOf(res.state); this.stamp();
    return this;
  }
  trip(id = 't1'){ return this.state.trips.find(t => t.id === id); }
  place(id, tid = 't1'){ const t = this.trip(tid); return t && t.places.find(p => p.id === id); }
}
const swap = (a, b) => { const fa = a.file(), fb = b.file(); a.receive(fb); b.receive(fa); };
const same = (a, b) => JSON.stringify(a.state) === JSON.stringify(b.state);
const base = () => ({ v: 6, trips: [{ id: 't1', title: 'Lisbon', color: '#0f766e', start: '2027-05-01', days: 5,
  places: [{ id: 'p1', name: 'Alfama walk', kind: 'walk', day: 0 }, { id: 'p2', name: 'Tram 28', kind: 'activity', day: null }, { id: 'p3', name: 'Pastéis', kind: 'food', day: 1 }],
  todos: [{ id: 'd1', text: 'Passport', done: false }] }] });
/* both phones start from the same trip, the way they do after the first file */
function pair(skewB = 0){ const a = new Phone('aaaa'); a.edit(s => { s.trips = normState(base()).trips; }); const b = new Phone('bbbb', null, skewB); b.receive(a.file()); return [a, b]; }

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ok = (c, m) => { if (!c) throw new Error(m); };

test('first file brings everything over', () => { const [a, b] = pair(); ok(same(a, b), 'identical after the first file'); });
test('different details of the same place both survive', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places[0].note = 'Go early'; });
  b.edit(s => { s.trips[0].places[0].slot = 'evening'; s.trips[0].places[0].day = 2; });
  swap(a, b);
  ok(same(a, b), 'converged');
  const p = a.place('p1'); ok(p.note === 'Go early' && p.slot === 'evening' && p.day === 2, JSON.stringify(p));
});
test('same detail: the newer change wins, whoever merges', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].title = 'Lisboa'; });
  b.edit(s => { s.trips[0].title = 'Lisbon & Sintra'; });
  swap(a, b);
  ok(same(a, b) && a.trip().title === 'Lisbon & Sintra', a.trip().title);
});
test('a delete reaches the other phone and stays deleted', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places = s.trips[0].places.filter(p => p.id !== 'p2'); });
  swap(a, b); swap(a, b); swap(b, a);
  ok(!a.place('p2') && !b.place('p2') && same(a, b), 'p2 gone everywhere');
});
test('an edit made after the other phone deleted it brings it back', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places = s.trips[0].places.filter(p => p.id !== 'p3'); });
  b.edit(s => { s.trips[0].places.find(p => p.id === 'p3').note = 'Best one at Belém'; });
  swap(a, b);
  ok(same(a, b) && a.place('p3') && a.place('p3').note === 'Best one at Belém', 'kept with the edit');
});
test('an older edit does not undo a newer delete', () => {
  const [a, b] = pair();
  b.edit(s => { s.trips[0].places.find(p => p.id === 'p3').note = 'old'; });
  a.edit(s => { s.trips[0].places = s.trips[0].places.filter(p => p.id !== 'p3'); });
  swap(a, b);
  ok(same(a, b) && !a.place('p3'), 'deleted');
});
test('deleting a whole trip while the other adds to it keeps the trip', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips = []; });
  b.edit(s => { s.trips[0].places.push({ id: 'p9', name: 'Sintra', kind: 'sight', day: 3 }); });
  swap(a, b);
  ok(same(a, b) && a.place('p9'), 'trip kept with the new place');
});
test('reordering on one phone and adding on the other keeps both', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places.reverse(); });
  b.edit(s => { s.trips[0].places.push({ id: 'p8', name: 'LX Factory', kind: 'shop', day: null }); });
  swap(a, b);
  const ids = a.trip().places.map(p => p.id).join();
  ok(same(a, b) && ids === 'p3,p2,p1,p8', ids);
});
test('stamps, notes and feelings merge', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places[0].visited = { at: '2027-05-01T10:00', note: '', feel: '' }; });
  swap(a, b);
  a.edit(s => { s.trips[0].places[0].visited.note = 'Lost in the alleys'; });
  b.edit(s => { s.trips[0].places[0].visited.feel = 'loved'; });
  swap(a, b);
  const v = a.place('p1').visited; ok(same(a, b) && v.note === 'Lost in the alleys' && v.feel === 'loved', JSON.stringify(v));
  b.edit(s => { s.trips[0].places[0].visited = null; });
  swap(a, b);
  ok(same(a, b) && a.place('p1').visited === null, 'unstamped everywhere');
});
test('concluding, wrap-up answers and stickers merge', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].concluded = { at: '2027-05-07T10:00:00Z' }; s.trips[0].summary.food = 'Pastéis'; });
  b.edit(s => { s.trips[0].summary.rating = 5; s.trips[0].stickers.push({ id: 's1', img: 'i1', x: .4, y: .5, s: .3, r: 0, shape: 'round' }); });
  swap(a, b);
  const t = a.trip(); ok(same(a, b) && t.concluded && t.summary.food === 'Pastéis' && t.summary.rating === 5 && t.stickers.length === 1, JSON.stringify(t.summary));
  a.edit(s => { s.trips[0].stickers[0].x = .8; }); b.edit(s => { s.trips[0].stickers[0].s = .6; });
  swap(a, b);
  ok(same(a, b) && a.trip().stickers[0].x === .8 && a.trip().stickers[0].s === .6, 'moved and resized');
});
test('two people decorating the same cover never lose a photo', () => {
  const [a, b] = pair();
  const add = (ph, pre) => ph.edit(s => { for (let i = 0; i < 8; i++) s.trips[0].stickers.push({ id: pre + i, img: pre + 'i' + i, x: .5, y: .5, s: .3, r: 0, shape: 'round' }); });
  add(a, 'a'); add(b, 'b'); swap(a, b);
  ok(same(a, b) && a.trip().stickers.length === 16, String(a.trip().stickers.length));
});
test('a phone whose clock runs behind still wins with a later edit', () => {
  const [a, b] = pair(-3600 * 1000);
  a.edit(s => { s.trips[0].title = 'From A'; });
  b.receive(a.file());
  b.edit(s => { s.trips[0].title = 'From B, after seeing A'; });
  swap(a, b);
  ok(same(a, b) && a.trip().title === 'From B, after seeing A', a.trip().title);
});
test('data from before syncing is combined, nothing lost', () => {
  const a = new Phone('aaaa', base());
  const b = new Phone('bbbb', { v: 6, trips: [base().trips[0], { id: 't2', title: 'Rome', color: '#b4532a', start: '2027-09-01', days: 4 }] });
  b.edit(s => { s.trips[0].places.push({ id: 'p7', name: 'Belém', kind: 'sight', day: null }); });
  swap(a, b);
  ok(same(a, b) && a.state.trips.length === 2 && a.place('p7'), 'union');
});
test('bringing in the same file twice changes nothing', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places[1].note = 'x'; });
  const f = a.file(); b.receive(f); const once = JSON.stringify(b.state); b.receive(f);
  ok(JSON.stringify(b.state) === once, 'idempotent');
});
test('shortening a trip moves later plans to the pool on both phones', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].days = 2; s.trips[0].places.forEach(p => { if (p.day >= 2) p.day = null; }); });
  b.edit(s => { s.trips[0].places.find(p => p.id === 'p2').day = 4; });
  swap(a, b); swap(a, b);
  ok(same(a, b) && a.place('p2').day === null, String(a.place('p2').day));
});
test('change summary describes trips', () => {
  const [a, b] = pair();
  a.edit(s => { s.trips[0].places.push({ id: 'n1', name: 'New', kind: 'food', day: null }); s.trips[0].places[0].note = 'e'; s.trips.push({ id: 't3', title: 'Porto', color: '#2a4d8f', start: '2027-06-01', days: 3 }); });
  const before = clone(b.state); b.receive(a.file());
  const sum = changeSummary(before, b.state);
  ok(sum.count === 3 && sum.trips.find(t => t.id === 't3').kind === 'new' && /1 new thing, 1 edited/.test(sum.trips.find(t => t.id === 't1').notes[0]), JSON.stringify(sum));
});

/* random edits on both phones, files swapped in random order: both must always end identical */
const OPS = [
  s => { const t = pick(s.trips); if (t) t.places.push({ id: 'r' + Math.floor(rnd() * 1e9).toString(36), name: 'Place ' + Math.floor(rnd() * 99), kind: pick(['food', 'sight', 'walk']), day: pick([null, 0, 1, 2]) }); },
  s => { const t = pick(s.trips); const p = t && pick(t.places); if (p) p.note = 'n' + Math.floor(rnd() * 99); },
  s => { const t = pick(s.trips); const p = t && pick(t.places); if (p) p.day = pick([null, 0, 1, 2, 3, 4]); },
  s => { const t = pick(s.trips); const p = t && pick(t.places); if (p) p.visited = p.visited ? null : { at: '2027-05-01T10:00', note: '', feel: '' }; },
  s => { const t = pick(s.trips); const p = t && pick(t.places); if (p && p.visited) p.visited.feel = pick(['loved', 'meh', '']); },
  s => { const t = pick(s.trips); if (t && t.places.length) t.places.splice(Math.floor(rnd() * t.places.length), 1); },
  s => { const t = pick(s.trips); if (t && t.places.length > 1){ const [x] = t.places.splice(0, 1); t.places.splice(Math.floor(rnd() * t.places.length), 0, x); } },
  s => { const t = pick(s.trips); if (t) t.title = pick(['Lisbon', 'Lisboa', 'Porto', 'Coast']); },
  s => { const t = pick(s.trips); if (t) t.days = pick([2, 3, 5, 7]); },
  s => { const t = pick(s.trips); if (t) t.todos.push({ id: 'd' + Math.floor(rnd() * 1e9).toString(36), text: 'todo', done: false }); },
  s => { const t = pick(s.trips); const d = t && pick(t.todos); if (d) d.done = !d.done; },
  s => { const t = pick(s.trips); if (t) t.concluded = t.concluded ? null : { at: '2027-05-07T10:00:00Z' }; },
  s => { if (rnd() < .3 && s.trips.length) s.trips.splice(Math.floor(rnd() * s.trips.length), 1); },
  s => { if (rnd() < .3) s.trips.push({ id: 'x' + Math.floor(rnd() * 1e9).toString(36), title: 'New', color: '#57534e', start: '2027-01-01', days: 3, places: [], todos: [] }); }
];
test('random edits always converge (400 rounds)', () => {
  for (let run = 0; run < 40; run++){
    const [a, b] = pair(Math.floor((rnd() - .5) * 7200e3));
    for (let round = 0; round < 10; round++){
      for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) a.edit(pick(OPS));
      for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) b.edit(pick(OPS));
      const r = rnd();
      if (r < .3) b.receive(a.file());
      else if (r < .6) a.receive(b.file());
      else {
        swap(a, b);
        if (!same(a, b)) swap(a, b);   // a fix made while tidying up after a merge needs one more swap
        ok(same(a, b), `run ${run} round ${round}: diverged\n${JSON.stringify(a.state)}\n${JSON.stringify(b.state)}`);
      }
    }
  }
});

let failed = 0;
for (const [name, fn] of tests){
  try { fn(); console.log('PASS  merge: ' + name); }
  catch (e) { failed++; console.log('FAIL  merge: ' + name + ': ' + e.message.slice(0, 2000)); }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
