/* أوقات الصلاة — عامل الخدمة v13
   - تحديث آمن: يُتحقق من index.html عبر SHA-256 قبل تخزينه.
   - أوقات الصلاة تعمل دون إنترنت، وprayer_update.json يُجلب من الشبكة أولاً.
*/
"use strict";
const SW_VERSION = 13;
const CACHE = "prayer-v" + SW_VERSION;
const CORE = [
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "logo.png",
  "السريحي.mp3",
  "اقامة.mp3"
];
let updateMeta = null;

const urlOf = (path) => new URL(path, self.registration.scope).toString();

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchMeta() {
  try {
    const r = await fetch(urlOf("prayer_update.json") + "?ts=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== "object") return null;
    if (j.index && !/^[A-Za-z0-9._-]+\.html?$/.test(String(j.index))) return null;
    if (typeof j.sha256 === "string") {
      j.sha256 = j.sha256.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(j.sha256)) return null;
    }
    return j;
  } catch (e) { return null; }
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE.map(async (u) => {
    try { await cache.add(new Request(urlOf(u), { cache: "reload" })); } catch (e) { /* ملف اختياري */ }
  }));
  updateMeta = await fetchMeta();
  // لا نخزّن index.html قبل التحقق من بصمته (إن وُجدت بصمة).
  try {
    const res = await fetch(urlOf("index.html"), { cache: "reload" });
    if (res && res.ok) {
      const buf = await res.arrayBuffer();
      let ok = true;
      if (updateMeta && updateMeta.sha256 && crypto.subtle) {
        ok = (await sha256Hex(buf)) === updateMeta.sha256;
      }
      if (ok) {
        const headers = { "Content-Type": "text/html; charset=utf-8" };
        await cache.put(urlOf("index.html"), new Response(buf, { headers }));
        await cache.put(urlOf("./"), new Response(buf, { headers }));
      } else {
        broadcast({ type: "UPDATE_TAMPERED", version: updateMeta.version || 0, reason: "precache" });
      }
    }
  } catch (e) {}
  if (updateMeta) {
    try { await cache.put(urlOf("prayer_update.json"), new Response(JSON.stringify(updateMeta), { headers: { "Content-Type": "application/json" } })); } catch (e) {}
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    updateMeta = await fetchMeta();
    await self.clients.claim();
  })());
});

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(list => {
    list.forEach(c => c.postMessage(msg));
  });
}

