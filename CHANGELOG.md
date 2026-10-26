# Changelog

Every APK build that goes out gets a version, starting at v1. See `CLAUDE.md` for the release
checklist (what has to be bumped/updated together).

## v9 — 2026-10-26

Google source: far fewer calls (the key's quota ran out quickly).

- **3 calls per place instead of 8** for a full refresh: Google's hourly forecast now covers the next 48 hours (2 calls, 24 hours
  each) plus the 7-day daily forecast (1 call). Before, it fetched all 7 days of hours.
- **The hours after those 48 are calibrated to Google's daily forecast** instead of being fetched: temperatures are stretched to
  Google's high and low, a day Google calls dry stays dry (no rain, no storm icon), and a wet day gets Google's rain amount and
  chance in one stretch of hours. So the strip and the day tiles never disagree.
- **Only the refresh button and pull-to-refresh can ask Google again early** (and only for answers older than 30 minutes). Adding a
  place, coming back to the app, the GPS moving or the 30-minute timer never refetch an answer younger than **6 hours** (was 3).
  Before, those internal refreshes could refetch everything every 20 minutes.
- Two places are fetched at a time (no more bursts), and a wrong key, a used-up quota or a per-minute limit stops the rest of
  that round after the first failure.
- Settings shows calls **today** and this month, and, on an error, Google's own explanation, which tells a per-minute limit from a
  daily one ("יותר מדי קריאות בדקה אחת" vs "נגמרה המכסה של המפתח").

## v8 — 2026-10-25

- **Google as a forecast source (optional).** Settings → מקור התחזית → Google, then paste a Google Weather API key. The hourly
  forecast (to the end of the 7th day) and the daily forecast of every place then come from Google, the same source as
  Google's own weather card; the past days and the "what was" history stay Open-Meteo's (Google keeps only 24 hours back).
  Open-Meteo remains the default and the fallback: no key, a wrong key, an exhausted quota or no connection leaves
  Open-Meteo's forecast on screen and the footer says why.
- **The key lives only on the phone** (typed into Settings, never in the app or the repo). "שמירה ובדיקה" checks it with
  one call before saving it.
- **Calls are limited on purpose.** Google's answers are kept for 3 hours (20 minutes minimum for a manual refresh), a
  wrong key or an exhausted quota stops after one call, and Settings shows the calls used this month. One full refresh of
  one place is up to 8 calls (hours come 24 per call, plus the days); the free allowance of a regular key is 10,000 a month.
- Google's weather conditions are translated into the same icons, labels and scenery as before.

## v7 — 2026-10-19

- **High and low for every day, in every place.** Each place card now has a row under the hourly strip with one column per
  day (the past days, today, then the week ahead): the high on top, the low under it. Today is the first column, the rows of
  all places scroll together, and tapping a day picks it for every card. Until now the highs and lows were only on the day
  tiles at the top, and only for the focused place.
- Settings → גבוהה ונמוכה לכל יום lets you hide the row again (the card is about 70px shorter without it).

## v6 — 2026-10-19

- **Text size, in five levels** (Settings → גודל טקסט): קטן · רגיל · גדול · גדול מאוד · ענק. Every text in the app scales,
  and so do the boxes that hold it (hour columns, day tiles), so nothing is cut off. A long place name now wraps to a
  second line instead of being cut with "…".
- **Row spacing, in four levels** (Settings → רווח בין השורות): צפוף מאוד · צפוף · מצומצם · רגיל. It sets the gap between
  place cards, the padding inside each card, the line height and the height of the scenery banner. "רגיל" is the v5
  layout. **The new default is "מצומצם"**, a bit tighter than before, as asked; pick "רגיל" to get the old spacing back.
- Both settings apply live and are remembered.

## v5 — 2026-10-18

- **Fix: the place name was cut off** ("בני…", "מו…"). The name shared one line with "יום שלישי · 07:00 · מה שהיה" (or
  "עכשיו") and the drag handle added in v3 left it even less room. The name now has its own line at full width, and the
  day/hour label sits right under it.

## v4 — 2026-10-18

