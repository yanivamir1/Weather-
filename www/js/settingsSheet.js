// Settings: text size, row spacing, units, how far back to look and the about line (version + data attribution).
import { esc, icon, openSheet } from './dom.js';
import { APP_VERSION } from './version.js';
import { GOOGLE_FREE_CALLS, REASON_TEXT } from './google.js';

const seg = (key, cur, opts) => `<div class="gp-seg" role="group">${opts.map(([v, l]) => `<button class="gp-chip${String(cur) === String(v) ? ' on' : ''}" data-set="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}"><span dir="ltr">${esc(l)}</span></button>`).join('')}</div>`;

const GOOGLE_KEY_URL = 'https://developers.google.com/maps/documentation/weather/demo-key';

function googleBlock(info) {
  const status = !info.key ? 'אין מפתח. עד שיוזן מפתח מוצגת תחזית Open-Meteo.'
    : info.reason ? `Google: ${REASON_TEXT[info.reason] || REASON_TEXT.other}` : 'המפתח שמור. התחזית שמוצגת היא של Google.';
  return `<div class="gs-g">
      <label class="sl" for="gkey">מפתח Google Weather API</label>
      <div class="gp-keyrow"><input id="gkey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="הדבק כאן את המפתח" value="${esc(info.key)}"><button class="gp-chip on" data-gsave>שמירה ובדיקה</button></div>
      <div class="gs-gstat" id="gstat" role="status">${esc(status)}</div>
      <div class="gs-note">קריאות החודש: <span class="num">${info.usage}</span> (במפתח רגיל <span class="num">${GOOGLE_FREE_CALLS.toLocaleString('en')}</span> בחודש בחינם; רענון מלא של מקום אחד עולה עד 8 קריאות, והתשובות נשמרות 3 שעות).<br>
      איך מקבלים מפתח בחינם: <a href="${GOOGLE_KEY_URL}" target="_blank" rel="noopener">דף ה-Maps Demo Key של Google</a>, נכנסים עם חשבון Gmail אישי, לוחצים Get a Demo Key ומעתיקים לכאן. אין צורך בכרטיס אשראי, אבל יש מכסה יומית מוגבלת. ההגבלה של המפתח צריכה להיות ל-Weather API בלבד, בלי הגבלה לאפליקציית אנדרואיד.</div>
    </div>`;
}

export function openSettings(settings, { onChange, onKey, googleInfo }) {
  const html = (s) => `<div class="grab"></div>
    <div class="gs-top"><h2>הגדרות</h2><button class="gp-menu" data-act="close-sheet" aria-label="סגור">${icon('gi-close')}</button></div>
    <div class="gs-set">
      <div class="row col"><span class="sl">גודל טקסט</span>${seg('textSize', s.textSize, [[0, 'קטן'], [1, 'רגיל'], [2, 'גדול'], [3, 'גדול מאוד'], [4, 'ענק']])}</div>
      <div class="row col"><span class="sl">רווח בין השורות</span>${seg('density', s.density, [[0, 'צפוף מאוד'], [1, 'צפוף'], [2, 'מצומצם'], [3, 'רגיל']])}</div>
      <div class="row col"><span class="sl">מקור התחזית</span>${seg('source', s.source, [['om', 'Open-Meteo'], ['google', 'Google']])}</div>
      ${s.source === 'google' ? googleBlock(googleInfo()) : ''}
      <div class="row"><span class="sl">טמפרטורה</span>${seg('temp', s.temp, [['c', '°C'], ['f', '°F']])}</div>
      <div class="row"><span class="sl">רוח</span>${seg('wind', s.wind, [['kmh', 'קמ״ש'], ['ms', 'מ׳/ש׳'], ['mph', 'mph']])}</div>
      <div class="row"><span class="sl">ימים אחורה (מה היה)</span>${seg('pastDays', s.pastDays, [[3, '3'], [7, '7'], [14, '14'], [30, '30']])}</div>
      <div class="row"><span class="sl">גבוהה ונמוכה לכל יום</span>${seg('dayTemps', s.dayTemps, [[true, 'מוצג'], [false, 'מוסתר']])}</div>
      <div class="row"><span class="sl">המיקום שלי</span>${seg('showGps', s.showGps, [[true, 'מוצג'], [false, 'מוסתר']])}</div>
    </div>
    <div class="gs-about">מזג אוויר ${APP_VERSION}<br>נתונים: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). תחזית אופציונלית: Google Weather API, במפתח שלך.<br>רשימת יישובי ישראל: הלשכה המרכזית לסטטיסטיקה, וקואורדינטות מ-<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL).<br>ימי עבר ושעות עבר מבוססים על ניתוח של מודלי מזג האוויר, לא על מד גשם.</div>`;
  const sheet = openSheet(html(settings));
  let cur = { ...settings };
  sheet.addEventListener('click', async (e) => {
    const save = e.target.closest('[data-gsave]');
    if (save) {
      const input = sheet.querySelector('#gkey'), stat = sheet.querySelector('#gstat');
      stat.textContent = 'בודק את המפתח…';
      const r = await onKey(input.value);
      stat.textContent = r.ok ? (r.cleared ? 'המפתח נמחק.' : 'המפתח תקין ונשמר. מביא את התחזית של Google…') : `${REASON_TEXT[r.reason] || REASON_TEXT.other}. המפתח לא נשמר.`;
      return;
    }
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const key = b.dataset.set, raw = b.dataset.v;
    cur = { ...cur, [key]: raw === 'true' ? true : raw === 'false' ? false : ['pastDays', 'textSize', 'density'].includes(key) ? +raw : raw };
    sheet.innerHTML = html(cur);
    onChange(cur);
  });
}
