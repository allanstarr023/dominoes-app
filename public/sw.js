const CACHE_NAME = "dominoes-table-v75";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=75",
  "/app.js?v=75",
  "/audio.js?v=75",
  "/boardLayout.js?v=75",
  "/championshipDayCharts.js?v=75",
  "/pixiBoardRenderer.js?v=75",
  "/vendor/echarts.esm.min.mjs?v=75",
  "/vendor/pixi.min.mjs?v=75",
  "/manifest.webmanifest?v=75",
  "/icon.svg?v=75",
  "/favicon.ico?v=75",
  "/audio/domino-tile.wav?v=75",
  "/audio/domino-slam.wav?v=75"
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
