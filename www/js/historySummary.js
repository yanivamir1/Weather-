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
    const h = none ? 2 : Math.max(4, Math.round((x.mm / max) * 52));
    const label = x.d === 0 ? 'היום' : WEEKDAY_SHORT[x.date.getDay()];
    return `<div class="hbar${x.d === 0 ? ' today' : ''}" aria-label="${esc(label)}: ${esc(mmSentence(x.mm))}"><span class="v num">${none ? '' : esc(mmText(x.mm))}</span><div class="col${none ? ' none' : ''}" style="height:${h}px"></div><span class="l">${label}</span></div>`;
  }).join('');
  const t24 = rainLast(data, 24), t48 = rainLast(data, 48), t7 = rainLast(data, n * 24);
  const tot = (label, v) => `<div class="tot"><span>${label}</span><b>${esc(mmSentence(v))}</b></div>`;
  return `<div class="sec">
    <h3>גשם שירד <small>${n} ימים אחורה</small></h3>
    <div class="hist" role="img" aria-label="גשם שירד בכל יום">${bars}</div>
    <div class="tots">${tot('24 שעות', t24)}${tot('48 שעות', t48)}${tot(n + ' ימים', t7)}</div>
    <div class="note">לפי מודל מזג האוויר, לא מד גשם. ממטרים מקומיים וקצרים יכולים להיות מוסטים או חסרים.</div>
  </div>`;
}
