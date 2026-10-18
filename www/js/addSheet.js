// "+" sheet: search a place or a city (Open-Meteo geocoding), or use the phone's location.
import { searchPlaces } from './api.js';
import { esc, icon, openSheet, closeSheet, $ } from './dom.js';

export function openAddSheet({ existing, gpsOn, onAdd, onGps }) {
  const sheet = openSheet(`<div class="grab"></div>
    <div class="shtop"><div class="shname">הוספת מקום</div><button class="icbtn" data-act="close-sheet" aria-label="סגור">${icon('close')}</button></div>
    <div class="srch">${icon('pin', 20)}<input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="חיפוש עיר או מקום" aria-label="חיפוש עיר או מקום"></div>
    ${gpsOn ? '' : `<div class="gpsrow"><button class="pill" data-act="gps">${icon('pin', 18)}<span>המיקום שלי</span></button></div>`}
    <div class="res" id="res"><div class="msg">התחל להקליד שם של עיר, ישוב או מקום.</div></div>`);

  const input = $('#q', sheet), res = $('#res', sheet);
  let timer = null, seq = 0, results = [];
  const have = new Set(existing);

  const show = (html) => { res.innerHTML = html; };
  async function run(q) {
    const my = ++seq;
    show('<div class="msg">מחפש…</div>');
    try {
      results = await searchPlaces(q);
      if (my !== seq) return;
      if (!results.length) { show('<div class="msg">לא נמצא מקום בשם הזה. נסה איות אחר.</div>'); return; }
      show(results.map((r, i) => {
        const done = have.has(r.key);
        return `<button class="resrow" data-i="${i}" ${done ? 'disabled' : ''} aria-label="${done ? 'כבר ברשימה: ' : 'הוסף: '}${esc(r.name)}"><span class="rn"><b>${esc(r.name)}</b><span>${esc(r.sub)}</span></span><span class="addbtn${done ? ' done' : ''}">${icon(done ? 'check' : 'plus-light')}</span></button>`;
      }).join(''));
    } catch (e) {
      if (my === seq) show('<div class="msg">החיפוש נכשל. בדוק את החיבור לאינטרנט ונסה שוב.</div>');
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { seq++; show('<div class="msg">התחל להקליד שם של עיר, ישוב או מקום.</div>'); return; }
    timer = setTimeout(() => run(q), 300);
  });
  res.addEventListener('click', (e) => {
    const row = e.target.closest('.resrow');
    if (!row) return;
    const place = results[+row.dataset.i];
    if (!place) return;
    closeSheet();
    onAdd(place);
  });
  const g = $('[data-act="gps"]', sheet);
  if (g) g.addEventListener('click', () => { closeSheet(); onGps(); });
  setTimeout(() => input.focus(), 350);
}
