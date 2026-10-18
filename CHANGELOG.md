# Changelog

Every APK build that goes out gets a version, starting at v1. See `CLAUDE.md` for the release
checklist (what has to be bumped/updated together).

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
