// One place = one Google-weather-style card: place + "now" hero, an hourly strip (temperature, rain chance above the
// icon, icon, time) and a scenic banner. All strips share one hour axis (they scroll together, see app.js).
import { at, dayInfo, nowDate, nowHour, rainSentence } from './forecast.js';
import { dayLabel } from './daySelector.js';
import { bannerOf, glossy, isCloudIcon } from './weatherCodes.js';
import { esc, icon } from './dom.js';
import { fmtTemp, mmText } from './units.js';
import { WEEKDAY_FULL, addDays, hh, parseDay } from './i18n.js';
import { FORECAST_DAYS } from './api.js';

const WET_RE = /ירד( גשם)? \d|גשם צפוי|יורד גשם|סופת|סיכוי/;

/** Hours shown in a strip for day `day`: from "now" today, from 07:00 on any other day; 24 hours, spilling into the next day. */
export function stripColumns(data, s) {
  const start = s.day === 0 ? nowHour(data) : 7;
  const count = s.day >= FORECAST_DAYS - 1 ? 24 - start : 24;
  const cols = [];
  for (let k = 0; k < count; k++) {
    let d = s.day, h = start + k;
    if (h > 23) { h -= 24; d += 1; }
    const x = at(data, d, h);
    if (x) cols.push({ k, d, h, x });
  }
  return cols;
}

function stripHtml(place, data, s) {
  return stripColumns(data, s).map(({ k, d, h, x }) => {
    let rain = '';
    if (x.past) { if ((x.rain || 0) >= 0.2) rain = mmText(x.rain) + ' מ״מ'; } else if ((x.prob || 0) >= 20) rain = x.prob + '%';
    const wetCloud = !x.past && (x.prob || 0) >= 20 && isCloudIcon(x.icon);
    const src = wetCloud ? 'icons/g-drop-cloud.svg' : glossy(x.icon);
    const sel = d === s.hourDay && h === s.hour && k > 0; // the first column stays plain, like Google
    const label = x.isNow ? 'עכשיו' : hh(h);
    return `<button class="gp-hc${sel ? ' sel' : ''}" data-act="hour" data-key="${esc(place.key)}" data-d="${d}" data-h="${h}" aria-label="${esc(place.name)}, ${label}, ${fmtTemp(x.t)}${rain ? ', ' + rain : ''}"><span class="t num">${fmtTemp(x.t)}</span><span class="r">${esc(rain)}</span><img class="ic" src="${src}" alt=""><span class="l num">${label}</span></button>`;
  }).join('');
}

/** One column per day (past days to the right of today, like the day tiles): high above low, for this place. Tap = pick that day. */
function dayStripHtml(place, data, s) {
  const base = parseDay(nowDate(data));
  let html = '';
  for (let d = -s.avail; d < FORECAST_DAYS; d++) {
    const di = dayInfo(data, d);
    if (!di) continue;
    const date = addDays(base, d);
    html += `<button class="gp-dc${d === s.day ? ' sel' : ''}${d < 0 ? ' past' : ''}" data-act="day" data-d="${d}" aria-pressed="${d === s.day}" aria-label="${esc(place.name)}, ${WEEKDAY_FULL[date.getDay()]}${d < 0 ? ' (מה שהיה)' : ''}, גבוהה ${fmtTemp(di.hi)}, נמוכה ${fmtTemp(di.lo)}"><span class="w">${dayLabel(d, date)}</span><span class="hi num">${fmtTemp(di.hi)}</span><span class="lo num">${fmtTemp(di.lo)}</span></button>`;
  }
  return html;
}

function nameBlock(place, when, canDrag) {
  const pin = place.gps ? `<img class="pin" src="icons/gi-pin.svg" alt="">` : '';
  return `<div class="gp-now"><button class="gp-namebtn" data-act="focus" data-key="${esc(place.key)}" aria-label="מיקוד ב${esc(place.name)}"><span class="n">${pin}<span>${esc(place.name)}</span></span>${when ? `<span class="w">${esc(when)}</span>` : ''}</button><button class="gp-more" data-act="open" data-key="${esc(place.key)}">פירוט ${icon('gi-chev', 14)}</button>${canDrag ? `<button class="gp-grip" data-act="grip" aria-label="גרור כדי לשנות את הסדר" tabindex="-1">${icon('gi-grip')}</button>` : ''}</div>`;
}

export function placeCard(place, data, s, focused, canDrag) {
  const foc = focused ? ' foc' : '';
  const attrs = ` data-key="${esc(place.key)}"${place.gps ? ' data-pin' : ''}`;
  const drag = canDrag && !place.gps;
  if (!data) {
    return `<div class="gp-card sm sk${foc}"${attrs}><div class="gp-top">${nameBlock(place, '', drag)}<div class="gp-skbar"></div></div><div class="gp-skstrip"></div></div>`;
  }
  const x = at(data, s.hourDay, s.hour);
  if (!x) return `<div class="gp-card sm${foc}"${attrs}><div class="gp-top">${nameBlock(place, '', drag)}<div class="gp-msg">אין נתונים לשעה הזו</div></div></div>`;
  const date = addDays(parseDay(data.now), s.hourDay);
  const when = x.isNow ? 'עכשיו' : `${WEEKDAY_FULL[date.getDay()]} · ${hh(s.hour)}${x.past ? ' · מה שהיה' : ''}`;
  const line = rainSentence(data, s.hourDay);
  return `<div class="gp-card sm${foc}"${attrs}>
    <div class="gp-top">${nameBlock(place, when, drag)}
      <div class="gp-hero">
        <div class="gp-main"><div class="gp-temp num">${fmtTemp(x.t)}</div><img class="gp-ic" src="${glossy(x.icon)}" alt=""></div>
        <div class="gp-side"><div class="gp-cond">${esc(x.label)}</div><div class="gp-feels">הרגשה כמו <span class="num">${fmtTemp(x.feels)}</span></div><div class="gp-wet${WET_RE.test(line) ? '' : ' dry'}">${esc(line)}</div></div>
      </div>
    </div>
    <div class="gp-strip">${stripHtml(place, data, s)}</div>
    ${s.dayTemps ? `<div class="gp-dstrip" role="group" aria-label="גבוהה ונמוכה לכל יום">${dayStripHtml(place, data, s)}</div>` : ''}
    <img class="gp-banner" src="${bannerOf(x.scene)}" alt="">
  </div>`;
}
