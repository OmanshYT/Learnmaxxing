/*
  Offline shell for the Chem Study Hub.

  Every path here is relative to the service worker's own location, so the same
  file works at a domain root and under a GitHub Pages sub-path
  (/Learnmaxxing/). The app is a handful of static files, so a cache-first
  shell plus a background refresh is enough — no build step, no CDN runtime.
*/
"use strict";

const VERSION = "chem-hub-v1";
const SHELL = [
  "",
  "index.html",
  "styles.css",
  "app.js",
  "ui.js",
  "library.js",
  "data.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
];

const url = (p) => new URL(p, self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // One missing file must not block the whole install.
      .then((cache) => Promise.all(SHELL.map((p) => cache.add(url(p)).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const target = new URL(req.url);
  // The PDF reader is a cross-origin ES module; leave it to the network.
  if (target.origin !== self.location.origin) return;

  // Opening the site: try the network, fall back to the saved shell so a dead
  // signal still opens the hub.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url("index.html"), copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(url("index.html"))
            .then((hit) => hit || caches.match(url("")))
            .then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Everything else: serve the cached copy at once, refresh it in the
  // background so the next visit gets the new build.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    })
  );
});
