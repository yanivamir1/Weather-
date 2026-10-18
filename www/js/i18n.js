// Hebrew date/time helpers. Tables instead of Intl so output is identical on every WebView.
export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const WEEKDAY_FULL = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
const MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];

export const pad2 = (n) => String(n).padStart(2, '0');
export const hh = (h) => pad2(h) + ':00';

/** 'YYYY-MM-DD' (or any ISO string starting with it) -> Date at local midnight. */
export function parseDay(s) {
  return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}
export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}
export const monthName = (date) => MONTHS[date.getMonth()];

/** "לפני 5 דק׳" style age for the footer. */
export function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'הרגע';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  return `לפני ${Math.round(h / 24)} ימים`;
}
