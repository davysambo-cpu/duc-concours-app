/**
 * SERVICE WORKER DUC CONCOURS (Mode Développement & Production)
 * Stratégie Network-First : Priorité aux fichiers frais, secours hors-ligne immédiat
 */

const CACHE_NAME = 'duc-concours-v21';

const FICHIERS_ESSENTIELS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './supabaseClient.js',
  './questions_prod.json',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_ESSENTIELS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Réseau en priorité, cache en secours si hors-ligne
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (!networkResponse || !networkResponse.ok) {
          return networkResponse;
        }
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => caches.match(event.request))
  );
});