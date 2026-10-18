// Offline gazetteer of Israeli places (data/il-places.json: every locality of the Central Bureau of Statistics list plus a
// few well-known sites). The online geocoder only knows a place by the Hebrew name GeoNames happens to hold, and for many
// small localities (e.g. משמר העמק) that is nothing — so the "+" search looks here first and merges the online results in.
let loading = null;

export function loadGazetteer() {
  if (!loading) {
    loading = fetch('data/il-places.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => j.p.map(([name, en, lat, lon, site, tier]) => ({
        key: 'il' + hash(name), name, nameEn: en, sub: site ? 'אתר · ישראל' : 'ישראל', lat, lon, tier: tier || 0,
        n: norm(name), s: skeleton(norm(name)), e: latin(en),
      })))
      .catch(() => { loading = null; return []; }); // retry on the next search
  }
  return loading;
}

/** Stable short key per place name (FNV-1a), so a saved place keeps its key across app versions. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ---------- normalisation: spelling variants must not hide a place ----------
const FINAL = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** Hebrew text without niqqud, quotes, hyphens, final letters and doubled matres lectionis (קריית = קרית). */
export function norm(s) {
  return String(s).toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳״'’‘`"“”]/g, '')
    .replace(/[-–־_.,()/]+/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINAL[c])
    .replace(/יי/g, 'י').replace(/וו/g, 'ו')
    .replace(/\s+/g, ' ').trim();
}
/** Consonant skeleton (no י/ו): catches full/defective spelling, e.g. מוצקין / מצקין. */
const skeleton = (n) => n.replace(/[יו]/g, '');
/** Latin letters only, q→k, no vowels or h: "Mishmar Ha‘Emeq" and "MISHMAR HAEMEK" give the same string. */
export function latin(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, '').replace(/q/g, 'k').replace(/[aeiouhy]/g, '');
}
const HEB = /[֐-׿]/;

function score(p, q, qs, qWords, isHeb, qLat) {
  if (!isHeb) return qLat && p.e.startsWith(qLat) ? (p.e === qLat ? 0 : 1) + 6 : -1;
  const n = p.n;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = n.split(' ');
  if (qWords.length === 1 && words.some((w) => w.startsWith(q))) return 2;
  if (qWords.length > 1 && qWords.every((t) => words.some((w) => w.startsWith(t)))) return 3;
  if (n.includes(q)) return 4;
  if (qs.length >= 2 && p.s.startsWith(qs)) return 5;
  if (qs.length >= 4 && p.s.includes(qs)) return 6;
  return -1;
}

/** Best matches first. Whole-name matches beat word matches, which beat "contains"; bigger towns, then shorter names, win ties. */
export async function searchLocal(query, limit = 8) {
  const all = await loadGazetteer();
  const q = norm(query);
  if (q.length < 2) return [];
  const isHeb = HEB.test(q);
  const qs = skeleton(q), qWords = q.split(' '), qLat = isHeb ? '' : latin(q);
  const hits = [];
  for (const p of all) {
    const sc = score(p, q, qs, qWords, isHeb, qLat);
    if (sc >= 0) hits.push([sc, p]);
  }
  hits.sort((a, b) => a[0] - b[0] || b[1].tier - a[1].tier || a[1].name.length - b[1].name.length || (a[1].name < b[1].name ? -1 : 1));
  return hits.slice(0, limit).map(([, p]) => p);
}

const rad = Math.PI / 180;
export function distKm(a, b) {
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Is the online result `o` the same place as the gazetteer entry `p`? Near it, and (Hebrew) the same name or (Latin) the same transliteration. */
export function samePlace(p, o) {
  if (distKm(p, o) > 3) return false;
  if (HEB.test(o.name)) { const a = norm(o.name); return a === p.n || a.startsWith(p.n) || p.n.startsWith(a); }
  const a = latin(o.name);
  return !!a && (a === p.e || (a.length >= 4 && (a.startsWith(p.e) || p.e.startsWith(a))));
}
