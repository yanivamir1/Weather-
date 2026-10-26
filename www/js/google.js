// Google Weather API (weather.googleapis.com) as an optional source for the FORECAST part of every place.
// Open-Meteo stays the base (it is the only one with the past days and the "what was" history); when Google is
// switched on, its daily forecast (7 days) and its hourly forecast for the next 48 hours replace Open-Meteo's. The
// hours further ahead stay Open-Meteo's, but are calibrated to Google's daily verdict (temperatures stretched to
// Google's high and low, dry days kept dry, wet days given Google's rain amount), so one place never says "rain" in
// the strip while the day tile says "dry". Everything is merged into the same normalized shape as api.js.
//
// Calls are the scarce thing: hours come 24 per call, so a full refresh of one place is 3 calls (2 pages of hours + the
// days). Answers are kept for 6 hours, a manual refresh reuses answers younger than 30 minutes, and every call is counted.
import { loadGoogleCache, loadGoogleUsage, saveGoogleCache, saveGoogleUsage } from './storage.js';
import { FORECAST_DAYS } from './api.js';
import { isWet } from './weatherCodes.js';

const BASE = 'https://weather.googleapis.com/v1';
export const GOOGLE_TTL = 6 * 60 * 60 * 1000;      // a forecast older than this is fetched again on a normal refresh
export const GOOGLE_MIN_AGE = 30 * 60 * 1000;      // even a manual refresh reuses an answer younger than this
export const GOOGLE_HOURS = 48;                    // hourly forecast hours fetched (24 per call)
export const GOOGLE_CALLS_PER_PLACE = GOOGLE_HOURS / 24 + 1;
export const GOOGLE_FREE_CALLS = 10000;

const round4 = (n) => Math.round(n * 10000) / 10000;
const pad = (n) => String(n).padStart(2, '0');

// Google's condition types -> the WMO codes the rest of the app speaks (labels, icons, scenery).
const WMO = {
  CLEAR: 0, MOSTLY_CLEAR: 1, PARTLY_CLOUDY: 2, MOSTLY_CLOUDY: 3, CLOUDY: 3, WINDY: 2,
  WIND_AND_RAIN: 63, LIGHT_RAIN_SHOWERS: 80, CHANCE_OF_SHOWERS: 80, SCATTERED_SHOWERS: 80, RAIN_SHOWERS: 81, HEAVY_RAIN_SHOWERS: 82,
  LIGHT_TO_MODERATE_RAIN: 61, MODERATE_TO_HEAVY_RAIN: 65, RAIN: 63, LIGHT_RAIN: 61, HEAVY_RAIN: 65, RAIN_PERIODICALLY_HEAVY: 65,
  LIGHT_SNOW_SHOWERS: 85, CHANCE_OF_SNOW_SHOWERS: 85, SCATTERED_SNOW_SHOWERS: 85, SNOW_SHOWERS: 85, HEAVY_SNOW_SHOWERS: 86,
  LIGHT_TO_MODERATE_SNOW: 71, MODERATE_TO_HEAVY_SNOW: 75, SNOW: 73, LIGHT_SNOW: 71, HEAVY_SNOW: 75, SNOWSTORM: 75,
  SNOW_PERIODICALLY_HEAVY: 75, HEAVY_SNOW_STORM: 75, BLOWING_SNOW: 73, RAIN_AND_SNOW: 73,
  HAIL: 96, HAIL_SHOWERS: 96, THUNDERSTORM: 95, THUNDERSHOWER: 95, LIGHT_THUNDERSTORM_RAIN: 95, SCATTERED_THUNDERSTORMS: 95, HEAVY_THUNDERSTORM: 99,
};
export const wmoOf = (type) => (type in WMO ? WMO[type] : 3);

// ---------- calls ----------
export class GoogleError extends Error {
  constructor(reason, status, detail) { super(reason); this.reason = reason; this.status = status; this.detail = detail || ''; }
}
/** key = wrong key, denied = the API is off for that key, quota = the (daily) limit is used up, rate = too many calls in a minute, network, other. */
export const REASON_TEXT = {
  key: 'המפתח לא תקין',
  denied: 'המפתח אינו מורשה ל-Weather API (צריך להפעיל אותו ל-Weather API בלבד, בלי הגבלת אפליקציה)',
  quota: 'נגמרה המכסה של המפתח (מתאפסת מחר)',
  rate: 'יותר מדי קריאות בדקה אחת, נסה שוב בעוד דקה',
  network: 'אין חיבור ל-Google',
  other: 'Google החזיר שגיאה',
};
/** Errors that mean "stop asking for now": the next place would fail the same way. */
const STOPS = ['key', 'denied', 'quota', 'rate'];

