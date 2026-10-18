// Everything derived from one place's normalized Open-Meteo data (see api.js): hourly lookups for any
// day offset (negative = the past), rain totals and the Hebrew rain sentences.
import { hh } from './i18n.js';
import { sceneOf, iconOf, labelOf, isWet, isRain, isDrizzle } from './weatherCodes.js';
import { mmSentence } from './units.js';

const utcDays = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

// Where "today" sits inside the hourly/daily arrays, computed once per data object.
const POS = new WeakMap();
function pos(data) {
  let p = POS.get(data);
  if (!p) {
    const today = utcDays(data.now);
    p = {
      hour: +data.now.slice(11, 13),
      hStart: Math.round(today - utcDays(data.h.t0)) * 24, // index of today 00:00 in the hourly arrays
      dStart: Math.round(today - utcDays(data.d.time[0])),
    };
    POS.set(data, p);
  }
  return p;
}

export const nowHour = (data) => pos(data).hour;
export const nowDate = (data) => data.now.slice(0, 10);
export const pastDaysAvailable = (data) => Math.min(data.pastDays, Math.floor(pos(data).hStart / 24));

/**
 * One hour of one day. d: 0 = today, -1 = yesterday, 1 = tomorrow. hour: 0-23.
 * Open-Meteo's precipitation and precipitation_probability are "preceding hour" values, so the hour that STARTS
 * at `hour` is the value stored one slot later; weather_code and the rest are instantaneous.
 */
export function at(data, d, hour) {
  if (!data) return null;
  const p = pos(data), i = p.hStart + d * 24 + hour, H = data.h;
  if (i < 0 || i >= H.t.length || H.t[i] == null) return null;
  const past = d < 0 || (d === 0 && hour < p.hour);
  const rain = i + 1 < H.rain.length ? H.rain[i + 1] : null;
  const prob = i + 1 < H.prob.length ? H.prob[i + 1] : null;
  const isDay = H.day[i] === 1;
  let code = H.code[i];
  if (past && rain != null) {
    // For hours that already happened the millimetres are the truth: keep the sky and the rain consistent.
    if (rain >= 0.3 && !isWet(code)) code = rain >= 1 ? 63 : 51;
    else if (rain < 0.1 && (isRain(code) || isDrizzle(code))) code = 3;
  }
  return {
    d, hour, past, isNow: d === 0 && hour === p.hour,
    t: H.t[i], feels: H.feels[i], hum: H.hum[i], rain, prob, code, isDay,
    wind: H.wind[i], dir: H.dir[i], press: H.press[i], uv: H.uv[i],
    scene: sceneOf(code, isDay), icon: iconOf(code, isDay), label: labelOf(code),
  };
}

export function dayInfo(data, d) {
  const p = pos(data), i = p.dStart + d, D = data.d;
  if (i < 0 || i >= D.time.length) return null;
  const code = D.code[i];
  return { hi: D.hi[i], lo: D.lo[i], psum: D.psum[i], pprob: D.pprob[i], uv: D.uv[i], code, icon: iconOf(code, true), label: labelOf(code), sunrise: String(D.rise[i]).slice(11, 16), sunset: String(D.set[i]).slice(11, 16), date: D.time[i] };
}

// ---------- rain that fell ----------
const RAIN_MIN = 0.2; // mm in an hour that counts as "it rained"

function sumRain(data, d, from, to) {
  let s = 0;
  for (let h = from; h < to; h++) { const x = at(data, d, h); if (x && x.rain != null) s += x.rain; }
  return s;
}
/** Total mm for day d. Today counts only the hours already behind us. */
export function dayRain(data, d) {
  if (!data) return 0;
  return sumRain(data, d, 0, d === 0 ? nowHour(data) : 24);
}
export const rainedOn = (data, d) => dayRain(data, d) >= RAIN_MIN;

/** mm over the last `hours` completed hours. */
export function rainLast(data, hours) {
  const p = pos(data), nowIdx = p.hStart + p.hour, H = data.h;
  let s = 0;
  for (let j = Math.max(0, nowIdx - hours); j < nowIdx; j++) { const v = H.rain[j + 1]; if (v != null) s += v; }
  return s;
}

function wetHours(data, d, from, to, min) {
  const out = [];
  for (let h = from; h < to; h++) { const x = at(data, d, h); if (x && x.rain != null && x.rain >= min) out.push(h); }
  return out;
}

function forecastSentence(data, d, from) {
  let a = -1, sa = -1, sb = -1, fe = -1, mx = 0;
  for (let h = from; h < 24; h++) {
    const x = at(data, d, h);
    if (!x) continue;
    const pr = x.prob || 0;
    if (x.code >= 95) { if (sa < 0) sa = h; sb = h; }
    if (pr >= 50 && a < 0) a = h;
    if (x.code === 45 || x.code === 48) fe = h;
    mx = Math.max(mx, pr);
  }
  const live = d === 0;
  if (sa >= 0) return live && sa <= from ? `סופת רעמים עד ${hh((sb + 1) % 24)}` : `סופת רעמים החל מ-${hh(sa)}`;
  if (a >= 0) return live && a <= from ? 'יורד גשם עכשיו' : `גשם צפוי החל מ-${hh(a)}`;
  if (fe >= 0) return `ערפל עד ${hh((fe + 1) % 24)}`;
  if (mx >= 30) return 'סיכוי קל לגשם';
  return live ? 'יבש עד סוף היום' : 'יבש כל היום';
}

/** The one-line story for a place on a given day: what fell (past) and/or what is coming. */
export function rainSentence(data, d) {
  if (!data) return '';
  if (d < 0) {
    const tot = sumRain(data, d, 0, 24);
    if (tot < RAIN_MIN) return 'לא ירד גשם';
    const hs = wetHours(data, d, 0, 24, 0.1);
    return `ירד גשם ${hh(hs[0])}–${hh((hs[hs.length - 1] + 1) % 24)} · ${mmSentence(tot)}`;
  }
  if (d === 0) {
    const nh = nowHour(data), so = sumRain(data, 0, 0, nh), ahead = forecastSentence(data, 0, nh);
    if (so < RAIN_MIN) return ahead.startsWith('יבש עד') ? 'יבש כל היום' : ahead; // nothing fell yet: just the outlook
    return `ירד ${mmSentence(so)} עד עכשיו · ${ahead}`;
  }
  return forecastSentence(data, d, 0);
}

