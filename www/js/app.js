// Weather app: one Google-weather-style card per place, a shared hour axis (the strips scroll together),
// day tiles that reach back into the past ("what was", to tell whether it rained) and a detail sheet per place.
import { APP_VERSION } from './version.js';
import { fetchAirQuality, fetchForecasts, reverseGeocode } from './api.js';
import { nowDate, nowHour, pastDaysAvailable } from './forecast.js';
import { placeCard } from './placeCard.js';
import { dayTilesHtml } from './daySelector.js';
import { detailHtml, fillAqi } from './detailSheet.js';
import { openAddSheet } from './addSheet.js';
import { openSettings } from './settingsSheet.js';
import { $, clearToast, closeSheet, esc, icon, isSheetOpen, openSheet, sheetEl, toast } from './dom.js';
import { ago } from './i18n.js';
import { distanceKm, getPosition } from './geo.js';
import { setUnits } from './units.js';
import { loadCache, loadGps, loadPlaces, loadSettings, saveCache, saveGps, savePlaces, saveSettings } from './storage.js';

const CACHE_TTL = 15 * 60 * 1000;
const AUTO_REFRESH = 30 * 60 * 1000;

const state = {
  settings: loadSettings(),
  saved: loadPlaces(),
  gps: loadGps(),
  data: {},
  fetchedAt: 0,
  loading: false,
  failed: false,
  day: 0,          // the day the hourly strips are showing (0 = today, negative = the past)
  hourDay: 0,      // the day of the selected hour (differs from `day` when a strip spilled into the next day)
  hour: new Date().getHours(),
  hourFromData: false,
  focusKey: null,
  resetDays: true,  // scroll the day tiles so that today is the first tile
  revealDay: false, // scroll the selected day tile into view after a tap on it
  resetStrip: true, // put the strips back at their first column
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

function resetToNow() {
  const ref = anyData();
  state.day = 0;
  state.hourDay = 0;
  state.hour = ref ? nowHour(ref) : new Date().getHours();
  state.resetStrip = true;
  state.hourFromData = !!ref;
}

async function refresh(force) {
  const ps = places();
  if (!ps.length) { render(); return; }
  const fresh = Date.now() - state.fetchedAt < CACHE_TTL && ps.every((p) => state.data[p.key]);
  if (!force && fresh) { render(); return; }
  if (inflight) { queued = true; return inflight; }
  state.loading = true;
  render();
  inflight = (async () => {
    try {
      const items = await fetchForecasts(ps, state.settings.pastDays);
      state.data = items;
      state.fetchedAt = Date.now();
      state.failed = false;
      saveCache({ ts: state.fetchedAt, pastDays: state.settings.pastDays, items });
      if (!state.hourFromData) resetToNow();
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
function headerHtml() {
  return `<div class="gp-loc"><span class="gp-dot"></span><span class="gp-locname">כל המקומות</span><span class="gp-sep">·</span><button class="gp-link" data-act="add">הוספת מקום</button></div>
    <div class="gp-h1"><h1>מזג אוויר</h1><div class="gp-hb"><button class="gp-menu${state.loading ? ' spin' : ''}" data-act="refresh" aria-label="רענון">${icon('gi-refresh')}</button><button class="gp-menu" data-act="settings" aria-label="הגדרות">${icon('gi-dots')}</button></div></div>`;
}

function footerHtml() {
  const age = state.fetchedAt ? ago(Date.now() - state.fetchedAt) : '';
  const stale = state.failed && state.fetchedAt ? '<br><span class="stale">אין חיבור לשרת. מוצגים נתונים שנשמרו.</span>' : '';
  return `<div class="gp-foot">מזג אוויר ${APP_VERSION} · נתונים: Open-Meteo.com${age ? `<br>עודכן ${age}` : ''}${stale}</div>`;
}

function render() {
  const list = $('#list');
  setUnits(state.settings);
  const prevTop = list.scrollTop;
  const prevDays = $('#days') ? $('#days').scrollLeft : 0;
  const firstStrip = $('.gp-strip');
  const prevStrip = firstStrip ? firstStrip.scrollLeft : 0;

  const rs = rows();
  const f = focusRow(rs);
  if (f) state.focusKey = f.key;
  const ref = anyData();
  let html = '<div class="ptr" id="ptr">משחרר לרענון…</div>' + headerHtml();

  if (!rs.length) {
    html += `<div class="gp-empty"><h2>איפה מזג האוויר?</h2>
      <p>הוסף עיר או מקום כדי לראות איך נראה היום בכל אחד מהם, ומה היה בימים האחרונים.</p>
      <div class="acts"><button class="gp-tonal fill" data-act="add">הוסף עיר</button><button class="gp-tonal" data-act="gps">${icon('gi-pin', 18)}המיקום שלי</button></div></div>`;
  } else {
    const loaded = rs.filter((r) => r.data);
    const avail = loaded.length ? Math.min(state.settings.pastDays, ...loaded.map((r) => pastDaysAvailable(r.data))) : 0;
    if (state.day < -avail) { state.day = 0; state.hourDay = 0; state.hour = ref ? nowHour(ref) : state.hour; }
    if (ref) {
      html += `<div class="gp-days" id="days">${dayTilesHtml({ todayIso: nowDate(ref), pastDays: avail, selected: state.day, focusData: f ? f.data : null, rows: rs })}</div>`;
    }
    if (!loaded.length && state.failed) {
      html += `<div class="gp-errbox"><span>לא הצלחתי להביא נתונים. בדוק את החיבור לאינטרנט.</span><button class="gp-tonal" data-act="refresh">נסה שוב</button></div>`;
    }
    const s = { day: state.day, hourDay: state.hourDay, hour: state.hour };
    html += rs.map((r) => placeCard(r, r.data, s, rs.length > 1 && r.key === state.focusKey)).join('');
  }
  html += footerHtml();
  list.innerHTML = html;

  list.scrollTop = prevTop;
  const days = $('#days');
  if (days) {
    if (state.resetDays && ref) {
      const today = days.querySelector('[data-d="0"]');
      if (today) { today.scrollIntoView({ inline: 'start', block: 'nearest' }); state.resetDays = false; list.scrollTop = prevTop; }
    } else {
      days.scrollLeft = prevDays;
      if (state.revealDay) {
        const sel = days.querySelector('.gp-day.on');
        if (sel) { sel.scrollIntoView({ inline: 'nearest', block: 'nearest' }); list.scrollTop = prevTop; }
      }
    }
  }
  state.revealDay = false;
  const x = state.resetStrip ? 0 : prevStrip;
  state.resetStrip = false;
  list.querySelectorAll('.gp-strip').forEach((el) => { el.scrollLeft = x; });
}

// ---------- actions ----------
function setDay(d) {
  const ref = anyData();
  state.day = d;
  state.hourDay = d;
  state.hour = d === 0 && ref ? nowHour(ref) : 7;
  state.resetStrip = true;
  state.revealDay = true;
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
  const sheet = openSheet(detailHtml(r, r.data, { hourDay: state.hourDay, hour: state.hour }, ctx), () => { state.sheetKey = null; });
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
      if (daysChanged) { state.data = {}; state.fetchedAt = 0; state.resetDays = true; state.day = 0; state.hourDay = 0; refresh(true); }
      render();
    },
  });
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  switch (t.dataset.act) {
    case 'day': setDay(+t.dataset.d); break;
    case 'hour':
      state.focusKey = t.dataset.key;
      state.hourDay = +t.dataset.d;
      state.hour = +t.dataset.h;
      render();
      break;
    case 'focus': state.focusKey = t.dataset.key; render(); break;
    case 'open': openDetail(t.dataset.key); break;
    case 'refresh': refresh(true); break;
    case 'settings': showSettings(); break;
    case 'add': openAdd(); break;
    case 'gps': enableGps(); break;
    case 'close-sheet': closeSheet(); break;
    case 'remove': removePlace(t.dataset.key); break;
    case 'move-up': movePlace(t.dataset.key, -1); break;
    case 'move-down': movePlace(t.dataset.key, 1); break;
    case 'acc': {
      const ac = t.closest('.gp-ac');
      const open = !ac.classList.contains('open');
      ac.classList.toggle('open', open);
      t.setAttribute('aria-expanded', String(open));
      ac.querySelector('.gp-acb').hidden = !open;
      break;
    }
    default: break;
  }
});

// all hourly strips scroll together: that is the shared timeline
$('#list').addEventListener('scroll', (e) => {
  const el = e.target;
  if (!el.classList || !el.classList.contains('gp-strip')) return;
  const x = el.scrollLeft;
  $('#list').querySelectorAll('.gp-strip').forEach((o) => { if (o !== el && o.scrollLeft !== x) o.scrollLeft = x; });
}, true);

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
  refresh(false).then(() => { if (anyData() && !state.hourFromData) { resetToNow(); render(); } });
  followGps();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, AUTO_REFRESH);

// ---------- start ----------
loadFromCache();
if (anyData()) resetToNow();
render();
refresh(false);
followGps();