// calls this month and today (the demo key's allowance is daily)
const dayKey = () => new Date().toISOString().slice(0, 10);
function countCall() {
  const u = loadGoogleUsage(), day = dayKey(), month = day.slice(0, 7);
  saveGoogleUsage({ month, n: (u.month === month ? u.n : 0) + 1, day, dn: (u.day === day ? u.dn || 0 : 0) + 1 });
}
export function googleUsage() {
  const u = loadGoogleUsage(), day = dayKey();
  return { month: u.month === day.slice(0, 7) ? u.n : 0, today: u.day === day ? u.dn || 0 : 0 };
}

async function getJson(url, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res;
  try {
    countCall();
    res = await fetch(url + `&key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
  } catch (e) {
    throw new GoogleError('network');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res.json();
  // Google says why in the body; keep a short piece of it, it is what tells a per-minute limit from a daily one
  let err = {};
  try { err = (await res.json()).error || {}; } catch (e) { /* no body */ }
  const detail = String(err.message || '').slice(0, 180);
  const text = detail + ' ' + JSON.stringify(err.details || '');
  let reason = 'other';
  if (/API_KEY_INVALID|API key not valid/i.test(text) || res.status === 401) reason = 'key';
  else if (res.status === 429 || /RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED|quota/i.test(text)) reason = /minute/i.test(text) ? 'rate' : 'quota';
  else if (res.status === 403) reason = 'denied';
  throw new GoogleError(reason, res.status, detail);
}

const where = (p) => `location.latitude=${round4(p.lat)}&location.longitude=${round4(p.lon)}`;

/** One cheap call (a single day) to find out whether a key works. */
export async function testGoogleKey(key, probe = { lat: 32.0809, lon: 34.7806 }) {
  try {
    await getJson(`${BASE}/forecast/days:lookup?${where(probe)}&days=1&pageSize=1`, key);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.reason || 'other' };
  }
}

/** The raw answer for one place: the next GOOGLE_HOURS hours, and the 7 days. */
async function fetchPlace(place, key, hoursNeeded) {
  const hoursChain = async () => {
    const out = [];
    let token = '';
    for (let page = 0; page < 11 && out.length < hoursNeeded; page++) {
      const j = await getJson(`${BASE}/forecast/hours:lookup?${where(place)}&hours=${hoursNeeded}&pageSize=24${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, key);
      out.push(...(j.forecastHours || []));
      token = j.nextPageToken || '';
      if (!token) break;
    }
    return out;
  };
  const [hours, daysJ] = await Promise.all([
    hoursChain(),
    getJson(`${BASE}/forecast/days:lookup?${where(place)}&days=${FORECAST_DAYS}&pageSize=${FORECAST_DAYS}`, key),
  ]);
  return { ts: Date.now(), hours: hours.map(compactHour), days: (daysJ.forecastDays || []).map(compactDay) };
}

// Only what the app uses is kept (the answers are cached on the phone).
const num = (v) => (typeof v === 'number' ? v : null);
function compactHour(h) {
  const p = h.precipitation || {};
  return {
    s: h.interval && h.interval.startTime,
    t: num(h.temperature && h.temperature.degrees), f: num(h.feelsLikeTemperature && h.feelsLikeTemperature.degrees),
    h: num(h.relativeHumidity), r: num(p.qpf && p.qpf.quantity), p: num(p.probability && p.probability.percent),
    c: h.weatherCondition && h.weatherCondition.type, d: h.isDaytime ? 1 : 0,
    w: num(h.wind && h.wind.speed && h.wind.speed.value), a: num(h.wind && h.wind.direction && h.wind.direction.degrees),
    q: num(h.airPressure && h.airPressure.meanSeaLevelMillibars), u: num(h.uvIndex),
  };
}
function compactDay(d) {
  const part = (x) => x || {};
  const dt = part(d.daytimeForecast), nt = part(d.nighttimeForecast);
  const qpf = (x) => num(x.precipitation && x.precipitation.qpf && x.precipitation.qpf.quantity);
  const prob = (x) => num(x.precipitation && x.precipitation.probability && x.precipitation.probability.percent);
  const sun = d.sunEvents || {};
  const date = d.displayDate || {};
  return {
    date: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
    hi: num(d.maxTemperature && d.maxTemperature.degrees), lo: num(d.minTemperature && d.minTemperature.degrees),
    c: dt.weatherCondition && dt.weatherCondition.type, ps: (qpf(dt) || 0) + (qpf(nt) || 0),
    pp: Math.max(prob(dt) || 0, prob(nt) || 0), u: num(dt.uvIndex), rise: sun.sunriseTime || null, set: sun.sunsetTime || null,
  };
}

