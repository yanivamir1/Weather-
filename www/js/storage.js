// localStorage can throw (private mode, blocked site data) — every access goes through here.
const K = { places: 'wx.places', gps: 'wx.gps', cache: 'wx.cache', settings: 'wx.settings', gkey: 'wx.gkey', gcache: 'wx.gcache', gusage: 'wx.gusage' };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// textSize 0..4 = קטן · רגיל · גדול · גדול מאוד · ענק; density 0..3 = צפוף מאוד · צפוף · מצומצם · רגיל (see styles.css).
export const DEFAULT_SETTINGS = { temp: 'c', wind: 'kmh', pastDays: 7, showGps: true, textSize: 1, density: 2, dayTemps: true, source: 'om' };

export const loadPlaces = () => read(K.places, []);
export const savePlaces = (v) => write(K.places, v);
export const loadGps = () => read(K.gps, null);
export const saveGps = (v) => write(K.gps, v);
export const loadCache = () => read(K.cache, null);
export const saveCache = (v) => write(K.cache, v);
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) });
export const saveSettings = (v) => write(K.settings, v);

// Google Weather API: the key is typed in on the phone (never part of the app or the repo), plus the last answers
// per place (so a refresh does not cost calls again) and a per-month call counter.
export const loadGoogleKey = () => String(read(K.gkey, '') || '');
export const saveGoogleKey = (v) => write(K.gkey, v);
export const loadGoogleCache = () => read(K.gcache, {});
export const saveGoogleCache = (v) => write(K.gcache, v);
export const loadGoogleUsage = () => read(K.gusage, { month: '', n: 0 });
export const saveGoogleUsage = (v) => write(K.gusage, v);
