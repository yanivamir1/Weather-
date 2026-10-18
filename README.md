# מזג אוויר — Android app

A personal multi-place weather app: one **Ribbon** row per place on a shared 24-hour axis, a day picker
that reaches back into the past (to tell whether it rained), and a background that follows the weather.
The app itself is the plain HTML/CSS/JS in [`www/`](www/) (no framework, no build step), wrapped with
[Capacitor](https://capacitorjs.com) as an installable Android app. Same structure as `TRADE-JORNAL`.

## Getting the APK

Every push to the build branches runs `.github/workflows/build-apk.yml`, which builds a debug-signed APK
named `weather-vN.apk` (Actions artifact `weather-vN`) and also commits the newest one to
`releases/weather-latest.apk`. Install it by allowing "install unknown apps" for whichever app opens it.
Builds share one signing key (`android/keystore/debug.keystore`), so a new build updates the old one in place.

## Local development

```bash
npm install
npx cap sync android      # copies www/ into the native android/ project
npx cap open android      # opens Android Studio, if installed
```

Editing `www/` needs no Android SDK. For a quick look in a browser, serve `www/` with any static server.

## Data

Weather: [Open-Meteo](https://open-meteo.com/) (free, no key, CC BY 4.0). Place search: Open-Meteo geocoding.
City name for "my location": BigDataCloud client reverse geocoding. History ("what was") uses Open-Meteo's
`past_days`: a model analysis, not rain-gauge measurements.

On the phone the app stores only your place list, settings and the last forecast it fetched (`localStorage`).
Nothing is sent anywhere except the coordinates of your places to the weather and place-name services above.
Android Auto Backup (`allowBackup`) restores the list after a reinstall when the phone has Google backup on.

See `CLAUDE.md` for the release checklist and `CHANGELOG.md` for versions.
