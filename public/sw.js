// DuoCount service worker — offline app shell + safe caching.
//
// Scope is deliberately narrow: it only ever handles same-origin GET requests,
// so Firebase (Firestore/Auth, cross-origin) and this app's own /api/ routes
// always go straight to the network and are never cached. That keeps counts
// live and never serves stale data for anything that must be fresh.
const CACHE = "duocount-v1";
const SHELL = ["/", "/offline.html", "/manifest.json", "/favicon.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCacheableAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /\.(?:css|js|png|svg|webp|woff2?)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase & other origins pass through
  if (url.pathname.startsWith("/api/")) return;     // API routes are never cached

  // Page navigations: network-first (fresh app), fall back to cache, then the
  // offline page — so a launch with no connection still shows something branded.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/offline.html")))
    );
    return;
  }

  // Hashed static assets: cache-first (immutable), populate on first fetch.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
      )
    );
  }
});
