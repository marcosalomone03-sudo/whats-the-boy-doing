/**
 * What's the boy doing? — free API bridge
 * Schedule priority: Nuremberg Airport public board, then Google Search fallback.
 * ADS-B.lol is used only after a scheduled flight has been identified.
 */
function dateCompact(date){return date.replace(/-/g,"");}
function daySchedule(date,flights,source,googleSearchUrl){return {source,googleSearchUrl,days:[{day:Number(date.slice(-2)),flights}]};}
function pick(obj,keys){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v;}return "";}
function time24(value){
 const s=String(value||"").trim();
 let m=s.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\s*([ap]\.?m\.?))?/i);
 if(!m)return "";
 let h=Number(m[1]),mi=m[2],ampm=(m[3]||"").toLowerCase().replace(/\./g,"");
 if(ampm==="pm"&&h<12)h+=12;
 if(ampm==="am"&&h===12)h=0;
 return String(h).padStart(2,"0")+":"+mi;
}
function localNueTime(value){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return "";
 return new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
}
function normalizeBoardRows(payload,origin,destination,date,direction){
 const rows=Array.isArray(payload)?payload:[];
 const expectedOther=origin==="NUE"?destination:origin;
 const wantedDate=Number(dateCompact(date));
 return rows.map(row=>{
  const airline=String(row?.flight?.airline?.iata||"").toUpperCase();
  const numberPart=String(row?.flight?.number||"").replace(/\s/g,"");
  const number=airline+numberPart;
  const other=String(direction==="departures"?row?.toAirport?.iata:row?.fromAirport?.iata||"").toUpperCase();
  const localDate=Number(row?.scheduledLocalDate||0);
  if(!/^((FR|RK|RR|OE)\d{1,5})$/.test(number))return null;
  if(other!==expectedOther||localDate!==wantedDate)return null;
  const boardTime=localNueTime(row?.scheduledTime);
  if(!boardTime)return null;
  return {flightNumber:number,carrierCode:airline,boardTime,boardType:direction==="departures"?"departure":"arrival",boardDate:date,source:"Nuremberg Airport"};
 }).filter(Boolean);
}
async function nurembergFlights(origin,destination,date){
 if(origin!=="NUE"&&destination!=="NUE")return [];
 const direction=origin==="NUE"?"departures":"arrivals";
 const other=origin==="NUE"?destination:origin;
 const base="https://airportnue-service.justrelate.io/production/api/flight-status/"+direction;
 const headers={"Accept":"application/json, text/plain, */*","Origin":"https://www.airport-nuernberg.de","Referer":"https://www.airport-nuernberg.de/en/flight-status","User-Agent":"Mozilla/5.0"};
 const url=base+"?lang=en&airportIata="+encodeURIComponent(other)+"&flightNumber=&date="+dateCompact(date)+"&hourMin=&hourMax=";
 const response=await fetch(url,{headers,cf:{cacheTtl:60,cacheEverything:true}});
 if(!response.ok)throw new Error("Nuremberg board HTTP "+response.status);
 const payload=await response.json();
 return normalizeBoardRows(payload,origin,destination,date,direction);
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
 if(html.length<3000||/unusual traffic|sorry\/index|consent\.google|having trouble accessing Google Search|id="yvlrue"/i.test(html))return [];
 const text=stripHtml(html);
 const matches=[...text.matchAll(/\b(?:FR|RK|RR|OE)\s?\d{1,5}\b/gi)];
 const results=[];
 for(const match of matches){
  const start=Math.max(0,match.index-220),end=Math.min(text.length,match.index+260);
  const context=text.slice(start,end);
  if(!/ryanair/i.test(context))continue;
  const number=match[0].replace(/\s/g,"").toUpperCase();
  const times=[...context.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)].map(m=>time24(m[0]));
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
    if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(destination)||!(origin==="NUE"||destination==="NUE")||!/^\d{4}-\d{2}-\d{2}$/.test(date))return cors(JSON.stringify({error:"Invalid schedule parameters; every tracked route must touch NUE and include a date."}),400,{"Content-Type":"application/json"});
    let flights=[],source="Nuremberg Airport";
    try{flights=await nurembergFlights(origin,destination,date);}catch(error){source="Nuremberg Airport unavailable";}
    if(!flights.length){
     source+="; Google Search fallback";
     try{flights=await googleFlights(origin,destination,date);}catch(error){source+=" unavailable";}
    }
    const googleSearchUrl="https://www.google.com/search?q="+encodeURIComponent("Ryanair flight "+origin+" "+destination+" "+date+" flight number schedule");
    return cors(JSON.stringify(daySchedule(date,flights,source,googleSearchUrl)),200,{"Content-Type":"application/json","X-WTBD-Schedule-Sources":source,"Access-Control-Expose-Headers":"X-WTBD-Schedule-Sources"});
   }
   if(u.pathname==="/api/observed" || u.pathname==="/api/overflights"){
    if(!env.FLYITALYADSB_API_KEY)return cors(JSON.stringify({error:"FLYITALYADSB_API_KEY secret is not configured on this Worker."}),503,{"Content-Type":"application/json"});
    let targetUrl="";
    if(u.pathname==="/api/observed"){
     const airport=(u.searchParams.get("airport")||"").toUpperCase(),type=(u.searchParams.get("type")||"arrivals").toLowerCase(),date=u.searchParams.get("date")||"";
     if(!/^[A-Z]{3,4}$/.test(airport)||!["arrivals","departures"].includes(type)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return cors(JSON.stringify({error:"Invalid observed-flight parameters"}),400,{"Content-Type":"application/json"});
     targetUrl="https://api.flyitalyadsb.com/v2/flights/airport/"+encodeURIComponent(airport)+"?type="+type+"&date="+date;
    }else{
     const lat=Number(u.searchParams.get("lat")),lon=Number(u.searchParams.get("lon")),from=u.searchParams.get("from")||"",to=u.searchParams.get("to")||"",dist=Number(u.searchParams.get("dist")||10),fm=Date.parse(from),tm=Date.parse(to);
     if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||dist<1||dist>10||!Number.isFinite(fm)||!Number.isFinite(tm)||tm<=fm||tm-fm>21600000)return cors(JSON.stringify({error:"Invalid overflight parameters; Free tier allows up to 10 km and 6 hours."}),400,{"Content-Type":"application/json"});
     targetUrl="https://api.flyitalyadsb.com/v2/overflights?lat="+lat+"&lon="+lon+"&dist="+dist+"&from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to);
    }
    const upstream=await fetch(targetUrl,{headers:{"Accept":"application/json","X-Api-Key":env.FLYITALYADSB_API_KEY,"User-Agent":"WhatsTheBoyDoing/11.0"}});
    const body=await upstream.text();
    return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json","Cache-Control":"public, max-age=60","X-WTBD-Observed-Source":"FlyItalyADSB"});
   }
   let target,hex="";
   if(u.pathname==="/api/aircraft"){
    const lat=Number(u.searchParams.get("lat")),lon=Number(u.searchParams.get("lon")),dist=Number(u.searchParams.get("dist")||35);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||dist<1||dist>250)return cors(JSON.stringify({error:"Invalid ADS-B search parameters"}),400,{"Content-Type":"application/json"});
    target="https://api.adsb.lol/v2/lat/"+lat+"/lon/"+lon+"/dist/"+dist;
    // The app expresses radius in nautical miles. FlyItalyADSB /v2 expects kilometres.
    const km=Math.min(500,Math.round(dist*1.852));
    if(env.FLYITALYADSB_API_KEY){
     const primary="https://api.flyitalyadsb.com/v2/lat/"+lat+"/lon/"+lon+"/dist/"+km;
     try{
      const live=await fetch(primary,{headers:{"Accept":"application/json","X-Api-Key":env.FLYITALYADSB_API_KEY,"User-Agent":"WhatsTheBoyDoing/12.0"},cf:{cacheTtl:2,cacheEverything:true}});
      const body=await live.text();let parsed=null;try{parsed=JSON.parse(body);}catch{}
      if(live.ok&&Array.isArray(parsed?.ac)&&parsed.ac.length>0)return cors(JSON.stringify(parsed),200,{"Content-Type":"application/json","Cache-Control":"no-store","X-WTBD-ADS-B-Source":"FlyItalyADSB","Access-Control-Expose-Headers":"X-WTBD-ADS-B-Source"});
     }catch(error){/* fall through to public ADS-B feeds */}
    }
   }else if(u.pathname==="/api/hex"){
    hex=(u.searchParams.get("icao")||"").toLowerCase();
    if(!/^[0-9a-f]{6}$/.test(hex))return cors(JSON.stringify({error:"Invalid ICAO hex"}),400,{"Content-Type":"application/json"});
    target="https://api.adsb.lol/v2/hex/"+hex;
    if(env.FLYITALYADSB_API_KEY){
     try{
      const live=await fetch("https://api.flyitalyadsb.com/v2/icao/"+hex,{headers:{"Accept":"application/json","X-Api-Key":env.FLYITALYADSB_API_KEY,"User-Agent":"WhatsTheBoyDoing/12.0"},cf:{cacheTtl:2,cacheEverything:true}});
      const body=await live.text();let parsed=null;try{parsed=JSON.parse(body);}catch{}
      if(live.ok&&parsed&&String(parsed.hex||"").toLowerCase()===hex)return cors(JSON.stringify({ac:[parsed]}),200,{"Content-Type":"application/json","Cache-Control":"no-store","X-WTBD-ADS-B-Source":"FlyItalyADSB","Access-Control-Expose-Headers":"X-WTBD-ADS-B-Source"});
     }catch(error){/* fall through to public ADS-B feeds */}
    }
   }else return cors(JSON.stringify({error:"Unknown endpoint"}),404,{"Content-Type":"application/json"});
   // Fallbacks use nautical miles and readsb-compatible responses.
   const targets=[
    {url:target,source:"ADSB.lol"},
    {url:target.replace("https://api.adsb.lol/v2/","https://opendata.adsb.fi/api/v2/"),source:"ADSB.fi"}
   ];
   let lastResponse=null,lastText="";
   for(const candidate of targets){
    try{
     const upstream=await fetch(candidate.url,{headers:{"Accept":"application/json"},cf:{cacheTtl:2,cacheEverything:true}});
     const body=await upstream.text();
     lastResponse=upstream;lastText=body;
     if(!upstream.ok)continue;
     let parsed=null;try{parsed=JSON.parse(body);}catch{}
     const hasAircraft=Array.isArray(parsed?.ac)?parsed.ac.length>0:true;
     if(hasAircraft){
      return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json","Cache-Control":"no-store","X-WTBD-ADS-B-Source":candidate.source,"Access-Control-Expose-Headers":"X-WTBD-ADS-B-Source"});
     }
    }catch(error){lastText=String(error);}
   }
   if(lastResponse)return cors(lastText,lastResponse.status,{"Content-Type":lastResponse.headers.get("Content-Type")||"application/json","X-WTBD-ADS-B-Source":"ADSB.lol + ADSB.fi unavailable"});
   return cors(JSON.stringify({error:"All free ADS-B sources are unavailable",detail:lastText}),502,{"Content-Type":"application/json"});
  }catch(error){return cors(JSON.stringify({error:"Upstream request failed",detail:String(error)}),502,{"Content-Type":"application/json"});}
 }
};
