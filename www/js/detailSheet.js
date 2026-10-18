// Detail sheet for one place at the selected day and hour.
import { at, dayInfo } from './forecast.js';
import { historyHtml } from './historySummary.js';
import { esc, icon } from './dom.js';
import { WEEKDAY_FULL, addDays, hh, parseDay } from './i18n.js';
import { fmtTemp, windNum, windUnit } from './units.js';
import { windFrom } from './weatherCodes.js';
import { FORECAST_DAYS } from './api.js';

export function aqiLabel(v) {
  if (v == null) return '';
  return v <= 20 ? 'טובה מאוד' : v <= 40 ? 'טובה' : v <= 60 ? 'בינונית' : v <= 80 ? 'גרועה' : v <= 100 ? 'גרועה מאוד' : 'קיצונית';
}
const uvLabel = (u) => (u <= 0 ? 'אין' : u <= 2 ? 'נמוך' : u <= 5 ? 'בינוני' : u <= 7 ? 'גבוה' : 'גבוה מאוד');

export function detailHtml(place, data, s, ctx) {
  const x = at(data, s.day, s.hour);
  const di = dayInfo(data, s.day);
  const base = parseDay(data.now);
  const date = addDays(base, s.day);
  const when = `${WEEKDAY_FULL[date.getDay()]} · ${hh(s.hour)}${x && x.past ? ' · מה שהיה' : ''}`;
  const stats = x ? [
    { i: 'drop', k: 'לחות', v: Math.round(x.hum) + '%', s: x.hum > 70 ? 'לח' : x.hum < 35 ? 'יבש' : 'נוח' },
    { i: 'wind', k: 'רוח', v: String(windNum(x.wind)), s: `${windUnit()} · ${windFrom(x.dir)}` },
    { i: 'sun', k: 'UV', v: String(Math.round(x.uv || 0)), s: uvLabel(x.uv || 0) },
    { i: 'gauge', k: 'לחץ', v: String(Math.round(x.press)), s: 'hPa' },
    { i: 'leaf', k: 'איכות אוויר', v: '–', s: '', aqi: true },
    { i: 'sunrise', k: 'זריחה', v: di ? di.sunrise : '–', s: di ? 'שקיעה ' + di.sunset : '' },
  ] : [];

  const week = [];
  for (let d = 0; d < FORECAST_DAYS; d++) { const w = dayInfo(data, d); if (w) week.push({ d, w }); }
  const lo = Math.min(...week.map((r) => r.w.lo)), hi = Math.max(...week.map((r) => r.w.hi)), span = Math.max(1, hi - lo);
  const weekHtml = week.map(({ d, w }) => {
    const name = d === 0 ? 'היום' : WEEKDAY_FULL[addDays(base, d).getDay()].replace('יום ', '');
    const rain = w.pprob != null && w.pprob >= 20 ? w.pprob + '%' : '';
    return `<div class="wr${d === s.day ? ' on' : ''}"><div class="wd">${name}</div><img class="wi" src="icons/${w.icon}.svg" alt=""><div class="wrain num">${rain}</div><div class="wlo num">${fmtTemp(w.lo)}</div><div class="track"><div class="tbar" style="right:${(((w.lo - lo) / span) * 100).toFixed(1)}%;width:${Math.max(6, ((w.hi - w.lo) / span) * 100).toFixed(1)}%"></div></div><div class="whi num">${fmtTemp(w.hi)}</div></div>`;
  }).join('');

  const nowLine = x ? `<div class="shnow">
      <div class="big num">${fmtTemp(x.t)}</div>
      <div class="shtxt"><img src="icons/${x.icon}.svg" alt="" style="width:40px;height:40px"><div class="lb">${esc(x.label)}</div>
      <div class="s2">הרגשה כמו <span class="num">${fmtTemp(x.feels)}</span></div>
      ${di ? `<div class="s2">מקס׳ <span class="num">${fmtTemp(di.hi)}</span> · מינ׳ <span class="num">${fmtTemp(di.lo)}</span></div>` : ''}</div>
    </div>` : '<div class="msg">אין נתונים לשעה הזו</div>';

  return `<div class="grab"></div>
  <div class="shtop"><div><div class="shname">${place.gps ? icon('pin', 18) : ''}<span>${esc(place.name)}</span></div><div class="shsub">${esc(when)}</div></div>
    <button class="icbtn" data-act="close-sheet" aria-label="סגור">${icon('close')}</button></div>
  ${nowLine}
  <div class="stats">${stats.map((t) => `<div class="stat"${t.aqi ? ' data-aqi' : ''}><div class="k">${icon(t.i)}<span>${t.k}</span></div><div class="v num">${esc(t.v)}</div><div class="s">${esc(t.s)}</div></div>`).join('')}</div>
  ${historyHtml(data)}
  <div class="sec"><h3>השבוע הקרוב</h3><div class="wk">${weekHtml}</div></div>
  <div class="acts2">
    ${ctx.canUp ? `<button class="pill" data-act="move-up" data-key="${esc(place.key)}">הזז למעלה</button>` : ''}
    ${ctx.canDown ? `<button class="pill" data-act="move-down" data-key="${esc(place.key)}">הזז למטה</button>` : ''}
    <button class="pill" data-act="remove" data-key="${esc(place.key)}">${place.gps ? 'כבה את המיקום שלי' : 'הסר מקום'}</button>
  </div>`;
}

/** Fills the air-quality tile once it has loaded (or leaves the dash if it failed). */
export function fillAqi(sheet, aq) {
  const tile = sheet && sheet.querySelector('[data-aqi]');
  if (!tile || !aq || aq.aqi == null) return;
  tile.querySelector('.v').textContent = String(aq.aqi);
  tile.querySelector('.s').textContent = aqiLabel(aq.aqi);
}
