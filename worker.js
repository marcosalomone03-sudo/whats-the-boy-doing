/**
 * What's the boy doing? — free API bridge
 * Schedule priority: Nuremberg Airport public board, then Google Search fallback.
 * ADS-B.lol is used only after a scheduled flight has been identified.
 */
function dateCompact(date){return date.replace(/-/g,"");}
function daySchedule(date,flights,source){return {source,days:[{day:Number(date.slice(-2)),flights}]};}
function pick(obj,keys){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v;}return "";}
function time24(value){
 const s=String(value||"").trim();
 let m=s.match(/(?:^|\\D)([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s*([ap]\\.?m\\.?))?/i);
 if(!m)return "";
 let h=Number(m[1]),mi=m[2],ampm=(m[3]||"").toLowerCase().replace(/\\./g,"");
 if(ampm==="pm"&&h<12)h+=12;
 if(ampm==="am"&&h===12)h=0;
 return String(h).padStart(2,"0")+":"+mi;
}
function normalizeBoardRows(payload,origin,destination,date,direction){
 let rows=Array.isArray(payload)?payload:[];
 if(!rows.length){
  for(const key of ["flights","items","results","data","departures","arrivals"])if(Array.isArray(payload?.[key])){rows=payload[key];break;}
 }
 const expectedOther=origin==="NUE"?destination:origin;
 return rows.map(row=>{
  const numberRaw=String(pick(row,["flightNumber","flightNo","flight","number","iataFlightNumber","flight_number"])).replace(/\\s/g,"").toUpperCase();
  const carrier=String(pick(row,["airlineIata","carrierCode","iataAirline","airlineCode","carrier"])||numberRaw.match(/^[A-Z]{2,3}/)?.[0]||"").toUpperCase();
  const number=/^[A-Z]{2,3}\\d/.test(numberRaw)?numberRaw:carrier+numberRaw;
  const other=String(pick(row,origin==="NUE"?["destinationIata","destination","airportIata","iataOther","to"]:["originIata","origin","airportIata","iataOther","from"])).toUpperCase();
  if(!/^((FR|RK)\\d{1,5})$/.test(number))return null;
  if(other&&other!==expectedOther)return null;
  const boardTime=time24(pick(row,["scheduledTime","scheduled","scheduledAt","scheduled_time","time","departureTime","arrivalTime","estimatedTime","estimated"]));
  if(!boardTime)return null;
  return {flightNumber:number,carrierCode:carrier||number.slice(0,2),boardTime,boardType:direction==="departures"?"departure":"arrival",boardDate:date,source:"Nuremberg Airport"};
 }).filter(Boolean);
}
async function nurembergFlights(origin,destination,date){
 if(origin!=="NUE"&&destination!=="NUE")return [];
 const direction=origin==="NUE"?"departures":"arrivals";
 const base="https://airportnue-service.justrelate.io/production/api/flight-status/"+direction;
 const headers={"Accept":"application/json, text/plain, */*","Origin":"https://www.airport-nuernberg.de","Referer":"https://www.airport-nuernberg.de/en/flight-status","User-Agent":"Mozilla/5.0"};
 const dateFormats=[dateCompact(date),date];
 for(const dateValue of dateFormats){
  const url=base+"?lang=en&airportIata=NUE&flightNumber=&date="+encodeURIComponent(dateValue)+"&hourMin=&hourMax=";
  const response=await fetch(url,{headers,cf:{cacheTtl:60,cacheEverything:true}});
  if(!response.ok)continue;
  let payload;try{payload=await response.json();}catch{continue;}
  const rows=normalizeBoardRows(payload,origin,destination,date,direction);
  if(rows.length)return rows;
 }
 return [];
}
function stripHtml(html){
 return html.replace(/<script[\\s\\S]*?<\\/script>/gi," ").replace(/<style[\\s\\S]*?<\\/style>/gi," ")
  .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&")
  .replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/\\s+/g," ").trim();
}
async function googleFlights(origin,destination,date){
 if(origin!=="NUE"&&destination!=="NUE")return [];
 const direction=origin==="NUE"?"departure":"arrival";
 const route=origin+" "+destination;
 const query="Ryanair flight "+route+" "+date+" flight number schedule";
 const url="https://www.google.com/search?q="+encodeURIComponent(query)+"&num=10&hl=en&gl=de";
 const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36","Accept":"text/html"},cf:{cacheTtl:300,cacheEverything:true}});
 if(!response.ok)return [];
 const html=await response.text();
 if(html.length<3000||/unusual traffic|sorry\\/index|consent\\.google/i.test(html))return [];
 const text=stripHtml(html);
 const matches=[...text.matchAll(/\\b(?:FR|RK)\\s?\\d{1,5}\\b/gi)];
 const results=[];
 for(const match of matches){
  const start=Math.max(0,match.index-220),end=Math.min(text.length,match.index+260);
  const context=text.slice(start,end);
  if(!/ryanair/i.test(context))continue;
  const number=match[0].replace(/\\s/g,"").toUpperCase();
  const times=[...context.matchAll(/\\b(?:[01]?\\d|2[0-3]):[0-5]\\d\\b/g)].map(m=>time24(m[0]));
  const boardTime=times.find(Boolean);
  if(!boardTime)continue;
  results.push({flightNumber:number,carrierCode:number.startsWith("RK")?"RK":"FR",boardTime,boardType:direction,boardDate:date,source:"Google Search (unverified)"});
 }
 return [...new Map(results.map(row=>[row.flightNumber,row])).values()];
}
function cors(body,status=200,headers={}){
 const h=new Headers(headers);h.set("Access-Control-Allow-Origin","*");h.set("Access-Control-Allow-Methods","GET, OPTIONS");h.set("Access-Control-Allow-Headers","Content-Type, Accept");
 return new Response(status===204?null:body,{status,headers:h});
}
export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return cors(null,204);
  const u=new URL(request.url);
  try{
   if(u.pathname==="/api/schedule"){
    const origin=(u.searchParams.get("origin")||"").toUpperCase(),destination=(u.searchParams.get("destination")||"").toUpperCase(),date=u.searchParams.get("date")||"";
    if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(destination)||!(origin==="NUE"||destination==="NUE")||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return cors(JSON.stringify({error:"Invalid schedule parameters; every tracked route must touch NUE and include a date."}),400,{"Content-Type":"application/json"});
    let flights=[],source="Nuremberg Airport";
    try{flights=await nurembergFlights(origin,destination,date);}catch(error){source="Nuremberg Airport unavailable";}
    if(!flights.length){
     source+="; Google Search fallback";
     try{flights=await googleFlights(origin,destination,date);}catch(error){source+=" unavailable";}
    }
    return cors(JSON.stringify(daySchedule(date,flights,source)),200,{"Content-Type":"application/json","X-WTBD-Schedule-Sources":source,"Access-Control-Expose-Headers":"X-WTBD-Schedule-Sources"});
   }
   let target;
   if(u.pathname==="/api/aircraft"){
    const lat=Number(u.searchParams.get("lat")),lon=Number(u.searchParams.get("lon")),dist=Number(u.searchParams.get("dist")||35);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||dist<1||dist>250)return cors(JSON.stringify({error:"Invalid ADS-B search parameters"}),400,{"Content-Type":"application/json"});
    target="https://api.adsb.lol/v2/lat/"+lat+"/lon/"+lon+"/dist/"+dist;
   }else if(u.pathname==="/api/hex"){
    const hex=(u.searchParams.get("icao")||"").toLowerCase();
    if(!/^[0-9a-f]{6}$/.test(hex))return cors(JSON.stringify({error:"Invalid ICAO hex"}),400,{"Content-Type":"application/json"});
    target="https://api.adsb.lol/v2/hex/"+hex;
   }else return cors(JSON.stringify({error:"Unknown endpoint"}),404,{"Content-Type":"application/json"});
   const upstream=await fetch(target,{headers:{"Accept":"application/json"},cf:{cacheTtl:10,cacheEverything:true}});
   return cors(await upstream.text(),upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json"});
  }catch(error){return cors(JSON.stringify({error:"Upstream request failed",detail:String(error)}),502,{"Content-Type":"application/json"});}
 }
};
