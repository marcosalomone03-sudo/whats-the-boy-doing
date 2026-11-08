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

  const state = { flights:[], candidates:[], selected:null, inboundAircraft:null, aircraftChange:null, turnaround:null, googleLinks:[], observed:[], scheduleDiagnostics:[], pool:null, dailyBoard:null, registrationHistory:[] };
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
    // Always inspect both directions, including an explicitly entered NUE route.
    // The aircraft may be operating the inbound leg now, or the outbound leg
    // after arriving at NUE on the preceding sector.
    if (parts.includes("NUE")) return [[parts[0],parts[1]],[parts[1],parts[0]]];
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
          const normalized=makeFlight(origin,destination,no,dep,arr,depDate,arrDate,estimated,item.source||data.source||"Schedule");
          Object.assign(normalized,{boardStatus:item.boardStatus||"",boardActualTime:item.boardActualTime||"",boardEstimatedTime:item.boardEstimatedTime||"",
            boardScheduledTime:item.boardScheduledTime||"",boardDirection:item.boardType||"",boardRegistration:item.boardRegistration||"",boardAircraftType:item.boardAircraftType||""});
          out.push(normalized);
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
        if (dep && arr && no) {
          const normalized=makeFlight(origin,destination,no,dep,arr,date,String(arrRaw).slice(0,10),{},item.source||data.source||"Schedule");
          Object.assign(normalized,{boardStatus:item.boardStatus||"",boardActualTime:item.boardActualTime||"",boardEstimatedTime:item.boardEstimatedTime||"",
            boardScheduledTime:item.boardScheduledTime||"",boardDirection:item.boardType||"",boardRegistration:item.boardRegistration||"",boardAircraftType:item.boardAircraftType||""});
          out.push(normalized);
        }
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
    const now=new Date();
    const from=new Date(eventTime.getTime()-2*3600000);
    // Overflights only describe observations already received. Never ask the API
    // for a future window; skip sectors whose observation window has not begun.
    if(from>now)return [];
    const to=new Date(Math.min(eventTime.getTime()+2*3600000,now.getTime()));
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
  async function loadDailyBoard(date) {
    const data=await get("/api/daily-board?date="+encodeURIComponent(date));
    if(!Array.isArray(data?.flights))throw new Error("Daily NUE board response is incomplete.");
    state.dailyBoard=data; return data;
  }
  function boardRegistrationEvidence(flight,registration) {
    const reg=String(registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!reg||!state.dailyBoard?.flights?.length)return null;
    const rows=state.dailyBoard.flights.filter(x=>String(x.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"")===reg).sort((a,b)=>Date.parse(a.scheduledTime)-Date.parse(b.scheduledTime));
    const target=rows.find(x=>x.flightNumber===flight.flightNumber&&x.origin===flight.origin&&x.destination===flight.destination);
    if(!target)return null;
    const targetTime=Date.parse(target.scheduledTime);
    const previous=rows.filter(x=>x.destination===target.origin&&Date.parse(x.scheduledTime)<=targetTime).slice(-1)[0]||null;
    const next=rows.find(x=>x.origin===target.destination&&Date.parse(x.scheduledTime)>targetTime)||null;
    const opposite=state.dailyBoard.flights.find(x=>x.origin===target.destination&&x.destination===target.origin&&Math.abs(Date.parse(x.scheduledTime)-targetTime)<18*3600000)||null;
    const oppositeReg=String(opposite?.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    return {registration:reg,flightNumber:target.flightNumber,targetRow:target,previousRow:previous,nextRow:next,previousFlight:previous?.flightNumber||null,nextFlight:next?.flightNumber||null,nextRegistration:next?.registration||null,destinationSwap:!!(opposite&&oppositeReg!==reg),oppositeFlight:opposite?.flightNumber||null,oppositeRegistration:opposite?.registration||null,source:"Nuremberg Airport daily board"};
  }
  function boardRowForFlight(flight) {
    return state.dailyBoard?.flights?.find(x=>x.flightNumber===flight.flightNumber&&x.origin===flight.origin&&x.destination===flight.destination)||null;
  }
  function flightFromBoardArrival(row) {
    const origin=String(row?.origin||"").toUpperCase(), destination=String(row?.destination||"").toUpperCase();
    const eventTime=Date.parse(row?.scheduledTime||"");
    if(!airport(origin)||!airport(destination)||destination!=="NUE"||!Number.isFinite(eventTime))return null;
    const parts=localParts(new Date(eventTime),airport(destination).tz);
    const date=parts.year+"-"+parts.month+"-"+parts.day, arrival=parts.hour+":"+parts.minute;
    const times=estimateBoardTimes(origin,destination,date,arrival,"arrival");
    const flight=makeFlight(origin,destination,row.flightNumber||"INBOUND",times.dep,times.arr,times.depDate,times.arrDate,times.estimated,"Nuremberg Airport daily board");
    Object.assign(flight,{boardRegistration:row.registration||"",boardStatus:row.status||"",boardScheduledTime:row.scheduledLocalTime||arrival,boardDirection:"arrival"});
    return flight;
  }
  function landingEvidenceFromRow(row,destinationCode) {
    if(!row||!/landed|arrived/i.test(String(row.status||"")))return null;
    let actualMs=Date.parse(row.statusTime||"");
    const scheduledMs=Date.parse(row.scheduledTime||"");
    if(!Number.isFinite(actualMs)&&row.statusTimeLocal&&Number.isFinite(scheduledMs)){
      const scheduledParts=localParts(new Date(scheduledMs),airport(destinationCode)?.tz||"Europe/Berlin");
      const date=scheduledParts.year+"-"+scheduledParts.month+"-"+scheduledParts.day;
      actualMs=dateAtAirport(date,row.statusTimeLocal,airport(destinationCode)).getTime();
    }
    if(!Number.isFinite(actualMs))return null;
    const scheduled=Number.isFinite(scheduledMs)?scheduledMs:null;
    return {actual:new Date(actualMs),scheduled:scheduled===null?null:new Date(scheduled),delayMinutes:scheduled===null?null:Math.round((actualMs-scheduled)/60000),status:String(row.status||"Landed"),source:"Nuremberg Airport board"};
  }
  function landingEvidence(flight,aircraft) {
    if(aircraft?.observedLanding?.seen==="ground"){
      const actual=aircraft.observedLanding.actual;
      return {actual,scheduled:flight.arrival,delayMinutes:Math.round((actual-flight.arrival)/60000),status:"Ground observation",source:"FlyItalyADSB observed-flight history"};
    }
    const row=aircraft?.boardEvidence?.targetRow||aircraft?.boardRow||boardRowForFlight(flight);
    const fromRow=landingEvidenceFromRow(row,flight.destination);
    if(fromRow)return fromRow;
    if(!/landed|arrived/i.test(String(flight?.boardStatus||""))||!flight?.boardActualTime)return null;
    const parts=localParts(flight.arrival,airport(flight.destination).tz);
    const date=parts.year+"-"+parts.month+"-"+parts.day;
    const actual=dateAtAirport(date,flight.boardActualTime,airport(flight.destination));
    return {actual,scheduled:flight.arrival,delayMinutes:Math.round((actual-flight.arrival)/60000),status:flight.boardStatus,source:flight.source||"Airport board"};
  }
  function punctualityText(delay) {
    if(!Number.isFinite(delay))return "PUNCTUALITY NOT PUBLISHED";
    if(Math.abs(delay)<=5)return "ON TIME";
    return Math.abs(delay)+" MIN "+(delay<0?"EARLY":"LATE");
  }
  function minutesAgoText(date) {
    const minutes=Math.max(0,Math.round((Date.now()-date.getTime())/60000));
    return minutes+" min ago";
  }
  function renderBoardLanding(flight,aircraft) {
    const evidence=landingEvidence(flight,aircraft);
    const row=aircraft?.boardRow||boardRowForFlight(flight)||{};
    const registration=aircraft?.r||row.registration||"Not published";
    const type=aircraft?.t||row.aircraftType||flight.boardAircraftType||"—";
    if(!evidence)return '<div class="empty">No live ADS-B position is available. The airport board has not published a confirmed landing time for this flight.</div>';
    return '<div class="flighttop"><div><div class="flightno">'+esc(flight.flightNumber)+'</div><div class="route">'+esc(flight.origin)+' → '+esc(flight.destination)+'</div><div class="muted">Aircraft registration '+esc(registration)+'</div></div><div class="status-stack"><span class="status ground">'+ (String(evidence.source).includes("FlyItalyADSB")?"LANDED · ADS-B HISTORY":"LANDED") +'</span><span class="status '+(Number.isFinite(evidence.delayMinutes)&&evidence.delayMinutes>5?"late":"air")+'">'+esc(punctualityText(evidence.delayMinutes))+'</span></div></div>'+
      '<div class="stats"><div class="stat"><small>'+(String(evidence.source).includes("FlyItalyADSB")?"Arrival observed · local":"Actual landing · local")+'</small><strong>'+esc(fmt(evidence.actual,airport(flight.destination).tz))+'</strong></div><div class="stat"><small>Landed</small><strong>'+esc(minutesAgoText(evidence.actual))+'</strong></div><div class="stat"><small>Scheduled arrival</small><strong>'+esc(fmt(evidence.scheduled||flight.arrival,airport(flight.destination).tz))+'</strong></div><div class="stat"><small>Aircraft type</small><strong>'+esc(type)+'</strong></div></div>'+
      '<div class="notice">'+(aircraft?.boardOnly?"No live ADS-B position is currently available for this aircraft. ":"An ADS-B ground observation indicates the aircraft was on the surface near the destination; this is an observed arrival time, not a guaranteed touchdown timestamp. ")+"Landing time and punctuality are taken from "+esc(evidence.source)+".</div>";
  }
  function liveEtaToAirport(ac,destinationCode,requireHeading=false) {
    const destination=airport(destinationCode), lat=numeric(ac?.lat), lon=numeric(ac?.lon), speed=numeric(ac?.gs);
    if(!destination||lat===null||lon===null||speed===null||speed<100||ac?.alt_baro==="ground")return null;
    const position={lat,lon}, distance=hav(position,destination), track=numeric(ac?.track);
    if(distance<3)return null;
    const requiredBearing=bearing(position,destination);
    if(requireHeading&&(track===null||angleDiff(track,requiredBearing)>65))return null;
    const minutes=Math.max(1,Math.round(distance/speed*60));
    return {eta:new Date(Date.now()+minutes*60000),minutes,distance,track,bearing:requiredBearing};
  }
  async function observedArrivalForRegistration(registration,destination,referenceTime,cache=new Map()) {
    const reg=String(registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!reg||!airport(destination))return null;
    const utcDay=referenceTime.toISOString().slice(0,10);
    const previousDay=new Date(referenceTime.getTime()-86400000).toISOString().slice(0,10);
    const days=[utcDay,previousDay];
    const requests=await Promise.all(days.map(day=>{
      const key=destination+"|"+day;
      if(!cache.has(key))cache.set(key,get("/api/observed?airport="+encodeURIComponent(destination)+"&type=arrivals&date="+encodeURIComponent(day)));
      return cache.get(key).catch(()=>null);
    }));
    const now=Date.now(), matches=[];
    for(const data of requests)for(const flight of (Array.isArray(data?.flights)?data.flights:[])){
      const flightReg=String(flight?.r||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      const arrival=flight?.to||{};
      const airportCode=String(arrival.iata||"").toUpperCase();
      const seen=String(arrival.seen||"").toLowerCase();
      const time=Number(arrival.time)*1000;
      if(flightReg!==reg||airportCode!==destination||!Number.isFinite(time)||time>now+10*60000||time<referenceTime.getTime()-12*3600000||!["ground","low"].includes(seen))continue;
      matches.push({actual:new Date(time),scheduled:null,delayMinutes:null,flightNumber:String(flight.callsign||"").trim(),origin:String(flight.from?.iata||flight.from?.airport||"Unknown"),seen,source:"FlyItalyADSB observed-flight history"});
    }
    matches.sort((a,b)=>b.actual-a.actual);
    return matches[0]||null;
  }
  async function findAircraftChange(current,registrationCache) {
    state.aircraftChange=null;
    state.turnaround=null;
    if(!current?.flight||!current?.aircraft||!state.dailyBoard?.flights?.length)return null;
    const destination=current.flight.destination;
    const next=state.flights.filter(f=>f.origin===destination&&f.departure.getTime()>current.flight.departure.getTime()&&f.departure.getTime()<current.flight.arrival.getTime()+10*3600000)
      .sort((a,b)=>a.departure-b.departure)[0];
    if(!next)return null;
    const currentRow=boardRowForFlight(current.flight);
    const currentReg=String(current.aircraft.r||current.aircraft.boardRow?.registration||currentRow?.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!currentReg)return null;
    const row=boardRowForFlight(next);
    const nextReg=String(row?.registration||next.boardRegistration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!nextReg)return null;
    if(currentReg&&nextReg===currentReg){
      state.turnaround={destination,nextFlight:next,registration:nextReg,landing:landingEvidence(current.flight,current.aircraft),eta:current.aircraft.boardOnly?null:liveEtaToAirport(current.aircraft,destination,false)};
      return null;
    }
    const boyEta=current.aircraft.boardOnly?null:liveEtaToAirport(current.aircraft,destination,false);
    const boyLanding=landingEvidence(current.flight,current.aircraft);
    const result=await identifyFlightByRegistration(next,registrationCache), ac=result.aircraft;
    const inboundEta=ac&&!ac.boardOnly?liveEtaToAirport(ac,destination,true):null;
    const previousRow=ac?.boardEvidence?.previousRow||null;
    let inboundLanding=landingEvidenceFromRow(previousRow,destination);
    const historyItem=state.registrationHistory.find(item=>{
      const key=String(item.data?.r||item.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      return key===nextReg;
    });
    const dspGround=historyItem?.latestTodayLanding?.airport===destination?historyItem.latestTodayLanding:null;
    const dspEstimate=historyItem?.latestTodayEstimatedLanding?.airport===destination?historyItem.latestTodayEstimatedLanding:null;
    const inboundHistory=!inboundLanding&&!dspGround&&!dspEstimate&&!inboundEta?await observedArrivalForRegistration(nextReg,destination,current.flight.arrival,registrationCache):null;
    const dspGroundEvidence=dspGround?{actual:new Date(Number(dspGround.time)*1000),scheduled:next.arrival,delayMinutes:null,status:"ADS-B ground observation",source:"FlyItalyADSB daily trace"}:null;
    const dspEstimateEvidence=dspEstimate&&Number.isFinite(Number(dspEstimate.time))?{actual:new Date(Number(dspEstimate.time)*1000),observed:new Date(Number(dspEstimate.observedTime)*1000),source:"FlyItalyADSB DSP descent estimate"}:null;
    const boyTime=boyLanding?.actual||boyEta?.eta||null;
    const inboundTime=inboundLanding?.actual||dspGroundEvidence?.actual||(inboundHistory?.seen==="ground"?inboundHistory.actual:null)||dspEstimateEvidence?.actual||inboundEta?.eta||null;
    const difference=boyTime&&inboundTime?Math.round((inboundTime-boyTime)/60000):null;
    state.aircraftChange={destination,nextFlight:next,aircraft:ac||{boardOnly:true,r:nextReg},inboundEta,boyEta,boyLanding,inboundLanding,dspGroundEvidence,dspEstimateEvidence,inboundHistory,previousRow,difference,mode:inboundLanding?"board-landed":dspGroundEvidence?"adsb-ground":inboundHistory?"history-landed":dspEstimateEvidence?"estimated-landed":inboundEta?"live":"assigned-only"};
    return state.aircraftChange;
  }
  function renderAircraftChange() {
    const item=state.aircraftChange;
    const el=$("aircraftChangeSection");
    if(!el)return;
    if(!item){el.hidden=true;return;}
    const ap=airport(item.destination), ac=item.aircraft;
    const inboundLanding=item.inboundLanding||item.dspGroundEvidence||(item.inboundHistory?.seen==="ground"?item.inboundHistory:null);
    const inboundEstimate=item.dspEstimateEvidence;
    const inboundText=inboundLanding
      ?"The replacement aircraft landed "+minutesAgoText(inboundLanding.actual)+"."
      :inboundEstimate
      ?"DSP estimates that the replacement aircraft landed "+minutesAgoText(inboundEstimate.actual)+" (around "+fmt(inboundEstimate.actual,ap.tz)+" local)."
      :item.inboundEta
      ?"The replacement aircraft is landing in about "+item.inboundEta.minutes+" minutes."
      :item.inboundHistory
      ?"The replacement aircraft was last observed close to "+item.destination+"; landing is not confirmed."
      :"The replacement aircraft is assigned to the next sector, but its live ADS-B position or landing time is not available.";
    const boyText=item.boyLanding
      ?"THE BOY LANDED AT "+item.destination+" · "+fmt(item.boyLanding.actual,ap.tz)+" · "+punctualityText(item.boyLanding.delayMinutes)
      :item.boyEta
      ?"THE BOY IS LANDING IN ABOUT "+item.boyEta.minutes+" MINUTES"
      :"The boy's landing at "+item.destination+" is not yet confirmed.";
    const status=item.mode==="live"?"LIVE ADS-B":inboundLanding?"LANDED":inboundEstimate?"ESTIMATED LANDING · DSP":item.inboundHistory?"NEAR AIRPORT · NOT CONFIRMED":"ASSIGNED · NO LIVE ADS-B";
    const inboundFlight=item.previousRow?'<div class="muted">Inbound sector: '+esc(item.previousRow.flightNumber||"Unknown flight")+' · '+esc(item.previousRow.origin||"?")+' → '+esc(item.destination)+'</div>':"";
    el.hidden=false;
    $("aircraftChangeContent").innerHTML=
      '<div class="notice inbound-heading">BOEING NEEDS TO DO AIRCRAFT CHANGE</div>'+
      '<div class="flighttop"><div><div class="flightno">'+esc(ac.r||nextRegFallback(item))+'</div><div class="route">'+esc(item.nextFlight.flightNumber)+' · '+esc(item.nextFlight.origin)+' → '+esc(item.nextFlight.destination)+'</div><div class="muted">Replacement aircraft assigned to the next sector</div>'+inboundFlight+'</div><span class="status '+(item.mode==="live"?"air":inboundLanding?"ground":"none")+'">'+status+'</span></div>'+
      '<div class="stats"><div class="stat"><small>Replacement aircraft</small><strong>'+esc(ac.r||nextRegFallback(item))+'</strong></div><div class="stat"><small>Aircraft type</small><strong>'+esc(ac.t||ac.boardRow?.aircraftType||"—")+'</strong></div>'+
      (item.mode==="live"?'<div class="stat"><small>Live ground speed</small><strong>'+Math.round(numeric(ac.gs))+' kt</strong></div>':"")+
      (inboundLanding?'<div class="stat"><small>Replacement landed · local</small><strong>'+esc(fmt(inboundLanding.actual,ap.tz))+'</strong></div><div class="stat"><small>Replacement landed</small><strong>'+esc(minutesAgoText(inboundLanding.actual))+'</strong></div>':inboundEstimate?'<div class="stat"><small>DSP estimated landing · local</small><strong>~'+esc(fmt(inboundEstimate.actual,ap.tz))+'</strong></div>':item.inboundEta?'<div class="stat"><small>Estimated landing</small><strong>'+esc(item.inboundEta.minutes)+' min · '+esc(fmt(item.inboundEta.eta,ap.tz))+'</strong></div>':"")+
      '<div class="stat"><small>Estimated departure · timetable</small><strong>'+esc(fmt(item.nextFlight.departure,airport(item.nextFlight.origin).tz))+'</strong></div>'+
      (item.boyLanding?'<div class="stat"><small>Boy landed · local</small><strong>'+esc(fmt(item.boyLanding.actual,ap.tz))+'</strong></div><div class="stat"><small>Boy punctuality</small><strong>'+esc(punctualityText(item.boyLanding.delayMinutes))+'</strong></div>':item.boyEta?'<div class="stat"><small>Boy estimated landing</small><strong>'+esc(item.boyEta.minutes)+' min</strong></div>':"")+
      '</div><div class="notice">'+esc(inboundText)+' '+esc(boyText)+' The next-sector registration comes from the Nuremberg Airport board and is not airline-confirmed. ADS-B landing estimates are not confirmed touchdown times.</div>';
  }
  function nextRegFallback(item) { return item?.aircraft?.r||item?.nextFlight?.boardRegistration||"Registration unavailable"; }
  async function findInboundAircraft(targetFlights,registrationCache) {
    state.inboundAircraft=null;
    if(!state.dailyBoard?.flights?.length)return null;
    const now=Date.now(), rows=state.dailyBoard.flights;
    const targets=targetFlights.filter(f=>f.origin==="NUE"&&f.departure.getTime()>now&&f.departure.getTime()<now+8*3600000).sort((x,y)=>x.departure-y.departure);
    for(const target of targets){
      const targetRow=boardRowForFlight(target), reg=String(targetRow?.registration||target.boardRegistration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      if(!reg)continue;
      const inboundRows=rows.filter(row=>String(row.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"")===reg&&row.destination==="NUE"&&row.origin!=="NUE")
        .filter(row=>{const t=Date.parse(row.scheduledTime||"");return Number.isFinite(t)&&t>=now-30*60000&&t<=now+180*60000;})
        .sort((x,y)=>Date.parse(x.scheduledTime)-Date.parse(y.scheduledTime));
      for(const row of inboundRows){
        const flight=flightFromBoardArrival(row); if(!flight)continue;
        const result=await identifyFlightByRegistration(flight,registrationCache), ac=result.aircraft;
        const altitude=numeric(ac?.alt_baro), speed=numeric(ac?.gs);
        if(!ac?.boardOnly&&altitude!==null&&altitude>1500&&speed!==null&&speed>=100){
          state.inboundAircraft={flight,aircraft:ac,targetFlight:target}; return state.inboundAircraft;
        }
      }
    }
    return null;
  }
  function renderInboundAircraft() {
    const item=state.inboundAircraft;
    if(!item)return "";
    return '<div class="inbound-card"><div class="notice inbound-heading">THE AIRCRAFT ASSIGNED TO YOUR UPCOMING FLIGHT IS CURRENTLY OPERATING THIS INBOUND SECTOR</div>'+renderAircraft(item.flight,item.aircraft)+'<div class="notice">This is the aircraft’s current inbound flight, not your selected outbound flight. Its assignment is based on the NUE airport board registration and is not airline-confirmed.</div></div>';
  }
  async function identifyFlightByRegistration(flight,registrationCache=new Map()) {
    const row=boardRowForFlight(flight);
    const registration=String(row?.registration||flight.boardRegistration||"").trim();
    const boardEvidence=registration?boardRegistrationEvidence(flight,registration):null;
    const boardRow=row||{flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,direction:flight.origin==="NUE"?"departure":"arrival",registration,status:flight.boardStatus||"Not reported",scheduledLocalTime:flight.boardScheduledTime||flight.departureLocal||"",statusTimeLocal:flight.boardActualTime||flight.boardEstimatedTime||""};
    if(!registration)return {flight,aircraft:{boardOnly:true,boardReason:row?"The airport board has not published an aircraft registration for this flight.":"No matching registration was available from the Nuremberg board.",boardRow,boardEvidence:null}};
    try {
      const cacheKey=registration.toUpperCase().replace(/[^A-Z0-9]/g,"");
      if(!registrationCache.has(cacheKey))registrationCache.set(cacheKey,get("/api/registration?reg="+encodeURIComponent(registration)));
      const ac=await registrationCache.get(cacheKey);
      if(ac?.notSeen)return {flight,aircraft:{boardOnly:true,boardReason:"FlyItalyADSB is not currently receiving this registration. This alone does not establish whether the aircraft is parked, switched off or outside receiver coverage.",boardRow,boardEvidence,r:registration,t:row?.aircraftType||flight.boardAircraftType||null}};
      const returnedReg=String(ac?.r||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      const requestedReg=registration.toUpperCase().replace(/[^A-Z0-9]/g,"");
      if(returnedReg!==requestedReg)return {flight,aircraft:{boardOnly:true,boardReason:"The ADS-B response did not match the registration assigned by the airport board.",boardRow,boardEvidence,r:registration}};
      if(!validAircraft(ac))return {flight,aircraft:{boardOnly:true,boardReason:"FlyItalyADSB returned no sufficiently fresh position for this registration.",boardRow,boardEvidence,r:registration,t:ac?.t||row?.aircraftType||null}};
      return {flight,aircraft:{...ac,boardEvidence,boardRow,liveVerified:true,operatorMatch:true,operatorName:"Nuremberg Airport board registration",onGround:ac.alt_baro==="ground",seenPos:positionAge(ac),score:100,crossTrack:null}};
    } catch(error) {
      return {flight,aircraft:{boardOnly:true,boardReason:"The direct ADS-B registration lookup failed: "+(error?.message||"unknown error"),boardRow,boardEvidence,r:registration,t:row?.aircraftType||flight.boardAircraftType||null}};
    }
  }
  async function loadNuePool(date) {
    try { const data=await get("/api/pool?date="+encodeURIComponent(date)); state.pool=data?.aircraft||null; return data; }
    catch(error){state.pool=null;console.warn("NUE pool unavailable",error);return null;}
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
    function turnaroundEvidence(flight,hex) {
    const airportCode=flight.origin;
    const previous=state.flights.filter(f=>f!==flight&&f.destination===airportCode&&f.date===flight.date&&f.arrival<=flight.departure).sort((a,b)=>b.arrival-a.arrival)[0];
    if(!previous)return null;
    const timeOf=item=>{const value=item?.closest_time;const ms=typeof value==="number"?(value<1e12?value*1000:value):Date.parse(value);return Number.isFinite(ms)?ms:null;};
    const records=state.observed.filter(item=>String(item.icao||item.hex||"").toLowerCase()===String(hex).toLowerCase());
    const arrivals=records.filter(item=>item.checkpoint==="arrival"&&item.flight?.flightNumber===previous.flightNumber&&item.flight?.origin===previous.origin&&item.flight?.destination===previous.destination).map(item=>({item,time:timeOf(item)})).filter(x=>x.time!==null&&Math.abs(x.time-previous.arrival.getTime())<=90*60000);
    const departures=records.filter(item=>item.checkpoint==="departure"&&item.flight?.flightNumber===flight.flightNumber&&item.flight?.origin===flight.origin&&item.flight?.destination===flight.destination).map(item=>({item,time:timeOf(item)})).filter(x=>x.time!==null&&Math.abs(x.time-flight.departure.getTime())<=90*60000);
    for(const arrival of arrivals)for(const departure of departures){const gap=(departure.time-arrival.time)/60000;if(gap>=0&&gap<=180)return {inboundFlight:previous.flightNumber,arrivalTime:new Date(arrival.time).toISOString(),departureTime:new Date(departure.time).toISOString(),gapMinutes:Math.round(gap)};}
    return null;
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
    return !!(a && typeof a.hex === "string" && /^[0-9a-f]{6}$/i.test(a.hex) && lat !== null && lon !== null && Math.abs(lat)<=90 && Math.abs(lon)<=180 && (seen===null || seen<75) && seenPos<=60);
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
  function ryanairGroupIdentity(identity, registration) {
    const owner=String(identity?.registeredOwner||identity?.registered_owner||"").toLowerCase();
    const flag=String(identity?.operatorFlagCode||identity?.operator_flag_code||"").toUpperCase();
    const reg=String(registration||identity?.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    // Ryanair Group fleet registrations are currently EI-, 9H- and SP-.
    // Registration is only a preliminary fleet filter: registry owner/flag
    // must independently identify a Ryanair Group operator.
    const prefixMatch=/^(EI|9H|SP)/.test(reg);
    const ownerMatch=/ryanair|malta air|buzz|ryanair uk|ryanair sun/.test(owner);
    const flagMatch=new Set(["RYR","RUK","RYS","MAY"]).has(flag);
    return {ok:prefixMatch&&(ownerMatch||flagMatch),prefixMatch,ownerMatch,flagMatch,registration:reg,
      owner:identity?.registeredOwner||identity?.registered_owner||"",flag};
  }
  async function findCandidates(flight) {
    const origin=airport(flight.origin), destination=airport(flight.destination);
    if (!origin || !destination) throw new Error("Airport coordinates are not available for this route.");
    const now=Date.now(), dep=flight.departure.getTime(), arr=flight.arrival.getTime();
    // Keep the inbound leg eligible after landing so the same aircraft can be
    // evaluated against the following outbound sector at NUE.
    if (now < dep-180*60000 || now > arr+180*60000) return [];

    const durationMinutes=Math.max(30,(arr-dep)/60000);
    const elapsedMinutes=(now-dep)/60000;
    const expectedFraction=Math.max(0,Math.min(1,elapsedMinutes/durationMinutes));
    const expectedPoint=interpolate(origin,destination,expectedFraction);
    // Always inspect the departure area. Once the flight has had time to leave,
    // also inspect the expected live position and nearby route segments.
    const requests=[aircraftNear(origin,40)];
    if(now>dep+8*60000) requests.push(aircraftNear(expectedPoint,250));
    if(now>dep+8*60000 && expectedFraction>0.12 && expectedFraction<0.88) {
      requests.push(aircraftNear(interpolate(origin,destination,Math.max(0,expectedFraction-0.16)),250));
      requests.push(aircraftNear(interpolate(origin,destination,Math.min(1,expectedFraction+0.16)),250));
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
      if(seenPos>60) continue;
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
        if(geo.alongTrack < -40 || geo.alongTrack > geo.distance+50 || geo.crossTrack>150) continue;
        if(minutesAfterArrival>45&&distanceToDestination>55) continue;
        if(minutesAfterArrival>60) continue;
        const fraction=Math.max(0,Math.min(1,geo.alongTrack/Math.max(1,geo.distance)));
        progressDifference=Math.abs(fraction-expectedFraction);
        headingDifference=track===null?null:angleDiff(track,routeBearing);
        const nearEndpoint=Math.min(distanceToOrigin,distanceToDestination)<=25;
        if(!nearEndpoint&&progressDifference>0.55) continue;
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
    // ADS-B itself does not reliably identify the operator. Do not discard a live
    // B738/B38M merely because public registry enrichment is missing: EI/9H/SP
    // registrations are a shortlist signal, not proof of Ryanair Group ownership.
    const checked=await Promise.all(candidates.slice(0,20).map(async ac=>{
      const poolMatch=!!state.pool?.[String(ac.hex).toLowerCase()];
      try {
        const identity=await aircraftIdentity(ac.hex);
        const registration=ac.r||identity.registration||null;
        const match=ryanairGroupIdentity(identity,registration);
        const knownOtherOwner=!!(match.owner||match.flag) && !match.ownerMatch && !match.flagMatch;
        const possibleOnly=match.prefixMatch && !match.ok && !knownOtherOwner;
        return {...ac,operatorMatch:match.ok,possibleOnly,registrationPrefixMatch:match.prefixMatch,
          poolMatch,operatorName:match.owner||match.flag||(possibleOnly?"Ryanair Group registration prefix only":"Unknown"),
          identitySource:identity.source||"Aircraft registry",r:registration,t:ac.t||identity.aircraftType||null};
      } catch(error) {
        const registration=ac.r||null;
        const prefixMatch=/^(EI|9H|SP)/.test(String(registration||"").toUpperCase().replace(/[^A-Z0-9]/g,""));
        return {...ac,operatorMatch:false,possibleOnly:prefixMatch,registrationPrefixMatch:prefixMatch,
          poolMatch,operatorName:prefixMatch?"Ryanair Group registration prefix only":"Unverified",
          identityError:error.message,r:registration};
      }
    }));
    return checked.filter(ac=>ac.operatorMatch||ac.possibleOnly)
      .sort((x,y)=>(y.operatorMatch?1:0)-(x.operatorMatch?1:0)||(y.poolMatch?1:0)-(x.poolMatch?1:0)||y.score-x.score)
      .slice(0,6);
  }

  function saveSelected(flight,aircraft) {
    const saved={flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,date:flight.date,routeScan:!!flight.routeScan,hex:aircraft.hex,callsign:(aircraft.flight||"").trim(),registration:aircraft.r||null,type:aircraft.t||null,updatedAt:new Date().toISOString()};
    storageSet(saved);
    state.selected={flight,aircraft};
  }
  function minuteWords(value) { return String(Math.max(0,Math.round(value))); }
  function flightPhase(ac,distanceToDestination,onGround) {
    if(onGround)return {icon:"🔄",label:"TURNAROUND",className:"ground"};
    const altitude=numeric(ac.alt_baro),verticalRate=numeric(ac.baro_rate);
    if(altitude!==null&&altitude<=10000&&verticalRate!==null&&verticalRate>250)return {icon:"🛫",label:"CLIMB",className:"air"};
    if(altitude!==null&&altitude<=12000&&((verticalRate!==null&&verticalRate< -250)||(Number.isFinite(distanceToDestination)&&distanceToDestination<=35)))return {icon:"🛬",label:"LANDING",className:"air"};
    if(altitude!==null&&altitude>=20000&&(verticalRate===null||Math.abs(verticalRate)<700))return {icon:"✈️",label:"CRUISE",className:"air"};
    return {icon:"✈️",label:"AIRBORNE",className:"air"};
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
    const phase=flightPhase(ac,distanceToDestination,onGround);
    let eta=null, etaMinutes=null, punctualityLabel="", punctualityClass="air", etaLabel="Not available";
    if(!onGround&&speed!==null&&speed>=100&&Number.isFinite(distanceToDestination)){
      const minutes=Math.max(0,Math.round(distanceToDestination/speed*60));
      etaMinutes=minutes;
      eta=new Date(Date.now()+minutes*60000);
      etaLabel=fmt(eta,destination.tz);
      const difference=Math.round((eta-flight.arrival)/60000);
      if(Math.abs(difference)<=5)punctualityLabel="ON TIME";
      else if(difference<0)punctualityLabel=minuteWords(Math.abs(difference))+" EARLY";
      else {punctualityLabel=minuteWords(difference)+" LATE";punctualityClass="late";}
    }
    return `<div class="flighttop"><div><div style="display:flex;align-items:center;gap:9px"><span style="font-size:30px;line-height:1" aria-label="${esc(phase.label)}">${phase.icon}</span><div><div class="flightno">${esc(flight.flightNumber)}</div><div class="muted" style="font-weight:700;letter-spacing:.08em">${esc(phase.label)}</div></div></div><div class="route">${esc(flight.origin)} → ${esc(flight.destination)}</div><div class="muted">${esc(airport(flight.origin)?.name)} · ${esc(airport(flight.destination)?.name)}</div></div><div class="status-stack"><span class="status ${statusClass}">${status}</span>${punctualityLabel?`<span class="status ${punctualityClass}">${esc(punctualityLabel)}</span>`:""}</div></div><div class="notice">${ac.boardEvidence?"DAILY BOARD REGISTRATION MATCH — "+esc(ac.boardEvidence.registration)+". ":""}Live ADS-B reports the aircraft ${onGround?(taxiing?"on the surface and moving at "+Math.round(speed||0)+" kt":"on the surface"):"airborne"}. Registration and HEX are read from the transponder feed. The airport board assignment is not airline-confirmed.</div>
      <div class="stats">
        <div class="stat"><small>Call sign · ADS-B</small><strong>${esc((ac.flight||"").trim()||"Not broadcast")}</strong></div>
        <div class="stat"><small>Registration</small><strong>${esc(ac.r)}</strong></div>
        <div class="stat"><small>Aircraft type</small><strong>${esc(ac.t)}</strong></div>
        <div class="stat"><small>Ground speed</small><strong>${speed===null?"—":Math.round(speed)+" kt"}</strong></div>
        <div class="stat"><small>Altitude</small><strong>${onGround?"GROUND":altitude===null?"—":Math.round(altitude).toLocaleString()+" ft"}</strong></div>
        <div class="stat"><small>ESTIMATED ARRIVAL · LOCAL</small><strong>${esc(etaLabel)}</strong></div><div class="stat"><small>LANDING IN · EST.</small><strong>${etaMinutes===null?"—":etaMinutes+" min"}</strong></div>
      </div><div class="notice">ETA is a simple live estimate from remaining great-circle distance and current ground speed; wind, routing and speed changes can alter it. ADS-B position age: ${Math.round(positionAge(ac))} seconds.</div>`;
  }
  function renderTurnaround(flight,item) {
    const ap=airport(item.destination), landing=item.landing;
    const landingLine=landing
      ?'<div class="stat"><small>Aircraft landed · local</small><strong>'+esc(fmt(landing.actual,ap.tz))+'</strong></div><div class="stat"><small>Arrival punctuality</small><strong>'+esc(punctualityText(landing.delayMinutes))+'</strong></div>'
      :item.eta
      ?'<div class="stat"><small>Estimated landing</small><strong>'+esc(item.eta.minutes)+' min · '+esc(fmt(item.eta.eta,ap.tz))+'</strong></div>'
      :'<div class="stat"><small>Landing status</small><strong>Not confirmed</strong></div>';
    const arrivalText=landing
      ?"Aircraft landed at "+fmt(landing.actual,ap.tz)+" · "+punctualityText(landing.delayMinutes)+"."
      :item.eta
      ?"The aircraft is estimated to land in "+item.eta.minutes+" minutes."
      :"The aircraft landing time is not yet available.";
    return '<div class="notice inbound-heading">🔄 THE BOY IS DOING TURNAROUND</div><div class="notice">'+esc(arrivalText)+'</div><div class="stats">'+landingLine+'<div class="stat"><small>Estimated departure · timetable</small><strong>'+esc(fmt(item.nextFlight.departure,ap.tz))+'</strong></div><div class="stat"><small>Next sector</small><strong>'+esc(item.nextFlight.flightNumber)+' · '+esc(item.nextFlight.origin)+' → '+esc(item.nextFlight.destination)+'</strong></div></div><div class="notice">Same aircraft registration '+esc(item.registration)+' is assigned to the next sector. Estimated departure is the scheduled timetable departure, not a live take-off prediction.</div>';
  }
  function render() {
    const flights=[...state.flights].sort((a,b)=>a.departure-b.departure), now=new Date();
    const missingGoogleLinks=state.googleLinks.filter(x=>!flights.some(f=>x.route===f.origin+"-"+f.destination));
    $("sectors").innerHTML=(flights.length?flights.map(f=>`<div class="flightrow"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(f.date)} · ${esc(airport(f.origin)?.name)} → ${esc(airport(f.destination)?.name)} · ${esc(f.source||"Schedule")}${f.departureEstimated||f.arrivalEstimated?" · one time estimated":""}</small></div><div class="time"><small>${f.departureEstimated?"EST. ":""}DEP · ${esc(f.origin)}</small>${f.departureEstimated?"~":""}${fmt(f.departure,airport(f.origin).tz)}<small>${f.arrivalEstimated?"EST. ":""}ARR · ${esc(f.destination)}</small>${f.arrivalEstimated?"~":""}${fmt(f.arrival,airport(f.destination).tz)}</div></div>`).join(""):`<div class="empty">No flights scheduled for this date.</div>`)+(missingGoogleLinks.length?`<div class="notice">Google fallback searches (only routes without a scheduled result): ${missingGoogleLinks.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.route)} ↗</a>`).join(" · ")}</div>`:"");
    $("sectorCount").textContent=flights.length+" SECTORS";
    const next=state.aircraftChange?.nextFlight||state.turnaround?.nextFlight||flights.find(f=>f.departure>now);
    const lastSector=flights[flights.length-1];
    const selectedIsLastSector=!!(state.selected&&lastSector&&state.selected.flight.flightNumber===lastSector.flightNumber&&state.selected.flight.date===lastSector.date&&state.selected.flight.origin===lastSector.origin&&state.selected.flight.destination===lastSector.destination);
    $("nextFlight").innerHTML=next?`<div class="flighttop"><div><div class="flightno">${esc(next.flightNumber)}</div><div class="route">${esc(next.origin)} → ${esc(next.destination)}</div></div><span class="status none">UPCOMING</span></div><div class="stats"><div class="stat"><small>${next.departureEstimated?"Estimated departure":"Scheduled departure"}</small><strong>${next.departureEstimated?"~":""}${fmt(next.departure,airport(next.origin).tz)}</strong></div><div class="stat"><small>${next.arrivalEstimated?"Estimated arrival":"Scheduled arrival"}</small><strong>${next.arrivalEstimated?"~":""}${fmt(next.arrival,airport(next.destination).tz)}</strong></div></div>`:selectedIsLastSector?`<div class="empty"><strong>YAY, THE BOY IS COMING BACK HOME! 🏡</strong><br>THE DAY IS FINISHED · FEIERABEND</div>`:`<div class="empty">No future sector in loaded timetable.</div>`;
    $("current").innerHTML=state.selected?(state.selected.aircraft?.boardOnly||landingEvidence(state.selected.flight,state.selected.aircraft)?renderBoardLanding(state.selected.flight,state.selected.aircraft):renderAircraft(state.selected.flight,state.selected.aircraft))+(state.turnaround?renderTurnaround(state.selected.flight,state.turnaround):""):`<div class="empty">No live aircraft selected. The results below distinguish live ADS-B positions from airport-board-only operational status.</div>`;
    renderAircraftChange();
    const last=storageGet();
    $("lastFlight").innerHTML=last?`<div class="flighttop"><div><div class="flightno">${esc(last.flightNumber)}</div><div class="route">${esc(last.origin)} → ${esc(last.destination)}</div></div><span class="status none">LAST AUTO-MATCHED FLIGHT</span></div><div class="stats"><div class="stat"><small>Callsign</small><strong>${esc(last.callsign)}</strong></div><div class="stat"><small>Registration</small><strong>${esc(last.registration)}</strong></div><div class="stat"><small>Aircraft type</small><strong>${esc(last.type)}</strong></div><div class="stat"><small>ICAO HEX</small><strong>${esc(last.hex)}</strong></div></div>`:`<div class="empty">No aircraft selected on this device yet.</div>`;
  }

  function historyAirportStamp(event) {
    if(!event||!Number.isFinite(Number(event.time)))return "time unavailable";
    const code=String(event.iata||event.airport||"").toUpperCase();
    const ap=airport(code), tz=ap?.tz||"UTC";
    const stamp=new Date(Number(event.time)*1000);
    return new Intl.DateTimeFormat("en-GB",{timeZone:tz,day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(stamp)+" "+(ap?code:"UTC");
  }

  function latestFlightFromTodayTrack(track) {
    const rows=Array.isArray(track?.trace)?track.trace:[];
    const base=Number(track?.timestamp);
    if(!rows.length||!Number.isFinite(base))return null;
    const airports=Object.entries(AIRPORTS).filter(([,a])=>Number.isFinite(a?.lat)&&Number.isFinite(a?.lon));
    const rad=x=>x*Math.PI/180;
    const distanceKm=(lat1,lon1,lat2,lon2)=>{
      const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
      const x=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
    };
    const points=[];
    for(const row of rows){
      if(!Array.isArray(row)||row.length<4)continue;
      const offset=Number(row[0]),lat=Number(row[1]),lon=Number(row[2]),alt=row[3],gs=Number(row[4]);
      if(!Number.isFinite(offset)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const onGround=String(alt).toLowerCase()==="ground";
      const hasAltitude=alt!==null&&alt!==undefined&&alt!=="";
      const lowAltitude=hasAltitude&&Number.isFinite(Number(alt))&&Number(alt)>=0&&Number(alt)<=500&&(!Number.isFinite(gs)||gs<=100);
      if(!onGround&&!lowAltitude)continue;
      let nearest=null,nearestKm=Infinity;
      for(const [code,ap] of airports){
        const km=distanceKm(lat,lon,ap.lat,ap.lon);
        if(km<nearestKm){nearestKm=km;nearest=code;}
      }
      if(nearest&&nearestKm<=4)points.push({airport:nearest,time:base+offset,seen:onGround?"ground":"low"});
    }
    points.sort((a,b)=>a.time-b.time);
    const clusters=[];
    for(const point of points){
      const last=clusters[clusters.length-1];
      if(last&&last.airport===point.airport&&point.time-last.lastTime<=45*60){
        last.lastTime=point.time;last.last=point;last.count++;
        if(point.seen==="ground")last.seen="ground";
      }else clusters.push({airport:point.airport,firstTime:point.time,lastTime:point.time,first:point,last:point,count:1,seen:point.seen});
    }
    const distinct=[];
    for(const cluster of clusters){
      if(!distinct.length||distinct[distinct.length-1].airport!==cluster.airport)distinct.push(cluster);
      else distinct[distinct.length-1]=cluster;
    }
    if(distinct.length<2)return null;
    const from=distinct[distinct.length-2],to=distinct[distinct.length-1];
    if(to.firstTime<=from.lastTime)return null;
    return {
      day:new Date(to.lastTime*1000).toISOString().slice(0,10),
      from:{iata:from.airport,time:from.lastTime,seen:from.seen},
      to:{iata:to.airport,time:to.firstTime,seen:to.seen},
      callsign:"",
      source:"TODAY'S ADS-B TRACK",
      inferred:true
    };
  }

  function latestGroundAirportLanding(track) {
    const rows=Array.isArray(track?.trace)?track.trace:[];
    const base=Number(track?.timestamp);
    if(!rows.length||!Number.isFinite(base))return null;
    const airports=Object.entries(AIRPORTS).filter(([,a])=>Number.isFinite(a?.lat)&&Number.isFinite(a?.lon));
    const rad=x=>x*Math.PI/180;
    const distanceKm=(lat1,lon1,lat2,lon2)=>{
      const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
      const x=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
    };
    const ground=[],airborne=[];
    for(const row of rows){
      if(!Array.isArray(row)||row.length<4)continue;
      const offset=Number(row[0]),lat=Number(row[1]),lon=Number(row[2]),alt=row[3];
      if(!Number.isFinite(offset)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const time=base+offset;
      if(String(alt).toLowerCase()==="ground"){
        let nearest=null,nearestKm=Infinity;
        for(const [code,ap] of airports){
          const km=distanceKm(lat,lon,ap.lat,ap.lon);
          if(km<nearestKm){nearestKm=km;nearest=code;}
        }
        if(nearest&&nearestKm<=4)ground.push({airport:nearest,time});
      }else if(Number.isFinite(Number(alt))&&Number(alt)>500){
        airborne.push(time);
      }
    }
    if(!ground.length||!airborne.length)return null;
    ground.sort((a,b)=>a.time-b.time);
    airborne.sort((a,b)=>a-b);
    const clusters=[];
    for(const point of ground){
      const last=clusters[clusters.length-1];
      if(last&&last.airport===point.airport&&point.time-last.lastTime<=45*60){
        last.lastTime=point.time;
      }else clusters.push({airport:point.airport,firstTime:point.time,lastTime:point.time});
    }
    const latest=clusters[clusters.length-1];
    const lastAirborne=airborne[airborne.length-1];
    if(!latest||latest.firstTime<=lastAirborne)return null;
    return {
      landingOnly:true,airport:latest.airport,time:latest.firstTime,
      eventTime:latest.lastTime,seen:"ground",
      day:new Date(latest.firstTime*1000).toISOString().slice(0,10)
    };
  }


  function latestEstimatedAirportLanding(track) {
    const rows=Array.isArray(track?.trace)?track.trace:[];
    const base=Number(track?.timestamp);
    if(rows.length<3||!Number.isFinite(base))return null;
    const points=rows.filter(row=>Array.isArray(row)&&row.length>=4&&Number.isFinite(Number(row[0]))&&Number.isFinite(Number(row[1]))&&Number.isFinite(Number(row[2]))&&Number.isFinite(Number(row[3]))&&Number(row[3])>500)
      .map(row=>({time:base+Number(row[0]),lat:Number(row[1]),lon:Number(row[2]),alt:Number(row[3])}));
    if(points.length<3)return null;
    const last=points[points.length-1],previous=points[points.length-2],before=points[points.length-3];
    if(last.time<=previous.time||previous.time<=before.time)return null;
    if(last.alt<500||last.alt>4000||last.alt>=previous.alt||previous.alt>before.alt)return null;
    const rad=x=>x*Math.PI/180;
    const distanceKm=(p,ap)=>{
      const dLat=rad(ap.lat-p.lat),dLon=rad(ap.lon-p.lon);
      const x=Math.sin(dLat/2)**2+Math.cos(rad(p.lat))*Math.cos(rad(ap.lat))*Math.sin(dLon/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
    };
    const airports=Object.entries(AIRPORTS).filter(([,ap])=>Number.isFinite(ap?.lat)&&Number.isFinite(ap?.lon));
    let nearest=null,lastKm=Infinity,previousKm=Infinity;
    for(const [code,ap] of airports){
      const km=distanceKm(last,ap),prevKm=distanceKm(previous,ap);
      if(km<lastKm){nearest=code;lastKm=km;previousKm=prevKm;}
    }
    if(!nearest||lastKm>20||previousKm-lastKm<0.15)return null;
    const minutes=Math.max(2,Math.min(8,Math.round(lastKm/220*60)));
    const estimatedTime=last.time+minutes*60;
    return {estimatedLanding:true,airport:nearest,time:estimatedTime,eventTime:estimatedTime,observedTime:last.time,day:new Date(estimatedTime*1000).toISOString().slice(0,10),source:"ADS-B descent estimate"};
  }

  function latestNueBoardFlight(board,registration) {
    const key=String(registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const nowMs=Date.now();
    const rows=Array.isArray(board?.flights)?board.flights:[];
    const matches=rows.filter(row=>{
      const reg=String(row?.registration||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
      if(!key||reg!==key)return false;
      if(!/^[A-Z]{3}$/.test(row.origin||"")||!/^[A-Z]{3}$/.test(row.destination||""))return false;
      if(/cancel|divert/i.test(String(row.status||"")))return false;
      const scheduled=Date.parse(row.scheduledTime||"");
      const actual=Date.parse(row.statusTime||"");
      const actualStatus=/departed|take.?off|airborne|landed|arrived|started/i.test(String(row.status||""));
      const eventMs=actualStatus&&Number.isFinite(actual)?actual:scheduled;
      return Number.isFinite(eventMs)&&eventMs<=nowMs+10*60000;
    }).map(row=>{
      const actual=Date.parse(row.statusTime||"");
      const scheduled=Date.parse(row.scheduledTime||"");
      const actualStatus=/departed|take.?off|airborne|landed|arrived|started/i.test(String(row.status||""));
      const eventMs=actualStatus&&Number.isFinite(actual)?actual:scheduled;
      return {
        day:row.date||new Date(eventMs).toISOString().slice(0,10),
        from:{iata:row.origin,time:eventMs/1000,seen:"board"},
        to:{iata:row.destination,time:eventMs/1000,seen:"board"},
        callsign:row.flightNumber||"",
        status:row.status||"Scheduled",
        direction:row.direction||"",
        board:true,
        actual:actualStatus&&Number.isFinite(actual),
        eventTime:eventMs/1000
      };
    }).sort((x,y)=>y.eventTime-x.eventTime);
    return matches[0]||null;
  }

  async function loadRegistrationHistories(items) {
    state.registrationHistory=[];
    const unique=new Map();
    for(const item of items){
      if(!item?.aircraft?.boardOnly)continue;
      const registration=String(item.aircraft.r||item.aircraft.boardRow?.registration||"").toUpperCase().trim();
      const key=registration.replace(/[^A-Z0-9]/g,"");
      if(key&&!unique.has(key))unique.set(key,registration);
    }
    const targets=[...unique.entries()].slice(0,2);
    await loadAirportCatalogue();
    const results=await Promise.allSettled(targets.map(([key,registration])=>get("/api/flight-reg?reg="+encodeURIComponent(registration)).then(data=>({key,registration,data}))));
    for(let i=0;i<results.length;i++){
      const result=results[i];
      if(result.status==="fulfilled")state.registrationHistory.push(result.value);
      else state.registrationHistory.push({key:targets[i][0],registration:targets[i][1],error:result.reason?.message||"History lookup failed"});
    }
    const localNow=new Date();
    const today=[localNow.getFullYear(),String(localNow.getMonth()+1).padStart(2,"0"),String(localNow.getDate()).padStart(2,"0")].join("-");
    let board=null;
    try{board=await get("/api/daily-board?date="+today);}catch(error){state.nueBoardError=error?.message||"Nuremberg board unavailable";}
    await Promise.all(state.registrationHistory.map(async item=>{
      const icao=String(item.data?.icao||"").toLowerCase();
      if(item.error)return;
      item.latestBoard=latestNueBoardFlight(board,item.data?.r||item.registration);
      if(!/^[0-9a-f]{6}$/.test(icao))return;
      try{
        const track=await get("/api/history?icao="+encodeURIComponent(icao)+"&date="+today);
        const latest=latestFlightFromTodayTrack(track);
        if(latest)item.latestToday=latest;
        const landing=latestGroundAirportLanding(track);
        if(landing)item.latestTodayLanding=landing;
        const estimate=latestEstimatedAirportLanding(track);
        if(estimate)item.latestTodayEstimatedLanding=estimate;
      }catch(error){
        item.todayTrackError=error?.message||"Today's track unavailable";
      }
    }));
    renderAircraftHistory();
  }
  function renderAircraftHistory() {
    const section=$("aircraftHistorySection"),content=$("aircraftHistoryContent");
    if(!section||!content)return;
    if(!state.registrationHistory.length){section.hidden=true;content.innerHTML="";return;}
    section.hidden=false;
    content.innerHTML=state.registrationHistory.map(item=>{
      if(item.error)return '<div class="notice">History for '+esc(item.registration)+': '+esc(item.error)+'</div>';
      const data=item.data||{},all=Array.isArray(data.flights)?data.flights:[];
      const complete=all.filter(f=>{
        const from=String(f?.from?.iata||"").toUpperCase(),to=String(f?.to?.iata||"").toUpperCase();
        const duration=Number(f?.duration_min),arrival=Number(f?.to?.time||f?.last_seen);
        return /^[A-Z]{3}$/.test(from)&&/^[A-Z]{3}$/.test(to)&&from!==to&&Number.isFinite(duration)&&duration>=25&&duration<=600&&Number.isFinite(arrival);
      }).sort((a,b)=>Number(b.to?.time||b.last_seen)-Number(a.to?.time||a.last_seen));
      const latest=[item.latestTodayLanding,item.latestTodayEstimatedLanding,item.latestToday,item.latestBoard,complete[0]].filter(Boolean).sort((a,b)=>Number(b.eventTime||b.to?.time||b.last_seen||0)-Number(a.eventTime||a.to?.time||a.last_seen||0))[0]||null;
      const registration=data.r||item.registration;
      const coverage=data.coverage||{};
      const today=data.today||{};
      let latestHtml='<div class="empty">No complete flight is available in the returned history.</div>';
      if(latest){
        const from=(latest.landingOnly||latest.estimatedLanding)?"":latest.from.iata,to=(latest.landingOnly||latest.estimatedLanding)?latest.airport:latest.to.iata;
        const seen=latest.landingOnly?"ADS-B GROUND":latest.estimatedLanding?"ESTIMATED FROM ADS-B DESCENT":latest.board?"NUE BOARD · "+String(latest.status||"SCHEDULED").toUpperCase()+(latest.actual?" · ACTUAL STATUS":" · SCHEDULED TIME"):String(latest.to.seen||"unknown").toUpperCase();
        const arrivalTime=Number((latest.landingOnly||latest.estimatedLanding)?latest.time:latest.to.time||latest.last_seen)*1000;
        const ageMs=Math.max(0,Date.now()-arrivalTime);
        const age=ageMs<3600000?Math.max(1,Math.round(ageMs/60000))+" min ago":ageMs<86400000?Math.round(ageMs/3600000)+" h ago":Math.floor(ageMs/86400000)+" days ago";
        const call=String(latest.callsign||"").trim();
        latestHtml='<div class="history-flight latest-history-flight"><div><b>'+((latest.landingOnly||latest.estimatedLanding)?'LANDED '+esc(to):esc(from)+' → '+esc(to))+'</b><small>'+esc(latest.day||"Date unavailable")+(call?" · "+esc(call):"")+'</small><small>'+(latest.estimatedLanding?'Estimated landing: ~'+new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(latest.time*1000))+' UTC':latest.landingOnly?'Ground observation: '+esc(historyAirportStamp({iata:to,time:latest.time})):latest.board?'Board event: '+esc(historyAirportStamp(latest.direction==="arrival"?latest.to:latest.from))+' ('+esc(latest.direction||"movement")+')':esc(historyAirportStamp(latest.from))+' → '+esc(historyAirportStamp(latest.to)))+'</small><small>'+ (latest.landingOnly?'ADS-B GROUND · ':latest.estimatedLanding?'ADS-B DESCENT ESTIMATE · ':latest.board?'NUE board event: ':'Airport observation: ') +esc(seen)+' · '+esc(age)+'</small>'+(latest.landingOnly?'<small>Source: FlyItalyADSB · first recorded ground point at the airport; not the exact touchdown timestamp.</small>':latest.estimatedLanding?'<small>Estimated from the last descending ADS-B position and distance to the airport; not a confirmed landing.</small>':latest.inferred?'<small>Route inferred from current-day ADS-B track and airport proximity; not an airline movement record.</small>':latest.board?'<small>Source: Nuremberg Airport daily board · '+(latest.actual?'actual event status':'scheduled board time')+'</small>':'')+'</div></div>';
      }
      const note=latest?.estimatedLanding?"Estimated landing only: based on the final descending ADS-B observations, approach direction and approximate distance to the airport. It is not confirmation that the aircraft landed.":latest?.landingOnly?"Landing is based on the first recorded ADS-B ground point within 4 km of the airport, after the aircraft's last airborne point; it is an observed ground-arrival time, not an exact touchdown timestamp.":latest?.board?"Nuremberg Airport daily board matched by aircraft registration. Actual event status is shown only when the board publishes it; otherwise the displayed time is scheduled.":latest?.inferred?"Today's route is inferred from the current-day ADS-B track and nearby airport observations; times are not guaranteed takeoff or touchdown timestamps.":"Historical ADS-B-derived observations, not an airline movement log; the archive is updated nightly and may not include today's movements.";
      return '<div class="history-aircraft"><div class="flighttop"><div><div class="flightno">'+esc(registration)+'</div><div class="muted">ICAO HEX '+esc(data.icao||"—")+' · HISTORY '+esc(coverage.from||"—")+' to '+esc(coverage.to||"—")+'</div></div><span class="status none">'+(latest?.landingOnly?"TODAY · ADS-B LANDING":latest?.estimatedLanding?"TODAY · ESTIMATED LANDING":latest?.board?"TODAY · NUE BOARD":latest?.inferred?"TODAY · ADS-B TRACK":"LATEST ARCHIVE")+'</span></div>'+latestHtml+'<div class="notice">'+esc(note)+'</div></div>';
    }).join("");
  }

  function renderCandidates(items,message="No flight or aircraft status found for the selected date and route.") {
    const el=$("candidates");
    if (!items.length) { el.className="inbound-result"; el.innerHTML='<div class="empty inbound-empty">'+esc(message)+'</div>'+renderInboundAircraft(); return; }
    el.className="candidate-list";
    el.innerHTML=items.map((item,i)=>{
      const f=item.flight, ac=item.aircraft;
      const dateLabel=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${f.date}T12:00:00Z`));
      const dep=fmt(f.departure,airport(f.origin).tz), arr=fmt(f.arrival,airport(f.destination).tz);
      if(ac.boardOnly){
        const row=ac.boardRow||{},ev=ac.boardEvidence||{};
        const time=x=>x?.scheduledLocalTime||x?.statusTimeLocal||"time unavailable";
        const delay=x=>Number.isFinite(x?.delayMinutes)?(Math.abs(x.delayMinutes)<=5?"ON TIME":x.delayMinutes>0?x.delayMinutes+" min late":Math.abs(x.delayMinutes)+" min early"):"";
        const previous=ev.previousRow?(`PREVIOUS: ${ev.previousRow.flightNumber} ${ev.previousRow.origin}→${ev.previousRow.destination} · ${time(ev.previousRow)} · ${ev.previousRow.status||"status unavailable"} ${delay(ev.previousRow)}`):"";
        const next=ev.nextRow?(`NEXT: ${ev.nextRow.flightNumber} ${ev.nextRow.origin}→${ev.nextRow.destination} · ${time(ev.nextRow)} · ${ev.nextRow.status||"status unavailable"} ${delay(ev.nextRow)}`):"";
        const boardStatus=[row.status||"Status unavailable",row.statusTimeLocal?"board time "+row.statusTimeLocal:"",row.scheduledLocalTime?"scheduled "+row.scheduledLocalTime:"",delay(row)].filter(Boolean).join(" · ");
        const swap=ev.destinationSwap?"<br>Different registration assigned to the opposite-direction sector: "+esc(ev.oppositeFlight)+" · "+esc(ev.oppositeRegistration):"";
        return `<div class="candidate"><div class="flighttop"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(dateLabel)} · DEP ${esc(dep)} · ARR ${esc(arr)}</small></div><span class="status none">AIRPORT BOARD ONLY</span></div><small>BOARD REGISTRATION: ${esc(ac.r||row.registration||"Not published")} · BOARD STATUS: ${esc(boardStatus)}<br>ADS-B: ${esc(ac.boardReason)}<br>${esc(previous)}<br>${esc(next)}${swap}<br>Source: Nuremberg Airport. No live aircraft position is being claimed.</small></div>`;
      }
      const confidence="LIVE ADS-B · BOARD REGISTRATION MATCH";
      const boardChain=ac.boardEvidence?" · AIRPORT BOARD REGISTRATION "+esc(ac.boardEvidence.registration)+(ac.boardEvidence.previousFlight?" · PREVIOUS "+esc(ac.boardEvidence.previousFlight):"")+(ac.boardEvidence.nextFlight?" · NEXT "+esc(ac.boardEvidence.nextFlight):"")+(ac.boardEvidence.destinationSwap?" · SWAP AT "+esc(f.destination)+": "+esc(ac.boardEvidence.oppositeFlight)+" assigned "+esc(ac.boardEvidence.oppositeRegistration):""):"";
      const evidence=`${Math.round(positionAge(ac))}s since last position · ${esc(ac.source||"FlyItalyADSB")}${boardChain}`;
      return `<div class="candidate"><div class="flighttop"><div><b>${esc(f.flightNumber)} · ${esc(f.origin)} → ${esc(f.destination)}</b><small>${esc(dateLabel)} · DEP ${esc(dep)} · ARR ${esc(arr)}</small></div><span class="status none">${esc(confidence)}</span></div><small>${esc((ac.flight||"").trim()||"Callsign not broadcast")} · ${esc(ac.t||"Type unavailable")} · ${esc(ac.r||"Registration unknown")} · HEX ${esc(ac.hex)} · GS ${numeric(ac.gs)===null?"—":Math.round(numeric(ac.gs))+" kt"} · ALT ${ac.alt_baro==="ground"?"GROUND":numeric(ac.alt_baro)===null?"—":Math.round(numeric(ac.alt_baro))+" ft"} · ${evidence}<br>Automatically matched from the NUE airport-board registration and live ADS-B response. Assignment is not airline-confirmed.</small></div>`;
    }).join("");
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
    state.flights=[]; state.candidates=[]; state.selected=null; state.inboundAircraft=null; state.aircraftChange=null; state.turnaround=null; renderAircraftChange(); state.googleLinks=[]; state.observed=[]; state.scheduleDiagnostics=[]; state.dailyBoard=null; state.registrationHistory=[]; renderAircraftHistory();
    $("candidates").className="empty"; $("candidates").textContent="Reading the NUE flight board, then querying ADS-B directly by aircraft registration…";
    $("connection").textContent="Checking Nuremberg Airport board…"; $("lastUpdated").textContent="SEARCHING";
    try {
      const boardResult=await loadDailyBoard(date).catch(error=>{console.warn("Daily NUE board unavailable",error);return null;});
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
      if(date!==today){
        renderCandidates([],"Historical live ADS-B lookup is not enabled. The timetable is available, but no current position is queried for a past date.");
        $("connection").textContent="Timetable loaded · live registration lookup is only available for today";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if(scheduleErrors.length)showError(scheduleErrors.join("\\n"));
        return;
      }
      const nowMs=Date.now();
      const searchFlights=state.flights.filter(f=>nowMs>=f.departure.getTime()-90*60000&&nowMs<=f.arrival.getTime()+180*60000);
      const registrationCache=new Map();
      if(!searchFlights.length){
        await findInboundAircraft(state.flights,registrationCache);
        renderCandidates([],"No current or recently landed flight found for the selected route.");
        $("connection").textContent="Timetable loaded · no selected-route aircraft inside the live tracking window";
        $("lastUpdated").textContent="SCHEDULE UPDATED";
        if(scheduleErrors.length)showError(scheduleErrors.join("\\n"));
        return;
      }
      $("connection").textContent="NUE board registrations found · querying FlyItalyADSB by registration…";
      const results=await Promise.allSettled(searchFlights.map(f=>identifyFlightByRegistration(f,registrationCache)));
      const final=[];
      const lookupErrors=[];
      results.forEach((r,i)=>{
        if(r.status==="fulfilled")final.push(r.value);
        else lookupErrors.push(`${searchFlights[i].flightNumber}: ${r.reason?.message||"registration lookup failed"}`);
      });
      state.candidates=final;
      await loadRegistrationHistories(final);
      const now=new Date();
      const live=final.filter(item=>!item.aircraft.boardOnly);
      const airborne=live.filter(item=>{
        const f=item.flight, ac=item.aircraft, altitude=numeric(ac.alt_baro), speed=numeric(ac.gs);
        const inbound=ac.boardEvidence?.previousRow, inboundArrival=Date.parse(inbound?.scheduledTime||"");
        const stillOnInboundLeg=inbound?.destination===f.origin&&Number.isFinite(inboundArrival)&&nowMs>=inboundArrival-180*60000&&nowMs<=inboundArrival+30*60000;
        return !stillOnInboundLeg&&altitude!==null&&altitude>1500&&speed!==null&&speed>=100&&nowMs>=f.departure.getTime()-20*60000&&nowMs<=f.arrival.getTime()+30*60000;
      }).sort((a,b)=>Math.abs(a.flight.arrival.getTime()-nowMs)-Math.abs(b.flight.arrival.getTime()-nowMs));
      const ground=live.filter(item=>{
        const f=item.flight, ac=item.aircraft, lat=numeric(ac.lat), lon=numeric(ac.lon);
        return ac.alt_baro==="ground"&&f.origin==="NUE"&&nowMs>=f.departure.getTime()-90*60000&&nowMs<=f.departure.getTime()+20*60000&&lat!==null&&lon!==null&&hav(airport("NUE"),{lat,lon})<=5;
      }).sort((a,b)=>a.flight.departure-b.flight.departure);
      const automatic=airborne[0]||ground[0]||null;
      let historyLandedCandidate=null;
      if(!automatic){
        const possibleHistory=final.filter(item=>!landingEvidence(item.flight,item.aircraft)&&item.flight.arrival.getTime()<=Date.now()+15*60000&&Date.now()-item.flight.arrival.getTime()<=180*60000)
          .sort((a,b)=>Math.abs(Date.now()-a.flight.arrival.getTime())-Math.abs(Date.now()-b.flight.arrival.getTime())).slice(0,2);
        for(const item of possibleHistory){
          const reg=item.aircraft.r||item.aircraft.boardRow?.registration;
          const history=await observedArrivalForRegistration(reg,item.flight.destination,item.flight.arrival,registrationCache);
          if(history?.seen==="ground"){item.aircraft.observedLanding=history;historyLandedCandidate=item;break;}
        }
      }
      const landedCandidate=automatic?null:final.filter(item=>landingEvidence(item.flight,item.aircraft))
        .sort((a,b)=>Math.abs(Date.now()-landingEvidence(a.flight,a.aircraft).actual.getTime())-Math.abs(Date.now()-landingEvidence(b.flight,b.aircraft).actual.getTime()))[0]||historyLandedCandidate;
      const boardCurrentCandidate=automatic||landedCandidate?null:final.filter(item=>item.flight.departure.getTime()<=Date.now()+20*60000&&item.flight.arrival.getTime()>=Date.now()-180*60000)
        .sort((a,b)=>Math.abs(Date.now()-a.flight.arrival.getTime())-Math.abs(Date.now()-b.flight.arrival.getTime()))[0]||null;
      if(automatic)saveSelected(automatic.flight,automatic.aircraft);
      else if(landedCandidate)state.selected=landedCandidate;
      else if(boardCurrentCandidate)state.selected=boardCurrentCandidate;
      else state.selected=null;
      const operationalCurrent=automatic||landedCandidate||boardCurrentCandidate;
      if(operationalCurrent)await findAircraftChange(operationalCurrent,registrationCache);
      if(!operationalCurrent)await findInboundAircraft(state.flights,registrationCache);
      const liveCount=final.filter(item=>!item.aircraft.boardOnly).length;
      const boardOnlyCount=final.length-liveCount;
      renderCandidates(final,final.length?"":"No live aircraft match for the selected route yet.");
      render();
      $("lastUpdated").textContent="UPDATED "+fmt(new Date(),"Europe/Berlin");
      $("connection").textContent=`${liveCount} live registration match(es) · ${boardOnlyCount} airport-board-only status(es) · no geographic aircraft matching`;
      if(scheduleErrors.length||lookupErrors.length)showError([...scheduleErrors,...lookupErrors].join("\\n"));
      if(!boardResult)$("connection").textContent+=" · full daily board unavailable; route timetable fallback used";
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
