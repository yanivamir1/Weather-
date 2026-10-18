// "My location". Native: the Capacitor Geolocation plugin through the injected bridge (no bundler, so no import).
// Browser: navigator.geolocation. Coarse accuracy is plenty for weather.
const OPTS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 };

function nativePlugin() {
  const C = window.Capacitor;
  return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins ? C.Plugins.Geolocation : null;
}

/** Resolves { ok:true, lat, lon } or { ok:false, reason: 'denied' | 'timeout' | 'unavailable' }. */
export async function getPosition() {
  const g = nativePlugin();
  if (g) {
    try {
      let perm = await g.checkPermissions();
      const granted = (p) => p.location === 'granted' || p.coarseLocation === 'granted';
      if (!granted(perm)) perm = await g.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (!granted(perm)) return { ok: false, reason: 'denied' };
      const pos = await g.getCurrentPosition(OPTS);
      return { ok: true, lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch (e) {
      const m = String((e && e.message) || e).toLowerCase();
      return { ok: false, reason: m.includes('denied') || m.includes('permission') ? 'denied' : m.includes('timeout') ? 'timeout' : 'unavailable' };
    }
  }
  if (!navigator.geolocation) return { ok: false, reason: 'unavailable' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
      OPTS
    );
  });
}

/** Rough distance in km, enough to decide whether the phone moved. */
export function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
