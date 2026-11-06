# What's the boy doing? — V7

A personal flight-day tracker for Ryanair-group flights from NUE. It identifies scheduled sectors, then uses ADS-B.lol to find and manually confirm a plausible aircraft.

## Schedule discovery

The app combines sources instead of trusting one incomplete timetable:

1. **Ryanair public timetable** — baseline schedule.
2. **Aena official airport board** — no API key required; supplements missing Ryanair rows for supported Spanish airports (including ALC, AGP, PMI, BCN and MAD).
3. **SkyLink airport-board API (optional)** — worldwide fallback for the NUE departures/arrivals board. The Worker can use it when the `SKYLINK_API_KEY` secret is configured.

Aena publishes only the time at its own airport. When the opposite endpoint time is unavailable from the timetable, the app estimates block time from route distance and marks that time with `~`; it is not an airline-published arrival/departure time.

Without a SkyLink key, airports not covered by Aena still depend on the Ryanair timetable. This is why a flight such as PMO–NUE FR904 can still be missing.

## Free services

- Ryanair's public timetable endpoint (unofficial/undocumented and subject to change).
- Aena's public airport-board endpoint for supported Spanish airports.
- ADSB.lol public API for live aircraft observations.
- Optional SkyLink API free trial: 1,000 requests/month for personal, non-commercial use; application and approval required. See [pricing](https://skylinkapi.com/pricing/) and [schedule docs](https://skylinkapi.com/docs/v3/schedules/).
- Cloudflare Workers Free as the CORS bridge.

No AviationStack or FlightNerve integration is used. ADS-B matches remain probabilistic and require manual confirmation; they are not proof of airline-confirmed flight status.

## Setup

Follow `SETUP.md`. The app requires the Cloudflare Worker URL in `config.js`. To enable worldwide airport-board fallback, add the optional `SKYLINK_API_KEY` Worker secret as described in `SETUP.md`.
