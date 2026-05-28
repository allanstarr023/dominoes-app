const CACHE_NAME = "dominoes-table-v44";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=44",
  "/app.js?v=44",
  "/boardLayout.js?v=44",
  "/pixiBoardRenderer.js?v=44",
  "/vendor/pixi.min.mjs?v=44",
  "/manifest.webmanifest?v=44",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
