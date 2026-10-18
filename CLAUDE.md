# Instructions for building this app

General guidance for whoever (or whatever) works on this repo next. This app follows the same
pattern as its sibling, `TRADE-JORNAL` (same owner, same delivery flow).

## Versioning — do this on every release

Every APK build that goes out to the user gets a version number, starting at `v1`. On every
change you push that should count as a new release (anything beyond a same-day follow-up fix to a
build that hasn't reached the user yet):

1. Bump `APP_VERSION` in `www/js/version.js` (`v1` → `v2` → `v3` ...).
2. Bump `versionName` (same string, e.g. `"v2"`) **and** `versionCode` (integer, +1) in
   `android/app/build.gradle`'s `defaultConfig` block. Keep these two in lockstep with
   `version.js` — they must always show the same version.
3. Add an entry to `CHANGELOG.md` under that version number, dated, describing what changed.
4. Only after 1–3: `npx cap sync android`, commit, push.

The version is shown in the app (Settings sheet and the list footer) so the user can confirm which
build is installed — don't remove it.

**The downloaded file must show the version too.** `.github/workflows/build-apk.yml` reads
`APP_VERSION` from `www/js/version.js` and names the build `weather-vN.apk` (artifact `weather-vN`).
Don't hardcode a version in the workflow and don't go back to a generic `app-debug.apk` name.

## Getting the built APK to Yaniv directly

GitHub Actions artifact downloads redirect to Azure blob storage (`*.blob.core.windows.net`), which
the sandboxed dev environment can't reach, and there is no Android SDK there to build locally. So the
workflow commits the newest build to `releases/weather-latest.apk` on the branch (with a skip-ci
marker in that one commit's message so it doesn't loop). After CI is green: `git pull`, then hand
that file to Yaniv directly (chat attachment). Keep this working: don't remove `contents: write` or
the commit-back step from `build-apk.yml`, and don't add `releases/*.apk` to `.gitignore`.

**Careful with commit messages:** GitHub matches the skip-ci marker as a plain substring anywhere in
a commit message, including prose that merely *describes* it. Spell it without the surrounding
brackets in your own commit messages; only the workflow's generated commit has the real marker.

Don't open a pull request unless Yaniv asks for one.

## In-app "check for update" — don't build it unprompted

Yaniv declined an in-app update check for Trade Journal (the repo is private, so the phone can't read
a version number anonymously). Same here: deliver each build directly when he asks.

## Data source and its limits

- Weather comes from **Open-Meteo** (`api.open-meteo.com`, plus `geocoding-api.open-meteo.com` and
  `air-quality-api.open-meteo.com`): free without a key for non-commercial use (10,000 calls/day),
  CC BY 4.0, so the attribution line in the app must stay. The "my location" row also uses
  `api.bigdatacloud.net` for the city name. One forecast request serves every place (comma-separated
  coordinates), with `past_days` for history.
- **Past hours are the weather model's analysis, not a rain gauge.** Keep the "לפי מודל" wording wherever
  rain that already fell is shown. Open-Meteo's `precipitation` and `precipitation_probability` are
  "preceding hour" values — `forecast.js` `at()` reads the slot one later for the hour that starts at
  `hour`; keep that in mind before touching it. Probability exists only for the future; the past shows mm.
- The dev sandbox's network policy blocks those hosts (403 on CONNECT). To test with live data an
  environment owner must add them to Allowed domains. Without that, check layout/logic against a
  synthetic fixture kept **outside** the repo and say clearly that it is synthetic; real behaviour is
  then verified on the phone.

## Other standing rules

- `www/` is the single source of truth (plain HTML/CSS/ES modules, no build step, no framework) and
  should keep working as a plain website. Don't put Capacitor-specific code in without a non-native
  fallback (see `www/js/geo.js`: native plugin when `Capacitor.isNativePlatform()`, else
  `navigator.geolocation`).
- Capacitor plugins are reached via the injected `window.Capacitor.Plugins.*` bridge, not npm imports —
  there is no bundler.
- `android/keystore/debug.keystore` is committed on purpose so every CI build shares one signature —
  never regenerate or remove it; that would break in-place updates and Android's Auto Backup restore.
- Fonts are bundled in `www/fonts` (Heebo for Hebrew/Latin, Space Grotesk for numbers); nothing is
  loaded from a CDN at runtime.
- Follow `anthropic-skills:design-inspiration` for anything visual — re-check it before any design
  change, since Yaniv updates his taste there over time. Dark only; muted glow; ghost pills; one cream
  action; monochrome icons.
- UI text is Hebrew, right-to-left. Numbers and chart time stay in `.num` (LTR) spans.
