
(() => {
"use strict";

const $ = id => document.getElementById(id);

const cfg = window.WTBD_CONFIG || {};
const WORKER = (cfg.WORKER_URL || cfg.workerUrl || "").replace(/\/+$/, "");
const ROUTE_RE = /^[A-Z]{3}(?:-[A-Z]{3})?$/;

const A = {
NUE:{name:"Nuremberg",tz:"Europe/Berlin",lat:49.4987,lon:11.0780},
BUD:{name:"Budapest",tz:"Europe/Budapest",lat:47.4369,lon:19.2556},
ALC:{name:"Alicante",tz:"Europe/Madrid",lat:38.2822,lon:-0.5582},
STN:{name:"London Stansted",tz:"Europe/London",lat:51.8850,lon:0.2350},
DUB:{name:"Dublin",tz:"Europe/Dublin",lat:53.4213,lon:-6.2701},
PMI:{name:"Palma",tz:"Europe/Madrid",lat:39.5517,lon:2.7388},
GOT:{name:"Gothenburg",tz:"Europe/Stockholm",lat:57.6628,lon:12.2798},
ARN:{name:"Stockholm Arlanda",tz:"Europe/Stockholm",lat:59.6519,lon:17.9186},
VIE:{name:"Vienna",tz:"Europe/Vienna",lat:48.1103,lon:16.5697},
BCN:{name:"Barcelona",tz:"Europe/Madrid",lat:41.2974,lon:2.0833},
FCO:{name:"Rome Fiumicino",tz:"Europe/Rome",lat:41.8003,lon:12.2389},
MXP:{name:"Milan Malpensa",tz:"Europe/Rome",lat:45.6306,lon:8.7281},
BGY:{name:"Milan Bergamo",tz:"Europe/Rome",lat:45.6739,lon:9.7042},
MAN:{name:"Manchester",tz:"Europe/London",lat:53.3537,lon:-2.2750},
LTN:{name:"London Luton",tz:"Europe/London",lat:51.8747,lon:-0.3683},
EDI:{name:"Edinburgh",tz:"Europe/London",lat:55.9500,lon:-3.3725},
CRL:{name:"Brussels Charleroi",tz:"Europe/Brussels",lat:50.4592,lon:4.4538},
KRK:{name:"Krakow",tz:"Europe/Warsaw",lat:50.0777,lon:19.7848},
WRO:{name:"Wroclaw",tz:"Europe/Warsaw",lat:51.1027,lon:16.8858},
BRI:{name:"Bari",tz:"Europe/Rome",lat:41.1389,lon:16.7606},
CTA:{name:"Catania",tz:"Europe/Rome",lat:37.4668,lon:15.0664},
NAP:{name:"Naples",tz:"Europe/Rome",lat:40.8860,lon:14.2908},
OPO:{name:"Porto",tz:"Europe/Lisbon",lat:41.2481,lon:-8.6814},
LIS:{name:"Lisbon",tz:"Europe/Lisbon",lat:38.7742,lon:-9.1342},
AGP:{name:"Malaga",tz:"Europe/Madrid",lat:36.6749,lon:-4.4991},
SVQ:{name:"Seville",tz:"Europe/Madrid",lat:37.4180,lon:-5.8931},
MAD:{name:"Madrid",tz:"Europe/Madrid",lat:40.4983,lon:-3.5676},
BER:{name:"Berlin",tz:"Europe/Berlin",lat:52.3667,lon:13.5033},
HAM:{name:"Hamburg",tz:"Europe/Berlin",lat:53.6304,lon:9.9882},
FRA:{name:"Frankfurt",tz:"Europe/Berlin",lat:50.0379,lon:8.5622},
MUC:{name:"Munich",tz:"Europe/Berlin",lat:48.3538,lon:11.7861},
ZRH:{name:"Zurich",tz:"Europe/Zurich",lat:47.4581,lon:8.5555},
CPH:{name:"Copenhagen",tz:"Europe/Copenhagen",lat:55.6181,lon:12.6560},
OSL:{name:"Oslo",tz:"Europe/Oslo",lat:60.1976,lon:11.1004},
BGO:{name:"Bergen",tz:"Europe/Oslo",lat:60.2934,lon:5.2181},
HEL:{name:"Helsinki",tz:"Europe/Helsinki",lat:60.3172,lon:24.9633},
GDN:{name:"Gdansk",tz:"Europe/Warsaw",lat:54.3776,lon:18.4662},
WAW:{name:"Warsaw",tz:"Europe/Warsaw",lat:52.1657,lon:20.9671},
PRG:{name:"Prague",tz:"Europe/Prague",lat:50.1008,lon:14.2632},
LPA:{name:"Gran Canaria",tz:"Atlantic/Canary",lat:27.9319,lon:-15.3866},
TFS:{name:"Tenerife South",tz:"Atlantic/Canary",lat:28.0445,lon:-16.5725},
RAK:{name:"Marrakech",tz:"Africa/Casablanca",lat:31.6069,lon:-8.0363}
};

const state = {
flights:[],
candidates:[],
selected:null,
last:null
};

/* INITIAL DATE */

const now = new Date();

$("flightDate").value = [
now.getFullYear(),
String(now.getMonth()+1).padStart(2,"0"),
String(now.getDate()).padStart(2,"0")
].join("-");

/* AIRPORTS AND ROUTES */

function airport(code) {
return A[code] || {
name:code,
tz:"Europe/Berlin",
lat:null,
lon:null
};
}

function routesFor(value) {
const parts = value.split("-");

if(parts.length === 1) {
return [
["NUE",parts[0]],
[parts[0],"NUE"]
];
}

return [
["NUE",parts[0]],
[parts[0],"NUE"],
["NUE",parts[1]],
[parts[1],"NUE"]
];
}

/* TIME AND DATE FUNCTIONS */

function localParts(date,tz) {
return Object.fromEntries(
new Intl.DateTimeFormat("en-GB",{
timeZone:tz,
year:"numeric",
month:"2-digit",
day:"2-digit",
hour:"2-digit",
minute:"2-digit",
hourCycle:"h23"
}).formatToParts(date).map(x=>[x.type,x.value])
);
}

function dateAtAirport(ds,ts,ap) {
const [y,m,d] = ds.split("-").map(Number);
const [h,n] = ts.split(":").map(Number);

const target = Date.UTC(y,m-1,d,h,n);
let guess = target;

for(let i=0;i<4;i++) {
const p = localParts(new Date(guess),ap.tz);

guess += target - Date.UTC(
Number(p.year),
Number(p.month)-1,
Number(p.day),
Number(p.hour),
Number(p.minute)
);
}

return new Date(guess);
}

function fmt(date,tz) {
return date
? new Intl.DateTimeFormat("en-GB",{
timeZone:tz,
hour:"2-digit",
minute:"2-digit",
hourCycle:"h23"
}).format(date)
: "—";
}

/* DISPLAY HELPERS */

function esc(value) {
return String(value ?? "—").replace(/[&<>"']/g,c=>({
"&":"&amp;",
"<":"&lt;",
">":"&gt;",
'"':"&quot;",
"'":"&#39;"
}[c]));
}

function error(message) {
$("error").style.display = message ? "block" : "none";
$("error").textContent = message || "";
}

function safeStorageGet(key) {
try {
return JSON.parse(localStorage.getItem(key) || "null");
} catch {
return null;
}
}

function safeStorageSet(key,value) {
try {
localStorage.setItem(key,JSON.stringify(value));
} catch(e) {
console.warn("Local storage unavailable:",e);
}
}

/* CLOUDFLARE WORKER */

async function get(path) {
if(!WORKER) {
throw new Error("Worker URL not configured. Check config.js.");
}

const response = await fetch(WORKER+path,{
headers:{Accept:"application/json"},
cache:"no-store"
});

if(!response.ok) {
throw new Error(
`Proxy returned HTTP ${response.status} for ${path.split("?")[0]}`
);
}

return response.json();
}

/* SCHEDULE NORMALIZATION */

function normalizeSchedule(j,o,d,ds) {
const out = [];

const days = Array.isArray(j?.days) ? j.days : [];
const dayNumber = Number(ds.slice(-2));

for(const entry of days) {

if(Number(entry.day) !== dayNumber) continue;

for(const flight of (entry.flights || [])) {

const dep =
flight.departureTime ||
flight.departureLocalTime ||
flight.departureDateTime?.slice(11,16);

const arr =
flight.arrivalTime ||
flight.arrivalLocalTime ||
flight.arrivalDateTime?.slice(11,16);

const number =
flight.number ||
flight.flightNumber ||
flight.flightNo;

if(!dep || !arr || !number) continue;

const carrier = flight.carrierCode || "FR";

out.push(
makeFlight(
o,
d,
`${carrier}${number}`,
dep,
arr,
ds
)
);
}
}

/* Compatibility with alternative timetable formats */

if(!out.length && Array.isArray(j)) {

for(const item of j) {

for(const leg of (item.legs || [item])) {

const dep = leg.departureDateTime;
const arr = leg.arrivalDateTime;

if(!dep || !arr) continue;
if(dep.slice(0,10) !== ds) continue;

out.push(
makeFlight(
o,
d,
leg.flightNumber || item.flightNumber || "FR?",
dep.slice(11,16),
arr.slice(11,16),
ds,
arr.slice(0,10)
)
);
}
}
}

/* Remove duplicate entries */

const unique = new Map();

for(const flight of out) {
const key = [
flight.flightNumber,
flight.date,
flight.departure.getTime()
].join("|");

unique.set(key,flight);
}

return [...unique.values()];
}

function makeFlight(o,d,num,dep,arr,ds,arrDate=ds) {
return {
origin:o,
destination:d,
flightNumber:String(num).replace(/\s/g,"").toUpperCase(),
date:ds,
departureLocal:dep.slice(0,5),
arrivalLocal:arr.slice(0,5),
departure:dateAtAirport(ds,dep.slice(0,5),airport(o)),
arrival:dateAtAirport(arrDate,arr.slice(0,5),airport(d))
};
}

async function loadRoute(o,d,ds) {
const [year,month] = ds.split("-");

const data = await get(
`/api/schedule?origin=${encodeURIComponent(o)}`+
`&destination=${encodeURIComponent(d)}`+
`&year=${year}&month=${Number(month)}`
);

return normalizeSchedule(data,o,d,ds);
}

/* GEOGRAPHICAL CALCULATIONS */

function hav(a,b) {
const R = 3440.065;
const p = Math.PI/180;

const d1 = (b.lat-a.lat)*p;
const d2 = (b.lon-a.lon)*p;

const x =
Math.sin(d1/2)**2 +
Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(d2/2)**2;

return 2*R*Math.asin(Math.sqrt(x));
}

function bearing(a,b) {
const p = Math.PI/180;

const y =
Math.sin((b.lon-a.lon)*p)*Math.cos(b.lat*p);

const x =
Math.cos(a.lat*p)*Math.sin(b.lat*p) -
Math.sin(a.lat*p)*Math.cos(b.lat*p)*
Math.cos((b.lon-a.lon)*p);

return (Math.atan2(y,x)/p+360)%360;
}

function diff(a,b) {
return Math.abs(((a-b+540)%360)-180);
}

function midpoint(a,b) {
const p1 = a.lat*Math.PI/180;
const l1 = a.lon*Math.PI/180;
const p2 = b.lat*Math.PI/180;
const l2 = b.lon*Math.PI/180;

const bx = Math.cos(p2)*Math.cos(l2-l1);
const by = Math.cos(p2)*Math.sin(l2-l1);

const p3 = Math.atan2(
Math.sin(p1)+Math.sin(p2),
Math.sqrt((Math.cos(p1)+bx)**2+by**2)
);

const l3 = l1+Math.atan2(by,Math.cos(p1)+bx);

return {
lat:p3*180/Math.PI,
lon:l3*180/Math.PI
};
}

/* ADS-B DATA */

async function aircraftNear(lat,lon,distance) {
return get(
`/api/aircraft?lat=${lat}&lon=${lon}`+
`&dist=${Math.min(250,Math.max(5,Math.round(distance)))}`
);
}

function validAircraft(a) {
return !!(
a &&
a.hex &&
Number.isFinite(Number(a.lat)) &&
Number.isFinite(Number(a.lon)) &&
Number(a.seen ?? 999) < 90
);
}

async function findCandidates(flight) {
const origin = airport(flight.origin);
const destination = airport(flight.destination);

if(origin.lat == null || destination.lat == null) {
return [];
}

const middle = midpoint(origin,destination);

const points = [
{...origin,kind:"departure"},
{...middle,kind:"route"}
];

if(hav(origin,destination)>350) {
points.push({...destination,kind:"arrival"});
}

const responses = await Promise.allSettled(
points.map(point =>
aircraftNear(
point.lat,
point.lon,
point.kind==="departure" ? 45 : 150
)
)
);

const aircraftMap = new Map();

for(const response of responses) {

if(response.status !== "fulfilled") continue;

for(const aircraft of (response.value.ac || [])) {

if(!validAircraft(aircraft)) continue;

const previous = aircraftMap.get(aircraft.hex);

if(
!previous ||
Number(aircraft.seen ?? 999) <
Number(previous.seen ?? 999)
) {
aircraftMap.set(aircraft.hex,aircraft);
}
}
}

const candidates = [];

for(const aircraft of aircraftMap.values()) {

const position = {
lat:Number(aircraft.lat),
lon:Number(aircraft.lon)
};

const fromOrigin = hav(origin,position);
const toDestination = hav(position,destination);

const deviation =
fromOrigin+toDestination-hav(origin,destination);

if(deviation>55) continue;

const track = Number.isFinite(Number(aircraft.track))
? Number(aircraft.track)
: null;

const routeBearing = bearing(origin,destination);

const airborne =
aircraft.alt_baro !== "ground" &&
Number.isFinite(Number(aircraft.alt_baro)) &&
Number(aircraft.alt_baro)>1000;

const headingOK =
track === null || diff(track,routeBearing)<85;

const timeOK =
Date.now() >= flight.departure.getTime()-50*60000 &&
Date.now() <= flight.arrival.getTime()+100*60000;

if(!timeOK) continue;

const nearOrigin = fromOrigin<35;
const nearRoute =
fromOrigin>=20 && toDestination>=20;

if(!(nearOrigin || nearRoute)) continue;
if(!headingOK && airborne) continue;

const score =
(nearOrigin?25:0) +
(airborne?20:0) +
(headingOK?15:0) -
Math.min(deviation,50)/5 -
Number(aircraft.seen||0)/10;

candidates.push({
...aircraft,
score,
fromOrigin,
routeBearing
});
}

return candidates
.sort((a,b)=>b.score-a.score)
.slice(0,8);
}

/* AIRCRAFT SELECTION */

function saveSelected(flight,aircraft) {

const item = {
flightNumber:flight.flightNumber,
origin:flight.origin,
destination:flight.destination,
date:flight.date,
hex:aircraft.hex,
callsign:(aircraft.flight||"").trim(),
registration:aircraft.r||null,
type:aircraft.t||null,
updatedAt:new Date().toISOString()
};

safeStorageSet("wtbd-selected-v2",item);

state.selected = {
flight,
aircraft
};
}

/* AIRCRAFT DISPLAY */

function renderAircraft(flight,aircraft) {

const onGround = aircraft.alt_baro === "ground";

const status = onGround
? "ON GROUND"
: Number.isFinite(Number(aircraft.alt_baro))
? "AIRBORNE"
: "UNKNOWN";

const statusClass = onGround
? "ground"
: status==="AIRBORNE"
? "air"
: "none";

return `
<div class="flighttop">
<div>
<div class="flightno">${esc(flight.flightNumber)}</div>
<div class="route">${esc(flight.origin)} → ${esc(flight.destination)}</div>
<div class="muted">${esc(flight.origin)} · ${esc(flight.destination)}</div>
</div>
<span class="status ${statusClass}">${status}</span>
</div>

<div class="stats">

<div class="stat">
<small>Actual callsign</small>
<strong>${esc((aircraft.flight||"").trim()||"Not broadcast")}</strong>
</div>

<div class="stat">
<small>ICAO HEX</small>
<strong>${esc(aircraft.hex)}</strong>
</div>

<div class="stat">
<small>Registration</small>
<strong>${esc(aircraft.r)}</strong>
</div>

<div class="stat">
<small>Aircraft type</small>
<strong>${esc(aircraft.t)}</strong>
</div>

<div class="stat">
<small>Ground speed</small>
<strong>${Number.isFinite(aircraft.gs)?Math.round(aircraft.gs)+" kt":"—"}</strong>
</div>

<div class="stat">
<small>Altitude</small>
<strong>${
Number.isFinite(Number(aircraft.alt_baro))
? Math.round(Number(aircraft.alt_baro)).toLocaleString()+" ft"
: onGround ? "GROUND" : "—"
}</strong>
</div>

<div class="stat">
<small>Latitude</small>
<strong>${Number.isFinite(Number(aircraft.lat))?Number(aircraft.lat).toFixed(4):"—"}</strong>
</div>

<div class="stat">
<small>Longitude</small>
<strong>${Number.isFinite(Number(aircraft.lon))?Number(aircraft.lon).toFixed(4):"—"}</strong>
</div>

</div>

<div class="notice">
ADS-B position age: ${Math.round(Number(aircraft.seen)||0)} seconds.
This is not airline-confirmed flight status.
</div>
`;
}

/* MAIN DISPLAY */

function render() {

const flights = [...state.flights]
.sort((a,b)=>a.departure-b.departure);

const now = new Date();

$("sectors").innerHTML = flights.length
? flights.map(flight=>`
<div class="flightrow">
<div>
<b>${esc(flight.flightNumber)} · ${esc(flight.origin)} → ${esc(flight.destination)}</b>
<small>${esc(airport(flight.origin).name)} → ${esc(airport(flight.destination).name)}</small>
</div>
<div class="time">
${fmt(flight.departure,airport(flight.origin).tz)}
<small>arr ${fmt(flight.arrival,airport(flight.destination).tz)}</small>
</div>
</div>
`).join("")
: `<div class="empty">No flights scheduled for this date.</div>`;

$("sectorCount").textContent = flights.length+" SECTORS";

const next = flights.find(flight=>flight.departure>now);

$("nextFlight").innerHTML = next
? `
<div class="flighttop">
<div>
<div class="flightno">${esc(next.flightNumber)}</div>
<div class="route">${esc(next.origin)} → ${esc(next.destination)}</div>
</div>
<span class="status none">UPCOMING</span>
</div>
<div class="stats">
<div class="stat">
<small>Scheduled departure</small>
<strong>${fmt(next.departure,airport(next.origin).tz)}</strong>
</div>
<div class="stat">
<small>Scheduled arrival</small>
<strong>${fmt(next.arrival,airport(next.destination).tz)}</strong>
</div>
</div>
`
: `<div class="empty">No future sector in loaded timetable.</div>`;

$("current").innerHTML = state.selected
? renderAircraft(state.selected.flight,state.selected.aircraft)
: `<div class="empty">No aircraft confirmed yet. Select a candidate below.</div>`;

const last = safeStorageGet("wtbd-selected-v2");

$("lastFlight").innerHTML = last
? `
<div class="flighttop">
<div>
<div class="flightno">${esc(last.flightNumber)}</div>
<div class="route">${esc(last.origin)} → ${esc(last.destination)}</div>
</div>
<span class="status none">LAST SELECTED</span>
</div>
<div class="stats">
<div class="stat">
<small>Callsign</small>
<strong>${esc(last.callsign)}</strong>
</div>
<div class="stat">
<small>Registration</small>
<strong>${esc(last.registration)}</strong>
</div>
<div class="stat">
<small>Aircraft type</small>
<strong>${esc(last.type)}</strong>
</div>
<div class="stat">
<small>ICAO HEX</small>
<strong>${esc(last.hex)}</strong>
</div>
</div>
`
: `<div class="empty">No aircraft selected on this device yet.</div>`;
}

/* RESTORE LAST AIRCRAFT */

async function refreshSelected() {

const saved = safeStorageGet("wtbd-selected-v2");

if(!saved?.hex) return;

/* Do not show an old flight as today's current flight */

const flight = state.flights.find(item =>
item.flightNumber===saved.flightNumber &&
item.origin===saved.origin &&
item.destination===saved.destination &&
item.date===saved.date
);

if(!flight) return;

try {

const data = await get(
`/api/hex?icao=${encodeURIComponent(saved.hex)}`
);

const aircraft = (data.ac||[]).find(
item=>String(item.hex).toLowerCase()===String(saved.hex).toLowerCase()
);

if(aircraft) {
state.selected = {
flight,
aircraft
};
}

} catch(e) {

/* HEX refresh is optional. Keep the schedule working if it fails. */

console.warn("Could not refresh saved aircraft:",e.message);
}
}

/* MAIN SEARCH */

async function run() {

error("");

if(!WORKER) {
error("Worker not configured. Check config.js.");
return;
}

const route = $("route").value
.trim()
.toUpperCase()
.replace(/\s+/g,"");

const date = $("flightDate").value;

if(!ROUTE_RE.test(route)) {
error("Enter one airport code (BUD) or two (BUD-ALC).");
return;
}

if(!date) {
error("Choose a duty date.");
return;
}

const button = $("track");

button.disabled = true;
button.textContent = "LOADING FLIGHT SCHEDULE…";

state.flights = [];
state.candidates = [];
state.selected = null;

$("candidates").innerHTML = "";
$("connection").textContent = "Checking the published timetable…";

try {

const routes = routesFor(route);

const responses = await Promise.allSettled(
routes.map(([origin,destination]) =>
loadRoute(origin,destination,date)
)
);

const errors = [];

responses.forEach((response,index)=>{

if(response.status==="fulfilled") {
state.flights.push(...response.value);
} else {
errors.push(
routes[index].join("-")+": "+response.reason.message
);
}

});

state.flights.sort((a,b)=>a.departure-b.departure);

/* A successful timetable with zero flights is NOT an API failure */

if(!state.flights.length) {

render();

$("candidates").innerHTML =
`<div class="empty">No flights scheduled on ${esc(date)} for the selected route.</div>`;

$("connection").textContent = errors.length
? "Some timetable requests failed."
: "Schedule checked · no flights today";

if(errors.length) error(errors.join("\n"));

$("lastUpdated").textContent =
"UPDATED "+fmt(new Date(),"Europe/Berlin");

return;
}

$("connection").textContent =
"Schedule loaded · matching nearby aircraft…";

render();

/* Only search aircraft during the active flight window */

const now = Date.now();

const activeFlights = state.flights.filter(flight =>
now>=flight.departure.getTime()-50*60000 &&
now<=flight.arrival.getTime()+100*60000
);

const allCandidates = [];

for(const flight of activeFlights) {

try {

const aircraft = await findCandidates(flight);

allCandidates.push(
...aircraft.map(item=>({
flight,
aircraft:item
}))
);

} catch(e) {

errors.push(
flight.flightNumber+" ADS-B: "+e.message
);

}
}

allCandidates.sort(
(a,b)=>b.aircraft.score-a.aircraft.score
);

state.candidates = allCandidates;

/* Candidate display */

if(allCandidates.length) {

$("candidates").className = "candidate-list";

$("candidates").innerHTML = allCandidates.map((item,index)=>`
<div class="candidate">
<div>
<b>${esc(item.flight.flightNumber)} · ${esc(item.flight.origin)} → ${esc(item.flight.destination)}</b>
<small>
${esc((item.aircraft.flight||"").trim()||"No callsign")}
· ${esc(item.aircraft.r||"Registration unknown")}
· ${esc(item.aircraft.t||"Type unknown")}
· HEX ${esc(item.aircraft.hex)}
· ${Math.round(Number(item.aircraft.seen)||0)}s ago
</small>
</div>
<button class="secondary" data-pick="${index}">SELECT</button>
</div>
`).join("");

$("candidates")
.querySelectorAll("[data-pick]")
.forEach(button=>{

button.addEventListener("click",()=>{

const item = allCandidates[Number(button.dataset.pick)];

if(!item) return;

saveSelected(item.flight,item.aircraft);

render();

$("connection").textContent =
"Aircraft selected · ICAO HEX saved";

});

});

} else {

$("candidates").innerHTML = activeFlights.length
? `<div class="empty">No convincing aircraft candidate found for the active scheduled sectors. Try again closer to departure.</div>`
: `<div class="empty">No flight is currently within the aircraft-tracking time window.</div>`;

}

/* Optional restoration of previously selected aircraft */

await refreshSelected();

render();

$("lastUpdated").textContent =
"UPDATED "+fmt(new Date(),"Europe/Berlin");

$("connection").textContent = allCandidates.length
? `${allCandidates.length} possible aircraft · choose the correct one`
: "Schedule loaded · no ADS-B match";

if(errors.length) {
error(errors.join("\n"));
}

} catch(e) {

error(e.message);

$("connection").textContent =
"Unable to load flight data";

} finally {

button.disabled = false;
button.textContent = "REFRESH DUTY & AIRCRAFT ↗";

}
}

/* EVENT LISTENERS */

$("track").addEventListener("click",run);

$("route").addEventListener("input",event=>{
event.target.value = event.target.value.toUpperCase();
});

$("route").addEventListener("keydown",event=>{
if(event.key==="Enter") run();
});

/* SERVICE WORKER */

if(
"serviceWorker" in navigator &&
location.protocol.startsWith("http")
) {
navigator.serviceWorker
.register("./sw.js")
.catch(error=>console.warn("Service worker:",error));
}

/* INITIAL DISPLAY */

render();

})();
