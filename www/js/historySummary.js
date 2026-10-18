// "What fell": per-day rain bars for the last week plus 24h / 48h / 7-day totals.
// Values are the weather model's own analysis of past hours — not a rain gauge — and the UI says so.
import { dayRain, rainLast, pastDaysAvailable } from './forecast.js';
import { WEEKDAY_SHORT, addDays, parseDay } from './i18n.js';
import { mmText, mmSentence } from './units.js';
import { esc } from './dom.js';

export function historyHtml(data) {
  const n = Math.min(7, pastDaysAvailable(data));
  if (n < 1) return '';
  const base = parseDay(data.now);
  const days = [];
  for (let d = -n; d <= 0; d++) days.push({ d, mm: dayRain(data, d), date: addDays(base, d) });
  const max = Math.max(5, ...days.map((x) => x.mm));
  const bars = days.map((x) => {
    const none = x.mm < 0.1;
    const h = none ? 2 : Math.max(4, Math.round((x.mm / max) * 54));
    const label = x.d === 0 ? 'היום' : WEEKDAY_SHORT[x.date.getDay()];
    return `<div class="hb${x.d === 0 ? ' today' : ''}" role="img" aria-label="${esc(label)}: ${esc(mmSentence(x.mm))}"><span class="v num">${none ? '' : esc(mmText(x.mm))}</span><i class="${none ? 'none' : ''}" style="height:${h}px"></i><span class="l">${label}</span></div>`;
  }).join('');
  const tot = (label, v) => `<div class="gs-tot"><span>${label}</span><b>${esc(mmSentence(v))}</b></div>`;
  return `<div class="gs-sec">
    <h3>גשם שירד <small>${n} ימים אחורה</small></h3>
    <div class="gp-chart"><div class="hist">${bars}</div></div>
    <div class="gs-tots">${tot('24 שעות', rainLast(data, 24))}${tot('48 שעות', rainLast(data, 48))}${tot(n + ' ימים', rainLast(data, n * 24))}</div>
    <div class="gs-note">לפי מודל מזג האוויר, לא מד גשם. ממטרים מקומיים וקצרים יכולים להיות מוסטים או חסרים.</div>
  </div>`;
}
