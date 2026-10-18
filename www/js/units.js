// Display units. Data is always stored in °C, km/h and mm; conversion happens only here.
let settings = { temp: 'c', wind: 'kmh' };
export function setUnits(s) { settings = s; }

export const tempNum = (c) => (c == null || Number.isNaN(c) ? null : Math.round(settings.temp === 'f' ? c * 9 / 5 + 32 : c));
export const fmtTemp = (c) => { const v = tempNum(c); return v == null ? '–' : v + '°'; };

export function windNum(kmh) {
  if (kmh == null) return null;
  if (settings.wind === 'ms') return Math.round(kmh / 3.6);
  if (settings.wind === 'mph') return Math.round(kmh / 1.609);
  return Math.round(kmh);
}
export const windUnit = () => (settings.wind === 'ms' ? 'מ׳/ש׳' : settings.wind === 'mph' ? 'mph' : 'קמ״ש');

/** Hourly rain in mm: nothing under 0.1, one decimal under 10, whole numbers above. */
export function mmText(v) {
  if (v == null || v < 0.1) return '–';
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}
/** For sentences: "8 מ״מ" / "0.4 מ״מ". */
export function mmSentence(v) {
  if (v == null || v < 0.05) return '0 מ״מ';
  return (v < 10 ? (Math.round(v * 10) / 10).toString() : String(Math.round(v))) + ' מ״מ';
}
