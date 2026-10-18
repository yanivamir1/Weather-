// Detail sheet for one place: Google-style accordions with a 24-hour chart for the selected day, what fell, the numbers.
import { at, dayInfo } from './forecast.js';
import { historyHtml } from './historySummary.js';
import { esc, icon } from './dom.js';
import { WEEKDAY_FULL, addDays, hh, parseDay } from './i18n.js';
import { fmtTemp, mmSentence, windNum, windUnit } from './units.js';
import { glossy, windFrom } from './weatherCodes.js';

export function aqiLabel(v) {
  if (v == null) return '';
  return v <= 20 ? 'טובה מאוד' : v <= 40 ? 'טובה' : v <= 60 ? 'בינונית' : v <= 80 ? 'גרועה' : v <= 100 ? 'גרועה מאוד' : 'קיצונית';
}
const uvLabel = (u) => (u <= 0 ? 'אין' : u <= 2 ? 'נמוך' : u <= 5 ? 'בינוני' : u <= 7 ? 'גבוה' : 'גבוה מאוד');

function accordion(key, iconName, title, value, bars, open) {
  const body = bars.map((b) => `<div class="gp-bar${b.sel ? ' sel' : ''}${b.v <= 0 ? ' zero' : ''}" role="img" aria-label="${hh(b.h)}, ${esc(b.text)}"><i style="height:${b.v <= 0 ? 2 : Math.max(4, b.v)}%"></i></div>`).join('');
  return `<div class="gp-ac${open ? ' open' : ''}">
    <button class="gp-ach" data-act="acc" aria-expanded="${open}"><span class="gp-ati">${icon(iconName)}</span><span class="gp-att">${title}<span class="dotc">·</span><span class="v">${esc(value)}</span></span>${icon('gi-chev')}</button>
    <div class="gp-acb"${open ? '' : ' hidden'}><div class="gp-chart"><div class="gp-bars">${body}</div><div class="gp-ax num"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div></div>
  </div>`;
}

export function detailHtml(place, data, s, ctx) {
  const x = at(data, s.hourDay, s.hour);
  const di = dayInfo(data, s.hourDay);
  const date = addDays(parseDay(data.now), s.hourDay);
  const when = `${WEEKDAY_FULL[date.getDay()]} · ${hh(s.hour)}${x && x.past ? ' · מה שהיה' : ''}`;
  const hours = [];
  for (let h = 0; h < 24; h++) hours.push(at(data, s.hourDay, h));
  const bars = (fn, scale, text) => hours.map((y, h) => {
    if (!y) return { h, v: 0, text: '', sel: false };
    const v = fn(y), pct = Math.max(0, Math.min(100, (v / scale) * 100));
    return { h, v: v <= 0 ? 0 : pct, text: text(y), sel: h === s.hour };
  });
  let accs = '', stats = '';
  if (x) {
    const rainVal = x.past ? mmSentence(x.rain) : `${x.prob == null ? 0 : x.prob}%`;
    accs = accordion('rain', 'gi-rain', 'משקעים', rainVal, bars((y) => (y.past ? Math.min(y.rain || 0, 4) * 25 : y.prob || 0), 100, (y) => (y.past ? mmSentence(y.rain) : (y.prob || 0) + '%')), true)
      + accordion('wind', 'gi-wind', 'רוח', `${windNum(x.wind)} ${windUnit()}`, bars((y) => y.wind || 0, 40, (y) => windNum(y.wind) + ' ' + windUnit()), false)
      + accordion('hum', 'gi-drop', 'לחות', `${Math.round(x.hum)}%`, bars((y) => y.hum || 0, 100, (y) => Math.round(y.hum) + '%'), false)
      + accordion('uv', 'gi-sun', 'UV', `${Math.round(x.uv || 0)} · ${uvLabel(x.uv || 0)}`, bars((y) => y.uv || 0, 10, (y) => String(Math.round(y.uv || 0))), false);
    stats = [
      { i: 'gi-gauge', k: 'לחץ', v: String(Math.round(x.press)), s: 'hPa' },
      { i: 'gi-leaf', k: 'איכות אוויר', v: '–', s: '', aqi: true },
      { i: 'gi-sunrise', k: 'זריחה', v: di ? di.sunrise : '–', s: di ? 'שקיעה ' + di.sunset : '' },
      { i: 'gi-wind', k: 'כיוון הרוח', v: windFrom(x.dir) || '–', s: '' },
    ].map((t) => `<div class="gs-stat"${t.aqi ? ' data-aqi' : ''}><div class="k">${icon(t.i)}<span>${t.k}</span></div><div class="v">${esc(t.v)}</div><div class="s">${esc(t.s)}</div></div>`).join('');
  }
  return `<div class="grab"></div>
  <div class="gs-top"><div><h2>${place.gps ? icon('gi-pin', 18) : ''}<span>${esc(place.name)}</span></h2><div class="gs-sub">${esc(when)}</div></div>
    <button class="gp-menu" data-act="close-sheet" aria-label="סגור">${icon('gi-close')}</button></div>
  ${x ? `<div class="gs-now"><div class="gp-temp num">${fmtTemp(x.t)}</div><img class="gp-ic" src="${glossy(x.icon)}" alt=""><div class="gs-nt"><div class="gp-cond">${esc(x.label)}</div><div class="gp-feels">הרגשה כמו <span class="num">${fmtTemp(x.feels)}</span>${di ? ` · <span class="num">${fmtTemp(di.hi)}</span>/<span class="num">${fmtTemp(di.lo)}</span>` : ''}</div></div></div>` : '<div class="gp-msg">אין נתונים לשעה הזו</div>'}
  <div class="gs-accs">${accs}</div>
  ${historyHtml(data)}
  <div class="gs-stats">${stats}</div>
  <div class="gs-acts">
    ${ctx.canUp ? `<button class="gp-tonal" data-act="move-up" data-key="${esc(place.key)}">הזז למעלה</button>` : ''}
    ${ctx.canDown ? `<button class="gp-tonal" data-act="move-down" data-key="${esc(place.key)}">הזז למטה</button>` : ''}
    <button class="gp-tonal" data-act="remove" data-key="${esc(place.key)}">${place.gps ? 'כבה את המיקום שלי' : 'הסר מקום'}</button>
  </div>`;
}

/** Fills the air-quality tile once it has loaded (or leaves the dash if it failed). */
export function fillAqi(sheet, aq) {
  const tile = sheet && sheet.querySelector('[data-aqi]');
  if (!tile || !aq || aq.aqi == null) return;
  tile.querySelector('.v').textContent = String(aq.aqi);
  tile.querySelector('.s').textContent = aqiLabel(aq.aqi);
}
