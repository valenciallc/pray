/* أوقات الصلاة — عامل الخدمة v27
   - تحديث آمن: يُتحقق من index.html و app.js و styles.css عبر SHA-256 قبل تخزينها.
   - أوقات الصلاة تعمل دون إنترنت، وprayer_update.json يُجلب من الشبكة أولاً.
*/
"use strict";
const SW_VERSION = 27;
const CACHE = "prayer-v" + SW_VERSION;
const CONTENT_TYPES = {
  "index.html": "text/html; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "app.js": "application/javascript; charset=utf-8"
};
const CORE = [
  "logo.webp",
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

const isValidAssetName = (name) => /^[A-Za-z0-9._-]+\.(css|js)$/.test(String(name || ""));

function validMeta(j) {
  if (!j || typeof j !== "object") return false;
  if (j.index && !/^[A-Za-z0-9._-]+\.html?$/.test(String(j.index))) return false;
  if (typeof j.sha256 === "string") {
    if (!/^[a-f0-9]{64}$/i.test(j.sha256)) return false;
  }
  if (j.files !== undefined) {
    if (!j.files || typeof j.files !== "object" || Array.isArray(j.files)) return false;
    for (const [name, entry] of Object.entries(j.files)) {
      if (!isValidAssetName(name) || !entry || typeof entry !== "object") return false;
      if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256)) return false;
      if (!Number.isFinite(entry.size)) return false;
    }
  }
  return true;
}

// يجلب ملفاً ويتحقق من بصمته وحجمه قبل إعادته؛ يُعيد null عند أي عدم تطابق.
async function fetchVerifiedAsset(name, expected) {
  const r = await fetch(urlOf(name) + "?v=" + Date.now(), { cache: "reload" });
  if (!r || !r.ok) return null;
  const buf = await r.arrayBuffer();
  if (expected && Number.isFinite(expected.size) && buf.byteLength !== expected.size) return null;
  if (expected && expected.sha256 && crypto.subtle) {
    const hex = await sha256Hex(buf);
    if (hex !== String(expected.sha256).toLowerCase()) return null;
  }
  return buf;
}

async function putVerified(name, buf) {
  const cache = await caches.open(CACHE);
  await cache.put(urlOf(name), new Response(buf, {
    headers: { "Content-Type": CONTENT_TYPES[name] || "application/octet-stream" }
  }));
}

