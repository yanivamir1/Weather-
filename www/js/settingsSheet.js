// Settings: units, how far back to look, calm mode and the about line (version + data attribution).
import { esc, icon, openSheet, $ } from './dom.js';
import { APP_VERSION } from './version.js';

const seg = (key, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="pill ring${String(cur) === String(v) ? ' on' : ''}" data-set="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}"><span dir="ltr">${esc(l)}</span></button>`).join('')}</div>`;

export function openSettings(settings, { onChange, onClose }) {
  const html = (s) => `<div class="grab"></div>
    <div class="shtop"><div class="shname">הגדרות</div><button class="icbtn" data-act="close-sheet" aria-label="סגור">${icon('close')}</button></div>
    <div class="set">
      <div class="setrow"><span class="sl">טמפרטורה</span>${seg('temp', s.temp, [['c', '°C'], ['f', '°F']])}</div>
      <div class="setrow"><span class="sl">רוח</span>${seg('wind', s.wind, [['kmh', 'קמ״ש'], ['ms', 'מ׳/ש׳'], ['mph', 'mph']])}</div>
      <div class="setrow"><span class="sl">ימים אחורה (מה היה)</span>${seg('pastDays', s.pastDays, [[3, '3'], [7, '7'], [14, '14'], [30, '30']])}</div>
      <div class="setrow"><span class="sl">המיקום שלי</span>${seg('showGps', s.showGps, [[true, 'מוצג'], [false, 'מוסתר']])}</div>
      <div class="setrow"><span class="sl">רקע רגוע (בלי תנועה)</span>${seg('calm', s.calm, [[false, 'כבוי'], [true, 'פועל']])}</div>
    </div>
    <div class="about">מזג אוויר ${APP_VERSION}<br>נתונים: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).<br>ימי עבר ושעות עבר מבוססים על ניתוח של מודלי מזג האוויר, לא על מד גשם.</div>`;
  const sheet = openSheet(html(settings), onClose);
  let cur = { ...settings };
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const key = b.dataset.set;
    const raw = b.dataset.v;
    cur = { ...cur, [key]: raw === 'true' ? true : raw === 'false' ? false : key === 'pastDays' ? +raw : raw };
    sheet.innerHTML = html(cur);
    onChange(cur);
  });
  return $('.sheet');
}
