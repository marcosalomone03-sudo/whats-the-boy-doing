# What's the boy doing? — flight tracker

A personal flight-day tracker for Ryanair-group flights operating to or from Nuremberg (NUE).

## Flight discovery

When the user enters an airport code such as `ALC`, the app expands it into two routes:

- NUE → ALC
- ALC → NUE

For two airport codes such as `BUD-ALC`, it expands them into the four routes connecting each airport with NUE.

For each route and selected date, the Cloudflare Worker:

1. Queries the **official Nuremberg Airport departures board** for flights leaving NUE, or the **official arrivals board** for flights arriving at NUE.
2. If the official board returns no matching flight, it attempts a **Google Search fallback** for the route, date, airline and flight number.
3. Returns the flight number and the available board time to the app. If only one endpoint time is available, the app estimates the other time and marks it with `~`.

Google Search is an opportunistic fallback, not an authoritative timetable API. Results are accepted only when a Ryanair-group flight number and a time can be extracted from the returned search text. Google may block automated requests or return incomplete/ambiguous snippets. The app therefore also exposes a direct Google results link for each route when the schedule is missing; a manual result is not treated as verified until its flight number and time are checked.

## Aircraft tracking

After the schedule is identified, the app uses the public ADS-B.lol API to find plausible aircraft along the route. The user manually confirms a candidate. Callsigns are never inferred by adding a prefix to the commercial flight number.

Displayed ADS-B information can include registration, aircraft type, callsign, ICAO hex, ground speed, altitude and position. ADS-B is observational data: it is not airline-confirmed flight status and coverage may be incomplete.

## Free services

- Nuremberg Airport public flight board.
- Google Search HTML results as a best-effort fallback (not a guaranteed API).
- ADS-B.lol public API.
- Cloudflare Workers Free as the CORS/API bridge.
- GitHub Pages for hosting.

No AviationStack, FlightNerve, Aena or SkyLink integration is used by the current schedule pipeline.

## Development

The Worker exposes:

- `/api/schedule?origin=NUE&destination=ALC&date=2026-11-06`
- `/api/aircraft?lat=49.4987&lon=11.078&dist=35`
- `/api/hex?icao=4CA123`

Every scheduled route must have NUE as origin or destination. The app's route expansion enforces this.

The schedule response includes a `source` field so the UI can distinguish the official Nuremberg board from the Google fallback.
