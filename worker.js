/**
 * What's the boy doing? — free API bridge
 * Deploy as a Cloudflare Worker. No API key is used.
 * Routes:
 * Deployment pipeline: GitHub Actions publishes this Worker to Cloudflare.
 *   /api/schedule?origin=NUE&destination=BUD&year=2026&month=11
 *   /api/aircraft?lat=49.4987&lon=11.078&dist=35
 *   /api/hex?icao=4CA123
 */
const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const AENA_AIRPORTS = new Set(["ALC","AGP","PMI","BCN","MAD","SVQ","TFS","LPA","VLC","BIO","IBZ","MAH","SCQ","GRX","ACE","FUE","TFN","ZAZ","SDR","VLL","REU","OVD","LCG","MJV","XRY","GRO","SPC"]);
function dateLabel(date) {
 const [y,m,d]=date.split("-");
 return d+"/"+m+"/"+y;
}
function skyDate(label,fallback) {
 const match=String(label||"").match(/(\d{1,2})\s+([A-Za-z]{3})/);
 if(!match||!MONTHS[match[2]])return fallback;
 let year=Number(fallback.slice(0,4));
 const month=MONTHS[match[2]],day=Number(match[1]);
 const base=new Date(fallback+"T12:00:00Z").getTime();
 let candidate=Date.UTC(year,month-1,day,12);
 if(candidate-base>180*86400000)year--;
 else if(base-candidate>180*86400000)year++;
 return year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
async function aenaFlights(origin,destination,date) {
 let boardAirport="",flightType="",otherAirport="";
 if(AENA_AIRPORTS.has(origin)){boardAirport=origin;flightType="S";otherAirport=destination;}
 else if(AENA_AIRPORTS.has(destination)){boardAirport=destination;flightType="L";otherAirport=origin;}
 else return [];
 const daysAhead=(Date.parse(date+"T12:00:00Z")-Date.now())/86400000;
 const range=daysAhead>=-1&&daysAhead<=2?"&limit=200&dosDias=si":"";
 const url="https://www.aena.es/sites/Satellite?pagename=AENA_ConsultarVuelos&airport="+encodeURIComponent(boardAirport)+"&flightType="+flightType+range;
 const response=await fetch(url,{method:"POST",headers:{"Accept":"application/json","Origin":"https://www.aena.es","Referer":"https://www.aena.es/en/flight-info.html?iata="+boardAirport},cf:{cacheTtl:300,cacheEverything:true}});
 if(!response.ok)return [];
 let rows;try{rows=await response.json();}catch{return [];}
 if(!Array.isArray(rows))return [];
 return rows.filter(row=>{
  const carrier=String(row.iataCompania||"").toUpperCase();
  return row.iataAena===boardAirport&&row.iataOtro===otherAirport&&row.fecha===dateLabel(date)&&["FR","RK"].includes(carrier);
 }).map(row=>{
  const carrier=String(row.iataCompania||"FR").toUpperCase();
  const number=String(row.numVuelo||"").replace(/\s/g,"");
  const boardTime=String(row.horaProgramada||row.horaEstimada||"").slice(0,5);
  if(!/^\d{2}:\d{2}$/.test(boardTime)||!number)return null;
  return {flightNumber:carrier+number,carrierCode:carrier,boardTime,boardType:flightType==="S"?"departure":"arrival",boardDate:date,source:"Aena"};
 }).filter(Boolean);
}
async function skyLinkFlights(origin,destination,date,key) {
 if(!key||!(origin==="NUE"||destination==="NUE"))return [];
 const direction=origin==="NUE"?"departures":"arrivals";
 const other=origin==="NUE"?destination:origin;
 const dateKey=date.split("-").reverse().join("-");
 const base="https://data.skylinkapi.com/v3";
 const boardUrl=base+"/schedules/"+direction+"?iata=NUE&date="+encodeURIComponent(dateKey);
 const boardResponse=await fetch(boardUrl,{headers:{"Accept":"application/json","x-api-key":key},cf:{cacheTtl:180,cacheEverything:true}});
 if(!boardResponse.ok)return [];
 let board;try{board=await boardResponse.json();}catch{return [];}
 const rows=Array.isArray(board?.flights)?board.flights:[];
 const unique=new Map();
 for(const row of rows){
  const flight=String(row.Flight||"").replace(/\s/g,"").toUpperCase();
  if(row.IATA!==other||!/^FR\d+$|^RK\d+$/.test(flight))continue;
  if(skyDate(row.Date,date)!==date)continue;
  unique.set(flight,row);
 }
 const results=await Promise.allSettled([...unique.entries()].slice(0,10).map(async([flight,row])=>{
  const response=await fetch(base+"/flight_status/"+encodeURIComponent(flight),{headers:{"Accept":"application/json","x-api-key":key},cf:{cacheTtl:120,cacheEverything:true}});
  if(response.ok){
   const status=await response.json();
   const dep=status.departure||{},arr=status.arrival||{};
   const depTime=String(dep.scheduled_time||"").slice(0,5),arrTime=String(arr.scheduled_time||"").slice(0,5);
   if(/^\d{2}:\d{2}$/.test(depTime)&&/^\d{2}:\d{2}$/.test(arrTime)){
    return {flightNumber:flight,carrierCode:flight.startsWith("RK")?"RK":"FR",departureDateTime:skyDate(dep.scheduled_date,date)+"T"+depTime,arrivalDateTime:skyDate(arr.scheduled_date,date)+"T"+arrTime,source:"SkyLink"};
   }
  }
  const time=String(row.Time||"").slice(0,5);
  if(!/^\d{2}:\d{2}$/.test(time))return null;
  return {flightNumber:flight,carrierCode:flight.startsWith("RK")?"RK":"FR",boardTime:time,boardType:direction==="departures"?"departure":"arrival",boardDate:date,source:"SkyLink"};
 }));
 return results.filter(x=>x.status==="fulfilled"&&x.value).map(x=>x.value);
}
function cors(body,status=200,headers={}) {
 const responseHeaders=new Headers(headers);
 responseHeaders.set("Access-Control-Allow-Origin","*");
 responseHeaders.set("Access-Control-Allow-Methods","GET, OPTIONS");
 responseHeaders.set("Access-Control-Allow-Headers","Content-Type, Accept");
 return new Response(status===204?null:body,{status,headers:responseHeaders});
}
export default {
 async fetch(request, env) {
  if (request.method === "OPTIONS") return cors(null,204);
  const u = new URL(request.url);
  try {
   let target, selectedDate="";
   if (u.pathname === "/api/schedule") {
    const o=(u.searchParams.get("origin")||"").toUpperCase();
    const d=(u.searchParams.get("destination")||"").toUpperCase();
    const y=Number(u.searchParams.get("year")), m=Number(u.searchParams.get("month"));
    selectedDate=u.searchParams.get("date")||"";
    if(!/^[A-Z]{3}$/.test(o)||!/^[A-Z]{3}$/.test(d)||y<2024||y>2035||m<1||m>12||(selectedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))) return cors(JSON.stringify({error:"Invalid schedule parameters"}),400,{"Content-Type":"application/json"});
    target=`https://services-api.ryanair.com/timtbl/3/schedules/${o}/${d}/years/${y}/months/${m}`;
   } else if (u.pathname === "/api/aircraft") {
    const lat=Number(u.searchParams.get("lat")), lon=Number(u.searchParams.get("lon")), dist=Number(u.searchParams.get("dist")||35);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||dist<1||dist>250) return cors(JSON.stringify({error:"Invalid ADS-B search parameters"}),400,{"Content-Type":"application/json"});
    target=`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`;
   } else if (u.pathname === "/api/hex") {
    const hex=(u.searchParams.get("icao")||"").toLowerCase();
    if(!/^[0-9a-f]{6}$/.test(hex)) return cors(JSON.stringify({error:"Invalid ICAO hex"}),400,{"Content-Type":"application/json"});
    target=`https://api.adsb.lol/v2/hex/${hex}`;
   } else return cors(JSON.stringify({error:"Unknown endpoint"}),404,{"Content-Type":"application/json"});
   const upstream=await fetch(target,{headers:{"Accept":"application/json"},cf:{cacheTtl:10,cacheEverything:true}});
   const body=await upstream.text();
   if(u.pathname==="/api/schedule"){
    if(!upstream.ok)return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json"});
    let schedule;try{schedule=JSON.parse(body);}catch{return cors(JSON.stringify({error:"Invalid timetable response"}),502,{"Content-Type":"application/json"});}
    const o=(u.searchParams.get("origin")||"").toUpperCase();
    const d=(u.searchParams.get("destination")||"").toUpperCase();
    const y=Number(u.searchParams.get("year")),m=Number(u.searchParams.get("month"));
    let source="Ryanair timetable";
    if(selectedDate){
     const merge=extra=>{
      if(!extra.length)return 0;
      let day=schedule.days.find(item=>Number(item.day)===Number(selectedDate.slice(-2)));
      if(!day){day={day:Number(selectedDate.slice(-2)),flights:[]};schedule.days.push(day);}
      let added=0;
      for(const flight of extra){
       const exists=day.flights.some(item=>String(item.flightNumber||item.number||"").replace(/\s/g,"").toUpperCase()===flight.flightNumber);
       if(!exists){day.flights.push(flight);added++;}
      }
      schedule.days.sort((a,b)=>Number(a.day)-Number(b.day));
      return added;
     };
     try{
      const official=await aenaFlights(o,d,selectedDate);
      const added=merge(official);
      if(official.length)source=added?"Ryanair timetable + Aena official board":"Ryanair timetable + Aena (already listed)";
     }catch(error){source="Ryanair timetable (Aena board unavailable)";}
     if(env&&env.SKYLINK_API_KEY){
      try{
       const extra=await skyLinkFlights(o,d,selectedDate,env.SKYLINK_API_KEY);
       const added=merge(extra);
       if(extra.length)source+=(source.includes("Aena")?" + SkyLink":" + SkyLink airport board")+(added?"":" (no new rows)");
      }catch(error){source+=" (SkyLink board unavailable)";}
     }else if(!source.includes("Aena"))source+=" (SkyLink key not configured)";
    }else source="Ryanair timetable (date-specific board lookup not requested)";
    return cors(JSON.stringify(schedule),200,{"Content-Type":"application/json","X-WTBD-Schedule-Sources":source,"Access-Control-Expose-Headers":"X-WTBD-Schedule-Sources"});
   }
   return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json"});
  } catch(e) {
   return cors(JSON.stringify({error:"Upstream request failed",detail:String(e)}),502,{"Content-Type":"application/json"});
  }
 }
};