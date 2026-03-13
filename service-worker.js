// ═══════════════════════════════════════════════════════════════
//  Ski Stations Weather PWA — Service Worker
//  Cache version: v5  (March 2026 — full-width layout + mobile scroll)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'ski-pwa-v5';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.json'
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: network-first for API calls, cache-first for assets ─
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Always go to network for weather / forecast API calls
    if (url.includes('openweathermap.org') || url.includes('open-meteo.com')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ error: 'Offline — no cached weather data available.' }),
                    { headers: { 'Content-Type': 'application/json' } })
            )
        );
        return;
    }

    // Cache-first for app shell (HTML, JS, CSS, manifest)
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request)
                .then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    }
                    return response;
                })
            )
    );
});
