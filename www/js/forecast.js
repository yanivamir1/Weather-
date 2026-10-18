// Everything derived from one place's normalized Open-Meteo data (see api.js): hourly lookups for any
// day offset (negative = the past), rain totals, the Hebrew sentences and the ribbon colours.
import { hh } from './i18n.js';
import { sceneOf, iconOf, labelOf, isWet, isRain, isDrizzle } from './weatherCodes.js';
import { mmText, mmSentence, fmtTemp, windNum } from './units.js';

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
    const nh = nowHour(data), so = sumRain(data, 0, 0, nh);
    const past = so >= RAIN_MIN ? `ירד ${mmSentence(so)} עד עכשיו` : 'עוד לא ירד גשם היום';
    return `${past} · ${forecastSentence(data, 0, nh)}`;
  }
  return forecastSentence(data, d, 0);
}

/** Short note under the place name on past days. */
export function pastRainNote(data, d) {
  const tot = dayRain(data, d);
  return tot < RAIN_MIN ? { text: 'יבש', wet: false } : { text: mmSentence(tot), wet: true };
}

// ---------- ribbon colours / values ----------
export const RGB = { sun: '170,112,70', cloud: '122,120,84', rain: '92,112,142', storm: '110,96,160', fog: '150,152,156', night: '64,78,120', snow: '170,186,208' };
const ALPHA = [0.05, 0.1, 0.17, 0.25, 0.36];

export function level(metric, x) {
  if (metric === 'rain') {
    if (x.past) { const m = x.rain || 0; return m < 0.1 ? 0 : m < 0.5 ? 1 : m < 2 ? 2 : m < 5 ? 3 : 4; }
    const p = x.prob || 0; return p < 10 ? 0 : p < 30 ? 1 : p < 50 ? 2 : p < 75 ? 3 : 4;
  }
  if (metric === 'wind') return x.wind < 10 ? 1 : x.wind < 18 ? 2 : x.wind < 26 ? 3 : 4;
  if (metric === 'uv') return !x.uv ? 0 : x.uv < 3 ? 1 : x.uv < 5 ? 2 : x.uv < 7 ? 3 : 4;
  return x.t < 18 ? 1 : x.t < 24 ? 2 : x.t < 30 ? 3 : 4;
}
const hue = (metric, x) => (metric === 'rain' ? 'rain' : metric === 'wind' ? 'cloud' : metric === 'uv' ? 'sun' : x.scene);

/** CSS gradient with one stop per hour; hour 0 sits at the right edge of the RTL ribbon. */
export function ribbonGradient(data, d, metric) {
  const stops = [];
  for (let h = 0; h < 24; h++) {
    const x = at(data, d, h);
    const pct = ((h + 0.5) / 24 * 100).toFixed(2);
    stops.push(x ? `rgba(${RGB[hue(metric, x)]},${ALPHA[level(metric, x)]}) ${pct}%` : `rgba(255,255,255,0.04) ${pct}%`);
  }
  return `linear-gradient(to left,${stops.join(',')})`;
}

/** The eight 3-hour slots shown on a ribbon: icon + value. Rain shows mm for finished blocks, % ahead. */
export function ribbonSlots(data, d, metric) {
  const out = [];
  for (let g = 0; g < 8; g++) {
    const mid = at(data, d, g * 3 + 1);
    if (!mid) { out.push({ icon: 'cloud', text: '', wet: false }); continue; }
    const block = [at(data, d, g * 3), mid, at(data, d, g * 3 + 2)].filter(Boolean);
    let text, wet = false;
    if (metric === 'rain') {
      if (block.every((x) => x.past)) {
        const mm = block.reduce((s, x) => s + (x.rain || 0), 0);
        text = mmText(mm); wet = mm >= RAIN_MIN;
      } else {
        const pr = Math.max(...block.map((x) => x.prob || 0));
        text = pr < 10 ? '–' : pr + '%'; wet = pr >= 30;
      }
    } else if (metric === 'wind') {
      text = String(windNum(Math.max(...block.map((x) => x.wind || 0))));
    } else if (metric === 'uv') {
      const u = Math.max(...block.map((x) => x.uv || 0));
      text = u > 0 ? String(Math.round(u)) : '–';
    } else {
      text = fmtTemp(mid.t);
    }
    out.push({ icon: mid.icon, text, wet });
  }
  return out;
}

// ---------- national summary chips ----------
export function summary(rows, d, hour, metric) {
  const live = rows.filter((r) => r.data);
  if (!live.length) return [];
  const pick = (cmp, f) => live.reduce((b, r) => { const v = f(r); return !b || cmp(v, b.v) ? { v, r } : b; }, null);
  const gt = (a, b) => a > b, lt = (a, b) => a < b;
  if (metric === 'rain' && d < 0) {
    const tot = (r) => dayRain(r.data, d);
    const n = live.filter((r) => tot(r) >= RAIN_MIN).length, top = pick(gt, tot);
    return [
      { k: 'מקומות עם גשם', v: `${n} מתוך ${live.length}` },
      n ? { k: 'הכי הרבה', name: top.r.name, val: mmSentence(top.v) } : { k: 'סה״כ', v: 'לא ירד גשם' },
    ];
  }
  const xs = (r) => at(r.data, d, hour);
  const ok = live.filter((r) => xs(r));
  if (!ok.length) return [];
  const pickOk = (cmp, f) => ok.reduce((b, r) => { const v = f(r); return !b || cmp(v, b.v) ? { v, r } : b; }, null);
  if (metric === 'rain') {
    const val = (r) => { const x = xs(r); return x.past ? (x.rain || 0) : (x.prob || 0); };
    const past = xs(ok[0]).past, top = pickOk(gt, val);
    const dry = ok.filter((r) => val(r) < (past ? RAIN_MIN : 20)).length;
    return [{ k: 'הכי גשום', name: top.r.name, val: past ? mmSentence(top.v) : top.v + '%' }, { k: 'מקומות יבשים', v: `${dry} מתוך ${ok.length}` }];
  }
  if (metric === 'wind') {
    const w = (r) => xs(r).wind || 0, hi = pickOk(gt, w), lo = pickOk(lt, w);
    return [{ k: 'רוח חזקה', name: hi.r.name, val: String(windNum(hi.v)) }, { k: 'שקט ביותר', name: lo.r.name, val: String(windNum(lo.v)) }];
  }
  if (metric === 'uv') {
    const u = (r) => xs(r).uv || 0, hi = pickOk(gt, u), lo = pickOk(lt, u);
    return hi.v === 0 ? [{ k: 'UV', v: 'אין קרינה בשעה הזו' }] : [{ k: 'UV גבוה', name: hi.r.name, val: String(Math.round(hi.v)) }, { k: 'UV נמוך', name: lo.r.name, val: String(Math.round(lo.v)) }];
  }
  const t = (r) => xs(r).t, hi = pickOk(gt, t), lo = pickOk(lt, t);
  return [{ k: 'הכי חם', name: hi.r.name, val: fmtTemp(hi.v) }, { k: 'הכי קר', name: lo.r.name, val: fmtTemp(lo.v) }];
}

