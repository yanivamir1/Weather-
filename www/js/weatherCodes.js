// WMO weather_code -> Hebrew label, icon file name (icons/<name>.svg) and background scene.
const LABELS = {
  0: 'בהיר', 1: 'בהיר ברובו', 2: 'מעונן חלקית', 3: 'מעונן', 45: 'ערפל', 48: 'ערפל קפוא',
  51: 'טפטוף קל', 53: 'טפטוף', 55: 'טפטוף חזק', 56: 'טפטוף קפוא', 57: 'טפטוף קפוא חזק',
  61: 'גשם קל', 63: 'גשם', 65: 'גשם חזק', 66: 'גשם קפוא', 67: 'גשם קפוא חזק',
  71: 'שלג קל', 73: 'שלג', 75: 'שלג כבד', 77: 'גרגרי שלג',
  80: 'ממטרים קלים', 81: 'ממטרים', 82: 'ממטרים חזקים', 85: 'ממטרי שלג', 86: 'ממטרי שלג חזקים',
  95: 'סופת רעמים', 96: 'סופת רעמים עם ברד', 99: 'סופת רעמים עם ברד כבד',
};

export const isStorm = (c) => c >= 95;
export const isSnow = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const isFog = (c) => c === 45 || c === 48;
export const isDrizzle = (c) => c >= 51 && c <= 57;
export const isRain = (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82);
export const isWet = (c) => isStorm(c) || isSnow(c) || isDrizzle(c) || isRain(c);

export function sceneOf(code, day) {
  if (isStorm(code)) return 'storm';
  if (isSnow(code)) return 'snow';
  if (isFog(code)) return 'fog';
  if (isDrizzle(code) || isRain(code)) return 'rain';
  if (code === 2 || code === 3) return 'cloud';
  return day ? 'sun' : 'night';
}

export function iconOf(code, day) {
  if (isStorm(code)) return 'storm';
  if (isSnow(code)) return 'snow';
  if (isFog(code)) return 'fog';
  if (isDrizzle(code)) return 'drizzle';
  if (isRain(code)) return 'rain';
  if (code === 3) return 'cloud';
  if (code === 2) return day ? 'cloud-sun' : 'cloud-moon';
  return day ? 'sun' : 'moon';
}

export const labelOf = (code) => LABELS[code] || 'מעונן';

/** Hebrew compass word for the direction the wind blows FROM. */
export function windFrom(deg) {
  if (deg == null) return '';
  const names = ['צפונית', 'צפון-מזרחית', 'מזרחית', 'דרום-מזרחית', 'דרומית', 'דרום-מערבית', 'מערבית', 'צפון-מערבית'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ---------- glossy icons and scenic banners (icons/g-*.svg, icons/b-*.svg) ----------
const GLOSSY = { sun: 'g-sun', moon: 'g-moon', cloud: 'g-cloud', 'cloud-sun': 'g-cloud-sun', 'cloud-moon': 'g-cloud-moon', drizzle: 'g-rain', rain: 'g-rain', storm: 'g-storm', snow: 'g-snow', fog: 'g-fog' };
const BANNERS = ['sun', 'night', 'cloud', 'rain', 'storm', 'fog', 'snow'];
export const glossy = (name) => `icons/${GLOSSY[name] || 'g-cloud'}.svg`;
export const bannerOf = (scene) => `icons/b-${BANNERS.includes(scene) ? scene : 'cloud'}.svg`;
/** Dry cloud with a real chance of rain: Google shows the dark cloud with a single drop. */
export const isCloudIcon = (name) => name === 'cloud' || name === 'cloud-sun' || name === 'cloud-moon';
