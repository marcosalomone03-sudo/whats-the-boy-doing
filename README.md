# What's the boy doing? — iPhone PWA

A personal, installable web app prototype for duty-day flight tracking.

## Included
- Duty input: `BUD` or `BUD-ALC`
- Automatic route expansion from NUE
- Public Ryanair timetable endpoint (unofficial, undocumented and changeable)
- Public ADSB.lol callsign endpoint for live ADS-B observations
- Local device history (localStorage)
- PWA manifest, service worker and iPhone icons

## Important limitations
- The Ryanair timetable endpoint is unofficial and may change, block browser requests, or be unavailable. This browser-only app can be affected by CORS.
- ADS-B is not an airline operational feed. Coverage, callsigns and aircraft observations vary.
- A last ADS-B position on the ground does not prove the exact touchdown time.
- The current prototype does not claim to provide airline-confirmed delays, gate data, cancellations or exact takeoff/landing times.
- Data is fetched online. The service worker only caches the app shell, not live flight data.
- No API key or paid subscription is used.

## Publish for free with GitHub Pages
1. Create a GitHub repository named `whats-the-boy-doing`.
2. Upload all files from this folder to the repository root.
3. In repository Settings → Pages, choose Deploy from a branch.
4. Select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish the HTTPS site.
6. Open the published URL in Safari on iPhone.
7. Tap Share → Add to Home Screen → Add.

GitHub Pages is a hosting service with its own terms and availability; this app itself does not require a paid API or subscription.

## Local preview
A PWA service worker requires HTTPS or localhost. For local testing, run a static server in this folder, e.g. `python3 -m http.server 8000`, then open `http://localhost:8000`.
