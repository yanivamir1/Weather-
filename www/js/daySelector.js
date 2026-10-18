// Day tiles (Google style): the past days to the right of today, then the week ahead. Icon and high/low are those of
// the focused place; a small blue dot marks past days on which it rained somewhere.
import { WEEKDAY_FULL, WEEKDAY_SHORT, addDays, parseDay } from './i18n.js';
import { dayInfo, rainedOn } from './forecast.js';
import { glossy } from './weatherCodes.js';
import { fmtTemp } from './units.js';
import { FORECAST_DAYS } from './api.js';

export function dayLabel(d, date) {
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  if (d === -2) return 'שלשום';
  return WEEKDAY_SHORT[date.getDay()];
}

/** focusData: the focused place's data; rows: every place's { data }. */
export function dayTilesHtml({ todayIso, pastDays, selected, focusData, rows }) {
  const base = parseDay(todayIso);
  let html = '';
  for (let d = -pastDays; d < FORECAST_DAYS; d++) {
    const date = addDays(base, d);
    const di = focusData ? dayInfo(focusData, d) : null;
    const wet = d < 0 && rows.some((r) => r.data && rainedOn(r.data, d));
    const aria = `${WEEKDAY_FULL[date.getDay()]} ${date.getDate()}${d < 0 ? ' (מה שהיה)' : ''}${di ? ', ' + fmtTemp(di.hi) : ''}${wet ? ', ירד גשם' : ''}`;
    html += `<button class="gp-day${d === selected ? ' on' : ''}${d < 0 ? ' past' : ''}" data-act="day" data-d="${d}" aria-pressed="${d === selected}" aria-label="${aria}"><span class="n">${dayLabel(d, date)}</span>${di ? `<img class="ic" src="${glossy(di.icon)}" alt=""><span class="h num">${fmtTemp(di.hi)}/${fmtTemp(di.lo)}</span>` : '<span class="ic"></span><span class="h"></span>'}${wet ? '<span class="wet"></span>' : ''}</button>`;
  }
  return html;
}
