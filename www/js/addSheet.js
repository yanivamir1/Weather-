// "+" sheet: search a place or a city (Open-Meteo geocoding), or use the phone's location.
import { searchPlaces } from './api.js';
import { esc, icon, openSheet, closeSheet, $ } from './dom.js';

export function openAddSheet({ existing, gpsOn, onAdd, onGps }) {
  const sheet = openSheet(`<div class="grab"></div>
    <div class="gs-top"><h2>הוספת מקום</h2><button class="gp-menu" data-act="close-sheet" aria-label="סגור">${icon('gi-close')}</button></div>
    <div class="gp-search">${icon('gi-search')}<input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="חיפוש עיר או מקום" aria-label="חיפוש עיר או מקום"></div>
    ${gpsOn ? '' : `<button class="gp-add" data-act="gps"><span class="pl">${icon('gi-pin')}</span><span>המיקום שלי</span></button>`}
    <div class="gp-res" id="res"><div class="gp-msg">התחל להקליד שם של עיר, ישוב או מקום.</div></div>`);

  const input = $('#q', sheet), res = $('#res', sheet);
  let timer = null, seq = 0, results = [];
  const have = new Set(existing);
  const hint = '<div class="gp-msg">התחל להקליד שם של עיר, ישוב או מקום.</div>';
  const show = (html) => { res.innerHTML = html; };

  async function run(q) {
    const my = ++seq;
    show('<div class="gp-msg">מחפש…</div>');
    try {
      results = await searchPlaces(q);
      if (my !== seq) return;
      if (!results.length) { show('<div class="gp-msg">לא נמצא מקום בשם הזה. נסה איות אחר.</div>'); return; }
      show(results.map((r, i) => {
        const done = have.has(r.key);
        return `<button class="gp-pr" data-i="${i}" ${done ? 'disabled' : ''} aria-label="${done ? 'כבר ברשימה: ' : 'הוסף: '}${esc(r.name)}"><span class="nm"><span>${esc(r.name)}</span><span class="sub">${esc(r.sub)}</span></span><span class="gp-addic${done ? ' done' : ''}">${icon(done ? 'gi-check' : 'gi-plus')}</span></button>`;
      }).join(''));
    } catch (e) {
      if (my === seq) show('<div class="gp-msg">החיפוש נכשל. בדוק את החיבור לאינטרנט ונסה שוב.</div>');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { seq++; show(hint); return; }
    timer = setTimeout(() => run(q), 300);
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
