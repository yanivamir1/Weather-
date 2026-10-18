// Weather app (design option 5 "Ribbon"): one row per place on a shared 24-hour axis, a day picker that
// reaches back into the past ("what was", to tell whether it rained) and a background that follows the weather.
import { APP_VERSION } from './version.js';
import { fetchAirQuality, fetchForecasts, reverseGeocode } from './api.js';
import { at, nowDate, nowHour, pastDaysAvailable, rainSentence, summary } from './forecast.js';
import { axisHtml, ribbonRow } from './ribbonRow.js';
import { daySelectorHtml } from './daySelector.js';
import { detailHtml, fillAqi } from './detailSheet.js';
import { openAddSheet } from './addSheet.js';
import { openSettings } from './settingsSheet.js';
import { setCalm, setScene } from './scene.js';
import { $, clearToast, closeSheet, esc, icon, isSheetOpen, openSheet, sheetEl, toast } from './dom.js';
import { WEEKDAY_FULL, addDays, ago, hh, monthName, parseDay } from './i18n.js';
import { distanceKm, getPosition } from './geo.js';
import { fmtTemp, mmSentence, setUnits, windNum, windUnit } from './units.js';
import { loadCache, loadGps, loadPlaces, loadSettings, saveCache, saveGps, savePlaces, saveSettings } from './storage.js';

const CACHE_TTL = 15 * 60 * 1000;
const AUTO_REFRESH = 30 * 60 * 1000;
const METRICS = [['temp', 'טמפרטורה'], ['rain', 'גשם'], ['wind', 'רוח'], ['uv', 'UV']];

const state = {
  settings: loadSettings(),
  saved: loadPlaces(),
  gps: loadGps(),
  data: {},
  fetchedAt: 0,
  loading: false,
  failed: false,
  day: 0,
  hour: new Date().getHours(),
  hourFromData: false,
  metric: 'temp',
  focusKey: null,
  resetDays: true,
  sheetKey: null,
};
let inflight = null;
let queued = false;

// ---------- places ----------
function places() {
  const list = [];
  if (state.gps && state.gps.enabled && state.settings.showGps) {
    list.push({ key: 'gps', gps: true, name: state.gps.name || 'המיקום שלי', lat: state.gps.lat, lon: state.gps.lon });
  }
  return list.concat(state.saved);
}
const rows = () => places().map((p) => ({ ...p, data: state.data[p.key] || null }));
const anyData = () => Object.values(state.data)[0] || null;
const focusRow = (rs) => rs.find((r) => r.key === state.focusKey) || rs[0] || null;

// ---------- data ----------
function loadFromCache() {
  const c = loadCache();
  if (c && c.pastDays === state.settings.pastDays && c.items) {
    state.data = c.items;
    state.fetchedAt = c.ts || 0;
  }
}

async function refresh(force) {
  const ps = places();
  if (!ps.length) { render(); return; }
  const fresh = Date.now() - state.fetchedAt < CACHE_TTL && ps.every((p) => state.data[p.key]);
  if (!force && fresh) { render(); return; }
  if (inflight) { queued = true; return inflight; }
  state.loading = true;
  renderTop();
  inflight = (async () => {
    try {
      const items = await fetchForecasts(ps, state.settings.pastDays);
      state.data = items;
      state.fetchedAt = Date.now();
      state.failed = false;
      saveCache({ ts: state.fetchedAt, pastDays: state.settings.pastDays, items });
      if (!state.hourFromData) { state.hour = nowHour(anyData()); state.hourFromData = true; }
    } catch (e) {
      state.failed = true; // keep whatever is cached and say so in the footer
    } finally {
      state.loading = false;
      inflight = null;
    }
    render();
    if (queued) { queued = false; refresh(true); }
  })();
  return inflight;
}

// ---------- rendering ----------
function dateLine() {
  const ref = anyData();
  const base = ref ? parseDay(nowDate(ref)) : new Date();
  const date = addDays(base, state.day);
  const isNow = ref && state.day === 0 && state.hour === nowHour(ref);
  const past = ref && (state.day < 0 || (state.day === 0 && state.hour < nowHour(ref)));
  return `${WEEKDAY_FULL[date.getDay()]}, ${date.getDate()} ${monthName(date)} · ${isNow ? 'עכשיו ' : ''}${hh(state.hour)}${past ? ' · מה שהיה' : ''}`;
}

