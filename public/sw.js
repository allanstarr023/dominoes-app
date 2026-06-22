const CACHE_NAME = "dominoes-table-v80";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=80",
  "/app.js?v=80",
  "/audio.js?v=79",
  "/boardLayout.js?v=80",
  "/championshipDayCharts.js?v=79",
  "/pixiBoardRenderer.js?v=80",
  "/vendor/echarts.esm.min.mjs?v=80",
  "/vendor/pixi.min.mjs?v=80",
  "/manifest.webmanifest?v=80",
  "/icon.svg?v=80",
  "/favicon.ico?v=80",
  "/audio/domino-tile.wav?v=80",
  "/audio/domino-slam.wav?v=80"
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
