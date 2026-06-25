// service-worker.js
const CACHE_NAME = "fuelcontrol-v6";

// Quitamos los íconos de aquí para que si hay un error con la imagen, 
// no se bloquee toda la instalación de la app.
// FIX: se quitó "https://fonts.googleapis.com/..." (URL inválida/incompleta).
// Esa entrada rompía cache.addAll() en el evento "install", lo cual hacía
// fallar el registro COMPLETO del Service Worker y, por lo tanto, el modo
// offline no funcionaba en absoluto.
const STATIC_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

const NETWORK_FIRST_PATTERNS = [/index\.html$/, /app\.js$/, /style\.css$/, /\/$/];

self.addEventListener("install", event => {
  // FIX: cache.addAll() es "todo o nada" — si UN solo recurso falla
  // (URL mal escrita, CDN caído, etc.) se cancela el cacheo de TODOS los
  // demás y el Service Worker no queda listo para modo offline.
  // Cacheamos cada recurso por separado para que un fallo aislado no
  // tumbe el resto.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn("No se pudo cachear (se ignora, no bloquea instalación):", url, err)
          )
        )
      )
    )
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
