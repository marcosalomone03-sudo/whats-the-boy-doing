import { writeFile } from "node:fs/promises";

const source = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";
const response = await fetch(source, {
  headers: { "User-Agent": "WhatsTheBoyDoing-AirportCatalogue/1.0", "Accept": "application/json" }
});
if (!response.ok) throw new Error("Airport data source returned HTTP " + response.status);
const raw = await response.json();
const byIata = new Map();

for (const airport of Object.values(raw)) {
  const iata = String(airport?.iata || "").trim().toUpperCase();
  const lat = Number(airport?.lat);
  const lon = Number(airport?.lon);
  const tz = String(airport?.tz || "").trim();
  if (!/^[A-Z]{3}$/.test(iata) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180 || !tz.includes("/")) continue;
  const item = {
    iata,
    name: String(airport.name || airport.city || iata),
    city: String(airport.city || ""),
    country: String(airport.country || ""),
    lat,
    lon,
    tz
  };
  const old = byIata.get(iata);
  // Keep the first complete entry; the upstream catalogue is keyed by ICAO.
  if (!old) byIata.set(iata, item);
}

const airports = [...byIata.values()].sort((a, b) => a.iata.localeCompare(b.iata));
if (airports.length < 3000) throw new Error("Airport catalogue unexpectedly small: " + airports.length);
if (!airports.some(a => a.iata === "VLC")) throw new Error("Required Ryanair destination VLC is missing");
await writeFile("airports.json", JSON.stringify(airports));
console.log("Generated airports.json:", airports.length, "IATA airports; VLC =", airports.find(a => a.iata === "VLC"));
