(() => {
  "use strict";

  // What's the boy doing? — flight tracker
  const $ = id => document.getElementById(id);
  const cfg = window.WTBD_CONFIG || {};
  const WORKER = String(cfg.WORKER_URL || cfg.workerUrl || "").replace(/\/+$/, "");
  const ROUTE_RE = /^[A-Z]{3}(?:-[A-Z]{3})?$/;
  const STORAGE_KEY = "wtbd-selected-v3";

  let AIRPORTS = {
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

  const state = { flights:[], candidates:[], selected:null, googleLinks:[], observed:[] };
  const now = new Date();
  $("flightDate").value = [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");

  function airport(code) { return AIRPORTS[code] || null; }
  let airportCataloguePromise = null;
  function loadAirportCatalogue() {
    if (!airportCataloguePromise) airportCataloguePromise = fetch("./airports.json",{cache:"no-store"})
      .then(response=>response.ok?response.json():[])
      .then(rows=>{
        if (Array.isArray(rows)) for (const item of rows) {
          if (!item || !/^[A-Z]{3}$/.test(item.iata||"") || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon)) || !item.tz) continue;
          AIRPORTS[item.iata]={name:item.name||item.city||item.iata,tz:item.tz,lat:Number(item.lat),lon:Number(item.lon)};
        }
      }).catch(error=>console.warn("Airport catalogue unavailable; using bundled airports",error));
    return airportCataloguePromise;
  }

  function routesFor(value) {
    const parts = value.split("-");
    if (parts.length === 1) return [["NUE",parts[0]],[parts[0],"NUE"]];
    // If NUE is explicitly entered, treat the input as one exact route.
    // Two non-NUE codes are destination shortcuts and expand in both directions.
    if (parts.includes("NUE")) return [[parts[0],parts[1]]];
    return [["NUE",parts[0]],[parts[0],"NUE"],["NUE",parts[1]],[parts[1],"NUE"]];
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

  function makeFlight(origin,destination,number,dep,arr,date,arrivalDate,estimated={},source="Schedule") {
    const depTime = dateAtAirport(date,dep,airport(origin));
    let arrDate = arrivalDate || date;
    let arrTime = dateAtAirport(arrDate,arr,airport(destination));
    if (arrTime <= depTime) {
      arrDate = addCalendarDay(arrDate);
      arrTime = dateAtAirport(arrDate,arr,airport(destination));
    }
    return {origin,destination,flightNumber:String(number).replace(/\s/g,"").toUpperCase(),date,departureLocal:dep,arrivalLocal:arr,departure:depTime,arrival:arrTime,departureEstimated:!!estimated.departure,arrivalEstimated:!!estimated.arrival,source:String(source||"Schedule"),routeScan:false};
  }
  function estimateBoardTimes(origin,destination,date,boardTime,boardType) {
    const durationMinutes=Math.max(40,Math.round(hav(airport(origin),airport(destination))/430*60+35));
    if(boardType==="departure"){
      const departure=dateAtAirport(date,boardTime,airport(origin));
      const arrival=new Date(departure.getTime()+durationMinutes*60000);
      const p=localParts(arrival,airport(destination).tz);
      return {dep:boardTime,arr:String(p.hour)+":"+String(p.minute),depDate:date,arrDate:String(p.year)+"-"+String(p.month)+"-"+String(p.day),estimated:{departure:false,arrival:true}};
    }
    const arrival=dateAtAirport(date,boardTime,airport(destination));
    const departure=new Date(arrival.getTime()-durationMinutes*60000);
    const p=localParts(departure,airport(origin).tz);
    return {dep:String(p.hour)+":"+String(p.minute),arr:boardTime,depDate:String(p.year)+"-"+String(p.month)+"-"+String(p.day),arrDate:date,estimated:{departure:true,arrival:false}};
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
          let dep = timePart(item.departureTime || item.departureLocalTime || item.departureDateTime);
          let arr = timePart(item.arrivalTime || item.arrivalLocalTime || item.arrivalDateTime);
          const no = flightNo(item.flightNumber || item.number || item.flightNo,item.carrierCode);
          let depDate = item.departureDateTime && String(item.departureDateTime).includes("T")
            ? String(item.departureDateTime).slice(0,10) : date;
          let arrDate = item.arrivalDateTime && String(item.arrivalDateTime).includes("T")
            ? String(item.arrivalDateTime).slice(0,10) : undefined;
          let estimated = {};
          if ((!dep || !arr) && item.boardType && item.boardTime) {
            const times=estimateBoardTimes(origin,destination,item.boardDate||date,timePart(item.boardTime),item.boardType);
            dep=times.dep; arr=times.arr; depDate=times.depDate; arrDate=times.arrDate; estimated=times.estimated;
          }
          if (!dep || !arr || !no) continue;
          out.push(makeFlight(origin,destination,no,dep,arr,depDate,arrDate,estimated,item.source||data.source||"Schedule"));
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
        if (dep && arr && no) out.push(makeFlight(origin,destination,no,dep,arr,date,String(arrRaw).slice(0,10),{},item.source||data.source||"Schedule"));
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

  function overflightRows(data) {
    if (Array.isArray(data)) return data;
    for (const key of ["overflights","aircraft","results","items","ac"]) if (Array.isArray(data?.[key])) return data[key];
    return [];
  }
  async function queryAirportOverflights(flight,which) {
    const ap=airport(which==="departure"?flight.origin:flight.destination);
    const eventTime=which==="departure"?flight.departure:flight.arrival;
    // Free FlyItalyADSB tier: max 10 km and 6 hours per request.
    const from=new Date(eventTime.getTime()-2*3600000);
    const to=new Date(eventTime.getTime()+2*3600000);
    const qs=new URLSearchParams({lat:String(ap.lat),lon:String(ap.lon),dist:"10",from:from.toISOString(),to:to.toISOString()});
    const data=await get("/api/overflights?"+qs.toString());
    return overflightRows(data).map(row=>({...row,checkpoint:which,flight}));
  }
  async function loadObserved(date) {
    state.observed=[];
    const flights=state.flights.filter(f=>f.date===date).sort((a,b)=>Math.abs(Date.now()-a.departure.getTime())-Math.abs(Date.now()-b.departure.getTime())).slice(0,4);
    if (!flights.length) { renderObserved("No scheduled sectors found for this date, so there are no airport overflight windows to check."); return; }
    const tasks=[];
    for (const flight of flights) { tasks.push(queryAirportOverflights(flight,"departure")); tasks.push(queryAirportOverflights(flight,"arrival")); }
    const results=await Promise.allSettled(tasks);
    const errors=[];
    for (const result of results) { if(result.status==="fulfilled") state.observed.push(...result.value); else errors.push(result.reason?.message||"FlyItalyADSB overflight query failed"); }
    const dedup=new Map();
    for (const item of state.observed) {
      const hex=String(item.icao||item.hex||"").toLowerCase(); if(!hex) continue;
      const key=[item.flight.flightNumber,item.flight.origin,item.flight.destination,hex,item.checkpoint].join("|");
      dedup.set(key,item);
    }
    state.observed=[...dedup.values()];
    const hexes=[...new Set(state.observed.map(x=>String(x.icao||x.hex||"").toLowerCase()))].filter(x=>/^[0-9a-f]{6}$/.test(x)).slice(0,2);
    const tracks=await Promise.allSettled(hexes.map(icao=>get("/api/history?icao="+encodeURIComponent(icao)+"&date="+encodeURIComponent(date))));
    tracks.forEach((result,index)=>{
      if(result.status!=="fulfilled")return;
      const trace=Array.isArray(result.value?.trace)?result.value.trace:[];
      for(const item of state.observed)if(String(item.icao||item.hex||"").toLowerCase()===hexes[index])item.dailyTrace={timestamp:result.value.timestamp,trace,source:result.value.source||"FlyItalyADSB"};
    });
    renderObserved(errors.length?"Some FlyItalyADSB checks failed: "+[...new Set(errors)].join(" · "):"");
  }
  function renderObserved(message) {
    const el=$("observedFlights"); if(!el)return;
    if(!state.observed.length) { el.textContent=message||"FlyItalyADSB did not return aircraft near the selected airports in the scheduled time windows. Coverage gaps are possible; this does not prove the flight did not operate."; return; }
    const groups=new Map();
    for(const item of state.observed) {
      const f=item.flight,hex=String(item.icao||item.hex||"").toLowerCase(),key=[f.flightNumber,f.origin,f.destination,hex].join("|");
      if(!groups.has(key)) groups.set(key,{flight:f,hex,registration:item.r||"Registration unavailable",type:item.t||"Type unavailable",departure:false,arrival:false,records:[]});
      const group=groups.get(key); group[item.checkpoint]=true; group.records.push(item);
    }
    const lines=[...groups.values()].map(g=>{
      const times=g.records.map(r=>r.closest_time?new Date(typeof r.closest_time==="number"?r.closest_time*1000:Date.parse(r.closest_time)).toISOString().replace("T"," ").slice(0,16)+" UTC":"time unavailable").join(", ");
      const checkpoints=[g.departure?"near departure airport":"",g.arrival?"near arrival airport":""].filter(Boolean).join(" + ");
      const track=g.records.find(r=>r.dailyTrace)?.dailyTrace;
      const trackPoints=track?.trace||[];
      const first=trackPoints.length?new Date((Number(track.timestamp)+Number(trackPoints[0][0]))*1000).toISOString().slice(11,16)+" UTC":"";
      const last=trackPoints.length?new Date((Number(track.timestamp)+Number(trackPoints[trackPoints.length-1][0]))*1000).toISOString().slice(11,16)+" UTC":"";
      const trackLine=trackPoints.length?"\nDaily track: "+trackPoints.length+" positions · "+first+"–"+last:"\nDaily track not available";
      return g.flight.flightNumber+" · "+g.flight.origin+" → "+g.flight.destination+"\n"+g.registration+" · "+g.type+" · HEX "+g.hex+"\nObserved "+checkpoints+" · "+times+trackLine;
    });
    el.textContent=lines.join("\n\n")+"\n\nSource: FlyItalyADSB overflights (ADS-B/MLAT). Same ICAO observed near both airports is stronger evidence; one airport alone is not flight confirmation. Callsigns are not used to match flights."+(message?"\n\n"+message:"");
  }
  function observedAircraftCandidates() {
    const groups=new Map();
    for (const item of state.observed) {
      const flight=item.flight;
      const hex=String(item.icao||item.hex||"").toLowerCase();
      if (!flight || !/^[0-9a-f]{6}$/.test(hex)) continue;
      const key=[flight.flightNumber,flight.origin,flight.destination,flight.date,hex].join("|");
      if (!groups.has(key)) groups.set(key,{flight,hex,records:[],departure:false,arrival:false});
      const group=groups.get(key);
      group[item.checkpoint]=true;
      group.records.push(item);
    }
    const bothEnds=[...groups.values()].filter(g=>g.departure&&g.arrival);
    const oneEnd=[...groups.values()].filter(g=>!(g.departure&&g.arrival)&&["B738","B38M","B737"].includes(String(g.records[0]?.t||"").toUpperCase()));
    const ordered=[...bothEnds,...oneEnd].sort((a,b)=>(a.departure&&a.arrival?0:1)-(b.departure&&b.arrival?0:1));
    return ordered.slice(0,6).map(g=>{
      const first=g.records[0]||{};
      const times=g.records.map(r=>{
        const value=r.closest_time;
        const ms=typeof value==="number"?value*1000:Date.parse(value);
        return Number.isFinite(ms)?new Date(ms).toISOString().replace("T"," ").slice(0,16)+" UTC":"time unavailable";
      });
      const trace=g.records.find(r=>r.dailyTrace)?.dailyTrace;
      const points=Array.isArray(trace?.trace)?trace.trace.length:0;
      return {flight:g.flight,aircraft:{hex:g.hex,r:first.r||null,t:first.t||null,flight:Array.isArray(first.callsigns)?first.callsigns[0]||"":String(first.callsigns||""),historicalOnly:true,observedBothEnds:!!(g.departure&&g.arrival),observedCheckpoints:[g.departure?"departure airport":"",g.arrival?"arrival airport":""].filter(Boolean).join(" + "),observedTimes:times,historicalPositions:points,crossTrack:0,score:g.departure&&g.arrival?100:40}};
    });
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
  function positionAge(a) {
    return numeric(a?.seen_pos) ?? numeric(a?.seen) ?? 999;
  }
  function validAircraft(a) {
    const lat=numeric(a?.lat), lon=numeric(a?.lon), seen=numeric(a?.seen), seenPos=positionAge(a);
    return !!(a && typeof a.hex === "string" && /^[0-9a-f]{6}$/i.test(a.hex) && lat !== null && lon !== null && Math.abs(lat)<=90 && Math.abs(lon)<=180 && (seen===null || seen<60) && seenPos<=45);
  }
  async function aircraftNear(point,dist) {
    return get(`/api/aircraft?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}&dist=${dist}`);
  }
  const RYANAIR_737_TYPES = new Set(["B738", "B38M", "B737"]);
  // Callsigns are operational identifiers and are NOT derived from public flight numbers.
  // Do not use them to identify or reject an aircraft for a scheduled flight.
  function aircraftCompatibility(ac, flight) {
    const type = String(ac.t || "").toUpperCase();
    const operator = String(ac.ownOp || ac.operator || "").toLowerCase();
    const operatorKnown = !!operator;
    const operatorMatch = /ryanair|malta air|buzz|lauda|ryanair sun|ryanair uk/.test(operator);
    if (isKnownAirbus(type)) return {ok:false, operatorMatch:false, typeMatch:false, reason:"Airbus excluded"};
    const typeMatch = RYANAIR_737_TYPES.has(type);
    // An explicitly different operator is negative evidence. A callsign prefix or suffix
    // is never used as a flight-number match: Ryanair operational callsigns are independent.
    if (operatorKnown && !operatorMatch) return {ok:false, operatorMatch:false, typeMatch, reason:"Different operator"};
    if (!operatorMatch && !typeMatch) {
      return {ok:false, operatorMatch:false, typeMatch:false, reason:"No compatible aircraft evidence"};
    }
    return {ok:true, operatorMatch, typeMatch, operatorKnown};
  }
  function isKnownAirbus(type) {
    const t = String(type || "").toUpperCase();
    return /^(A318|A319|A320|A321|A20N|A21N|A332|A333|A339|A343|A346|A359|A35K|A388)$/.test(t) || t.startsWith("A32") || t.startsWith("A33") || t.startsWith("A34") || t.startsWith("A35");
  }
  async function findCandidates(flight) {
    const origin=airport(flight.origin), destination=airport(flight.destination);
    if (!origin || !destination) throw new Error("Airport coordinates are not available for this route.");
    const distance=hav(origin,destination);
    const fractions = distance < 180 ? [0.08,0.35,0.65,0.92] : [0.04,0.22,0.40,0.60,0.78,0.96];
    const points=fractions.map(f=>interpolate(origin,destination,f));
    const radius=Math.min(240,Math.max(130,Math.round(distance/6+65)));
    const results=await Promise.allSettled(points.map(p=>aircraftNear(p,radius)));
    const map=new Map();
    const failures=[];
    for (const result of results) {
      if (result.status!=="fulfilled") { failures.push(result.reason?.message || "ADS-B request failed"); continue; }
      for (const ac of (result.value?.ac || [])) {
        if (!validAircraft(ac)) continue;
        const old=map.get(ac.hex);
        if (!old || positionAge(ac)<positionAge(old)) map.set(ac.hex,ac);
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
      const onGround=ac.alt_baro === "ground";
      const altitude=onGround ? null : numeric(ac.alt_baro);
      const seen=numeric(ac.seen) ?? 999;
      const seenPos=positionAge(ac);
      const progressDifference=Math.abs(fraction-expectedFraction);
      const distanceToOrigin=hav(origin,pos);
      const distanceToDestination=hav(destination,pos);
      // Callsign is deliberately ignored: it is not a reliable key for a public flight number.
      // Near either airport, turns and runway alignment make heading less decisive.
      const nearEndpoint=Math.min(distanceToOrigin,distanceToDestination)<=8;
      if (!onGround && headingDifference!==null && headingDifference>105 && Math.min(distanceToOrigin,distanceToDestination)>6) continue;
      // Reject stale positions even if the transponder is still being heard.
      if (seenPos>30) continue;
      // Once the scheduled arrival has passed, do not keep presenting an airborne aircraft
      // far from destination as that flight. This prevents an opposite-direction leg winning.
      const minutesAfterArrival=(now-flight.arrival.getTime())/60000;
      if (!onGround && minutesAfterArrival>12 && distanceToDestination>22) continue;
      if (!onGround && minutesAfterArrival>30) continue;
      if (onGround) {
        const minutesFromDeparture=(now-flight.departure.getTime())/60000;
        const nearOriginInTime=distanceToOrigin<=12 && minutesFromDeparture>=-60 && minutesFromDeparture<=45;
        const nearDestinationInTime=distanceToDestination<=12 && minutesAfterArrival>=-45 && minutesAfterArrival<=90;
        if (!nearOriginInTime && !nearDestinationInTime) continue;
      }
      // Require tighter route geometry and progress. A compatible aircraft type/operator
      // is not proof that this aircraft is operating this commercial flight.
      if (!onGround && (geo.crossTrack>38 || progressDifference>0.24) && !nearEndpoint) continue;
      // Unknown-operator 737s need an especially tight positional, timing and heading match.
      if (!compatibility.operatorMatch) {
        if (geo.crossTrack > 28 || progressDifference > 0.18 || seen > 25 || (headingDifference !== null && headingDifference > 35)) continue;
      }
      const headingScore=headingDifference===null?0:headingDifference<35?18:headingDifference<65?10:headingDifference<90?2:-12;
      const operatorScore=compatibility.operatorMatch?45:0;
      const typeScore=compatibility.typeMatch?18:0;
      const routeScore=Math.max(0,22-geo.crossTrack/3);
      const progressScore=Math.max(0,18-progressDifference*30);
      const freshnessScore=Math.max(0,14-seenPos/4);
      const groundPenalty=onGround && fraction>0.12 && fraction<0.88 ? 20:0;
      const score=operatorScore+typeScore+routeScore+progressScore+headingScore+freshnessScore-groundPenalty;
      if (score < 35) continue;
      candidates.push({...ac,score,crossTrack:geo.crossTrack,alongTrack:geo.alongTrack,routeBearing,headingDifference,altitude,onGround,seenPos,typeMatch:compatibility.typeMatch,operatorMatch:compatibility.operatorMatch,expectedFraction,matchStatus:"POSSIBLE ONLY"});
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
    // ADS-B marks both parked and taxiing aircraft as "ground"; use groundspeed to distinguish movement.
    const taxiing=onGround && speed!==null && speed>=5;
    const status=onGround?(taxiing?"TAXIING":"ON GROUND"):altitude!==null?"AIRBORNE":"UNKNOWN";
    const statusClass=onGround?"ground":status==="AIRBORNE"?"air":"none";
    return `<div class="flighttop"><div><div class="flightno">${esc(flight.flightNumber)}</div><div class="route">${esc(flight.origin)} → ${esc(flight.destination)}</div><div class="muted">${esc(airport(flight.origin)?.name)} · ${esc(airport(flight.destination)?.name)}</div></div><span class="status ${statusClass}">${status}</span></div><div class="notice">MANUALLY SELECTED ADS-B CANDIDATE — free data sources do not confirm that this aircraft is assigned to ${esc(flight.flightNumber)}. Registration and HEX below are read directly from its transponder feed.</div>
      <div class="stats">
        <div class="stat"><small>Actual callsign</small><strong>${esc((ac.flight||"").trim()||"Not broadcast")}</strong></div>
        <div class="stat"><small>ICAO HEX</small><strong>${esc(ac.hex)}</strong></div>
        <div class="stat"><small>Registration</small><strong>${esc(ac.r)}</strong></div>
        <div class="stat"><small>Aircraft type</small><strong>${esc(ac.t)}</strong></div>
        <div class="stat"><small>Ground speed</small><strong>${speed===null?"—":Math.round(speed)+" kt"}</strong></div>
        <div class="stat"><small>Altitude</small><strong>${onGround?"GROUND":altitude===null?"—":Math.round(altitude).toLocaleString()+" ft"}</strong></div>
        <div class="stat"><small>Latitude</small><strong>${lat===null?"—":lat.toFixed(4)}</strong></div>
        <div class="stat"><small>Longitude</small><strong>${lon===null?"—":lon.toFixed(4)}</strong></div>
      </div><div class="notice">ADS-B position age: ${Math.round(positionAge(ac))} seconds. This is observational data, not airline-confirmed flight status.</div>`;
  }
  function render() {
    const flights=[...state.flights].sort((a,b)=>a.departure-b.departure), now=new Date();
    const missingGoogleLinks=state.googleLinks.filter(x=>!flights.some(f=>x.route===f.origin+"-"+f.destination));
    $("sectors").innerHTML=(flights.length?flights.map(f=>`<div class="flightrow"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(f.date)} · ${esc(airport(f.origin)?.name)} → ${esc(airport(f.destination)?.name)} · ${esc(f.source||"Schedule")}${f.departureEstimated||f.arrivalEstimated?" · one time estimated":""}</small></div><div class="time">${f.departureEstimated?"~":""}${fmt(f.departure,airport(f.origin).tz)}<small>arr ${f.arrivalEstimated?"~":""}${fmt(f.arrival,airport(f.destination).tz)}</small></div></div>`).join(""):`<div class="empty">No flights scheduled for this date.</div>`)+(missingGoogleLinks.length?`<div class="notice">Google fallback searches (only routes without a scheduled result): ${missingGoogleLinks.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.route)} ↗</a>`).join(" · ")}</div>`:"");
    $("sectorCount").textContent=flights.length+" SECTORS";
    const next=flights.find(f=>f.departure>now);
    $("nextFlight").innerHTML=next?`<div class="flighttop"><div><div class="flightno">${esc(next.flightNumber)}</div><div class="route">${esc(next.origin)} → ${esc(next.destination)}</div></div><span class="status none">UPCOMING</span></div><div class="stats"><div class="stat"><small>${next.departureEstimated?"Estimated departure":"Scheduled departure"}</small><strong>${next.departureEstimated?"~":""}${fmt(next.departure,airport(next.origin).tz)}</strong></div><div class="stat"><small>${next.arrivalEstimated?"Estimated arrival":"Scheduled arrival"}</small><strong>${next.arrivalEstimated?"~":""}${fmt(next.arrival,airport(next.destination).tz)}</strong></div></div>`:`<div class="empty">No future sector in loaded timetable.</div>`;
    $("current").innerHTML=state.selected?renderAircraft(state.selected.flight,state.selected.aircraft):`<div class="empty">No aircraft selected. Possible ADS-B candidates require manual checking.</div>`;
    const last=storageGet();
    $("lastFlight").innerHTML=last?`<div class="flighttop"><div><div class="flightno">${esc(last.flightNumber)}</div><div class="route">${esc(last.origin)} → ${esc(last.destination)}</div></div><span class="status none">LAST MANUAL SELECTION</span></div><div class="stats"><div class="stat"><small>Callsign</small><strong>${esc(last.callsign)}</strong></div><div class="stat"><small>Registration</small><strong>${esc(last.registration)}</strong></div><div class="stat"><small>Aircraft type</small><strong>${esc(last.type)}</strong></div><div class="stat"><small>ICAO HEX</small><strong>${esc(last.hex)}</strong></div></div>`:`<div class="empty">No aircraft selected on this device yet.</div>`;
  }
  function renderCandidates(items,message="No reliable Ryanair aircraft match found for the selected date, route and time.") {
    const el=$("candidates");
    if (!items.length) { el.className="empty"; el.textContent=message; return; }
    el.className="candidate-list";
    el.innerHTML=items.map((item,i)=>{
      const f=item.flight, ac=item.aircraft;
      const dateLabel=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${f.date}T12:00:00Z`));
      const historical=!!ac.historicalOnly;
      const confidence=historical?(ac.observedBothEnds?"OBSERVED BOTH ENDS":"PARTIAL OBSERVATION"):"POSSIBLE";
      const confidenceClass="none";
      const type=ac.t||"Type not broadcast";
      const call=(ac.flight||"").trim()||"Callsign not broadcast";
      const dep=fmt(f.departure,airport(f.origin).tz), arr=fmt(f.arrival,airport(f.destination).tz);
      const evidence=historical?`${esc(ac.observedCheckpoints)} · ${esc((ac.observedTimes||[]).join(", "))} · ${ac.historicalPositions||0} historical positions · FlyItalyADSB`:`${Math.round(numeric(ac.seen)||0)}s ago · ${Math.round(ac.crossTrack)} NM cross-track${ac.operatorMatch?" · ADS-B operator label matches Ryanair Group":""} · SOURCE ${esc(f.source||"Schedule")}`;
      const action=historical?"":`<button class="secondary" data-pick="${i}">SELECT AIRCRAFT</button>`;
      return `<div class="candidate"><div class="flighttop"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(dateLabel)} · DEP ${f.departureEstimated?"~":""}${esc(dep)} (${esc(f.origin)}) · ARR ${f.arrivalEstimated?"~":""}${esc(arr)} (${esc(f.destination)})</small></div><span class="status ${confidenceClass}">${esc(confidence)} · NOT VERIFIED</span></div><small>${esc(call)} · ${esc(type)} · ${esc(ac.r||"Registration unknown")} · HEX ${esc(ac.hex)} · ${evidence}${historical?" · NOT AIRLINE-CONFIRMED":""}${f.departureEstimated||f.arrivalEstimated?" · one time estimated":""}</small>${action}</div>`;
    }).join("");
    el.querySelectorAll("[data-pick]").forEach(button=>button.addEventListener("click",()=>{
      const item=items[Number(button.dataset.pick)]; if(!item)return;
      saveSelected(item.flight,item.aircraft); render();
      $("connection").textContent="Possible aircraft selected manually · not flight-confirmed";
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
    await loadAirportCatalogue();
    const routes=routesFor(route);
    const unknown=[...new Set(routes.flat().filter(code=>!airport(code)))];
    if (unknown.length) { showError(`Airport code not in the local database: ${unknown.join(", ")}. Add its airport coordinates before searching.`); return; }
    const button=$("track"); button.disabled=true; button.textContent="SEARCHING FLIGHTS…";
    state.flights=[]; state.candidates=[]; state.selected=null; state.googleLinks=[]; state.observed=[]; renderObserved('Loading FlyItalyADSB overflight checks…');
    $("candidates").className="empty"; $("candidates").textContent="Searching timetable and live aircraft…";
    $("connection").textContent="Checking timetable…"; $("lastUpdated").textContent="SEARCHING";
    try {
      const responses=await Promise.allSettled(routes.map(([o,d])=>loadRoute(o,d,date)));
      const scheduleErrors=[];
      responses.forEach((r,i)=>{ if(r.status==="fulfilled")state.flights.push(...r.value); else scheduleErrors.push(`${routes[i].join("-")}: ${r.reason?.message||"schedule unavailable"}`); });
      state.flights.sort((a,b)=>a.departure-b.departure); render();
      try { await loadObserved(date); } catch(e) { renderObserved("FlyItalyADSB overflight checks unavailable: "+(e.message||"API error")); }
      const observedCandidates=observedAircraftCandidates();
      const deviceNow=new Date();
      const today=[deviceNow.getFullYear(),String(deviceNow.getMonth()+1).padStart(2,"0"),String(deviceNow.getDate()).padStart(2,"0")].join("-");
      if (date !== today) {
        renderCandidates(observedCandidates,observedCandidates.length?"Historical FlyItalyADSB observations are listed here. The same ICAO at both airports is strong evidence, but not airline confirmation.":"No historical aircraft was linked to both airport windows. Live position matching is available only for today.");
        $("connection").textContent="Timetable loaded · live aircraft matching is for today only";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\n"));
        return;
      }
      const nowMs=Date.now();
      const searchFlights=state.flights.filter(f=>nowMs>=f.departure.getTime()-120*60000&&nowMs<=f.arrival.getTime()+240*60000);
      if (!searchFlights.length) {
        renderCandidates(observedCandidates,observedCandidates.length?"FlyItalyADSB airport observations are listed here. Same ICAO at both ends is strong evidence, not airline confirmation.":"No scheduled flight falls within the live tracking window, and no aircraft was observed at both airport windows.");
        $("connection").textContent="Timetable loaded · no flight inside live window";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\n"));
        return;
      }
      $("connection").textContent="Timetable loaded · checking live ADS-B positions…";
      const all=[]; const adsbErrors=[];
      const found=await Promise.allSettled(searchFlights.map(f=>findCandidates(f)));
      found.forEach((r,i)=>{ if(r.status==="fulfilled")all.push(...r.value.map(ac=>({flight:searchFlights[i],aircraft:ac}))); else adsbErrors.push(`${searchFlights[i].origin}-${searchFlights[i].destination}: ${r.reason?.message||"ADS-B unavailable"}`); });
      const unique=new Map();
      for (const item of all) { const key=String(item.aircraft.hex).toLowerCase(); const old=unique.get(key); if(!old||item.aircraft.score>old.aircraft.score)unique.set(key,item); }
      const liveCandidates=[...unique.values()].sort((a,b)=>b.aircraft.score-a.aircraft.score).slice(0,3);
      const final=[...observedCandidates,...liveCandidates].slice(0,6);
      state.candidates=final;
      renderCandidates(final,final.length?"Historical airport observations and live positions are listed separately. None is an airline-confirmed assignment.":adsbErrors.length?"ADS-B service could not complete the search. See the error details above.":"No aircraft was found in the scheduled airport windows or current route positions.");
      try { await refreshSelected(); } catch(e) { console.warn("Could not refresh saved aircraft",e.message); }
      render();
      $("lastUpdated").textContent="UPDATED "+fmt(new Date(),"Europe/Berlin");
      if (final.length) $("connection").textContent=`${final.length} aircraft observations · none is automatically confirmed`;
      else $("connection").textContent="No matching aircraft observation found";
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
