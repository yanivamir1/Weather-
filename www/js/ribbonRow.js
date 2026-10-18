// One place = one Ribbon row: name + a colour ribbon whose 24 hours share the same axis in every row.
import { at, dayInfo, nowHour, pastRainNote, ribbonGradient, ribbonSlots } from './forecast.js';
import { esc, icon } from './dom.js';
import { fmtTemp } from './units.js';

const pct = (h) => (((h + 0.5) / 24) * 100).toFixed(2);

function nameBlock(place, data, s) {
  let n2 = '';
  if (data) {
    if (s.day < 0) {
      const n = pastRainNote(data, s.day);
      n2 = `<span class="n2 ${n.wet ? 'wetnote' : ''}">${n.wet ? icon('drop', 12) : ''}<span>${esc(n.text)}</span></span>`;
    } else {
      const di = dayInfo(data, s.day);
      if (di) n2 = `<span class="n2"><span class="num">${fmtTemp(di.hi)}</span> / <span class="num">${fmtTemp(di.lo)}</span></span>`;
    }
  }
  const pin = place.gps ? icon('pin', 13) : '';
  return `<button class="nm" data-act="open" data-key="${esc(place.key)}" aria-label="פירוט ${esc(place.name)}"><span class="n1">${pin}<span>${esc(place.name)}</span></span>${n2}</button>`;
}

export function ribbonRow(place, data, s) {
  const foc = place.key === s.focusKey ? ' foc' : '';
  if (!data) {
    return `<div class="rb sk${foc}">${nameBlock(place, null, s)}<div class="pl2"><div class="rib"></div></div></div>`;
  }
  const x = at(data, s.day, s.hour);
  const scene = x ? x.scene : 'cloud';
  const slots = ribbonSlots(data, s.day, s.metric);
  const nh = nowHour(data);
  const shade = s.day === 0 && nh > 0 ? `<div class="shade" style="width:${((nh / 24) * 100).toFixed(2)}%"></div>` : '';
  const nowMark = s.day === 0 ? `<div class="rnow" style="right:${pct(nh)}%"></div>` : '';
  return `<div class="rb t-${scene}${foc}">
    ${nameBlock(place, data, s)}
    <button class="pl2" data-act="tap" data-key="${esc(place.key)}" aria-label="${esc(place.name)} · בחירת שעה">
      <div class="rib" style="background:${ribbonGradient(data, s.day, s.metric)}">${shade}${slots.map((sl) => icon(sl.icon)).join('')}</div>
      <div class="vals">${slots.map((sl) => `<span class="num${sl.wet ? ' w' : ''}">${esc(sl.text)}</span>`).join('')}</div>
      ${nowMark}<div class="rcur" style="right:${pct(s.hour)}%"></div>
    </button>
  </div>`;
}

/** Hour labels above the rows (0, 3, … 21), positioned on the same 24-hour axis as the ribbons. */
export function axisHtml(s, data) {
  const nowSlot = s.day === 0 && data ? Math.floor(nowHour(data) / 3) * 3 : -1;
  const labels = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => `<span class="lbl${h === nowSlot ? ' now' : ''}" style="right:${((h / 24) * 100).toFixed(2)}%"><span class="num">${String(h).padStart(2, '0')}</span></span>`).join('');
  return `<div class="axis"><div class="pl">${labels}</div></div>`;
}
