// Text size and row spacing are plain CSS levels: two attributes on <html> pick the variables in styles.css.
const clamp = (v, max, def) => (Number.isInteger(v) && v >= 0 && v <= max ? v : def);

export function applyLook(settings) {
  const r = document.documentElement;
  r.dataset.text = String(clamp(settings.textSize, 4, 1));
  r.dataset.density = String(clamp(settings.density, 3, 2));
}
