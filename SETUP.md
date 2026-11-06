# Setup V2 — iPhone + GitHub Pages + Cloudflare Worker

## Part A — create the free API bridge
1. Open https://dash.cloudflare.com/ and create/sign into a free account.
2. Open **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name such as `wtbd-flight-proxy`.
4. Deploy the starter Worker.
5. Open **Edit code** (or Quick Edit), replace all starter code with the full contents of `worker.js` from this folder, then **Deploy**.
6. Copy the Worker URL. It looks like `https://wtbd-flight-proxy.YOUR-SUBDOMAIN.workers.dev`.

## Part B — connect the app to the Worker
1. Open `config.js` in this folder.
2. Replace `https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev` with your real Worker URL. Keep the quotation marks.
3. Save `config.js`.

## Part C — update GitHub repository
Upload and replace these files in the ROOT of your existing repository:
- `index.html`
- `app.js`
- `config.js` (new)
- `manifest.webmanifest`
- `sw.js`
- `README.md`
- `worker.js` is only for Cloudflare; it may also remain in GitHub but is not used by Pages.
Keep your existing `icon-192.png` and `icon-512.png`, or use the included versions.

## Part D — refresh iPhone
1. Wait until GitHub Pages finishes deploying.
2. In Safari open the published site and reload.
3. If the installed home-screen app still shows the old version, fully close it and reopen. If needed, remove the old home-screen shortcut and add it again from Safari.

## Test
- First test `https://YOUR-WORKER-URL.workers.dev/` — it should return `Unknown endpoint` as JSON. This confirms the Worker is online.
- Then test `https://YOUR-WORKER-URL.workers.dev/api/aircraft?lat=49.4987&lon=11.078&dist=25` in Safari. It should return JSON with an `ac` array (possibly empty depending on coverage).
- Finally test the app.

## Important
This version is a beta. Ryanair's timetable endpoint is unofficial and can change. ADS-B coverage is incomplete. Route matching is probabilistic and therefore asks for manual confirmation. Do not treat it as an operational source or as proof of exact takeoff/landing or delay.
