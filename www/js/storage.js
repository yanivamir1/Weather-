// localStorage can throw (private mode, blocked site data) — every access goes through here.
const K = { places: 'wx.places', gps: 'wx.gps', cache: 'wx.cache', settings: 'wx.settings' };

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
export const DEFAULT_SETTINGS = { temp: 'c', wind: 'kmh', pastDays: 7, showGps: true, textSize: 1, density: 2 };

export const loadPlaces = () => read(K.places, []);
export const savePlaces = (v) => write(K.places, v);
export const loadGps = () => read(K.gps, null);
export const saveGps = (v) => write(K.gps, v);
export const loadCache = () => read(K.cache, null);
export const saveCache = (v) => write(K.cache, v);
export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) });
export const saveSettings = (v) => write(K.settings, v);
