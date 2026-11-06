(() => {
  "use strict";

  // What's the boy doing? — flight tracker
  const $ = id => document.getElementById(id);
  const cfg = window.WTBD_CONFIG || {};
  const WORKER = String(cfg.WORKER_URL || cfg.workerUrl || "").replace(/\/+$/, "");
  const ROUTE_RE = /^[A-Z]{3}(?:-[A-Z]{3})?$/;
  const STORAGE_KEY = "wtbd-selected-v2";

  const AIRPORTS = {
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
    PMO:{name:"Palermo",tz:"Europe/Rome",lat:38.1759,lon:13.0910},
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

  const state = { flights:[], candidates:[], selected:null };
  const now = new Date();
  $("flightDate").value = [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");

  function airport(code) { return AIRPORTS[code] || null; }
  function routesFor(value) {
    const parts = value.split("-");
    return parts.length === 1
      ? [["NUE",parts[0]],[parts[0],"NUE"]]
      : [["NUE",parts[0]],[parts[0],"NUE"],["NUE",parts[1]],[parts[1],"NUE"]];
  }
  function numeric(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function esc(value) {
    return String(value ?? "—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function showError(message) {
    $("error").style.display = message ? "block" : "none";
    $("error").textContent = message || "";
  }
  function storageGet() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } }
  function storageSet(value) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(value)); } catch(e) { console.warn("Local storage unavailable",e); } }

  function localParts(date,tz) {
    return Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));
  }
  function dateAtAirport(dateString,timeString,ap) {
    const [y,m,d] = dateString.split("-").map(Number);
    const [h,mi] = timeString.slice(0,5).split(":").map(Number);
    const target = Date.UTC(y,m-1,d,h,mi);
    let guess = target;
    for (let i=0;i<4;i++) {
      const p = localParts(new Date(guess),ap.tz);
      guess += target - Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
    }
    return new Date(guess);
  }
  function addCalendarDay(ds) {
    const [y,m,d] = ds.split("-").map(Number);
    const x = new Date(Date.UTC(y,m-1,d+1));
    return [x.getUTCFullYear(),String(x.getUTCMonth()+1).padStart(2,"0"),String(x.getUTCDate()).padStart(2,"0")].join("-");
  }
  function fmt(date,tz) {
    if (!date || !Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
  }

  async function get(path) {
    if (!WORKER) throw new Error("Worker URL not configured. Check config.js.");
    const response = await fetch(WORKER+path,{headers:{Accept:"application/json"},cache:"no-store"});
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Invalid response from Worker (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.detail || data.error || `Worker returned HTTP ${response.status}.`);
    return data;
  }

  function makeFlight(origin,destination,number,dep,arr,date,arrivalDate) {
    const depTime = dateAtAirport(date,dep,airport(origin));
    let arrDate = arrivalDate || date;
    let arrTime = dateAtAirport(arrDate,arr,airport(destination));
    if (arrTime <= depTime) {
      arrDate = addCalendarDay(arrDate);
      arrTime = dateAtAirport(arrDate,arr,airport(destination));
    }
    return {origin,destination,flightNumber:String(number).replace(/\s/g,"").toUpperCase(),date,departureLocal:dep,arrivalLocal:arr,departure:depTime,arrival:arrTime,routeScan:false};
  }
  function normalizeSchedule(data,origin,destination,date) {
    const out = [];
    const timePart = value => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      const match = text.match(/(?:T|^| )(\d{2}:\d{2})/);
      return match ? match[1] : "";
    };
    const flightNo = (raw,carrier) => {
      const value = String(raw || "").replace(/\s+/g,"").toUpperCase();
      if (!value) return "";
      return /^[A-Z]{2,3}\d/.test(value) ? value : `${String(carrier || "FR").toUpperCase()}${value}`;
    };
    if (Array.isArray(data?.days)) {
      for (const day of data.days) {
        const dayValue = String(day.date || day.dateLocal || day.day || "");
        const matchesDate = dayValue.includes("-")
          ? dayValue.slice(0,10) === date
          : Number(dayValue) === Number(date.slice(-2));
        if (!matchesDate) continue;
        for (const item of (Array.isArray(day.flights) ? day.flights : [])) {
          const dep = timePart(item.departureTime || item.departureLocalTime || item.departureDateTime);
          const arr = timePart(item.arrivalTime || item.arrivalLocalTime || item.arrivalDateTime);
          const no = flightNo(item.flightNumber || item.number || item.flightNo,item.carrierCode);
          if (!dep || !arr || !no) continue;
          const arrDate = item.arrivalDateTime && String(item.arrivalDateTime).includes("T")
            ? String(item.arrivalDateTime).slice(0,10) : undefined;
          out.push(makeFlight(origin,destination,no,dep,arr,date,arrDate));
        }
      }
    }
    if (!out.length && Array.isArray(data)) {
      for (const item of data) for (const leg of (item.legs || [item])) {
        const depRaw = leg.departureDateTime || leg.departureTime;
        const arrRaw = leg.arrivalDateTime || leg.arrivalTime;
        const depDate = String(depRaw || "").slice(0,10);
        if (!depRaw || !arrRaw || (depDate.includes("-") && depDate !== date)) continue;
        const dep = timePart(depRaw), arr = timePart(arrRaw);
        const no = flightNo(leg.flightNumber || item.flightNumber || leg.number || item.number,leg.carrierCode || item.carrierCode);
        if (dep && arr && no) out.push(makeFlight(origin,destination,no,dep,arr,date,String(arrRaw).slice(0,10)));
      }
    }
    const unique = new Map();
    for (const flight of out) {
      if (!Number.isFinite(flight.departure.getTime()) || !Number.isFinite(flight.arrival.getTime())) continue;
      unique.set(`${flight.flightNumber}|${flight.departure.getTime()}`,flight);
    }
    return [...unique.values()].sort((a,b)=>a.departure-b.departure);
  }
  async function loadRoute(origin,destination,date) {
    const [year,month] = date.split("-");
    const data = await get(`/api/schedule?origin=${origin}&destination=${destination}&year=${year}&month=${Number(month)}&date=${encodeURIComponent(date)}`);
    return normalizeSchedule(data,origin,destination,date);
  }

  const EARTH_NM = 3440.065;
  const RAD = Math.PI/180;
  function hav(a,b) {
    const dLat=(b.lat-a.lat)*RAD, dLon=(b.lon-a.lon)*RAD;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.sin(dLon/2)**2;
    return 2*EARTH_NM*Math.asin(Math.sqrt(Math.min(1,x)));
  }
  function bearing(a,b) {
    const y=Math.sin((b.lon-a.lon)*RAD)*Math.cos(b.lat*RAD);
    const x=Math.cos(a.lat*RAD)*Math.sin(b.lat*RAD)-Math.sin(a.lat*RAD)*Math.cos(b.lat*RAD)*Math.cos((b.lon-a.lon)*RAD);
    return (Math.atan2(y,x)/RAD+360)%360;
  }
  function angleDiff(a,b) { return Math.abs(((a-b+540)%360)-180); }
  function interpolate(a,b,f) {
    const total = hav(a,b)/EARTH_NM;
    if (total < 1e-8) return {lat:a.lat,lon:a.lon};
    const sinTotal=Math.sin(total), A=Math.sin((1-f)*total)/sinTotal, B=Math.sin(f*total)/sinTotal;
    const x=A*Math.cos(a.lat*RAD)*Math.cos(a.lon*RAD)+B*Math.cos(b.lat*RAD)*Math.cos(b.lon*RAD);
    const y=A*Math.cos(a.lat*RAD)*Math.sin(a.lon*RAD)+B*Math.cos(b.lat*RAD)*Math.sin(b.lon*RAD);
    const z=A*Math.sin(a.lat*RAD)+B*Math.sin(b.lat*RAD);
    return {lat:Math.atan2(z,Math.sqrt(x*x+y*y))/RAD,lon:Math.atan2(y,x)/RAD};
  }
  function routePosition(origin,destination,position) {
    const distance = hav(origin,destination)/EARTH_NM;
    const d13 = hav(origin,position)/EARTH_NM;
    const theta13 = bearing(origin,position)*RAD;
    const theta12 = bearing(origin,destination)*RAD;
    const delta = theta13-theta12;
    const cross = Math.asin(Math.max(-1,Math.min(1,Math.sin(d13)*Math.sin(delta))))*EARTH_NM;
    const along = Math.atan2(Math.sin(d13)*Math.cos(delta),Math.cos(d13))*EARTH_NM;
    return {crossTrack:Math.abs(cross),alongTrack:along,distance};
  }
  function validAircraft(a) {
    const lat=numeric(a?.lat), lon=numeric(a?.lon), seen=numeric(a?.seen);
    return !!(a && typeof a.hex === "string" && /^[0-9a-f]{6}$/i.test(a.hex) && lat !== null && lon !== null && Math.abs(lat)<=90 && Math.abs(lon)<=180 && (seen===null || seen<90));
  }
  async function aircraftNear(point,dist) {
    return get(`/api/aircraft?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}&dist=${dist}`);
  }
  const RYANAIR_737_TYPES = new Set(["B738", "B38M", "B737"]);
  const RYANAIR_CALLSIGN_PREFIXES = ["RYR", "RUK", "MAY", "BZZ", "RYS"];

  function normalizedCallsign(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  function callsignMatchesFlight(value, flightNumber) {
    const call = normalizedCallsign(value);
    const digits = String(flightNumber || "").replace(/^[A-Z]+/, "").replace(/\D/g, "");
    if (!call || !digits) return false;
    return RYANAIR_CALLSIGN_PREFIXES.some(prefix => {
      if (!call.startsWith(prefix)) return false;
      const suffix = call.slice(prefix.length).replace(/[A-Z]+$/, "");
      return suffix.replace(/^0+/, "") === digits.replace(/^0+/, "");
    });
  }
  function isKnownAirbus(type) {
    const t = String(type || "").toUpperCase();
    return /^(A318|A319|A320|A321|A20N|A21N|A332|A333|A339|A343|A346|A359|A35K|A388)$/.test(t) || t.startsWith("A32") || t.startsWith("A33") || t.startsWith("A34") || t.startsWith("A35");
  }
  function aircraftCompatibility(ac, flight) {
    const type = String(ac.t || "").toUpperCase();
    const call = normalizedCallsign(ac.flight);
    const operator = String(ac.ownOp || ac.operator || "").toLowerCase();
    const callMatch = callsignMatchesFlight(ac.flight, flight.flightNumber);
    const groupCall = RYANAIR_CALLSIGN_PREFIXES.some(prefix => call.startsWith(prefix));
    const operatorKnown = !!operator;
    const operatorMatch = /ryanair|malta air|buzz|lauda|ryanair sun|ryanair uk/.test(operator);
    if (isKnownAirbus(type)) return {ok:false, callMatch, groupCall, operatorMatch, typeMatch:false, reason:"Airbus excluded"};
    const typeMatch = RYANAIR_737_TYPES.has(type);
    // If the feed explicitly identifies a different operator, never treat it as a Ryanair candidate.
    if (operatorKnown && !operatorMatch) return {ok:false, callMatch, groupCall, operatorMatch:false, typeMatch, reason:"Different operator"};
    // A Ryanair-group callsign or operator is the strongest evidence. If neither is
    // broadcast, a 737 is only provisionally eligible and must pass strict route/time scoring.
    if (!callMatch && !groupCall && !operatorMatch && !typeMatch) {
      return {ok:false, callMatch, groupCall, operatorMatch, typeMatch, reason:"No compatible aircraft evidence"};
    }
    return {ok:true, callMatch, groupCall, operatorMatch, typeMatch, operatorKnown};
  }
  async function findCandidates(flight) {
    const origin=airport(flight.origin), destination=airport(flight.destination);
    if (!origin || !destination) throw new Error("Airport coordinates are not available for this route.");
    const distance=hav(origin,destination);
    const fractions = distance < 180 ? [0.08,0.35,0.65,0.92] : [0.04,0.22,0.40,0.60,0.78,0.96];
    const points=fractions.map(f=>interpolate(origin,destination,f));
    const radius=Math.min(180,Math.max(90,Math.round(distance/7+45)));
    const results=await Promise.allSettled(points.map(p=>aircraftNear(p,radius)));
    const map=new Map();
    const failures=[];
    for (const result of results) {
      if (result.status!=="fulfilled") { failures.push(result.reason?.message || "ADS-B request failed"); continue; }
      for (const ac of (result.value?.ac || [])) {
        if (!validAircraft(ac)) continue;
        const old=map.get(ac.hex);
        if (!old || (numeric(ac.seen) ?? 999)<(numeric(old.seen) ?? 999)) map.set(ac.hex,ac);
      }
    }
    if (!map.size && failures.length===results.length) throw new Error(failures[0]);

    const now=Date.now();
    if (now < flight.departure.getTime()-120*60000 || now > flight.arrival.getTime()+240*60000) return [];
    const routeBearing=bearing(origin,destination);
    const durationMinutes=Math.max(30,(flight.arrival.getTime()-flight.departure.getTime())/60000);
    const elapsedMinutes=(now-flight.departure.getTime())/60000;
    const expectedFraction=Math.max(0,Math.min(1,elapsedMinutes/durationMinutes));
    const candidates=[];
    for (const ac of map.values()) {
      const compatibility=aircraftCompatibility(ac,flight);
      if (!compatibility.ok) continue;
      const pos={lat:numeric(ac.lat),lon:numeric(ac.lon)};
      const geo=routePosition(origin,destination,pos);
      if (geo.alongTrack < -35 || geo.alongTrack > geo.distance+35 || geo.crossTrack > 65) continue;
      const fraction=Math.max(0,Math.min(1,geo.alongTrack/Math.max(1,geo.distance)));
      const track=numeric(ac.track);
      const headingDifference=track===null ? null : angleDiff(track,routeBearing);
      if (headingDifference!==null && headingDifference>75 && !compatibility.callMatch && !compatibility.groupCall && !compatibility.operatorMatch) continue;
      const onGround=ac.alt_baro === "ground";
      const altitude=onGround ? null : numeric(ac.alt_baro);
      const seen=numeric(ac.seen) ?? 999;
      const progressDifference=Math.abs(fraction-expectedFraction);
      // Unknown-operator 737s need a very tight positional, timing and heading match.
      if (!compatibility.callMatch && !compatibility.groupCall && !compatibility.operatorMatch) {
        if (geo.crossTrack > 28 || progressDifference > 0.18 || seen > 25 || (headingDifference !== null && headingDifference > 35)) continue;
      }
      const headingScore=headingDifference===null?0:headingDifference<35?18:headingDifference<65?10:headingDifference<90?2:-12;
      const callScore=compatibility.callMatch?55:compatibility.groupCall?42:compatibility.operatorMatch?48:0;
      const typeScore=compatibility.typeMatch?18:0;
      const routeScore=Math.max(0,22-geo.crossTrack/3);
      const progressScore=Math.max(0,18-progressDifference*30);
      const freshnessScore=Math.max(0,12-seen/8);
      const groundPenalty=onGround && fraction>0.12 && fraction<0.88 ? 20:0;
      const score=callScore+typeScore+routeScore+progressScore+headingScore+freshnessScore-groundPenalty;
      if (score < 28) continue;
      const confidence=score>=90?"HIGH":score>=60?"MEDIUM":"LOW";
      candidates.push({...ac,score,confidence,crossTrack:geo.crossTrack,alongTrack:geo.alongTrack,routeBearing,headingDifference,altitude,onGround,callMatch:compatibility.callMatch,typeMatch:compatibility.typeMatch,expectedFraction});
    }
    return candidates.sort((a,b)=>b.score-a.score).slice(0,3);
  }

  function saveSelected(flight,aircraft) {
    const saved={flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,date:flight.date,routeScan:!!flight.routeScan,hex:aircraft.hex,callsign:(aircraft.flight||"").trim(),registration:aircraft.r||null,type:aircraft.t||null,updatedAt:new Date().toISOString()};
    storageSet(saved);
    state.selected={flight,aircraft};
  }
  function renderAircraft(flight,ac) {
    const onGround=ac.alt_baro==="ground";
    const altitude=numeric(ac.alt_baro), speed=numeric(ac.gs), lat=numeric(ac.lat), lon=numeric(ac.lon);
    const status=onGround?"ON GROUND":altitude!==null?"AIRBORNE":"UNKNOWN";
    const statusClass=onGround?"ground":status==="AIRBORNE"?"air":"none";
    return `<div class="flighttop"><div><div class="flightno">${esc(flight.flightNumber)}</div><div class="route">${esc(flight.origin)} → ${esc(flight.destination)}</div><div class="muted">${esc(airport(flight.origin)?.name)} · ${esc(airport(flight.destination)?.name)}</div></div><span class="status ${statusClass}">${status}</span></div>
      <div class="stats">
        <div class="stat"><small>Actual callsign</small><strong>${esc((ac.flight||"").trim()||"Not broadcast")}</strong></div>
        <div class="stat"><small>ICAO HEX</small><strong>${esc(ac.hex)}</strong></div>
        <div class="stat"><small>Registration</small><strong>${esc(ac.r)}</strong></div>
        <div class="stat"><small>Aircraft type</small><strong>${esc(ac.t)}</strong></div>
        <div class="stat"><small>Ground speed</small><strong>${speed===null?"—":Math.round(speed)+" kt"}</strong></div>
        <div class="stat"><small>Altitude</small><strong>${onGround?"GROUND":altitude===null?"—":Math.round(altitude).toLocaleString()+" ft"}</strong></div>
        <div class="stat"><small>Latitude</small><strong>${lat===null?"—":lat.toFixed(4)}</strong></div>
        <div class="stat"><small>Longitude</small><strong>${lon===null?"—":lon.toFixed(4)}</strong></div>
      </div><div class="notice">ADS-B position age: ${Math.round(numeric(ac.seen)||0)} seconds. This is observational data, not airline-confirmed flight status.</div>`;
  }
  function render() {
    const flights=[...state.flights].sort((a,b)=>a.departure-b.departure), now=new Date();
    $("sectors").innerHTML=flights.length?flights.map(f=>`<div class="flightrow"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(f.date)} · ${esc(airport(f.origin)?.name)} → ${esc(airport(f.destination)?.name)}</small></div><div class="time">${fmt(f.departure,airport(f.origin).tz)}<small>arr ${fmt(f.arrival,airport(f.destination).tz)}</small></div></div>`).join(""):`<div class="empty">No flights scheduled for this date.</div>`;
    $("sectorCount").textContent=flights.length+" SECTORS";
    const next=flights.find(f=>f.departure>now);
    $("nextFlight").innerHTML=next?`<div class="flighttop"><div><div class="flightno">${esc(next.flightNumber)}</div><div class="route">${esc(next.origin)} → ${esc(next.destination)}</div></div><span class="status none">UPCOMING</span></div><div class="stats"><div class="stat"><small>Scheduled departure</small><strong>${fmt(next.departure,airport(next.origin).tz)}</strong></div><div class="stat"><small>Scheduled arrival</small><strong>${fmt(next.arrival,airport(next.destination).tz)}</strong></div></div>`:`<div class="empty">No future sector in loaded timetable.</div>`;
    $("current").innerHTML=state.selected?renderAircraft(state.selected.flight,state.selected.aircraft):`<div class="empty">No aircraft confirmed yet. Select a candidate below.</div>`;
    const last=storageGet();
    $("lastFlight").innerHTML=last?`<div class="flighttop"><div><div class="flightno">${esc(last.flightNumber)}</div><div class="route">${esc(last.origin)} → ${esc(last.destination)}</div></div><span class="status none">LAST SELECTED</span></div><div class="stats"><div class="stat"><small>Callsign</small><strong>${esc(last.callsign)}</strong></div><div class="stat"><small>Registration</small><strong>${esc(last.registration)}</strong></div><div class="stat"><small>Aircraft type</small><strong>${esc(last.type)}</strong></div><div class="stat"><small>ICAO HEX</small><strong>${esc(last.hex)}</strong></div></div>`:`<div class="empty">No aircraft selected on this device yet.</div>`;
  }
  function renderCandidates(items,message="No reliable Ryanair aircraft match found for the selected date, route and time.") {
    const el=$("candidates");
    if (!items.length) { el.className="empty"; el.textContent=message; return; }
    el.className="candidate-list";
    el.innerHTML=items.map((item,i)=>{
      const f=item.flight, ac=item.aircraft;
      const dateLabel=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${f.date}T12:00:00Z`));
      const confidence=ac.confidence||"UNVERIFIED";
      const confidenceClass=confidence==="HIGH"?"ground":confidence==="MEDIUM"?"air":"none";
      const type=ac.t||"Type not broadcast";
      const call=(ac.flight||"").trim()||"Callsign not broadcast";
      const dep=fmt(f.departure,airport(f.origin).tz), arr=fmt(f.arrival,airport(f.destination).tz);
      return `<div class="candidate"><div class="flighttop"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(dateLabel)} · DEP ${esc(dep)} (${esc(f.origin)}) · ARR ${esc(arr)} (${esc(f.destination)})</small></div><span class="status ${confidenceClass}">${esc(confidence)} MATCH</span></div><small>${esc(call)} · ${esc(type)} · ${esc(ac.r||"Registration unknown")} · HEX ${esc(ac.hex)} · ${Math.round(numeric(ac.seen)||0)}s ago · ${Math.round(ac.crossTrack)} NM cross-track${ac.callMatch?" · flight callsign matched":ac.groupCall?" · Ryanair-group callsign":ac.operatorMatch?" · operator verified":""}</small><button class="secondary" data-pick="${i}">SELECT AIRCRAFT</button></div>`;
    }).join("");
    el.querySelectorAll("[data-pick]").forEach(button=>button.addEventListener("click",()=>{
      const item=items[Number(button.dataset.pick)]; if(!item)return;
      saveSelected(item.flight,item.aircraft); render();
      $("connection").textContent="Aircraft selected · ICAO HEX saved";
    }));
  }

  async function refreshSelected() {
    const saved=storageGet();
    if (!saved?.hex || !airport(saved.origin) || !airport(saved.destination)) return;
    let flight=state.flights.find(f=>f.flightNumber===saved.flightNumber&&f.origin===saved.origin&&f.destination===saved.destination&&f.date===saved.date);
    if (!flight && saved.routeScan) flight={origin:saved.origin,destination:saved.destination,flightNumber:saved.flightNumber||"ROUTE TRAFFIC",date:saved.date,departure:new Date(Date.now()-4*3600000),arrival:new Date(Date.now()+4*3600000),routeScan:true};
    if (!flight) return;
    const data=await get(`/api/hex?icao=${encodeURIComponent(saved.hex)}`);
    const aircraft=(data.ac||[]).find(a=>String(a.hex).toLowerCase()===String(saved.hex).toLowerCase()&&validAircraft(a));
    if (aircraft) state.selected={flight,aircraft};
  }

  async function run() {
    showError("");
    if (!WORKER) { showError("Worker URL not configured. Check config.js."); return; }
    const route=$("route").value.trim().toUpperCase().replace(/\s+/g,"");
    const date=$("flightDate").value;
    if (!ROUTE_RE.test(route)) { showError("Enter one airport code (BUD) or two (BUD-ALC)."); return; }
    if (!date) { showError("Choose a duty date."); return; }
    const routes=routesFor(route);
    const unknown=[...new Set(routes.flat().filter(code=>!airport(code)))];
    if (unknown.length) { showError(`Airport code not in the local database: ${unknown.join(", ")}. Add its airport coordinates before searching.`); return; }
    const button=$("track"); button.disabled=true; button.textContent="SEARCHING FLIGHTS…";
    state.flights=[]; state.candidates=[]; state.selected=null;
    $("candidates").className="empty"; $("candidates").textContent="Searching timetable and live aircraft…";
    $("connection").textContent="Checking timetable…"; $("lastUpdated").textContent="SEARCHING";
    try {
      const responses=await Promise.allSettled(routes.map(([o,d])=>loadRoute(o,d,date)));
      const scheduleErrors=[];
      responses.forEach((r,i)=>{ if(r.status==="fulfilled")state.flights.push(...r.value); else scheduleErrors.push(`${routes[i].join("-")}: ${r.reason?.message||"schedule unavailable"}`); });
      state.flights.sort((a,b)=>a.departure-b.departure); render();
      const deviceNow=new Date();
      const today=[deviceNow.getFullYear(),String(deviceNow.getMonth()+1).padStart(2,"0"),String(deviceNow.getDate()).padStart(2,"0")].join("-");
      if (date !== today) {
        renderCandidates([],"Live ADS-B matching is available only for today's date. The scheduled sectors for your selected date are shown below.");
        $("connection").textContent="Timetable loaded · live aircraft matching is for today only";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\n"));
        return;
      }
      const nowMs=Date.now();
      const searchFlights=state.flights.filter(f=>nowMs>=f.departure.getTime()-120*60000&&nowMs<=f.arrival.getTime()+240*60000);
      if (!searchFlights.length) {
        renderCandidates([],"No scheduled flight falls within the live tracking window. Check the duty sectors below: the timetable may be missing the flight or its scheduled times may differ.");
        $("connection").textContent="Timetable loaded · no flight inside live window";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\n"));
        return;
      }
      $("connection").textContent="Timetable loaded · filtering Ryanair-compatible aircraft…";
      const all=[]; const adsbErrors=[];
      const found=await Promise.allSettled(searchFlights.map(f=>findCandidates(f)));
      found.forEach((r,i)=>{ if(r.status==="fulfilled")all.push(...r.value.map(ac=>({flight:searchFlights[i],aircraft:ac}))); else adsbErrors.push(`${searchFlights[i].origin}-${searchFlights[i].destination}: ${r.reason?.message||"ADS-B unavailable"}`); });
      const unique=new Map();
      for (const item of all) { const key=String(item.aircraft.hex).toLowerCase(); const old=unique.get(key); if(!old||item.aircraft.score>old.aircraft.score)unique.set(key,item); }
      const final=[...unique.values()].sort((a,b)=>b.aircraft.score-a.aircraft.score).slice(0,3);
      state.candidates=final;
      renderCandidates(final,adsbErrors.length&&!final.length?"ADS-B service could not complete the search. See the error details above.":"No live aircraft match found. ADS-B coverage, aircraft position and timing can affect results.");
      try { await refreshSelected(); } catch(e) { console.warn("Could not refresh saved aircraft",e.message); }
      render();
      $("lastUpdated").textContent="UPDATED "+fmt(new Date(),"Europe/Berlin");
      if (final.length) $("connection").textContent=`${final.length} filtered candidate${final.length===1?"":"s"} · manually confirm the correct aircraft`;
      else $("connection").textContent="No reliable Ryanair aircraft match · no generic traffic shown";
      if (scheduleErrors.length||adsbErrors.length) showError([...scheduleErrors,...adsbErrors].join("\n"));
    } catch(e) {
      showError(e.message||"Unable to load flight data."); $("connection").textContent="Unable to load flight data";
      renderCandidates([],"Search failed. Check the error message above and try again.");
    } finally { button.disabled=false; button.textContent="REFRESH DUTY & AIRCRAFT ↗"; }
  }

  $("track").addEventListener("click",run);
  $("route").addEventListener("input",event=>{event.target.value=event.target.value.toUpperCase();});
  $("route").addEventListener("keydown",event=>{if(event.key==="Enter")run();});
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(e=>console.warn("Service worker:",e));
  render();
})();
