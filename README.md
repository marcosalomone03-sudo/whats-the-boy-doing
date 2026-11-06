# What's the boy doing? — V2 beta

This is a rebuilt prototype. It no longer derives `RYR123` from `FR123`.

## Architecture
1. Reads the public Ryanair timetable for each route/day.
2. Queries ADSB.lol aircraft around the origin and route corridor during the scheduled operating window.
3. Ranks plausible aircraft using route geometry, time, track direction and freshness.
4. Shows candidates for manual confirmation.
5. After selection, stores the ICAO HEX and refreshes by HEX, not callsign.

A candidate is not a guaranteed match. If multiple aircraft are plausible, the user must confirm; if none are plausible, the app does not invent a match.

## Free services
- Ryanair's currently public timetable endpoint (unofficial/undocumented and subject to change).
- ADSB.lol public API (free/open data, dynamic rate limits; see https://api.adsb.lol/docs).
- Cloudflare Workers Free as a CORS bridge (published limit currently 100,000 requests/day; see Cloudflare docs).

No AviationStack key, paid API subscription, or paid flight-data account is used. Third-party free services may change or impose limits.

## Setup
Follow `SETUP.md`. The app requires a Cloudflare Worker URL in `config.js`. GitHub Pages alone cannot proxy cross-origin requests.
