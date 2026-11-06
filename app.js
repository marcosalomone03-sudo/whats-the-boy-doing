(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const ROUTE_RE = /^[A-Z]{3}(?:-[A-Z]{3})?$/;
  const AIRPORTS = {
    NUE:{name:"Nuremberg",tz:"Europe/Berlin"}, BUD:{name:"Budapest",tz:"Europe/Budapest"},
    ALC:{name:"Alicante",tz:"Europe/Madrid"}, STN:{name:"London Stansted",tz:"Europe/London"},
    DUB:{name:"Dublin",tz:"Europe/Dublin"}, PMI:{name:"Palma de Mallorca",tz:"Europe/Madrid"},
    GOT:{name:"Gothenburg",tz:"Europe/Stockholm"}, ARN:{name:"Stockholm Arlanda",tz:"Europe/Stockholm"},
    VIE:{name:"Vienna",tz:"Europe/Vienna"}, BCN:{name:"Barcelona",tz:"Europe/Madrid"},
    FCO:{name:"Rome Fiumicino",tz:"Europe/Rome"}, MXP:{name:"Milan Malpensa",tz:"Europe/Rome"},
    BGY:{name:"Milan Bergamo",tz:"Europe/Rome"}, MAN:{name:"Manchester",tz:"Europe/London"},
    LTN:{name:"London Luton",tz:"Europe/London"}, EDI:{name:"Edinburgh",tz:"Europe/London"},
    CRL:{name:"Brussels Charleroi",tz:"Europe/Brussels"}, KRK:{name:"Krakow",tz:"Europe/Warsaw"},
    WRO:{name:"Wroclaw",tz:"Europe/Warsaw"}, BRI:{name:"Bari",tz:"Europe/Rome"},
    CTA:{name:"Catania",tz:"Europe/Rome"}, NAP:{name:"Naples",tz:"Europe/Rome"},
    OPO:{name:"Porto",tz:"Europe/Lisbon"}, LIS:{name:"Lisbon",tz:"Europe/Lisbon"},
    AGP:{name:"Malaga",tz:"Europe/Madrid"}, SVQ:{name:"Seville",tz:"Europe/Madrid"},
    MAD:{name:"Madrid",tz:"Europe/Madrid"}, BER:{name:"Berlin",tz:"Europe/Berlin"},
    HAM:{name:"Hamburg",tz:"Europe/Berlin"}, FRA:{name:"Frankfurt",tz:"Europe/Berlin"},
    MUC:{name:"Munich",tz:"Europe/Berlin"}, ZRH:{name:"Zurich",tz:"Europe/Zurich"},
    CPH:{name:"Copenhagen",tz:"Europe/Copenhagen"}, OSL:{name:"Oslo",tz:"Europe/Oslo"},
    BGO:{name:"Bergen",tz:"Europe/Oslo"}, HEL:{name:"Helsinki",tz:"Europe/Helsinki"},
    GDN:{name:"Gdansk",tz:"Europe/Warsaw"}, WAW:{name:"Warsaw",tz:"Europe/Warsaw"},
    PRG:{name:"Prague",tz:"Europe/Prague"}, LPA:{name:"Gran Canaria",tz:"Atlantic/Canary"},
    TFS:{name:"Tenerife South",tz:"Atlantic/Canary"}, RAK:{name:"Marrakech",tz:"Africa/Casablanca"}
  };
  const state = { flights:[], observations:[], active:null, last:null, errors:[] };
  const now = new Date();
  $("flightDate").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  function localParts(date, tz) {
    const parts = new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
    return Object.fromEntries(parts.map(p=>[p.type,p.value]));
  }
  function dateAtAirport(dateString, timeString, airport) {
    // Convert an airport-local wall clock to an absolute timestamp, accounting for DST.
    const [y,m,d] = dateString.split("-").map(Number);
    const [hh,mm] = timeString.split(":").map(Number);
    const target = Date.UTC(y,m-1,d,hh,mm);
    let guess = target;
    for(let i=0;i<3;i++){
      const p = localParts(new Date(guess), airport.tz);
      const represented = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
      guess += target-represented;
    }
    return new Date(guess);
  }
  function airport(code){return AIRPORTS[code] || {name:code,tz:"Europe/Berlin"}}
  function routesFor(input){
    const parts=input.split("-");
    return parts.length===1 ? [[ "NUE",parts[0] ],[parts[0],"NUE"]] :
      [["NUE",parts[0]],[parts[0],"NUE"],["NUE",parts[1]],[parts[1],"NUE"]];
  }
  function fmtTime(date, tz){
    if(!date || Number.isNaN(+date)) return "—";
    return new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
  }
  function fmtDateTime(date){
    if(!date) return "—";
    return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date);
  }
  function safeText(v){return v===null||v===undefined||v===""?"—":String(v)}
  async function fetchJson(url, timeout=12000){
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const r=await fetch(url,{headers:{"Accept":"application/json"},signal:controller.signal,cache:"no-store"});
      if(!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
      return await r.json();
    } finally {clearTimeout(timer)}
  }
  function normalizeSchedule(json, origin, destination, dateString){
    const result=[];
    const wantedDay=Number(dateString.slice(-2));
    const days=Array.isArray(json?.days)?json.days:[];
    for(const dayEntry of days){
      if(Number(dayEntry.day)!==wantedDay) continue;
      const list=Array.isArray(dayEntry.flights)?dayEntry.flights:[];
      for(const f of list){
        const dep=f.departureTime || f.departureLocalTime || f.departureDateTime?.slice(11,16);
        const arr=f.arrivalTime || f.arrivalLocalTime || f.arrivalDateTime?.slice(11,16);
        const carrier=f.carrierCode || f.carrier || "FR";
        const number=f.number || f.flightNumber || f.flightNo;
        if(!dep || !arr || !number) continue;
        result.push({origin,destination,flightNumber:`${carrier}${number}`.replace(/\s/g,"").toUpperCase(),departureLocal:dep.slice(0,5),arrivalLocal:arr.slice(0,5),date:dateString,
          departure:dateAtAirport(dateString,dep.slice(0,5),airport(origin)),
          arrival:dateAtAirport(dateString,arr.slice(0,5),airport(destination)),source:"Ryanair timetable"});
      }
    }
    // Some schedule responses return a flat list of route objects with legs.
    if(!result.length && Array.isArray(json)){
      for(const item of json) for(const leg of (item.legs||[item])){
        const dep=leg.departureDateTime, arr=leg.arrivalDateTime;
        if(!dep||!arr) continue;
        const depD=dep.slice(0,10), arrD=arr.slice(0,10);
        if(depD!==dateString) continue;
        result.push({origin,destination,flightNumber:leg.flightNumber||item.flightNumber||"FR?",departureLocal:dep.slice(11,16),arrivalLocal:arr.slice(11,16),
          date:dateString,departure:dateAtAirport(dateString,dep.slice(11,16),airport(origin)),arrival:dateAtAirport(arrD,arr.slice(11,16),airport(destination)),source:"Ryanair timetable"});
      }
    }
    return result;
  }
  async function loadRoute(origin,destination,dateString){
    const [y,m]=dateString.split("-");
    const url=`https://services-api.ryanair.com/timtbl/3/schedules/${origin}/${destination}/years/${y}/months/${Number(m)}`;
    const data=await fetchJson(url);
    return normalizeSchedule(data,origin,destination,dateString);
  }
  function callsignFor(flightNumber){
    const m=flightNumber.match(/^FR(\d+[A-Z]?)$/i);
    return m?`RYR${m[1]}`:null;
  }
  async function trackFlight(flight){
    const callsign=callsignFor(flight.flightNumber);
    if(!callsign) return null;
    const data=await fetchJson(`https://api.adsb.lol/v2/callsign/${encodeURIComponent(callsign)}`);
    const ac=(data.ac||[]).filter(a=>(a.flight||"").trim().toUpperCase()===callsign);
    if(!ac.length) return null;
    ac.sort((a,b)=>(a.seen??999)-(b.seen??999));
    const a=ac[0];
    if((a.seen??999)>120) return null;
    const onGround=a.alt_baro==="ground" || a.alt_baro===null || a.alt_baro===undefined;
    return {flightNumber:flight.flightNumber,callsign,registration:a.r||null,icao:a.hex||null,type:a.t||null,
      groundSpeed:Number.isFinite(a.gs)?a.gs:null,altitude:Number.isFinite(a.alt_baro)?a.alt_baro:null,
      onGround,lat:a.lat??null,lon:a.lon??null,seen:a.seen??null,seenPos:a.seen_pos??null,
      observedAt:new Date(Date.now()-((a.seen??0)*1000)).toISOString()};
  }
  function saveHistory(obs, flight){
    const key="wtbd-history-v1";
    let hist=[];try{hist=JSON.parse(localStorage.getItem(key)||"[]")}catch{}
    const old=hist.find(x=>x.flightNumber===flight.flightNumber && x.date===flight.date);
    const entry={flightNumber:flight.flightNumber,origin:flight.origin,destination:flight.destination,date:flight.date,
      registration:obs.registration,icao:obs.icao,type:obs.type,lastSeen:obs.observedAt,onGround:obs.onGround,
      scheduledArrival:flight.arrival?.toISOString()||null,updatedAt:new Date().toISOString()};
    if(old) Object.assign(old,entry); else hist.unshift(entry);
    localStorage.setItem(key,JSON.stringify(hist.slice(0,30)));
  }
  function loadLast(){
    try{return JSON.parse(localStorage.getItem("wtbd-history-v1")||"[]")[0]||null}catch{return null}
  }
  function setError(message){const el=$("error");el.style.display=message?"block":"none";el.textContent=message||""}
  function renderFlightCard(f,obs,tag){
    const o=airport(f.origin),d=airport(f.destination);
    const badge=obs?(obs.onGround?"ON GROUND":"AIRBORNE"):"SCHEDULED";
    return `<div class="flighttop"><div><div class="flightno">${safeText(f.flightNumber)}</div><div class="route">${f.origin} <span style="color:var(--cyan)">→</span> ${f.destination}</div><div class="muted" style="font-size:11px;margin-top:4px">${o.name} → ${d.name}</div></div><span class="status ${obs?(obs.onGround?"ground":"air"):"none"}">${badge}</span></div>
      <div class="stats">
      <div class="stat"><small>Scheduled departure</small><strong>${fmtTime(f.departure,o.tz)}</strong></div>
      <div class="stat"><small>Scheduled arrival</small><strong>${fmtTime(f.arrival,d.tz)}</strong></div>
      <div class="stat"><small>Registration</small><strong>${safeText(obs?.registration)}</strong></div>
      <div class="stat"><small>Aircraft type</small><strong>${safeText(obs?.type)}</strong></div>
      <div class="stat"><small>Ground speed</small><strong>${obs?.groundSpeed!=null?Math.round(obs.groundSpeed)+" kt":"—"}</strong></div>
      <div class="stat"><small>Altitude</small><strong>${obs?.altitude!=null?Math.round(obs.altitude).toLocaleString()+" ft":(obs?.onGround?"GROUND":"—")}</strong></div>
      <div class="stat"><small>ADS-B observed</small><strong>${obs?fmtDateTime(new Date(obs.observedAt)):"—"}</strong></div>
      <div class="stat"><small>Delay / arrival</small><strong>Not verified</strong></div></div>
      <div class="notice">Tracking status is based on the latest public ADS-B position. It is not an airline-confirmed operational status.</div>`;
  }
  function render(){
    const now=new Date();
    const flights=[...state.flights].sort((a,b)=>a.departure-b.departure);
    const active=state.active;
    $("current").innerHTML=active?renderFlightCard(active.flight,active.obs):`<div class="empty">No matching active aircraft found right now.</div>`;
    const last=state.last||loadLast();
    $("lastFlight").innerHTML=last?`<div class="flighttop"><div><div class="flightno">${safeText(last.flightNumber)}</div><div class="route">${last.origin} → ${last.destination}</div></div><span class="status ground">LAST SEEN</span></div><div class="stats"><div class="stat"><small>Registration</small><strong>${safeText(last.registration)}</strong></div><div class="stat"><small>Aircraft</small><strong>${safeText(last.type)}</strong></div><div class="stat"><small>Last ADS-B observation</small><strong>${last.lastSeen?fmtDateTime(new Date(last.lastSeen)):"—"}</strong></div><div class="stat"><small>Landing time</small><strong>Not confirmed</strong></div></div><div class="notice">This is the most recent flight observation saved by this app on this device. Last seen on ground is not proof of touchdown time.</div>`:`<div class="empty">No completed flight saved on this device yet.</div>`;
    const next=flights.find(f=>f.departure>now && (!active || f.flightNumber!==active.flight.flightNumber));
    $("nextFlight").innerHTML=next?`<div class="flighttop"><div><div class="flightno">${next.flightNumber}</div><div class="route">${next.origin} → ${next.destination}</div></div><span class="status none">UPCOMING</span></div><div class="stats"><div class="stat"><small>Next takeoff expected at</small><strong>${fmtTime(next.departure,airport(next.origin).tz)}</strong></div><div class="stat"><small>Airport local date</small><strong>${next.date}</strong></div></div>`:`<div class="empty">No later scheduled sector found in the loaded timetable.</div>`;
    $("sectors").innerHTML=flights.length?flights.map(f=>`<div class="flightrow"><div><b>${f.flightNumber} · ${f.origin} → ${f.destination}</b><small>${airport(f.origin).name} → ${airport(f.destination).name}</small></div><div class="time">${fmtTime(f.departure,airport(f.origin).tz)}<small style="display:block;color:var(--muted);font-weight:400">arr ${fmtTime(f.arrival,airport(f.destination).tz)}</small></div></div>`).join(""):`<div class="empty">No timetable loaded.</div>`;
    $("sectorCount").textContent=`${flights.length} SECTORS`;
  }
  async function run(){
    setError("");
    const route=$("route").value.trim().toUpperCase().replace(/\s+/g,"");
    const dateString=$("flightDate").value;
    if(!ROUTE_RE.test(route)){setError("Invalid input. Enter one code (BUD) or two codes separated by a hyphen (BUD-ALC).");return}
    if(!dateString){setError("Choose a duty date.");return}
    const btn=$("track");btn.disabled=true;btn.textContent="LOADING TIMETABLE…";
    $("connection").textContent="Connecting to public flight timetable…";
    state.flights=[];state.active=null;state.errors=[];
    const routes=routesFor(route);
    const results=await Promise.allSettled(routes.map(([o,d])=>loadRoute(o,d,dateString)));
    results.forEach((r,i)=>{if(r.status==="fulfilled")state.flights.push(...r.value);else state.errors.push(`${routes[i][0]}-${routes[i][1]} timetable: ${r.reason.message}`)});
    state.flights.sort((a,b)=>a.departure-b.departure);
    if(!state.flights.length){
      const msg=state.errors.length?`Could not load the public timetable.\n${state.errors.join("\n")}\n\nThis may be a temporary API, CORS or network restriction. No flight data has been invented.`:"The timetable returned no scheduled flights for these routes and date.";
      setError(msg);$("connection").textContent="Timetable unavailable or empty";render();btn.disabled=false;btn.textContent="TRACK MY DUTY ↗";return;
    }
    $("connection").textContent="Timetable loaded · checking relevant aircraft…";
    const now=new Date();
    const candidates=state.flights.filter(f=>now>=new Date(f.departure.getTime()-100*60000)&&now<=new Date(f.arrival.getTime()+150*60000));
    // Limit live calls: only sectors whose scheduled window overlaps the current time.
    for(const f of candidates){
      try{
        const obs=await trackFlight(f);
        if(obs){
          state.observations.push({flight:f,obs});
          if(!obs.onGround){state.active={flight:f,obs};saveHistory(obs,f);break}
          saveHistory(obs,f);
        }
      }catch(e){state.errors.push(`${f.flightNumber} ADS-B: ${e.message}`)}
    }
    state.last=loadLast();
    render();
    $("lastUpdated").textContent=`UPDATED ${fmtTime(new Date(),"Europe/Berlin")}`;
    $("connection").textContent=state.active?"Live ADS-B aircraft matched":(state.observations.length?"Aircraft observed on ground":"Timetable loaded · no live aircraft match");
    if(state.errors.length)setError(state.errors.join("\n"));
    btn.disabled=false;btn.textContent="REFRESH TRACKING ↗";
  }
  $("track").addEventListener("click",run);
  $("route").addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase()});
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  render();
})();