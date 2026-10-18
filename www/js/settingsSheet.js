// Settings: units, how far back to look and the about line (version + data attribution).
import { esc, icon, openSheet } from './dom.js';
import { APP_VERSION } from './version.js';

const seg = (key, cur, opts) => `<div class="gp-seg" role="group">${opts.map(([v, l]) => `<button class="gp-chip${String(cur) === String(v) ? ' on' : ''}" data-set="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}"><span dir="ltr">${esc(l)}</span></button>`).join('')}</div>`;

export function openSettings(settings, { onChange }) {
  const html = (s) => `<div class="grab"></div>
    <div class="gs-top"><h2>הגדרות</h2><button class="gp-menu" data-act="close-sheet" aria-label="סגור">${icon('gi-close')}</button></div>
    <div class="gs-set">
      <div class="row"><span class="sl">טמפרטורה</span>${seg('temp', s.temp, [['c', '°C'], ['f', '°F']])}</div>
      <div class="row"><span class="sl">רוח</span>${seg('wind', s.wind, [['kmh', 'קמ״ש'], ['ms', 'מ׳/ש׳'], ['mph', 'mph']])}</div>
      <div class="row"><span class="sl">ימים אחורה (מה היה)</span>${seg('pastDays', s.pastDays, [[3, '3'], [7, '7'], [14, '14'], [30, '30']])}</div>
      <div class="row"><span class="sl">המיקום שלי</span>${seg('showGps', s.showGps, [[true, 'מוצג'], [false, 'מוסתר']])}</div>
    </div>
    <div class="gs-about">מזג אוויר ${APP_VERSION}<br>נתונים: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).<br>רשימת יישובי ישראל: הלשכה המרכזית לסטטיסטיקה, וקואורדינטות מ-<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL).<br>ימי עבר ושעות עבר מבוססים על ניתוח של מודלי מזג האוויר, לא על מד גשם.</div>`;
  const sheet = openSheet(html(settings));
  let cur = { ...settings };
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const key = b.dataset.set, raw = b.dataset.v;
    cur = { ...cur, [key]: raw === 'true' ? true : raw === 'false' ? false : key === 'pastDays' ? +raw : raw };
    sheet.innerHTML = html(cur);
    onChange(cur);
  });
}
