# Setup — iPhone + GitHub Pages + Cloudflare Worker

## Part A — Cloudflare Worker

1. Open https://dash.cloudflare.com/ and sign in.
2. Open **Workers & Pages** and select the existing `wtbd-flight-proxy` Worker.
3. Replace its code with the complete contents of `worker.js` in this repository, if it is not already deployed by GitHub Actions.
4. Deploy.

The GitHub Actions workflow can deploy automatically when `worker.js` changes, provided the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.

## Part B — GitHub Pages

The app is published from this repository. Check that `config.js` contains the existing Cloudflare Worker URL. Do not change the URL unless the Worker itself has been renamed.

## Part C — iPhone refresh

1. Open the published site in Safari and reload it.
2. Close and reopen the Home Screen app.
3. If an old cached version remains, remove the Home Screen shortcut and add it again from Safari.

## Schedule source logic

For every route touching NUE, the Worker queries the official Nuremberg Airport departures or arrivals board. If no matching flight is returned, it tries a Google Search fallback. Google is not a guaranteed timetable API; the fallback may return no result or incomplete information. The app must not invent a flight number or treat a Google snippet as an official confirmation.

## ADS-B

The app uses ADS-B.lol for live aircraft observations after a scheduled flight has been identified. Aircraft candidates are probabilistic and require manual confirmation. Do not treat the app as an operational aviation source or proof of exact takeoff, landing or delay.
