// service-worker.js
const CACHE_NAME = "fuelcontrol-v5";

// Quitamos los íconos de aquí para que si hay un error con la imagen, 
// no se bloquee toda la instalación de la app.
const STATIC_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono&display=swap"
];

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

  if (url.includes("firebase") || url.includes("googleapis.com/identitytoolkit")) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

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

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
