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
async function flightNerveFlights(origin,destination,date,key){
 if(!key||!date)return [];
 const routeUrl="https://api.flightnerve.com/route/"+encodeURIComponent(key)+"?from="+encodeURIComponent(origin)+"&to="+encodeURIComponent(destination);
 const routeResponse=await fetch(routeUrl,{headers:{"Accept":"application/json"},cf:{cacheTtl:86400,cacheEverything:true}});
 if(!routeResponse.ok)return [];
 let route;try{route=await routeResponse.json();}catch{return [];}
 const candidates=[...new Set((Array.isArray(route.flights)?route.flights:[])
  .filter(item=>String(item.airline||"").toUpperCase()==="FR")
  .map(item=>String(item.flight||"").toUpperCase().replace(/\s/g,""))
  .filter(number=>/^FR\d+$/.test(number)))].slice(0,8);
 const dateKey=date.replace(/-/g,"");
 const results=await Promise.allSettled(candidates.map(async flight=>{
  const number=flight.slice(2);
  const url="https://api.flightnerve.com/airline/"+encodeURIComponent(key)+"?num="+encodeURIComponent(number)+"&name=FR&date="+dateKey+"&depap="+encodeURIComponent(origin);
  const response=await fetch(url,{headers:{"Accept":"application/json"},cf:{cacheTtl:300,cacheEverything:true}});
  if(!response.ok)return null;
  const payload=await response.json();
  const legs=Array.isArray(payload)&&Array.isArray(payload[0])?payload.flat():Array.isArray(payload)?payload:[];
  const departure=legs.find(item=>item&&item.departure)?.departure;
  const arrival=legs.find(item=>item&&item.arrival)?.arrival;
  if(!departure||!arrival)return null;
  if(String(departure.airportCode||"").toUpperCase()!==origin||String(arrival.airportCode||"").toUpperCase()!==destination)return null;
  const dep=departure.departureDateTime,arr=arrival.arrivalDateTime;
  if(!dep||!arr||String(dep).slice(0,10)!==date)return null;
  return {flightNumber:flight,carrierCode:"FR",departureDateTime:dep,arrivalDateTime:arr};
 }));
 return results.filter(item=>item.status==="fulfilled"&&item.value).map(item=>item.value);
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
   let target;
   if (u.pathname === "/api/schedule") {
    const o=(u.searchParams.get("origin")||"").toUpperCase();
    const d=(u.searchParams.get("destination")||"").toUpperCase();
    const y=Number(u.searchParams.get("year")), m=Number(u.searchParams.get("month"));
    const selectedDate=u.searchParams.get("date")||"";
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
    if(env&&env.FLIGHTNERVE_API_KEY&&selectedDate){
     try{
      const extra=await flightNerveFlights(o,d,selectedDate,env.FLIGHTNERVE_API_KEY);
      if(extra.length){
       let day=schedule.days.find(item=>Number(item.day)===Number(selectedDate.slice(-2)));
       if(!day){day={day:Number(selectedDate.slice(-2)),flights:[]};schedule.days.push(day);}
       for(const flight of extra){
        const exists=day.flights.some(item=>String(item.flightNumber||item.number||"").replace(/\\s/g,"").toUpperCase()===flight.flightNumber);
        if(!exists)day.flights.push(flight);
       }
       schedule.days.sort((a,b)=>Number(a.day)-Number(b.day));
       source="Ryanair timetable + FlightNerve";
      }else source="Ryanair timetable (FlightNerve found no additional FR flights)";
     }catch(error){source="Ryanair timetable (FlightNerve unavailable)";}
    }else if(!selectedDate)source="Ryanair timetable (date-specific fallback not requested)";
    else source="Ryanair timetable (FlightNerve key not configured)";
    return cors(JSON.stringify(schedule),200,{"Content-Type":"application/json","X-WTBD-Schedule-Sources":source});
   }
   return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json"});
  } catch(e) {
   return cors(JSON.stringify({error:"Upstream request failed",detail:String(e)}),502,{"Content-Type":"application/json"});
  }
 }
};