/* ==========================================================
   KSI STUDIO – Service Worker
   Estrategia: precache del "app shell" + stale-while-revalidate.
   Resultado: carga instantánea y funcionamiento sin conexión.
   Supabase (*.supabase.co) NUNCA se cachea: siempre va a la red
   y la app maneja su propio respaldo local en script.js.
   ========================================================== */

const CACHE = "ksi-studio-v1"; // súbelo a v2, v3... al publicar cambios grandes

// Recursos propios (obligatorios)
const RECURSOS_LOCALES = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./muebles.json",
  "./manifest.json"
];

// Librerías CDN (mantener sincronizado con index.html). Si alguna falla, no rompe la instalación.
const RECURSOS_CDN = [
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
  "https://code.jquery.com/jquery-3.7.1.min.js",
  "https://code.jquery.com/ui/1.13.2/jquery-ui.min.js",
  "https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.css",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

// ---------- INSTALACIÓN ----------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(RECURSOS_LOCALES);
    await Promise.allSettled(RECURSOS_CDN.map(async (url) => {
      const resp = await fetch(url, { mode: "cors" });
      if (resp.ok) await cache.put(url, resp);
    }));
    await self.skipWaiting();
  })());
});

// ---------- ACTIVACIÓN: limpia cachés antiguas ----------
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---------- FETCH ----------
async function staleWhileRevalidate(request, clave) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(clave || request, { ignoreSearch: true });
  const red = fetch(request)
    .then((resp) => {
      if (resp && (resp.ok || resp.type === "opaque")) cache.put(clave || request, resp.clone());
      return resp;
    })
    .catch(() => null);

  if (enCache) return enCache;                       // instantáneo desde caché
  const resp = await red;                            // primera visita: red
  if (resp) return resp;
  if (clave) {                                       // navegación offline: app shell
    const shell = await cache.match("./index.html");
    if (shell) return shell;
  }
  return new Response("Sin conexión", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Datos en vivo y enlaces externos: sin intervención del SW
  if (url.hostname.endsWith("supabase.co") || url.hostname === "wa.me" || url.protocol === "data:") return;

  if (req.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(req, "./index.html"));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