- **No Israeli place goes missing in the "+" search.** The search used to rely on Open-Meteo's geocoder alone, which holds
  many small localities (e.g. משמר העמק) only under an English name, so a Hebrew search found nothing. The app now carries
  its own list of ~1,300 Israeli localities and sites (cities, towns, kibbutzim, moshavim, community settlements, Arab,
  Druze and Bedouin villages, settlements in Judea and Samaria, plus well-known sites such as Masada, Ein Bokek and
  Mount Hermon), searched instantly and offline, by Hebrew or English name. Spelling variants find the same place
  (קריית / קרית, with or without a geresh, hyphen or niqqud). Online results still come from Open-Meteo for the rest of
  the world and are merged in without duplicates; with no connection the Israeli matches still show, with a note.
- A place that is already on the list shows as added even if it was added earlier under the online entry.
- Credit for the data source was added to Settings.

## v3 — 2026-10-18

- **Reorder places by dragging:** each card has a grip handle (six dots, at the top of the card next to "פירוט").
  Press and hold-drag it up or down: the card lifts, the others slide out of the way, the list scrolls by itself near
  the top and bottom edge, and the new order is saved when you let go. Scrolling the list and the hourly strips works
  as before, because a drag starts only from the handle. "My location" stays pinned at the top (no handle).
  The move up / move down buttons in the detail sheet are still there.

## v2 — 2026-10-18

New look, copied from Google's weather card (design option 7, "all places").

- **Google-style cards, one per place:** big "now" temperature with a glossy icon, condition and feels-like, an
  hourly strip (temperature, rain chance in blue above the icon, icon, time) and a scenic banner that follows the
  weather (sun, cloud, rain, storm, fog, snow, night). Dark Google palette and Google Sans numerals.
- **Shared timeline:** every strip scrolls together, and tapping an hour on any card selects that hour for all places.
- **Day tiles** (Google style) reach back into the past; a small blue dot marks past days on which it rained somewhere.
  Past days and hours show rain in millimetres, and each card says "ירד גשם 09:00–14:00 · 8.1 מ״מ" or "לא ירד גשם".
- **Detail ("פירוט") per place:** accordions for precipitation, wind, humidity and UV with a 24-hour chart, the
  7-day rain chart with 24h / 48h / 7-day totals (labelled as model-based), pressure, air quality, sunrise/sunset,
  wind direction, and move / remove (with Undo).
- Removed with the old look: the Ribbon rows, the metric switch, the national summary chips, the animated page
  background and the "calm background" setting. The app icon and splash match the new look.
- Unchanged: "+" place search, "my location" (GPS), settings (units, days back), pull to refresh, offline cache.

## v1 — 2026-10-18

First release. A multi-place weather app in the style of design option 5 ("Ribbon").

- **One row per place** on a shared 24-hour axis: a colour ribbon (sun, cloud, rain, storm, fog, night)
  with icon and value every three hours. Tap a ribbon to pick the hour, tap a name for details.
- **Day picker** with the next 7 days *and* the past days (7 by default, up to 30 in Settings), plus a
  metric switch: temperature / rain / wind / UV.
- **"What was" — did it rain?** Past days and past hours come from Open-Meteo's `past_days`. Rain shows in
  millimetres (not %), each place gets "ירד גשם 16:00–19:00 · 8 מ״מ" or "לא ירד גשם", days with rain carry a
  dot, and the detail sheet has a 7-day rain chart with 24h / 48h / 7-day totals. This is the weather
  model's analysis of past hours, not a rain gauge, and the app says so.
- **Background follows the weather** of the focused place at the selected day and hour (sun, night with
  stars, cloud, rain, thunderstorm, fog, snow). "Calm background" in Settings stops the motion.
- **"+" button** searches any city or place (Open-Meteo geocoding, Hebrew); **"My location"** row via GPS,
  asked only when tapped.
- Detail sheet: feels-like, humidity, wind and direction, UV, pressure, air quality, sunrise/sunset, the
  coming week. Move or remove a place from there (remove has Undo).
- Settings: °C/°F, wind units, days back, show/hide my location, calm background.
- Pull to refresh, auto refresh every 30 minutes, last data kept for offline use.
- Dark only, Hebrew RTL, fonts bundled (no network needed to render).
- Data: Open-Meteo.com (CC BY 4.0), credited in the app.
