// Day pills: the past (what was) to the right of today, then the forecast, in RTL reading order.
import { WEEKDAY_FULL, WEEKDAY_SHORT, addDays, parseDay } from './i18n.js';
import { rainedOn } from './forecast.js';
import { FORECAST_DAYS } from './api.js';

export function dayLabel(d, date) {
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  if (d === -2) return 'שלשום';
  return WEEKDAY_SHORT[date.getDay()];
}

/** rows: [{ data }]; pastDays: how many days back are available in the data. */
export function daySelectorHtml({ todayIso, pastDays, selected, rows }) {
  const base = parseDay(todayIso);
  let html = '';
  for (let d = -pastDays; d < FORECAST_DAYS; d++) {
    const date = addDays(base, d);
    const wet = d < 0 && rows.some((r) => r.data && rainedOn(r.data, d));
    const cls = 'day' + (d < 0 ? ' past' : '') + (d === selected ? ' on' : '');
    const aria = `${WEEKDAY_FULL[date.getDay()]} ${date.getDate()}${d < 0 ? ' (מה שהיה)' : ''}${wet ? ', ירד גשם' : ''}`;
    if (d === 0 && pastDays > 0) html += '<span class="sep" aria-hidden="true"></span>';
    html += `<button class="${cls}" data-act="day" data-d="${d}" aria-label="${aria}" aria-pressed="${d === selected}"><span class="d1">${dayLabel(d, date)}</span><span class="d2 num">${date.getDate()}</span>${wet ? '<span class="wet"></span>' : ''}</button>`;
  }
  return html;
}
