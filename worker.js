/**
 * What's the boy doing? — free API bridge
 * Deploy as a Cloudflare Worker. No API key is used.
 * Routes:
 *   /api/schedule?origin=NUE&destination=BUD&year=2026&month=11
 *   /api/aircraft?lat=49.4987&lon=11.078&dist=35
 *   /api/hex?icao=4CA123
 */
const ALLOWED = new Set(["services-api.ryanair.com", "api.adsb.lol"]);
function cors(body, status=200, headers={}) {
  return new Response(body, {status, headers:{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type",
    "Cache-Control":"no-store",
    ...headers
  }});
}
export default {
 async fetch(request) {
  if (request.method === "OPTIONS") return cors(null,204);
  const u = new URL(request.url);
  try {
   let target;
   if (u.pathname === "/api/schedule") {
    const o=(u.searchParams.get("origin")||"").toUpperCase();
    const d=(u.searchParams.get("destination")||"").toUpperCase();
    const y=Number(u.searchParams.get("year")), m=Number(u.searchParams.get("month"));
    if(!/^[A-Z]{3}$/.test(o)||!/^[A-Z]{3}$/.test(d)||y<2024||y>2035||m<1||m>12) return cors(JSON.stringify({error:"Invalid schedule parameters"}),400,{"Content-Type":"application/json"});
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
   return cors(body,upstream.status,{"Content-Type":upstream.headers.get("Content-Type")||"application/json"});
  } catch(e) {
   return cors(JSON.stringify({error:"Upstream request failed",detail:String(e)}),502,{"Content-Type":"application/json"});
  }
 }
};