async function fetchMeta() {
  try {
    const r = await fetch(urlOf("prayer_update.json") + "?ts=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!validMeta(j)) return null;
    if (typeof j.sha256 === "string") j.sha256 = j.sha256.toLowerCase();
    if (j.files) {
      for (const entry of Object.values(j.files)) entry.sha256 = entry.sha256.toLowerCase();
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
  // ملفات التطبيق الإضافية لا تُخزّن إلا بعد التحقق من بصمتها.
  if (updateMeta && updateMeta.files) {
    for (const [name, expected] of Object.entries(updateMeta.files)) {
      if (!isValidAssetName(name)) continue;
      try {
        const buf = await fetchVerifiedAsset(name, expected);
        if (buf) await putVerified(name, buf);
        else broadcast({ type: "UPDATE_TAMPERED", version: updateMeta.version || 0, reason: "precache:" + name });
      } catch (e) {}
    }
  }
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

/* الجدولة المسبقة للإشعارات في المتصفحات التي تدعم Notification Triggers.
   نحتفظ بالوسوم في Cache Storage لإلغاء الإشعارات القديمة عند تحديث الجدول. */
const SCHEDULE_STORE = "prayer-schedule-v1";
let scheduledTags = [];
async function loadScheduledTags() {
  try {
    const cache = await caches.open(SCHEDULE_STORE);
    const r = await cache.match("tags");
    const j = r ? await r.json() : [];
    scheduledTags = Array.isArray(j) ? j.filter(x => typeof x === "string") : [];
  } catch (e) { scheduledTags = []; }
}
async function saveScheduledTags(tags) {
  scheduledTags = tags;
  try {
    const cache = await caches.open(SCHEDULE_STORE);
    await cache.put("tags", new Response(JSON.stringify(tags), {
      headers: { "Content-Type": "application/json" }
    }));
  } catch (e) {}
}
async function closeScheduledNotifications(tags) {
  if (!self.registration.getNotifications) return;
  for (const tag of tags) {
    try {
      const list = await self.registration.getNotifications({ tag });
      list.forEach(n => n.close());
    } catch (e) {}
  }
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

// يُطبّق على app.js و styles.css: لا تُقبل نسخة شبكية لا تطابق البصمة المسجلة.
async function verifiedAssetResponse(request, name) {
  const cache = await caches.open(CACHE);
  if (!updateMeta) updateMeta = await fetchMeta();
  const expected = updateMeta && updateMeta.files && updateMeta.files[name];
  let network = null;
  try {
    network = await Promise.race([
      fetch(request, { cache: "no-store" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
    ]);
  } catch (e) { network = null; }

  const fallback = async () => (await cache.match(urlOf(name))) ||
    new Response("", { status: 504, headers: { "Content-Type": CONTENT_TYPES[name] || "text/plain" } });

  if (!network || !network.ok) return fallback();
  if (!expected || !expected.sha256 || !crypto.subtle) {
    try { await cache.put(urlOf(name), network.clone()); } catch (e) {}
    return network;
  }
  try {
    const buf = await network.clone().arrayBuffer();
    const hex = await sha256Hex(buf);
    const sizeOk = !Number.isFinite(expected.size) || buf.byteLength === expected.size;
    if (hex !== String(expected.sha256).toLowerCase() || !sizeOk) {
      broadcast({ type: "UPDATE_TAMPERED", version: updateMeta.version || 0, reason: "asset:" + name });
      return fallback();
    }
    const response = new Response(buf, {
      headers: { "Content-Type": CONTENT_TYPES[name] || "application/octet-stream" }
    });
    await putVerified(name, buf);
    return response;
  } catch (e) {
    return fallback();
  }
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
      if (validMeta(j)) {
        if (typeof j.sha256 === "string") j.sha256 = j.sha256.toLowerCase();
        if (j.files) for (const entry of Object.values(j.files)) entry.sha256 = entry.sha256.toLowerCase();
        updateMeta = j;
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
  if (url.pathname.endsWith("/styles.css") || url.pathname.endsWith("/app.js")) {
    const name = url.pathname.split("/").pop();
    event.respondWith(verifiedAssetResponse(req, name));
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
  if (data.type === "SCHEDULE_WEB_NOTIFS") {
    event.waitUntil((async () => {
      const supported = typeof self.TimestampTrigger === "function";
      const events = Array.isArray(data.events) ? data.events : [];
      await loadScheduledTags();
      await closeScheduledNotifications(scheduledTags);
      const tags = [];
      if (supported) {
        const now = Date.now();
        for (const ev of events.slice(0, 60)) {
          const when = Number(ev && ev.epoch);
          if (!Number.isFinite(when) || when <= now + 1000) continue;
          const raw = String((ev && ev.id) || ((ev && ev.kind) || "event") + "-" + when);
          const tag = "prayer-sched-" + raw.replace(/[^\w\-:|]/g, "_");
          try {
            await self.registration.showNotification(String((ev && ev.title) || "🕌 أوقات الصلاة"), {
              body: String((ev && ev.text) || "حان وقت الصلاة"),
              icon: urlOf("icon-192.png"),
              badge: urlOf("icon-192.png"),
              tag: tag,
              dir: "rtl",
              lang: "ar",
              vibrate: [120, 60, 120],
              data: { url: urlOf("index.html") },
              showTrigger: new self.TimestampTrigger(when)
            });
            tags.push(tag);
          } catch (e) {}
        }
      }
      await saveScheduledTags(tags);
      broadcast({ type: "WEB_SCHEDULE_READY", count: tags.length, supported: supported });
    })());
    return;
  }
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
        let ok = true;
        const r = await fetch(urlOf(meta.index || "index.html") + "?verify=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error("fetch");
        const buf = await r.arrayBuffer();
        if (meta.sha256) {
          const hex = await sha256Hex(buf);
          if (hex !== meta.sha256 || (Number.isFinite(meta.size) && buf.byteLength !== meta.size)) ok = false;
        }
        if (ok) await putVerified("index.html", buf);
        for (const [name, expected] of Object.entries(meta.files || {})) {
          if (!isValidAssetName(name)) { ok = false; continue; }
          let asset = null;
          try { asset = await fetchVerifiedAsset(name, expected); } catch (e) {}
          if (!asset) { ok = false; continue; }
          await putVerified(name, asset);
        }
        if (ok) broadcast({ type: "UPDATE_VERIFIED", version: meta.version || SW_VERSION });
        else broadcast({ type: "UPDATE_TAMPERED", version: meta.version || 0, reason: "hash" });
        if (port) port.postMessage({ ok: ok, version: meta.version || SW_VERSION });
      } catch (e) {
        if (port) port.postMessage({ ok: false, error: "network" });
      }
    })());
    return;
  }
  if (data.type === "CACHE_VERIFIED" && (data.buffer || data.files)) {
    event.waitUntil((async () => {
      try {
        const meta = updateMeta || await fetchMeta();
        if (!meta) return;
        if (data.buffer) {
          if (meta.sha256) {
            const hex = await sha256Hex(data.buffer);
            if (hex !== meta.sha256) { broadcast({ type: "UPDATE_TAMPERED", reason: "client-hash" }); return; }
          }
          await putVerified("index.html", data.buffer);
        }
        const received = Array.isArray(data.files) ? data.files : [];
        const expectedFiles = meta.files || {};
        for (const item of received) {
          const name = String((item && item.path) || "");
          if (!Object.prototype.hasOwnProperty.call(expectedFiles, name) || !isValidAssetName(name)) continue;
          if (!(item.buffer instanceof ArrayBuffer)) continue;
          const expected = expectedFiles[name];
          const hex = await sha256Hex(item.buffer);
          if (hex !== String(expected.sha256).toLowerCase() ||
              (Number.isFinite(expected.size) && item.buffer.byteLength !== expected.size)) {
            broadcast({ type: "UPDATE_TAMPERED", reason: "client-hash:" + name });
            return;
          }
          await putVerified(name, item.buffer);
        }
        broadcast({ type: "UPDATE_VERIFIED", version: meta.version || SW_VERSION });
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
