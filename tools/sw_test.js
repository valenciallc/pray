/* اختبار محلي لعامل الخدمة: يحاكي Cache Storage والشبكة ويتحقق من رفض النسخ المتلاعب بها.
   يعمل بدون متصفح، ويُشغّل sw.js الحقيقي داخل vm. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SCOPE = "https://example.github.io/pray/";
const ORIGIN = "https://example.github.io";
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "prayer_update.json"), "utf8"));

const bytes = (name) => fs.readFileSync(path.join(ROOT, name));
const contents = {
  "index.html": bytes("index.html"),
  "styles.css": bytes("styles.css"),
  "app.js": bytes("app.js"),
  "logo.webp": bytes("logo.webp"),
  "prayer_update.json": Buffer.from(JSON.stringify(meta), "utf8"),
};
const tampered = new Set();

let failures = 0;
function ok(condition, message) {
  if (condition) console.log("  ✔ " + message);
  else { failures++; console.log("  ✖ " + message); }
}

const store = new Map();
const keyOf = (req) => typeof req === "string" ? new URL(req, SCOPE).href : (req.url || String(req));
const cache = {
  async put(req, res) { store.set(keyOf(req), res.clone()); },
  async match(req) { const r = store.get(keyOf(req)); return r ? r.clone() : undefined; },
  async add(req) {
    const res = await fetchMock(req);
    if (res && res.ok) await this.put(req, res);
  },
};
const caches = {
  async open() { return cache; },
  async keys() { return ["prayer-v" + meta.version]; },
  async delete() { return true; },
};

async function fetchMock(input) {
  const url = new URL(typeof input === "string" ? input : input.url, SCOPE);
  let name = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!name || name === "pray") name = "index.html";
  let body = contents[name];
  if (!body) return new Response("", { status: 404 });
  if (tampered.has(name)) body = Buffer.concat([body, Buffer.from("\n/* متلاعب */\n")]);
  const type = name.endsWith(".json") ? "application/json"
    : name.endsWith(".css") ? "text/css"
    : name.endsWith(".js") ? "application/javascript" : "text/html";
  return new Response(body, { status: 200, headers: { "Content-Type": type } });
}

const handlers = {};
const broadcasts = [];
const selfMock = {
  addEventListener: (type, fn) => { (handlers[type] || (handlers[type] = [])).push(fn); },
  registration: { scope: SCOPE, showNotification: async () => {} },
  clients: { matchAll: async () => [] },
  location: { origin: ORIGIN },
  skipWaiting: async () => {},
};
const pending = [];
const sandbox = {
  self: selfMock, caches, crypto: webcrypto, fetch: fetchMock,
  Request, Response, URL, setTimeout, clearTimeout, console,
  broadcast: undefined,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), sandbox, { filename: "sw.js" });

// نستبدل broadcast بسجل محلي دون تعديل sw.js.
vm.runInContext('broadcast = function(msg){ globalThis.__broadcasts.push(msg) }', sandbox);
sandbox.__broadcasts = broadcasts;

async function fire(type, event) {
  for (const fn of handlers[type] || []) fn(event);
  await Promise.all(pending.splice(0));
}

(async () => {
  console.log("1) التخزين الأولي والتحقق من البصمات");
  await fire("install", { waitUntil: (p) => pending.push(p) });
  for (const name of ["index.html", "styles.css", "app.js", "logo.webp", "prayer_update.json", ""]) {
    ok(store.has(new URL(name, SCOPE).href), "تم تخزين " + (name || "./"));
  }
  for (const name of ["styles.css", "app.js"]) {
    const res = await cache.match(new URL(name, SCOPE).href);
    const saved = Buffer.from(await res.arrayBuffer());
    ok(saved.equals(contents[name]), "النسخة المخزنة من " + name + " مطابقة للملف");
  }

  console.log("2) رفض نسخة شبكية متلاعب بها والعودة للمخزن");
  tampered.add("app.js");
  let responsePromise = null;
  await fire("fetch", {
    request: new Request(new URL("app.js", SCOPE).href),
    respondWith: (p) => { responsePromise = p; },
  });
  const served = Buffer.from(await (await responsePromise).arrayBuffer());
  ok(served.equals(contents["app.js"]), "النسخة السليمة المخزنة تُقدَّم بدل النسخة المتلاعب بها");
  ok(broadcasts.some((m) => m.type === "UPDATE_TAMPERED"), "يُذاع إنذار UPDATE_TAMPERED");
  tampered.delete("app.js");

  console.log("3) رسالة VERIFY_UPDATE تقبل الملفات الثلاثة");
  let portMessage = null;
  await fire("message", {
    data: { type: "VERIFY_UPDATE" },
    ports: [{ postMessage: (m) => { portMessage = m; } }],
    waitUntil: (p) => pending.push(p),
  });
  ok(!!portMessage && portMessage.ok === true, "VERIFY_UPDATE نجح لكل الملفات");

  console.log("4) رسالة CACHE_VERIFIED ترفض ملفاً متلاعباً به");
  const key = new URL("app.js", SCOPE).href;
  store.delete(key);
  const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const bad = Buffer.concat([contents["app.js"], Buffer.from("\n/* متلاعب */")]);
  await fire("message", {
    data: {
      type: "CACHE_VERIFIED",
      buffer: toArrayBuffer(contents["index.html"]),
      files: [{ path: "app.js", buffer: toArrayBuffer(bad) }],
    },
    ports: [],
    waitUntil: (p) => pending.push(p),
  });
  ok(!store.has(key), "لم تُخزَّن نسخة app.js المتلاعب بها");

  console.log(failures ? "\n✖ فشل " + failures + " اختبار" : "\n✔ جميع اختبارات عامل الخدمة نجحت");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("✖ تعذّر تشغيل اختبار عامل الخدمة:", e);
  process.exit(1);
});
