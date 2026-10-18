// "+" sheet: search a place or a city, or use the phone's location. Israeli places come from the bundled gazetteer (instant,
// works offline, knows every locality by its Hebrew name); the rest of the world comes from Open-Meteo geocoding.
import { searchPlaces } from './api.js';
import { distKm, loadGazetteer, samePlace, searchLocal } from './gazetteer.js';
import { esc, icon, openSheet, closeSheet, $ } from './dom.js';

export function openAddSheet({ existing, gpsOn, onAdd, onGps }) { // existing: [{ key, lat, lon }]
  const sheet = openSheet(`<div class="grab"></div>
    <div class="gs-top"><h2>הוספת מקום</h2><button class="gp-menu" data-act="close-sheet" aria-label="סגור">${icon('gi-close')}</button></div>
    <div class="gp-search">${icon('gi-search')}<input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="חיפוש עיר או מקום" aria-label="חיפוש עיר או מקום"></div>
    ${gpsOn ? '' : `<button class="gp-add" data-act="gps"><span class="pl">${icon('gi-pin')}</span><span>המיקום שלי</span></button>`}
    <div class="gp-res" id="res"><div class="gp-msg">התחל להקליד שם של עיר, ישוב או מקום.</div></div>`);

  const input = $('#q', sheet), res = $('#res', sheet);
  let timer = null, seq = 0, results = [];
  const have = new Set(existing.map((p) => p.key));
  const isDone = (r) => have.has(r.key) || existing.some((p) => distKm(p, r) < 1.2); // same place under another key
  loadGazetteer();
  const hint = '<div class="gp-msg">התחל להקליד שם של עיר, ישוב או מקום.</div>';
  const show = (html) => { res.innerHTML = html; };

  const rowsHtml = () => results.map((r, i) => {
    const done = isDone(r);
    return `<button class="gp-pr" data-i="${i}" ${done ? 'disabled' : ''} aria-label="${done ? 'כבר ברשימה: ' : 'הוסף: '}${esc(r.name)}"><span class="nm"><span>${esc(r.name)}</span><span class="sub">${esc(r.sub)}</span></span><span class="gp-addic${done ? ' done' : ''}">${icon(done ? 'gi-check' : 'gi-plus')}</span></button>`;
  }).join('');

  /** The online half of a search (the local half is already on screen): merge, then drop what the gazetteer already has. */
  async function run(q, my) {
    const on = await searchPlaces(q).then((r) => ({ ok: true, r }), () => ({ ok: false, r: [] }));
    const local = await searchLocal(q, 8);
    if (my !== seq) return;
    results = local.concat(on.r.filter((o) => !local.some((p) => samePlace(p, o)))).slice(0, 14);
    if (!results.length) show(`<div class="gp-msg">${on.ok ? 'לא נמצא מקום בשם הזה. נסה איות אחר.' : 'החיפוש נכשל. בדוק את החיבור לאינטרנט ונסה שוב.'}</div>`);
    else show(rowsHtml() + (on.ok ? '' : '<div class="gp-msg">אין חיבור לאינטרנט, מוצגים רק מקומות בישראל.</div>'));
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim(), my = ++seq;
    if (q.length < 2) { show(hint); return; }
    searchLocal(q, 8).then((local) => {
      if (my !== seq) return;
      results = local;
      show(local.length ? rowsHtml() + '<div class="gp-msg">מחפש עוד…</div>' : '<div class="gp-msg">מחפש…</div>');
    });
    timer = setTimeout(() => run(q, my), 300);
  });
  res.addEventListener('click', (e) => {
    const row = e.target.closest('.gp-pr');
    if (!row) return;
    const place = results[+row.dataset.i];
    if (!place) return;
    closeSheet();
    onAdd(place);
  });
  const g = $('[data-act="gps"]', sheet);
  if (g) g.addEventListener('click', (e) => { e.stopPropagation(); closeSheet(); onGps(); });
  setTimeout(() => input.focus(), 350);
}
