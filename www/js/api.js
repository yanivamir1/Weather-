// Open-Meteo (weather, geocoding, air quality) and a reverse-geocoder for the "my location" row.
// Open-Meteo is free for non-commercial use without a key; data is CC BY 4.0 (attribution is shown in the app).
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

export const FORECAST_DAYS = 7;

const CURRENT = ['temperature_2m', 'apparent_temperature', 'weather_code', 'is_day', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'pressure_msl'];
const HOURLY = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'precipitation_probability', 'weather_code', 'is_day', 'wind_speed_10m', 'wind_direction_10m', 'pressure_msl', 'uv_index'];
const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max', 'uv_index_max', 'sunrise', 'sunset'];

async function getJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One time zone for every place, so all rows share a single hour axis. */
export function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto';
  } catch (e) {
    return 'auto';
  }
}

const round4 = (n) => Math.round(n * 10000) / 10000;

export async function searchPlaces(q) {
  const url = `${GEOCODE}?name=${encodeURIComponent(q)}&count=8&language=he&format=json`;
  const j = await getJson(url, 10000);
  return (j.results || []).map((r) => ({
    key: 'g' + r.id,
    id: r.id,
    name: r.name,
    sub: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: round4(r.latitude),
    lon: round4(r.longitude),
  }));
}

function normalize(r, pastDays) {
  const h = r.hourly, d = r.daily, c = r.current;
  return {
    pastDays,
    now: c.time, // local ISO "YYYY-MM-DDTHH:MM"
    cur: { t: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: c.is_day, hum: c.relative_humidity_2m, wind: c.wind_speed_10m, dir: c.wind_direction_10m, press: c.pressure_msl },
    // Hourly arrays are contiguous from 00:00 of the first day, so only the first timestamp is kept.
    h: { t0: h.time[0], t: h.temperature_2m, feels: h.apparent_temperature, hum: h.relative_humidity_2m, rain: h.precipitation, prob: h.precipitation_probability, code: h.weather_code, day: h.is_day, wind: h.wind_speed_10m, dir: h.wind_direction_10m, press: h.pressure_msl, uv: h.uv_index },
    d: { time: d.time, code: d.weather_code, hi: d.temperature_2m_max, lo: d.temperature_2m_min, psum: d.precipitation_sum, pprob: d.precipitation_probability_max, uv: d.uv_index_max, rise: d.sunrise, set: d.sunset },
  };
}

/** One request for every place. Returns { [place.key]: normalized }. past_days gives the "what was" history. */
export async function fetchForecasts(places, pastDays) {
  if (!places.length) return {};
  const q = [
    `latitude=${places.map((p) => round4(p.lat)).join(',')}`,
    `longitude=${places.map((p) => round4(p.lon)).join(',')}`,
    `timezone=${encodeURIComponent(deviceTz())}`,
    `past_days=${pastDays}`,
    `forecast_days=${FORECAST_DAYS}`,
    `current=${CURRENT.join(',')}`,
    `hourly=${HOURLY.join(',')}`,
    `daily=${DAILY.join(',')}`,
  ].join('&');
  const j = await getJson(`${FORECAST}?${q}`);
  const list = Array.isArray(j) ? j : [j]; // a single location comes back as an object, several as an array
  if (list.length !== places.length) throw new Error('unexpected response');
  const out = {};
  places.forEach((p, i) => { out[p.key] = normalize(list[i], pastDays); });
  return out;
}

/** European AQI (0-100+). Loaded only when a detail sheet opens. */
export async function fetchAirQuality(lat, lon) {
  const url = `${AIR}?latitude=${round4(lat)}&longitude=${round4(lon)}&current=european_aqi,pm2_5&timezone=${encodeURIComponent(deviceTz())}`;
  const j = await getJson(url, 10000);
  const c = j.current || {};
  return { aqi: c.european_aqi == null ? null : Math.round(c.european_aqi), pm25: c.pm2_5 };
}

/** City name for the GPS row. Returns '' on any failure — the row is then simply called "המיקום שלי". */
export async function reverseGeocode(lat, lon) {
  try {
    const j = await getJson(`${REVERSE}?latitude=${round4(lat)}&longitude=${round4(lon)}&localityLanguage=he`, 8000);
    return j.city || j.locality || j.principalSubdivision || '';
  } catch (e) {
    return '';
  }
}
