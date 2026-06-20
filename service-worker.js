// service-worker.js — FuelControl PWA
// IMPORTANTE: sube este número (v2, v3, v4...) CADA VEZ que publiques cambios
// en index.html / app.js / style.css. Si no lo subes, los navegadores que ya
// tengan la app instalada pueden tardar en notar que hay una versión nueva.
const CACHE_NAME = "fuelcontrol-v3";

const STATIC_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono&display=swap"
];

// Archivos del "app shell" que cambian seguido: siempre se intenta traer la
// versión más nueva de internet primero; el caché es solo respaldo offline.
const NETWORK_FIRST_PATTERNS = [/index\.html$/, /app\.js$/, /style\.css$/, /\/$/];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = event.request.url;

  // Firebase: siempre red, sin caché de respaldo más que el último visto
  if (url.includes("firebase") || url.includes("googleapis.com/identitytoolkit")) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // App shell propio: red primero (para recibir actualizaciones al instante),
  // y si no hay internet, usamos lo último que quedó guardado en caché.
  if (NETWORK_FIRST_PATTERNS.some(re => re.test(url))) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto de recursos (fuentes, etc.): caché primero, red como respaldo
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
