// Google Weather API (weather.googleapis.com) as an optional source for the FORECAST part of every place.
// Open-Meteo stays the base (it is the only one with the past days and the "what was" history); when Google is
// switched on, its hourly forecast (up to the end of the 7th day) and daily forecast replace Open-Meteo's for the
// hours and days that are still ahead. Everything is merged into the same normalized shape as api.js, so no other
// module needs to know where a number came from.
//
// Calls are counted (the free allowance is 10,000 a month) and kept for a while, because one full refresh of one place
// is up to 8 calls (hours come 24 at a time, plus one for the days).
import { loadGoogleCache, loadGoogleUsage, saveGoogleCache, saveGoogleUsage } from './storage.js';
import { FORECAST_DAYS } from './api.js';

const BASE = 'https://weather.googleapis.com/v1';
export const GOOGLE_TTL = 3 * 60 * 60 * 1000;      // a forecast older than this is fetched again on refresh
export const GOOGLE_MIN_AGE = 20 * 60 * 1000;      // even a manual refresh reuses an answer younger than this
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
  constructor(reason, status) { super(reason); this.reason = reason; this.status = status; }
}
/** key = the key is wrong, denied = the API is off for that key, quota = limit reached, network, other. */
export const REASON_TEXT = {
  key: 'המפתח לא תקין',
  denied: 'המפתח אינו מורשה ל-Weather API (צריך להפעיל אותו ל-Weather API בלבד, בלי הגבלת אפליקציה)',
  quota: 'נגמרה המכסה של המפתח',
  network: 'אין חיבור ל-Google',
  other: 'Google החזיר שגיאה',
};

function countCall() {
  const month = new Date().toISOString().slice(0, 7);
  const u = loadGoogleUsage();
  saveGoogleUsage(u.month === month ? { month, n: u.n + 1 } : { month, n: 1 });
}
export function googleUsage() {
  const month = new Date().toISOString().slice(0, 7);
  const u = loadGoogleUsage();
  return u.month === month ? u.n : 0;
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
  let reason = 'other';
  if (res.status === 429) reason = 'quota';
  else if (res.status === 403) reason = 'denied';
  else if (res.status === 400 || res.status === 401) reason = 'key';
  throw new GoogleError(reason, res.status);
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

/** The raw answer for one place: hours until the end of the last forecast day, and the days. */
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

/** Writes Google's forecast over the hours and days that are still ahead. Returns a new object; `data` is left alone. */
export function mergeGoogle(data, g) {
  if (!g || !g.hours || !g.hours.length) return data;
  const H = { ...data.h }, D = { ...data.d };
  for (const k of ['t', 'feels', 'hum', 'rain', 'prob', 'code', 'day', 'wind', 'dir', 'press', 'uv']) H[k] = H[k].slice();
  for (const k of ['code', 'hi', 'lo', 'psum', 'pprob', 'uv', 'rise', 'set']) D[k] = D[k].slice();

  // an hourly slot is a calendar day * 24 + the local hour, exactly as forecast.js counts them
  const t0 = dayNumber(+H.t0.slice(0, 4), +H.t0.slice(5, 7), +H.t0.slice(8, 10));
  // never touch the hours that already happened: those stay Open-Meteo's analysis, an old Google forecast must not replace them
  const nowIdx = Math.round(dayNumber(+data.now.slice(0, 4), +data.now.slice(5, 7), +data.now.slice(8, 10)) - t0) * 24 + Number(data.now.slice(11, 13));
  let replaced = 0;
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
    replaced++;
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
  return { ...data, h: H, d: D, src: 'google', gHours: replaced };
}

/**
 * Merges Google into the freshly fetched Open-Meteo `items` ({ [place.key]: data }), fetching only what is not cached.
 * `force` = the user asked for a refresh: answers older than GOOGLE_MIN_AGE are fetched again, otherwise GOOGLE_TTL.
 * Returns { ok, reason }: ok is false when no place could be updated (items stay as Open-Meteo gave them).
 */
export async function applyGoogle(items, places, key, force) {
  const cache = loadGoogleCache() || {};
  const maxAge = force ? GOOGLE_MIN_AGE : GOOGLE_TTL;
  let failure = null, good = 0;
  const one = async (p) => {
    const data = items[p.key];
    if (!data) return;
    let g = cache[p.key];
    const moved = g && (Math.abs(g.lat - p.lat) > 0.001 || Math.abs(g.lon - p.lon) > 0.001);
    if (!g || moved || Date.now() - g.ts > maxAge) {
      try {
        const hoursNeeded = Math.max(24, FORECAST_DAYS * 24 - Number(data.now.slice(11, 13)));
        g = { ...(await fetchPlace(p, key, hoursNeeded)), lat: p.lat, lon: p.lon };
        cache[p.key] = g;
      } catch (e) {
        failure = failure || e.reason || 'other';
        if (!g || moved) return; // nothing usable to fall back on: this place stays on Open-Meteo
      }
    }
    items[p.key] = mergeGoogle(data, g);
    good++;
  };
  // The first place goes alone: a wrong key or an exhausted quota would fail all of them, so don't spend calls on the rest.
  const [first, ...rest] = places;
  await one(first);
  if (!failure || !['key', 'denied', 'quota'].includes(failure)) await Promise.all(rest.map(one));
  const live = new Set(places.map((p) => p.key));
  for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
  saveGoogleCache(cache);
  return { ok: good > 0 && !failure, partial: good > 0 && !!failure, reason: failure };
}
