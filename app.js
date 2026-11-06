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

  const state = { flights:[], candidates:[], selected:null, googleLinks:[], observed:[], scheduleDiagnostics:[] };
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
    state.scheduleDiagnostics.push({route:origin+"-"+destination,...(data.diagnostics||{}),source:data.source||"Schedule"});
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
    // Collapse all route/checkpoint duplicates into one row per ICAO HEX.
    const groups=new Map();
    for(const item of state.observed) {
      const hex=String(item.icao||item.hex||"").toLowerCase();
      if(!/^[0-9a-f]{6}$/.test(hex)) continue;
      if(!groups.has(hex)) groups.set(hex,{hex,registration:item.r||"Registration unavailable",type:item.t||"Type unavailable",sightings:new Map(),records:[]});
      const g=groups.get(hex); g.records.push(item);
      const f=item.flight||{};
      const code=item.checkpoint==="departure"?f.origin:f.destination;
      const ap=airport(code);
      const label=code?(code+(ap?.name?" ("+ap.name+")":"")):"Airport code unavailable";
      const route=f.flightNumber?f.flightNumber+" "+(f.origin||"?")+"→"+(f.destination||"?"):"scheduled route unavailable";
      const key=[label,item.checkpoint,route].join("|");
      const time=item.closest_time;
      const ms=typeof time==="number"?time*1000:Date.parse(time);
      const timeText=Number.isFinite(ms)?new Date(ms).toISOString().replace("T"," ").slice(0,16)+" UTC":"time unavailable";
      g.sightings.set(key,{label,checkpoint:item.checkpoint,route,timeText});
    }
    const lines=[...groups.values()].map(g=>{
      const sightings=[...g.sightings.values()].map(s=>"near "+s.label+" ("+(s.checkpoint==="departure"?"departure":"arrival")+" · "+s.route+") · "+s.timeText).join("\n");
      const track=g.records.find(r=>r.dailyTrace)?.dailyTrace;
      const points=Array.isArray(track?.trace)?track.trace:[];
      const first=points.length?new Date((Number(track.timestamp)+Number(points[0][0]))*1000).toISOString().slice(11,16)+" UTC":"";
      const last=points.length?new Date((Number(track.timestamp)+Number(points[points.length-1][0]))*1000).toISOString().slice(11,16)+" UTC":"";
      const trackLine=points.length?"\nDaily track: "+points.length+" positions · "+first+"–"+last:"\nDaily track not available";
      return g.registration+" · "+g.type+" · HEX "+g.hex+"\n"+sightings+trackLine;
    });
    el.textContent=lines.join("\n\n")+"\n\nUnique aircraft are deduplicated by ICAO HEX. Airport labels identify the exact airport checked. An airport observation alone does not confirm a flight assignment; callsigns are not used to match flights."+(message?"\n\n"+message:"");
  }
    function observedAircraftCandidates() {
    // Build a flight-specific evidence group first, then deduplicate globally by HEX.
    const byFlight=new Map();
    for(const item of state.observed) {
      const f=item.flight, hex=String(item.icao||item.hex||"").toLowerCase();
      if(!f||!/^[0-9a-f]{6}$/.test(hex)) continue;
      const key=[f.flightNumber,f.origin,f.destination,f.date,hex].join("|");
      if(!byFlight.has(key)) byFlight.set(key,{flight:f,hex,records:[],departure:false,arrival:false});
      const g=byFlight.get(key);
      if(item.checkpoint==="departure"||item.checkpoint==="arrival") g[item.checkpoint]=true;
      g.records.push(item);
    }
    const bestByHex=new Map();
    for(const g of byFlight.values()) {
      // Do not label a single-airport sighting as a candidate for a specific flight.
      if(!g.departure||!g.arrival) continue;
      const times=g.records.map(r=>{const v=r.closest_time;return typeof v==="number"?v*1000:Date.parse(v);}).filter(Number.isFinite);
      const score=times.length?Math.min(...times.map(t=>Math.abs(t-g.flight.departure.getTime())+Math.abs(t-g.flight.arrival.getTime()))):Number.POSITIVE_INFINITY;
      const old=bestByHex.get(g.hex);
      if(!old||score<old.score) bestByHex.set(g.hex,{...g,score});
    }
    return [...bestByHex.values()].map(g=>{
      const first=g.records[0]||{};
      const times=g.records.map(r=>{const v=r.closest_time;const ms=typeof v==="number"?v*1000:Date.parse(v);return Number.isFinite(ms)?new Date(ms).toISOString().replace("T"," ").slice(0,16)+" UTC":"time unavailable";});
      const track=g.records.find(r=>r.dailyTrace)?.dailyTrace;
      const points=Array.isArray(track?.trace)?track.trace.length:0;
      return {flight:g.flight,aircraft:{hex:g.hex,r:first.r||null,t:first.t||null,flight:Array.isArray(first.callsigns)?first.callsigns[0]||"":String(first.callsigns||""),historicalOnly:true,observedBothEnds:true,observedCheckpoints:g.flight.origin+" departure + "+g.flight.destination+" arrival",observedTimes:times,historicalPositions:points,crossTrack:0,score:100}};
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
  // Restrict candidates to the two main Ryanair 737 variants and a known Ryanair Group aircraft registry ownership.
  // Unknown operator metadata is not enough to pass the filter.
  const RYANAIR_737_TYPES = new Set(["B738", "B38M"]);
  const RYANAIR_GROUP_OPERATORS = /ryanair|malta air|buzz|lauda europe|ryanair sun|ryanair uk/;
  // Callsigns are descriptive only: never match them to the public flight number.
  function aircraftCompatibility(ac) {
    const type = String(ac.t || "").toUpperCase();
    const operator = String(ac.ownOp || ac.operator || "").toLowerCase().trim();
    const typeMatch = RYANAIR_737_TYPES.has(type);
    const operatorMatch = !!operator && RYANAIR_GROUP_OPERATORS.test(operator);
    return {ok:typeMatch && operatorMatch, operatorMatch, typeMatch, operatorKnown:!!operator,
      reason:!typeMatch?"Aircraft type excluded":!operatorMatch?"Ryanair Group operator not confirmed":""};
  }
  function isKnownAirbus(type) {
    const t = String(type || "").toUpperCase();
    return /^(A318|A319|A320|A321|A20N|A21N|A332|A333|A339|A343|A346|A359|A35K|A388)$/.test(t) || t.startsWith("A32") || t.startsWith("A33") || t.startsWith("A34") || t.startsWith("A35");
  }
  async function aircraftIdentity(hex) {
    return get(`/api/identity?icao=${encodeURIComponent(hex)}`);
  }
  function ryanairGroupIdentity(identity) {
    const owner=String(identity?.registeredOwner||identity?.registered_owner||"").toLowerCase();
    const flag=String(identity?.operatorFlagCode||identity?.operator_flag_code||"").toUpperCase();
    const ownerMatch=/ryanair|malta air|buzz|ryanair uk|ryanair sun/.test(owner);
    const flagMatch=new Set(["RYR","RUK","RYS","MAY"]).has(flag);
    return {ok:ownerMatch||flagMatch,owner:identity?.registeredOwner||identity?.registered_owner||"",flag};
  }
  async function findCandidates(flight) {
    const origin=airport(flight.origin), destination=airport(flight.destination);
    if (!origin || !destination) throw new Error("Airport coordinates are not available for this route.");
    const now=Date.now(), dep=flight.departure.getTime(), arr=flight.arrival.getTime();
    if (now < dep-180*60000 || now > arr+30*60000) return [];

    const durationMinutes=Math.max(30,(arr-dep)/60000);
    const elapsedMinutes=(now-dep)/60000;
    const expectedFraction=Math.max(0,Math.min(1,elapsedMinutes/durationMinutes));
    const expectedPoint=interpolate(origin,destination,expectedFraction);
    // Always inspect the departure area. Once the flight has had time to leave,
    // also inspect the expected live position and nearby route segments.
    const requests=[aircraftNear(origin,40)];
    if(now>dep+8*60000) requests.push(aircraftNear(expectedPoint,105));
    if(now>dep+8*60000 && expectedFraction>0.18 && expectedFraction<0.82) {
      requests.push(aircraftNear(interpolate(origin,destination,Math.max(0,expectedFraction-0.16)),95));
      requests.push(aircraftNear(interpolate(origin,destination,Math.min(1,expectedFraction+0.16)),95));
    }
    const results=await Promise.allSettled(requests);
    const map=new Map(), failures=[];
    for(const result of results) {
      if(result.status!=="fulfilled"){failures.push(result.reason?.message||"ADS-B request failed");continue;}
      for(const ac of (result.value?.ac||[])) {
        if(!validAircraft(ac)) continue;
        const hex=String(ac.hex).toLowerCase(),old=map.get(hex);
        if(!old||positionAge(ac)<positionAge(old)) map.set(hex,ac);
      }
    }
    if(!map.size&&failures.length===results.length) throw new Error(failures[0]);

    const routeBearing=bearing(origin,destination), candidates=[];
    for(const ac of map.values()) {
      const type=String(ac.t||"").toUpperCase();
      if(type!=="B738"&&type!=="B38M") continue;
      const pos={lat:numeric(ac.lat),lon:numeric(ac.lon)};
      const geo=routePosition(origin,destination,pos);
      const distanceToOrigin=hav(origin,pos),distanceToDestination=hav(destination,pos);
      const onGround=ac.alt_baro==="ground";
      const seenPos=positionAge(ac),track=numeric(ac.track);
      if(seenPos>30) continue;
      const nearOrigin=distanceToOrigin<=35;
      const nearDestination=distanceToDestination<=25;
      const minutesFromDeparture=(now-dep)/60000;
      const minutesAfterArrival=(now-arr)/60000;
      let progressDifference=0,headingDifference=null;
      if(onGround) {
        const validGround=nearOrigin&&minutesFromDeparture>=-180&&minutesFromDeparture<=75;
        const atDestination=nearDestination&&minutesAfterArrival>=-30&&minutesAfterArrival<=30;
        if(!validGround&&!atDestination) continue;
      } else {
        if(geo.alongTrack < -25 || geo.alongTrack > geo.distance+30 || geo.crossTrack>85) continue;
        if(minutesAfterArrival>12&&distanceToDestination>22) continue;
        if(minutesAfterArrival>30) continue;
        const fraction=Math.max(0,Math.min(1,geo.alongTrack/Math.max(1,geo.distance)));
        progressDifference=Math.abs(fraction-expectedFraction);
        headingDifference=track===null?null:angleDiff(track,routeBearing);
        const nearEndpoint=Math.min(distanceToOrigin,distanceToDestination)<=12;
        if(!nearEndpoint&&progressDifference>0.38) continue;
        if(!nearEndpoint&&headingDifference!==null&&headingDifference>125) continue;
      }
      const routePenalty=Math.min(40,geo.crossTrack/2);
      const progressPenalty=progressDifference*45;
      const freshness=Math.max(0,18-seenPos/3);
      const groundBonus=onGround&&nearOrigin?18:0;
      const headingBonus=headingDifference===null?0:Math.max(-8,12-headingDifference/8);
      const score=55+freshness+groundBonus+headingBonus-routePenalty-progressPenalty;
      candidates.push({...ac,score,crossTrack:geo.crossTrack,alongTrack:geo.alongTrack,expectedFraction,onGround,seenPos,operatorMatch:false,matchStatus:"IDENTITY CHECK PENDING"});
    }
    candidates.sort((a,b)=>b.score-a.score);
    // ADS-B itself has no airline field. Enrich only the strongest type/route candidates
    // from an aircraft registry, then keep only confirmed Ryanair Group ownership/operator flags.
    const checked=await Promise.all(candidates.slice(0,10).map(async ac=>{
      try {
        const identity=await aircraftIdentity(ac.hex);
        const match=ryanairGroupIdentity(identity);
        return {...ac,operatorMatch:match.ok,operatorName:match.owner||match.flag||"Unknown",identitySource:identity.source||"Aircraft registry",
          r:ac.r||identity.registration||null,t:ac.t||identity.aircraftType||null};
      } catch(error) {
        return {...ac,operatorMatch:false,operatorName:"Unverified",identityError:error.message};
      }
    }));
    return checked.filter(ac=>ac.operatorMatch).slice(0,3);
  }

  function saveSelected(flight,aircraft) {
    const saved={flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,date:flight.date,routeScan:!!flight.routeScan,hex:aircraft.hex,callsign:(aircraft.flight||"").trim(),registration:aircraft.r||null,type:aircraft.t||null,updatedAt:new Date().toISOString()};
    storageSet(saved);
    state.selected={flight,aircraft};
  }
  function renderAircraft(flight,ac) {
    const onGround=ac.alt_baro==="ground";
    const altitude=numeric(ac.alt_baro), speed=numeric(ac.gs), lat=numeric(ac.lat), lon=numeric(ac.lon);
    const destination=airport(flight.destination);
    const distanceToDestination=destination&&lat!==null&&lon!==null?hav(destination,{lat,lon}):Infinity;
    const nearDestination=distanceToDestination<=3;
    const lowNearDestination=nearDestination&&altitude!==null&&altitude<=1800;
    const taxiing=onGround&&speed!==null&&speed>=5;
    const status=onGround?(taxiing?"TAXIING":"ON GROUND"):lowNearDestination?"NEAR DESTINATION · STATUS UNCONFIRMED":altitude!==null?"AIRBORNE":"UNKNOWN";
    const statusClass=onGround||lowNearDestination?"ground":status==="AIRBORNE"?"air":"none";
    return `<div class="flighttop"><div><div class="flightno">${esc(flight.flightNumber)}</div><div class="route">${esc(flight.origin)} → ${esc(flight.destination)}</div><div class="muted">${esc(airport(flight.origin)?.name)} · ${esc(airport(flight.destination)?.name)}</div></div><span class="status ${statusClass}">${status}</span></div><div class="notice">MANUALLY SELECTED ADS-B CANDIDATE — free data sources do not confirm that this aircraft is assigned to ${esc(flight.flightNumber)}. Registration and HEX below are read directly from its transponder feed.</div>
      <div class="stats">
        <div class="stat"><small>ADS-B callsign · unverified</small><strong>${esc((ac.flight||"").trim()||"Not broadcast")}</strong></div>
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
      const evidence=historical?`${esc(ac.observedCheckpoints)} · ${esc((ac.observedTimes||[]).join(", "))} · ${ac.historicalPositions||0} historical positions · FlyItalyADSB`:`${Math.round(numeric(ac.seen)||0)}s ago · ${Math.round(ac.crossTrack)} NM cross-track${ac.operatorMatch?" · aircraft registry identifies Ryanair Group":""} · SOURCE ${esc(f.source||"Schedule")}`;
      const action=historical?"":`<button class="secondary" data-pick="${i}">SELECT AIRCRAFT</button>`;
      return `<div class="candidate"><div class="flighttop"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(dateLabel)} · DEP ${f.departureEstimated?"~":""}${esc(dep)} (${esc(f.origin)}) · ARR ${f.arrivalEstimated?"~":""}${esc(arr)} (${esc(f.destination)})</small></div><span class="status ${confidenceClass}">${esc(confidence)} · NOT VERIFIED</span></div><small>${esc(call)} · ${esc(type)} · ${esc(ac.r||"Registration unknown")} · HEX ${esc(ac.hex)} · OWNER ${esc(ac.operatorName||"Ryanair Group registry match")} · ${evidence}${historical?" · NOT AIRLINE-CONFIRMED":""}${f.departureEstimated||f.arrivalEstimated?" · one time estimated":""}</small>${action}</div>`;
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
    const route=$("route").value.trim().toUpperCase().replace(/\\s+/g,"");
    const date=$("flightDate").value;
    if (!ROUTE_RE.test(route)) { showError("Enter one airport code (BUD) or two (BUD-ALC)."); return; }
    if (!date) { showError("Choose a duty date."); return; }
    await loadAirportCatalogue();
    const routes=routesFor(route);
    const unknown=[...new Set(routes.flat().filter(code=>!airport(code)))];
    if (unknown.length) { showError(`Airport code not in the local database: ${unknown.join(", ")}. Add its airport coordinates before searching.`); return; }
    const button=$("track"); button.disabled=true; button.textContent="SEARCHING FLIGHTS…";
    state.flights=[]; state.candidates=[]; state.selected=null; state.googleLinks=[]; state.observed=[]; state.scheduleDiagnostics=[];
    $("observedFlights").textContent="Airport arrival checks are disabled: the app never queries future observations.";
    $("candidates").className="empty"; $("candidates").textContent="Searching timetable and current ADS-B positions…";
    $("connection").textContent="Checking timetable…"; $("lastUpdated").textContent="SEARCHING";
    try {
      const responses=await Promise.allSettled(routes.map(([o,d])=>loadRoute(o,d,date)));
      const scheduleErrors=[];
      responses.forEach((r,i)=>{ if(r.status==="fulfilled")state.flights.push(...r.value); else scheduleErrors.push(`${routes[i].join("-")}: ${r.reason?.message||"schedule unavailable"}`); });
      state.flights.sort((a,b)=>a.departure-b.departure); render();
      if(!state.flights.length){
        const d=state.scheduleDiagnostics[0]||{};
        const detail=d.error||("API rows: "+(d.rowCount??"?")+"; accepted: "+(d.acceptedCount??0)+"; fields: "+((d.firstRowKeys||[]).join(", ")||"no row fields")+"; response keys: "+((d.topLevelKeys||[]).join(", ")||d.payloadType||"unknown"));
        $("connection").textContent="Timetable empty · "+detail;
        $("lastUpdated").textContent="SCHEDULE CHECKED";
        renderCandidates([],"No verified timetable sectors were returned by the Nuremberg Airport board.");
        showError("NUE timetable diagnostic ("+(d.route||"route")+"): "+detail);
        return;
      }
      const deviceNow=new Date();
      const today=[deviceNow.getFullYear(),String(deviceNow.getMonth()+1).padStart(2,"0"),String(deviceNow.getDate()).padStart(2,"0")].join("-");
      if (date !== today) {
        renderCandidates([],"Historical ADS-B candidate reconstruction is not enabled. No future airport observations are queried.");
        $("connection").textContent="Timetable loaded · live ADS-B is only available for today";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\\n"));
        return;
      }
      const nowMs=Date.now();
      // Track from 3 hours before scheduled departure until 3 hours after scheduled arrival,
      // allowing delayed flights to remain eligible for live ADS-B matching.
      const searchFlights=state.flights.filter(f=>nowMs>=f.departure.getTime()-180*60000&&nowMs<=f.arrival.getTime()+180*60000);
      if (!searchFlights.length) {
        renderCandidates([],"No flight is inside the live tracking window. No future observations were requested.");
        $("connection").textContent="Timetable loaded · no flight inside live window";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if (scheduleErrors.length) showError(scheduleErrors.join("\\n"));
        return;
      }
      $("connection").textContent="Timetable loaded · filtering current ADS-B traffic…";
      const all=[]; const adsbErrors=[];
      const found=await Promise.allSettled(searchFlights.map(f=>findCandidates(f)));
      found.forEach((r,i)=>{ if(r.status==="fulfilled")all.push(...r.value.map(ac=>({flight:searchFlights[i],aircraft:ac}))); else adsbErrors.push(`${searchFlights[i].origin}-${searchFlights[i].destination}: ${r.reason?.message||"ADS-B unavailable"}`); });
      // One aircraft (one ICAO HEX) can appear only once in the final shortlist.
      const unique=new Map();
      for (const item of all) {
        const key=String(item.aircraft.hex).toLowerCase();
        const old=unique.get(key);
        if(!old||item.aircraft.score>old.aircraft.score)unique.set(key,item);
      }
      const final=[...unique.values()].sort((a,b)=>b.aircraft.score-a.aircraft.score).slice(0,6);
      state.candidates=final;
      renderCandidates(final,final.length?"Live ADS-B candidates only. Filtered to B738/B38M and checked against aircraft registry ownership. Position and route fit are not airline confirmation.":adsbErrors.length?"ADS-B service could not complete the search. See the error details above.":"No live aircraft passed both the Ryanair Group operator and B738/B38M filters.");
      // Never silently restore a previously selected aircraft after a fresh search.
      render();
      $("lastUpdated").textContent="UPDATED "+fmt(new Date(),"Europe/Berlin");
      $("connection").textContent=final.length?`${final.length} filtered live aircraft · not airline-confirmed`:"No aircraft passed the strict Ryanair 737 filter";
      if (scheduleErrors.length||adsbErrors.length) showError([...scheduleErrors,...adsbErrors].join("\\n"));
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
