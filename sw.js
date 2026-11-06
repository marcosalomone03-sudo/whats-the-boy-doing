const CACHE="wtbd-v2-shell";
const FILES=["./","./index.html","./app.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin===location.origin&&e.request.method==="GET"){e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));}});