// ---------- merging into the Open-Meteo shape ----------
const localKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localIso = (iso) => { if (!iso) return null; const d = new Date(iso); return `${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayNumber = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000;

/**
 * Writes Google's forecast over the hours and days that are still ahead. Returns a new object; `data` is left alone.
 * Hours Google did not cover (everything after its 48 hours) are calibrated to its daily numbers, see calibrate().
 */
export function mergeGoogle(data, g) {
  if (!g || !g.hours || !g.hours.length) return data;
  const H = { ...data.h }, D = { ...data.d };
  for (const k of ['t', 'feels', 'hum', 'rain', 'prob', 'code', 'day', 'wind', 'dir', 'press', 'uv']) H[k] = H[k].slice();
  for (const k of ['code', 'hi', 'lo', 'psum', 'pprob', 'uv', 'rise', 'set']) D[k] = D[k].slice();

  // an hourly slot is a calendar day * 24 + the local hour, exactly as forecast.js counts them
  const t0 = dayNumber(+H.t0.slice(0, 4), +H.t0.slice(5, 7), +H.t0.slice(8, 10));
  // never touch the hours that already happened: those stay Open-Meteo's analysis, an old Google forecast must not replace them
  const nowIdx = Math.round(dayNumber(+data.now.slice(0, 4), +data.now.slice(5, 7), +data.now.slice(8, 10)) - t0) * 24 + Number(data.now.slice(11, 13));
  const covered = new Set();
  for (const h of g.hours) {
    if (!h.s || h.t == null) continue;
    const when = new Date(h.s);
    const i = Math.round(dayNumber(when.getFullYear(), when.getMonth() + 1, when.getDate()) - t0) * 24 + when.getHours();
    if (i < nowIdx || i >= H.t.length) continue;
    H.t[i] = h.t;
    if (h.f != null) H.feels[i] = h.f;
    if (h.h != null) H.hum[i] = h.h;
    if (h.c) H.code[i] = wmoOf(h.c);
    H.day[i] = h.d;
    if (h.w != null) H.wind[i] = h.w;
    if (h.a != null) H.dir[i] = h.a;
    if (h.q != null) H.press[i] = h.q;
    if (h.u != null) H.uv[i] = h.u;
    // Open-Meteo stores rain and chance as "the hour that just ended" one slot later; keep that convention
    if (i + 1 < H.rain.length) { H.rain[i + 1] = h.r == null ? 0 : h.r; H.prob[i + 1] = h.p == null ? 0 : h.p; }
    covered.add(i);
  }
  for (const d of g.days || []) {
    const i = D.time.indexOf(d.date);
    if (i < 0 || d.hi == null) continue;
    D.hi[i] = d.hi; D.lo[i] = d.lo;
    if (d.c) D.code[i] = wmoOf(d.c);
    D.psum[i] = d.ps; D.pprob[i] = d.pp;
    if (d.u != null) D.uv[i] = d.u;
    if (d.rise) D.rise[i] = localIso(d.rise);
    if (d.set) D.set[i] = localIso(d.set);
  }
  calibrate(data.h, H, D, g.days || [], t0, nowIdx, covered);
  return { ...data, h: H, d: D, src: 'google', gHours: covered.size };
}

const dryCodeOf = (dayCode) => Math.min(dayCode == null ? 2 : dayCode, 3);

/**
 * The hours Google's hourly answer did not reach keep Open-Meteo's shape but are pulled to Google's daily verdict:
 * temperatures stretched so the day's high and low are Google's; a day Google calls dry has no rain and no wet icons;
 * a wet day gets Google's amount and chance, spread over its most likely hours. `om` is Open-Meteo's untouched hourly data.
 */
function calibrate(om, H, D, days, t0, nowIdx, covered) {
  for (const d of days) {
    const di = D.time.indexOf(d.date);
    if (di < 0 || d.hi == null || d.lo == null) continue;
    const i0 = Math.round(dayNumber(+d.date.slice(0, 4), +d.date.slice(5, 7), +d.date.slice(8, 10)) - t0) * 24;
    const idx = [];
    let coveredRain = 0, omHi = -99, omLo = 99;
    for (let k = 0; k < 24; k++) {
      const i = i0 + k;
      if (i < 0 || i >= H.t.length) continue;
      if (om.t[i] != null) { omHi = Math.max(omHi, om.t[i]); omLo = Math.min(omLo, om.t[i]); }
      if (i < nowIdx) continue;
      if (covered.has(i)) coveredRain += (i + 1 < H.rain.length ? H.rain[i + 1] || 0 : 0);
      else idx.push(i);
    }
    if (!idx.length) continue;

    // temperature: Open-Meteo's day range -> Google's high/low (a plain shift when the range is too flat to stretch)
    const stretch = omHi - omLo >= 1.5 ? (d.hi - d.lo) / (omHi - omLo) : 1;
    for (const i of idx) {
      const t = om.t[i];
      if (t == null) continue;
      const nt = omHi - omLo >= 1.5 ? d.lo + (t - omLo) * stretch : t + ((d.hi + d.lo) / 2 - (omHi + omLo) / 2);
      H.feels[i] = (om.feels[i] == null ? nt : om.feels[i] + (nt - t));
      H.t[i] = nt;
    }

    // rain
    const slot = (i) => i + 1; // Open-Meteo keeps rain and chance one slot later
    const dry = d.pp < 25 && d.ps < 0.6;
    if (dry) {
      for (const i of idx) {
        if (slot(i) < H.rain.length) { H.rain[slot(i)] = 0; H.prob[slot(i)] = Math.min(H.prob[slot(i)] || 0, d.pp); }
        if (isWet(H.code[i])) H.code[i] = dryCodeOf(D.code[di]);
      }
      continue;
    }
    // the rain falls in one stretch: the run of hours where Open-Meteo itself sees the most rain and chance
    const cand = idx.filter((i) => slot(i) < H.rain.length);
    const want = Math.min(cand.length, Math.max(3, Math.min(8, Math.round(d.ps > 0 ? d.ps / 1.2 : 4))));
    const score = (i) => (om.prob[slot(i)] || 0) + 20 * (om.rain[slot(i)] || 0);
    let best = 0, bestSum = -1;
    for (let k = 0; k + want <= cand.length; k++) {
      let sum = 0;
      for (let j = 0; j < want; j++) sum += score(cand[k + j]);
      if (sum > bestSum) { bestSum = sum; best = k; }
    }
    const win = cand.slice(best, best + want);
    const inWin = new Set(win);
    const left = Math.max(0, d.ps - coveredRain);
    const weights = win.map((i) => (om.rain[slot(i)] || 0) + 0.2), wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const wetCode = isWet(D.code[di]) ? D.code[di] : 80;
    for (const i of idx) {
      if (slot(i) >= H.rain.length) continue;
      if (inWin.has(i)) {
        const k = win.indexOf(i);
        H.rain[slot(i)] = Math.round(left * weights[k] / wsum * 10) / 10;
        H.prob[slot(i)] = Math.max(H.prob[slot(i)] || 0, d.pp);
        if (!isWet(H.code[i])) H.code[i] = wetCode;
      } else {
        H.rain[slot(i)] = 0;
        H.prob[slot(i)] = Math.min(H.prob[slot(i)] || 0, Math.max(10, Math.round(d.pp / 2)));
        if (isWet(H.code[i])) H.code[i] = dryCodeOf(D.code[di]);
      }
    }
  }
}

/**
 * Merges Google into the freshly fetched Open-Meteo `items` ({ [place.key]: data }), fetching only what is not cached.
 * `manual` = the user pressed refresh: answers older than GOOGLE_MIN_AGE are fetched again; every other refresh
 * (start-up, coming back to the app, adding a place, the timer) only fetches what is older than GOOGLE_TTL or missing.
 * Returns { ok, partial, reason, detail }: ok is false when no place could be updated (items stay Open-Meteo's).
 */
export async function applyGoogle(items, places, key, manual) {
  const cache = loadGoogleCache() || {};
  const maxAge = manual ? GOOGLE_MIN_AGE : GOOGLE_TTL;
  let failure = null, detail = '', good = 0;
  const one = async (p) => {
    const data = items[p.key];
    if (!data) return;
    let g = cache[p.key];
    const moved = g && (Math.abs(g.lat - p.lat) > 0.001 || Math.abs(g.lon - p.lon) > 0.001);
    if (!g || moved || Date.now() - g.ts > maxAge) {
      if (failure && STOPS.includes(failure)) { if (!g || moved) return; } // the next call would fail the same way
      else {
        try {
          g = { ...(await fetchPlace(p, key, GOOGLE_HOURS)), lat: p.lat, lon: p.lon };
          cache[p.key] = g;
        } catch (e) {
          failure = failure || e.reason || 'other';
          detail = detail || e.detail || '';
          if (!g || moved) return; // nothing usable to fall back on: this place stays on Open-Meteo
        }
      }
    }
    items[p.key] = mergeGoogle(data, g);
    good++;
  };
  // One place at a time up to two: a wrong key or an exhausted quota stops the rest after the first failure, and the
  // per-minute limit is never hit by a burst.
  const queue = places.slice();
  const worker = async () => { while (queue.length) await one(queue.shift()); };
  await Promise.all([worker(), worker()]);
  const live = new Set(places.map((p) => p.key));
  for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
  saveGoogleCache(cache);
  return { ok: good > 0 && !failure, partial: good > 0 && !!failure, reason: failure, detail };
}