async function verifiedIndexResponse(request) {
  let network = null;
  try {
    network = await Promise.race([
      fetch(request, { cache: "no-store" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
    ]);
  } catch (e) { network = null; }
  const cache = await caches.open(CACHE);
  if (!network || !network.ok) {
    return (await cache.match(urlOf("index.html"))) || (await cache.match(urlOf("./"))) || new Response(
      "<!doctype html><meta charset=utf-8><title>غير متصل</title><body style='font-family:sans-serif;text-align:center;padding:40px'>التطبيق غير متاح دون اتصال. افتحه مرة واحدة على الشبكة أولاً.</body>",
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
    );
  }
  if (!updateMeta) updateMeta = await fetchMeta();
  if (updateMeta && updateMeta.sha256 && crypto.subtle) {
    try {
      const buf = await network.clone().arrayBuffer();
      const hex = await sha256Hex(buf);
      if (hex !== updateMeta.sha256) {
        broadcast({ type: "UPDATE_TAMPERED", version: updateMeta.version || 0 });
        const old = (await cache.match(urlOf("index.html"))) || (await cache.match(urlOf("./")));
        if (old) return old;
        return new Response("Update integrity check failed", { status: 502 });
      }
      broadcast({ type: "UPDATE_VERIFIED", version: updateMeta.version || SW_VERSION });
    } catch (e) { /* لا نمنع العرض إذا تعذّر التحقق محلياً */ }
  }
  try { await cache.put(urlOf("index.html"), network.clone()); } catch (e) {}
  return network;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(async (res) => {
    if (res && res.ok) { try { await cache.put(request, res.clone()); } catch (e) {} }
    return res;
  }).catch(() => null);
  return cached || network || new Response("", { status: 504 });
}

async function networkFirstMeta(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: "no-store" });
    if (res && res.ok) {
      const j = await res.clone().json();
      const validIndex = !j.index || /^[A-Za-z0-9._-]+\.html?$/.test(String(j.index));
      const validHash = typeof j.sha256 !== "string" || /^[a-f0-9]{64}$/i.test(j.sha256);
      if (j && validIndex && validHash) {
        if (typeof j.sha256 === "string") { j.sha256 = j.sha256.toLowerCase(); updateMeta = j; }
        try { await cache.put(urlOf("prayer_update.json"), res.clone()); } catch (e) {}
        return res;
      }
    }
  } catch (e) {}
  const cached = await cache.match(urlOf("prayer_update.json"));
  if (cached) return cached;
  return new Response(JSON.stringify(updateMeta || {}), { headers: { "Content-Type": "application/json" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    event.respondWith(verifiedIndexResponse(req));
    return;
  }
  if (url.pathname.endsWith("prayer_update.json")) {
    event.respondWith(networkFirstMeta(req));
    return;
  }
  if (/\.(?:mp3|png|svg|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (data.type === "GET_VERSION") {
    if (port) port.postMessage({ version: SW_VERSION, cache: CACHE, meta: updateMeta });
    return;
  }
  if (data.type === "VERIFY_UPDATE") {
    event.waitUntil((async () => {
      const meta = await fetchMeta();
      if (!meta) { broadcast({ type: "UPDATE_TAMPERED", version: 0, reason: "meta" }); return; }
      updateMeta = meta;
      try {
        const r = await fetch(urlOf(meta.index || "index.html") + "?verify=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error("fetch");
        const buf = await r.arrayBuffer();
        const hex = await sha256Hex(buf);
        const ok = !meta.sha256 || hex === meta.sha256;
        if (ok) {
          const cache = await caches.open(CACHE);
          try { await cache.put(urlOf("index.html"), new Response(buf, { headers: { "Content-Type": "text/html; charset=utf-8" } })); } catch (e) {}
          broadcast({ type: "UPDATE_VERIFIED", version: meta.version || SW_VERSION });
        } else {
          broadcast({ type: "UPDATE_TAMPERED", version: meta.version || 0, reason: "hash" });
        }
        if (port) port.postMessage({ ok: ok, version: meta.version || SW_VERSION });
      } catch (e) {
        if (port) port.postMessage({ ok: false, error: "network" });
      }
    })());
    return;
  }
  if (data.type === "CACHE_VERIFIED" && data.buffer) {
    event.waitUntil((async () => {
      try {
        const expected = updateMeta && updateMeta.sha256;
        if (expected) {
          const hex = await sha256Hex(data.buffer);
          if (hex !== expected) { broadcast({ type: "UPDATE_TAMPERED", reason: "client-hash" }); return; }
        }
        const cache = await caches.open(CACHE);
        await cache.put(urlOf("index.html"), new Response(data.buffer, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      } catch (e) {}
    })());
    return;
  }
  if (data.type === "REJECT_UPDATE") {
    broadcast({ type: "UPDATE_TAMPERED", reason: "rejected" });
    return;
  }
});

/* إشعارات Push اختيارية للمستقبل */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const title = payload.title || "🕌 أوقات الصلاة";
  const body = payload.body || "حان وقت الصلاة";
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: urlOf("icon-192.png"),
    badge: urlOf("icon-192.png"),
    tag: payload.tag || "prayer",
    dir: "rtl",
    lang: "ar",
    vibrate: [120, 60, 120],
    data: { url: payload.url || urlOf("./") }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = (event.notification.data && event.notification.data.url) || urlOf("./");
  try {
    const u = new URL(target, self.registration.scope);
    if (u.origin !== self.location.origin) target = urlOf("./");
    else target = u.href;
  } catch (e) { target = urlOf("./"); }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) { c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