function renderTop() {
  const top = $('#top');
  const rs = rows();
  const ref = anyData();
  const prevDays = $('#days');
  const prevScroll = prevDays ? prevDays.scrollLeft : 0;
  let body = '';
  if (rs.length) {
    const avail = ref ? Math.min(state.settings.pastDays, ...rs.filter((r) => r.data).map((r) => pastDaysAvailable(r.data))) : 0;
    if (state.day < -avail) state.day = 0;
    const days = ref ? daySelectorHtml({ todayIso: nowDate(ref), pastDays: avail, selected: state.day, rows: rs }) : '';
    const chips = ref ? summary(rs, state.day, state.hour, state.metric) : [];
    body = `<div class="days" id="days">${days}</div>
      <div class="mets">${METRICS.map(([k, l]) => `<button class="pill ring${state.metric === k ? ' on' : ''}" data-act="metric" data-v="${k}" aria-pressed="${state.metric === k}">${l}</button>`).join('')}</div>
      <div class="sumrow">${chips.map((c) => `<div class="sumchip"><span class="k">${esc(c.k)}</span>${c.name ? `<span class="v"><span class="nz">${esc(c.name)}</span><span class="vv num">${esc(c.val)}</span></span>` : `<span class="v">${esc(c.v)}</span>`}</div>`).join('')}</div>`;
  }
  top.innerHTML = `<div class="hd"><div><h1 class="ttl">מזג אוויר</h1><div class="sub">${esc(dateLine())}</div></div>
    <div class="hdbtns"><button class="icbtn${state.loading ? ' spin' : ''}" data-act="refresh" aria-label="רענון">${icon('refresh')}</button><button class="icbtn" data-act="settings" aria-label="הגדרות">${icon('sliders')}</button></div></div>${body}`;
  const days = $('#days');
  if (days) {
    if (state.resetDays && ref) {
      const today = days.querySelector('[data-d="0"]');
      if (today) { today.scrollIntoView({ inline: 'start', block: 'nearest' }); state.resetDays = false; }
    } else {
      days.scrollLeft = prevScroll;
      const sel = days.querySelector('.day.on');
      if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }
}

function focusCard(rs) {
  const f = focusRow(rs);
  if (!f || !f.data) return '';
  const x = at(f.data, state.day, state.hour);
  if (!x) return '';
  const rain = x.past ? `ירד ${mmSentence(x.rain)}` : `סיכוי גשם ${x.prob == null ? 0 : x.prob}%`;
  return `<button class="fcard t-${x.scene}" data-act="open" data-key="${esc(f.key)}" aria-label="פירוט ${esc(f.name)}">
    <img class="ic" style="width:38px;height:38px" src="icons/${x.icon}.svg" alt="">
    <div class="fbig num">${fmtTemp(x.t)}</div>
    <div class="finfo"><div class="fn">${esc(f.name)} · ${hh(state.hour)}</div>
    <div class="fl">${esc(x.label)} · ${rain} · רוח <span class="num">${windNum(x.wind)}</span> ${windUnit()}</div>
    <div class="fs">${esc(rainSentence(f.data, state.day))}</div></div>
  </button>`;
}

function footer() {
  const age = state.fetchedAt ? ago(Date.now() - state.fetchedAt) : '';
  const stale = state.failed && state.fetchedAt ? '<br><span class="stale">אין חיבור לשרת. מוצגים נתונים שנשמרו.</span>' : '';
  return `<div class="foot">מזג אוויר ${APP_VERSION} · נתונים: Open-Meteo.com${age ? `<br>עודכן ${age}` : ''}${stale}</div>`;
}

function renderList() {
  const list = $('#list');
  const prev = list.scrollTop;
  const rs = rows();
  let html = '<div class="ptr" id="ptr">משחרר לרענון…</div>';
  if (!rs.length) {
    html += `<div class="empty"><h2>איפה מזג האוויר?</h2>
      <p>הוסף עיר או מקום כדי לראות איך נראה היום בכל אחד מהם, ומה היה בימים האחרונים.</p>
      <div class="acts"><button class="pill cream" data-act="add">הוסף עיר</button><button class="pill ring" data-act="gps">${icon('pin', 18)}&nbsp;המיקום שלי</button></div></div>`;
  } else {
    const hasData = rs.some((r) => r.data);
    if (!hasData && state.failed) {
      html += `<div class="errbox"><span>לא הצלחתי להביא נתונים. בדוק את החיבור לאינטרנט.</span><button class="pill ring" data-act="refresh">נסה שוב</button></div>`;
    }
    const s = { day: state.day, hour: state.hour, metric: state.metric, focusKey: (focusRow(rs) || {}).key };
    html += axisHtml(s, anyData());
    html += rs.map((r) => ribbonRow(r, r.data, s)).join('');
    html += focusCard(rs);
  }
  html += footer();
  list.innerHTML = html;
  list.scrollTop = prev;
}

function render() {
  const rs = rows();
  const f = focusRow(rs);
  if (f) state.focusKey = f.key;
  setUnits(state.settings);
  setCalm(state.settings.calm);
  renderTop();
  renderList();
  const x = f && f.data ? at(f.data, state.day, state.hour) : null;
  setScene(x ? x.scene : new Date().getHours() >= 6 && new Date().getHours() < 18 ? 'sun' : 'night');
}

// ---------- actions ----------
function setDay(d) {
  state.day = d;
  const ref = anyData();
  if (d === 0 && ref) state.hour = nowHour(ref);
  render();
}

function openDetail(key) {
  const rs = rows();
  const r = rs.find((x) => x.key === key);
  if (!r || !r.data) return;
  state.focusKey = key;
  state.sheetKey = key;
  const idx = state.saved.findIndex((p) => p.key === key);
  const ctx = { canUp: idx > 0, canDown: idx >= 0 && idx < state.saved.length - 1 };
  const sheet = openSheet(detailHtml(r, r.data, { day: state.day, hour: state.hour }, ctx), () => { state.sheetKey = null; });
  fetchAirQuality(r.lat, r.lon).then((aq) => { if (state.sheetKey === key) fillAqi(sheetEl() || sheet, aq); }).catch(() => {});
  render();
}

function addPlace(p) {
  if (places().some((x) => x.key === p.key)) return;
  state.saved.push({ key: p.key, id: p.id, name: p.name, sub: p.sub, lat: p.lat, lon: p.lon });
  savePlaces(state.saved);
  state.focusKey = p.key;
  render();
  refresh(true);
  toast(`נוסף: ${p.name}`);
}

function removePlace(key) {
  closeSheet();
  if (key === 'gps') {
    state.gps = { ...state.gps, enabled: false };
    saveGps(state.gps);
    render();
    toast('המיקום שלי כובה', { label: 'בטל', run: () => { state.gps = { ...state.gps, enabled: true }; saveGps(state.gps); render(); refresh(true); } });
    return;
  }
  const idx = state.saved.findIndex((p) => p.key === key);
  if (idx < 0) return;
  const [gone] = state.saved.splice(idx, 1);
  savePlaces(state.saved);
  render();
  toast(`הוסר: ${gone.name}`, { label: 'בטל', run: () => { state.saved.splice(Math.min(idx, state.saved.length), 0, gone); savePlaces(state.saved); render(); refresh(false); } });
}

function movePlace(key, dir) {
  const i = state.saved.findIndex((p) => p.key === key), j = i + dir;
  if (i < 0 || j < 0 || j >= state.saved.length) return;
  [state.saved[i], state.saved[j]] = [state.saved[j], state.saved[i]];
  savePlaces(state.saved);
  closeSheet();
  render();
}

const GPS_MSG = {
  denied: 'ההרשאה למיקום נדחתה. אפשר לאשר אותה בהגדרות המכשיר.',
  timeout: 'לא הצלחתי לאתר מיקום בזמן. נסה שוב.',
  unavailable: 'המיקום לא זמין במכשיר.',
};

async function enableGps() {
  toast('מאתר מיקום…');
  const r = await getPosition();
  if (!r.ok) { toast(GPS_MSG[r.reason] || GPS_MSG.unavailable); return; }
  clearToast();
  state.gps = { enabled: true, lat: r.lat, lon: r.lon, name: '', ts: Date.now() };
  state.settings = { ...state.settings, showGps: true };
  saveSettings(state.settings);
  saveGps(state.gps);
  state.focusKey = 'gps';
  render();
  refresh(true);
  reverseGeocode(r.lat, r.lon).then((name) => {
    if (name && state.gps && state.gps.enabled) { state.gps = { ...state.gps, name }; saveGps(state.gps); render(); }
  });
}

/** Quietly follow the phone: only when it was enabled before (so no permission prompt appears on launch). */
async function followGps() {
  if (!state.gps || !state.gps.enabled || !state.settings.showGps) return;
  const r = await getPosition();
  if (!r.ok) return;
  if (distanceKm(state.gps, { lat: r.lat, lon: r.lon }) < 3) return;
  state.gps = { ...state.gps, lat: r.lat, lon: r.lon, name: '', ts: Date.now() };
  saveGps(state.gps);
  render();
  refresh(true);
  reverseGeocode(r.lat, r.lon).then((name) => {
    if (name && state.gps) { state.gps = { ...state.gps, name }; saveGps(state.gps); render(); }
  });
}

function openAdd() {
  openAddSheet({
    existing: places().map((p) => p.key),
    gpsOn: !!(state.gps && state.gps.enabled && state.settings.showGps),
    onAdd: addPlace,
    onGps: enableGps,
  });
}

function showSettings() {
  openSettings(state.settings, {
    onChange: (next) => {
      const daysChanged = next.pastDays !== state.settings.pastDays;
      state.settings = next;
      saveSettings(next);
      if (daysChanged) { state.data = {}; state.fetchedAt = 0; state.resetDays = true; state.day = 0; refresh(true); }
      render();
    },
    onClose: () => {},
  });
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  switch (t.dataset.act) {
    case 'day': setDay(+t.dataset.d); break;
    case 'metric': state.metric = t.dataset.v; render(); break;
    case 'tap': {
      const r = t.getBoundingClientRect();
      const h = Math.floor(Math.min(23.99, Math.max(0, ((r.right - e.clientX) / r.width) * 24)));
      state.focusKey = t.dataset.key;
      state.hour = h;
      render();
      break;
    }
    case 'open': openDetail(t.dataset.key); break;
    case 'refresh': refresh(true); break;
    case 'settings': showSettings(); break;
    case 'add': openAdd(); break;
    case 'gps': enableGps(); break;
    case 'close-sheet': closeSheet(); break;
    case 'remove': removePlace(t.dataset.key); break;
    case 'move-up': movePlace(t.dataset.key, -1); break;
    case 'move-down': movePlace(t.dataset.key, 1); break;
    default: break;
  }
});
$('#fab').dataset.act = 'add';

// pull to refresh
(() => {
  const list = $('#list');
  let y0 = null, armed = false;
  list.addEventListener('touchstart', (e) => { y0 = list.scrollTop <= 0 && !isSheetOpen() ? e.touches[0].clientY : null; armed = false; }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    const ptr = $('#ptr');
    if (ptr) ptr.classList.toggle('on', dy > 24);
    armed = dy > 80;
  }, { passive: true });
  list.addEventListener('touchend', () => {
    const ptr = $('#ptr');
    if (ptr) ptr.classList.remove('on');
    if (armed) refresh(true);
    y0 = null; armed = false;
  });
})();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  state.hourFromData = false;
  refresh(false).then(() => { if (anyData() && !state.hourFromData) { state.hour = nowHour(anyData()); state.hourFromData = true; render(); } });
  followGps();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, AUTO_REFRESH);

// ---------- start ----------
loadFromCache();
if (anyData()) { state.hour = nowHour(anyData()); state.hourFromData = true; }
render();
refresh(false);
followGps();
