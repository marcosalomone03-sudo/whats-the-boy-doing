(() => {
"use strict";
const $=id=>document.getElementById(id);
const cfg=window.WTBD_CONFIG||{};
const WORKER=(cfg.workerUrl||"").replace(/\/+$/,"");
const ROUTE_RE=/^[A-Z]{3}(?:-[A-Z]{3})?$/;
const A={
 NUE:{name:"Nuremberg",tz:"Europe/Berlin",lat:49.4987,lon:11.0780},BUD:{name:"Budapest",tz:"Europe/Budapest",lat:47.4369,lon:19.2556},
 ALC:{name:"Alicante",tz:"Europe/Madrid",lat:38.2822,lon:-0.5582},STN:{name:"London Stansted",tz:"Europe/London",lat:51.8850,lon:0.2350},
 DUB:{name:"Dublin",tz:"Europe/Dublin",lat:53.4213,lon:-6.2701},PMI:{name:"Palma",tz:"Europe/Madrid",lat:39.5517,lon:2.7388},
 GOT:{name:"Gothenburg",tz:"Europe/Stockholm",lat:57.6628,lon:12.2798},ARN:{name:"Stockholm Arlanda",tz:"Europe/Stockholm",lat:59.6519,lon:17.9186},
 VIE:{name:"Vienna",tz:"Europe/Vienna",lat:48.1103,lon:16.5697},BCN:{name:"Barcelona",tz:"Europe/Madrid",lat:41.2974,lon:2.0833},
 FCO:{name:"Rome Fiumicino",tz:"Europe/Rome",lat:41.8003,lon:12.2389},MXP:{name:"Milan Malpensa",tz:"Europe/Rome",lat:45.6306,lon:8.7281},
 BGY:{name:"Milan Bergamo",tz:"Europe/Rome",lat:45.6739,lon:9.7042},MAN:{name:"Manchester",tz:"Europe/London",lat:53.3537,lon:-2.2750},
 LTN:{name:"London Luton",tz:"Europe/London",lat:51.8747,lon:-0.3683},EDI:{name:"Edinburgh",tz:"Europe/London",lat:55.9500,lon:-3.3725},
 CRL:{name:"Brussels Charleroi",tz:"Europe/Brussels",lat:50.4592,lon:4.4538},KRK:{name:"Krakow",tz:"Europe/Warsaw",lat:50.0777,lon:19.7848},
 WRO:{name:"Wroclaw",tz:"Europe/Warsaw",lat:51.1027,lon:16.8858},BRI:{name:"Bari",tz:"Europe/Rome",lat:41.1389,lon:16.7606},
 CTA:{name:"Catania",tz:"Europe/Rome",lat:37.4668,lon:15.0664},NAP:{name:"Naples",tz:"Europe/Rome",lat:40.8860,lon:14.2908},
 OPO:{name:"Porto",tz:"Europe/Lisbon",lat:41.2481,lon:-8.6814},LIS:{name:"Lisbon",tz:"Europe/Lisbon",lat:38.7742,lon:-9.1342},
 AGP:{name:"Malaga",tz:"Europe/Madrid",lat:36.6749,lon:-4.4991},SVQ:{name:"Seville",tz:"Europe/Madrid",lat:37.4180,lon:-5.8931},
 MAD:{name:"Madrid",tz:"Europe/Madrid",lat:40.4983,lon:-3.5676},BER:{name:"Berlin",tz:"Europe/Berlin",lat:52.3667,lon:13.5033},
 HAM:{name:"Hamburg",tz:"Europe/Berlin",lat:53.6304,lon:9.9882},FRA:{name:"Frankfurt",tz:"Europe/Berlin",lat:50.0379,lon:8.5622},
 MUC:{name:"Munich",tz:"Europe/Berlin",lat:48.3538,lon:11.7861},ZRH:{name:"Zurich",tz:"Europe/Zurich",lat:47.4581,lon:8.5555},
 CPH:{name:"Copenhagen",tz:"Europe/Copenhagen",lat:55.6181,lon:12.6560},OSL:{name:"Oslo",tz:"Europe/Oslo",lat:60.1976,lon:11.1004},
 BGO:{name:"Bergen",tz:"Europe/Oslo",lat:60.2934,lon:5.2181},HEL:{name:"Helsinki",tz:"Europe/Helsinki",lat:60.3172,lon:24.9633},
 GDN:{name:"Gdansk",tz:"Europe/Warsaw",lat:54.3776,lon:18.4662},WAW:{name:"Warsaw",tz:"Europe/Warsaw",lat:52.1657,lon:20.9671},
 PRG:{name:"Prague",tz:"Europe/Prague",lat:50.1008,lon:14.2632},LPA:{name:"Gran Canaria",tz:"Atlantic/Canary",lat:27.9319,lon:-15.3866},
 TFS:{name:"Tenerife South",tz:"Atlantic/Canary",lat:28.0445,lon:-16.5725},RAK:{name:"Marrakech",tz:"Africa/Casablanca",lat:31.6069,lon:-8.0363}
};
const state={flights:[],candidates:[],selected:null,last:null};
const now=new Date(); $("flightDate").value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
function airport(c){return A[c]||{name:c,tz:"Europe/Berlin",lat:null,lon:null};}
function routesFor(s){let p=s.split("-");return p.length===1?[["NUE",p[0]],[p[0],"NUE"]]:[["NUE",p[0]],[p[0],"NUE"],["NUE",p[1]],[p[1],"NUE"]];}
function localParts(d,tz){return Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).map(x=>[x.type,x.value]));}
function dateAtAirport(ds,ts,ap){let [y,m,d]=ds.split("-").map(Number),[h,n]=ts.split(":").map(Number),target=Date.UTC(y,m-1,d,h,n),guess=target;for(let i=0;i<3;i++){let p=localParts(new Date(guess),ap.tz);guess+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}return new Date(guess);}
function fmt(d,tz){return d?new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d):"—";}
function esc(x){return String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function error(s){$("error").style.display=s?"block":"none";$("error").textContent=s||"";}
async function get(path){if(!WORKER||WORKER.includes("YOUR-WORKER"))throw new Error("Cloudflare Worker URL not configured. Follow SETUP.md first.");let r=await fetch(WORKER+path,{headers:{Accept:"application/json"},cache:"no-store"});if(!r.ok)throw new Error(`Proxy returned HTTP ${r.status} for ${path.split("?")[0]}`);return r.json();}
function normalizeSchedule(j,o,d,ds){let out=[],days=Array.isArray(j?.days)?j.days:[],day=+ds.slice(-2);for(let e of days){if(+e.day!==day)continue;for(let f of (e.flights||[])){let dep=f.departureTime||f.departureLocalTime||f.departureDateTime?.slice(11,16),arr=f.arrivalTime||f.arrivalLocalTime||f.arrivalDateTime?.slice(11,16),num=f.number||f.flightNumber||f.flightNo;if(!dep||!arr||!num)continue;let carrier=f.carrierCode||"FR";out.push(makeFlight(o,d,`${carrier}${num}`,dep,arr,ds));}}
 if(!out.length&&Array.isArray(j)){for(let it of j)for(let l of (it.legs||[it])){let dep=l.departureDateTime,arr=l.arrivalDateTime;if(dep&&arr&&dep.slice(0,10)===ds)out.push(makeFlight(o,d,l.flightNumber||it.flightNumber||"FR?",dep.slice(11,16),arr.slice(11,16),ds,arr.slice(0,10)));}}
 return out;}
function makeFlight(o,d,num,dep,arr,ds,arrDate=ds){return {origin:o,destination:d,flightNumber:String(num).replace(/\s/g,"").toUpperCase(),date:ds,departureLocal:dep.slice(0,5),arrivalLocal:arr.slice(0,5),departure:dateAtAirport(ds,dep.slice(0,5),airport(o)),arrival:dateAtAirport(arrDate,arr.slice(0,5),airport(d))};}
async function loadRoute(o,d,ds){let [y,m]=ds.split("-");let j=await get(`/api/schedule?origin=${o}&destination=${d}&year=${y}&month=${+m}`);return normalizeSchedule(j,o,d,ds);}
function hav(a,b){let R=3440.065,p=Math.PI/180,d1=(b.lat-a.lat)*p,d2=(b.lon-a.lon)*p,x=Math.sin(d1/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function bearing(a,b){let p=Math.PI/180,y=Math.sin((b.lon-a.lon)*p)*Math.cos(b.lat*p),x=Math.cos(a.lat*p)*Math.sin(b.lat*p)-Math.sin(a.lat*p)*Math.cos(b.lat*p)*Math.cos((b.lon-a.lon)*p);return (Math.atan2(y,x)/p+360)%360;}
function diff(a,b){return Math.abs(((a-b+540)%360)-180);}
function midpoint(a,b){let p1=a.lat*Math.PI/180,l1=a.lon*Math.PI/180,p2=b.lat*Math.PI/180,l2=b.lon*Math.PI/180,Bx=Math.cos(p2)*Math.cos(l2-l1),By=Math.cos(p2)*Math.sin(l2-l1),p3=Math.atan2(Math.sin(p1)+Math.sin(p2),Math.sqrt((Math.cos(p1)+Bx)**2+By**2)),l3=l1+Math.atan2(By,Math.cos(p1)+Bx);return {lat:p3*180/Math.PI,lon:l3*180/Math.PI};}
function distToSegmentPoint(p,a,b){let ab=hav(a,b),ap=hav(a,p),pb=hav(p,b);return Math.max(0,(ap+pb-ab));}
async function aircraftNear(lat,lon,dist){return get(`/api/aircraft?lat=${lat}&lon=${lon}&dist=${Math.min(250,Math.max(5,Math.round(dist)))}`);}
function validAircraft(a){return a&&a.hex&&Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&(a.seen??999)<90;}
async function findCandidates(f){let o=airport(f.origin),d=airport(f.destination);if(o.lat==null||d.lat==null)return [];
 let mid=midpoint(o,d),points=[{...o,kind:"departure"},{...mid,kind:"route"}];if(hav(o,d)>350)points.push({...d,kind:"arrival"});
 let results=await Promise.allSettled(points.map(p=>aircraftNear(p.lat,p.lon,p.kind==="departure"?45:150)));
 let map=new Map();
 for(let r of results)if(r.status==="fulfilled")for(let a of (r.value.ac||[])){if(!validAircraft(a))continue;let old=map.get(a.hex);if(!old||(a.seen??999)<(old.seen??999))map.set(a.hex,a);}
 let candidates=[];
 for(let a of map.values()){
  let p={lat:a.lat,lon:a.lon},along=hav(o,p)+hav(p,d)-hav(o,d),fromOrigin=hav(o,p),toDest=hav(p,d);
  if(along>55)continue;
  let track=Number.isFinite(a.track)?a.track:null,routeBearing=bearing(o,d);
  let airborne=a.alt_baro!=="ground"&&Number.isFinite(a.alt_baro)&&a.alt_baro>1000;
  let headingOK=track===null||diff(track,routeBearing)<85;
  let timeOK=Date.now()>=f.departure.getTime()-50*60000&&Date.now()<=f.arrival.getTime()+100*60000;
  if(!timeOK)continue;
  let nearOrigin=fromOrigin<35,nearRoute=fromOrigin>=20&&toDest>=20;
  if(!(nearOrigin||nearRoute)||(!headingOK&&airborne))continue;
  candidates.push({...a,score:(nearOrigin?25:0)+(airborne?20:0)+(headingOK?15:0)-Math.min(along,50)/5-(a.seen||0)/10,fromOrigin,routeBearing});
 }
 return candidates.sort((a,b)=>b.score-a.score).slice(0,8);
}
function saveSelected(f,a){let item={flightNumber:f.flightNumber,origin:f.origin,destination:f.destination,date:f.date,hex:a.hex,callsign:(a.flight||"").trim(),registration:a.r||null,type:a.t||null,updatedAt:new Date().toISOString()};localStorage.setItem("wtbd-selected-v2",JSON.stringify(item));state.selected={flight:f,aircraft:a};}
function renderAircraft(f,a){let onGround=a.alt_baro==="ground"||a.alt_baro===null;return `<div class="flighttop"><div><div class="flightno">${esc(f.flightNumber)}</div><div class="route">${f.origin} → ${f.destination}</div><div class="muted">${esc(f.origin)} · ${esc(f.destination)}</div></div><span class="status ${onGround?"ground":"air"}">${onGround?"ON GROUND":"AIRBORNE"}</span></div><div class="stats"><div class="stat"><small>Actual callsign</small><strong>${esc((a.flight||"").trim()||"Not broadcast")}</strong></div><div class="stat"><small>ICAO HEX</small><strong>${esc(a.hex)}</strong></div><div class="stat"><small>Registration</small><strong>${esc(a.r)}</strong></div><div class="stat"><small>Aircraft type</small><strong>${esc(a.t)}</strong></div><div class="stat"><small>Ground speed</small><strong>${Number.isFinite(a.gs)?Math.round(a.gs)+" kt":"—"}</strong></div><div class="stat"><small>Altitude</small><strong>${Number.isFinite(a.alt_baro)?Math.round(a.alt_baro).toLocaleString()+" ft":(onGround?"GROUND":"—")}</strong></div><div class="stat"><small>Latitude</small><strong>${Number.isFinite(a.lat)?a.lat.toFixed(4):"—"}</strong></div><div class="stat"><small>Longitude</small><strong>${Number.isFinite(a.lon)?a.lon.toFixed(4):"—"}</strong></div></div><div class="notice">Aircraft selected by the user. Last ADS-B position age: ${Math.round(a.seen||0)} seconds. This is not airline-confirmed flight status.</div>`;}
function render(){let flights=[...state.flights].sort((a,b)=>a.departure-b.departure),now=new Date();$("sectors").innerHTML=flights.length?flights.map(f=>`<div class="flightrow"><div><b>${esc(f.flightNumber)} · ${f.origin} → ${f.destination}</b><small>${esc(airport(f.origin).name)} → ${esc(airport(f.destination).name)}</small></div><div class="time">${fmt(f.departure,airport(f.origin).tz)}<small>arr ${fmt(f.arrival,airport(f.destination).tz)}</small></div></div>`).join(""):`<div class="empty">No timetable loaded.</div>`;$("sectorCount").textContent=flights.length+" SECTORS";
 let next=flights.find(f=>f.departure>now);$("nextFlight").innerHTML=next?`<div class="flighttop"><div><div class="flightno">${esc(next.flightNumber)}</div><div class="route">${next.origin} → ${next.destination}</div></div><span class="status none">UPCOMING</span></div><div class="stats"><div class="stat"><small>Scheduled departure</small><strong>${fmt(next.departure,airport(next.origin).tz)}</strong></div><div class="stat"><small>Scheduled arrival</small><strong>${fmt(next.arrival,airport(next.destination).tz)}</strong></div></div>`:`<div class="empty">No future sector in loaded timetable.</div>`;
 $("current").innerHTML=state.selected?renderAircraft(state.selected.flight,state.selected.aircraft):`<div class="empty">No aircraft confirmed yet. Select a candidate below.</div>`;
 let last=null;try{last=JSON.parse(localStorage.getItem("wtbd-selected-v2")||"null")}catch{};$("lastFlight").innerHTML=last?`<div class="flighttop"><div><div class="flightno">${esc(last.flightNumber)}</div><div class="route">${last.origin} → ${last.destination}</div></div><span class="status none">LAST SELECTED</span></div><div class="stats"><div class="stat"><small>Callsign</small><strong>${esc(last.callsign)}</strong></div><div class="stat"><small>Registration</small><strong>${esc(last.registration)}</strong></div><div class="stat"><small>Aircraft type</small><strong>${esc(last.type)}</strong></div><div class="stat"><small>ICAO HEX</small><strong>${esc(last.hex)}</strong></div></div>`:`<div class="empty">No aircraft selected on this device yet.</div>`;
}
async function refreshSelected(){let saved;try{saved=JSON.parse(localStorage.getItem("wtbd-selected-v2")||"null")}catch{}if(!saved?.hex)return;let data=await get(`/api/hex?icao=${saved.hex}`),a=(data.ac||[]).find(x=>x.hex===saved.hex);if(a){let f=state.flights.find(x=>x.flightNumber===saved.flightNumber)||{flightNumber:saved.flightNumber,origin:saved.origin,destination:saved.destination,date:saved.date};state.selected={flight:f,aircraft:a};}}
async function run(){error("");if(!WORKER||WORKER.includes("YOUR-WORKER")){error("Worker not configured. Open SETUP.md and deploy worker.js first.");return;}let route=$("route").value.trim().toUpperCase().replace(/\s+/g,""),ds=$("flightDate").value;if(!ROUTE_RE.test(route)){error("Enter BUD or BUD-ALC.");return;}if(!ds){error("Choose a duty date.");return;}
 let btn=$("track");btn.disabled=true;btn.textContent="LOADING FLIGHT SCHEDULE…";state.flights=[];state.candidates=[];state.selected=null;
 try{let routes=routesFor(route),res=await Promise.allSettled(routes.map(([o,d])=>loadRoute(o,d,ds)));let errs=[];res.forEach((r,i)=>{if(r.status==="fulfilled")state.flights.push(...r.value);else errs.push(routes[i].join("-")+": "+r.reason.message)});state.flights.sort((a,b)=>a.departure-b.departure);if(!state.flights.length)throw new Error("No timetable received. "+errs.join(" | "));
  $("connection").textContent="Schedule loaded · matching nearby aircraft…";render();
  let now=Date.now(),active=state.flights.filter(f=>now>=f.departure.getTime()-50*60000&&now<=f.arrival.getTime()+100*60000);
  let all=[];for(let f of active){try{let ac=await findCandidates(f);all.push(...ac.map(a=>({flight:f,aircraft:a})));}catch(e){errs.push(f.flightNumber+" ADS-B: "+e.message)}}
  all.sort((a,b)=>b.aircraft.score-a.aircraft.score);state.candidates=all;
  if(all.length){$("candidates").className="candidate-list";$("candidates").innerHTML=all.map((x,i)=>`<div class="candidate"><div><b>${esc(x.flight.flightNumber)} · ${x.flight.origin} → ${x.flight.destination}</b><small>${esc((x.aircraft.flight||"").trim()||"No callsign")} · ${esc(x.aircraft.r||"Registration unknown")} · ${esc(x.aircraft.t||"Type unknown")} · HEX ${esc(x.aircraft.hex)} · ${Math.round(x.aircraft.seen||0)}s ago</small></div><button class="secondary" data-pick="${i}">SELECT</button></div>`).join("");$("candidates").querySelectorAll("[data-pick]").forEach(b=>b.addEventListener("click",()=>{let x=all[+b.dataset.pick];saveSelected(x.flight,x.aircraft);render();$("connection").textContent="Aircraft selected · refreshing by ICAO HEX";}));}
  else $("candidates").innerHTML=`<div class="empty">No convincing aircraft candidate found for the active scheduled sectors. Try again closer to departure or check that the route and date are correct.</div>`;
  await refreshSelected();render();$("lastUpdated").textContent="UPDATED "+fmt(new Date(),"Europe/Berlin");$("connection").textContent=all.length?`${all.length} possible aircraft · choose the correct one`:"Schedule loaded · no ADS-B match";if(errs.length)error(errs.join("\n"));
 }catch(e){error(e.message);$("connection").textContent="Unable to load flight data";}finally{btn.disabled=false;btn.textContent="REFRESH DUTY & AIRCRAFT ↗";}}
$("track").addEventListener("click",run);$("route").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase());if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});render();
})();