// Weather app: one Google-weather-style card per place, a shared hour axis (the strips scroll together),
// day tiles that reach back into the past ("what was", to tell whether it rained) and a detail sheet per place.
import { APP_VERSION } from './version.js';
import { fetchAirQuality, fetchForecasts, reverseGeocode } from './api.js';
import { nowDate, nowHour, pastDaysAvailable } from './forecast.js';
import { placeCard } from './placeCard.js';
import { initDrag, isDragging } from './dragReorder.js';
import { dayTilesHtml } from './daySelector.js';
import { detailHtml, fillAqi } from './detailSheet.js';
import { openAddSheet } from './addSheet.js';
import { openSettings } from './settingsSheet.js';
import { $, clearToast, closeSheet, esc, icon, isSheetOpen, openSheet, sheetEl, toast } from './dom.js';
import { ago } from './i18n.js';
import { distanceKm, getPosition } from './geo.js';
import { setUnits } from './units.js';
import { applyLook } from './look.js';
import { REASON_TEXT, applyGoogle, googleUsage, testGoogleKey } from './google.js';
import { loadCache, loadGoogleKey, loadGps, loadPlaces, loadSettings, saveCache, saveGoogleCache, saveGoogleKey, saveGps, savePlaces, saveSettings } from './storage.js';

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
  resetDayStrip: true, // put the high/low day strips back so that today is the first column
  sheetKey: null,
  google: null,    // what the last Google call round said: { ok, partial, reason } (null = Google not in use)
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

/** force = fetch Open-Meteo even if it is fresh. manual = the user pressed refresh: only then may Google answers younger than 6 hours be refetched. */
async function refresh(force, manual = false) {
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
      // Google's forecast replaces Open-Meteo's for the hours still ahead; any failure leaves Open-Meteo in place
      const gkey = state.settings.source === 'google' ? loadGoogleKey() : '';
      state.google = gkey ? await applyGoogle(items, ps, gkey, manual) : null;
      if (state.google && state.google.reason && manual) toast('Google: ' + (REASON_TEXT[state.google.reason] || REASON_TEXT.other) + '. מוצגת תחזית Open-Meteo.');
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
  const g = state.settings.source === 'google';
  const used = g && Object.values(state.data).some((d) => d && d.src === 'google');
  const src = used ? 'תחזית: Google Weather · מה שהיה: Open-Meteo.com' : 'נתונים: Open-Meteo.com';
  const gnote = !g ? '' : !loadGoogleKey() ? '<br><span class="stale">Google: חסר מפתח (בהגדרות)</span>'
    : state.google && state.google.reason ? `<br><span class="stale">Google: ${REASON_TEXT[state.google.reason] || REASON_TEXT.other}${used ? ' (חלק מהנתונים מהשמירה)' : ''}</span>` : '';
  return `<div class="gp-foot">מזג אוויר ${APP_VERSION} · ${src}${age ? `<br>עודכן ${age}` : ''}${stale}${gnote}</div>`;
}

function render() {
  if (isDragging()) return; // rebuilding the list would drop the card under the finger; onEnd of the drag renders
  const list = $('#list');
  setUnits(state.settings);
  const prevTop = list.scrollTop;
  const prevDays = $('#days') ? $('#days').scrollLeft : 0;
  const firstStrip = $('.gp-strip');
  const prevStrip = firstStrip ? firstStrip.scrollLeft : 0;
  const firstDays = $('.gp-dstrip');
  const prevDayStrip = firstDays ? firstDays.scrollLeft : null;

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
    const s = { day: state.day, hourDay: state.hourDay, hour: state.hour, avail, dayTemps: state.settings.dayTemps };
    html += rs.map((r) => placeCard(r, r.data, s, rs.length > 1 && r.key === state.focusKey, state.saved.length > 1)).join('');
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

  // the high/low day strips scroll together too; the first time (or after a reset) today is the first column
  const dayStrips = list.querySelectorAll('.gp-dstrip');
  if (dayStrips.length) {
    let dx = prevDayStrip;
    if (state.resetDayStrip || dx == null) {
      const first = dayStrips[0], today = first.querySelector('[data-d="0"]');
      first.scrollLeft = 0;
      if (today) first.scrollLeft += today.getBoundingClientRect().right - (first.getBoundingClientRect().right - parseFloat(getComputedStyle(first).paddingRight));
      dx = first.scrollLeft;
      state.resetDayStrip = false;
    }
    dayStrips.forEach((el) => { el.scrollLeft = dx; });
  }
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

/** Drop of a dragged card: put it at `to` among the saved places (the pinned "my location" card is not in that list). */
function reorderPlace(key, to) {
  const i = state.saved.findIndex((p) => p.key === key);
  if (i < 0 || to < 0 || to >= state.saved.length || i === to) return;
  const [p] = state.saved.splice(i, 1);
  state.saved.splice(to, 0, p);
  savePlaces(state.saved);
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
    existing: places().map((p) => ({ key: p.key, lat: p.lat, lon: p.lon })),
    gpsOn: !!(state.gps && state.gps.enabled && state.settings.showGps),
    onAdd: addPlace,
    onGps: enableGps,
  });
}

function showSettings() {
  openSettings(state.settings, {
    googleInfo: () => ({ key: loadGoogleKey(), usage: googleUsage(), reason: state.google && state.google.reason, detail: state.google && state.google.detail }),
    onKey: async (raw) => {
      const k = raw.trim();
      if (!k) { saveGoogleKey(''); saveGoogleCache({}); state.google = null; state.fetchedAt = 0; render(); return { ok: true, cleared: true }; }
      const r = await testGoogleKey(k);
      if (r.ok) { saveGoogleKey(k); saveGoogleCache({}); state.fetchedAt = 0; refresh(true); }
      return r;
    },
    onChange: (next) => {
      const daysChanged = next.pastDays !== state.settings.pastDays;
      const sourceChanged = next.source !== state.settings.source;
      state.settings = next;
      saveSettings(next);
      applyLook(next);
      if (daysChanged) { state.data = {}; state.fetchedAt = 0; state.resetDays = true; state.resetDayStrip = true; state.day = 0; state.hourDay = 0; refresh(true); }
      else if (sourceChanged && (next.source === 'om' || loadGoogleKey())) { state.fetchedAt = 0; refresh(true); }
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
    case 'refresh': refresh(true, true); break;
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
  const cls = el.classList && ['gp-strip', 'gp-dstrip'].find((c) => el.classList.contains(c));
  if (!cls) return;
  const x = el.scrollLeft;
  $('#list').querySelectorAll('.' + cls).forEach((o) => { if (o !== el && o.scrollLeft !== x) o.scrollLeft = x; });
}, true);

initDrag({
  list: $('#list'),
  onDrop: reorderPlace,
  onEnd: render,
});

// pull to refresh
(() => {
  const list = $('#list');
  let y0 = null, armed = false;
  list.addEventListener('touchstart', (e) => { y0 = list.scrollTop <= 0 && !isSheetOpen() && !isDragging() ? e.touches[0].clientY : null; armed = false; }, { passive: true });
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
    if (armed) refresh(true, true);
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
applyLook(state.settings);
loadFromCache();
if (anyData()) resetToNow();
render();
refresh(false);
followGps();
