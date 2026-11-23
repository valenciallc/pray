/* اختبار دخان: يشغّل index.html فعلياً في jsdom ويتحقق من ظهور البيانات.
   الهدف: منع تكرار مشكلة «الصفحة الفارغة» التي سببها خطأ تهيئة JavaScript. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const RAW_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const APP_JS = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

// index.html مرجع خارجي فقط؛ ندمج الملفات مؤقتاً لكي يعمل jsdom دون خادم ويب.
const CSS_LINK = '<link rel="stylesheet" href="styles.css">';
const APP_TAG = /<script src="app\.js"[^>]*><\/script>/;
if (!RAW_HTML.includes(CSS_LINK) || !APP_TAG.test(RAW_HTML) || /<style>/.test(RAW_HTML) || /<\/script>/.test(APP_JS)) {
  console.error("✖ بنية v20 غير صحيحة: index.html يجب أن يشير إلى styles.css و app.js فقط");
  process.exit(1);
}
const HTML = RAW_HTML
  .replace(CSS_LINK, "<style>\n" + CSS + "\n</style>")
  .replace(APP_TAG, "<script>\n" + APP_JS + "\n</script>");
let failures = 0;

function ok(condition, message) {
  if (condition) {
    console.log("  ✔ " + message);
  } else {
    failures++;
    console.log("  ✖ " + message);
  }
}

function isNoise(message) {
  // jsdom لا ينفّذ الوسائط، والخطأ المتعمد أدناه يُختبر حاجز الأخطاء.
  return /Not implemented|SMOKE_TEST_BOOM/.test(String(message));
}

async function boot(html, seed) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (!isNoise(e.message)) errors.push(e.message); });
  vc.on("error", (...a) => { if (!isNoise(a.join(" "))) errors.push("console.error: " + a.join(" ")); });
  const dom = new JSDOM(html, {
    url: "https://example.github.io/pray/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (seed) for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 2200));
  return { dom, errors };
}

(async () => {
  console.log("0) هيكلة الملفات والبصمة");
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "prayer_update.json"), "utf8"));
  ok(Number(meta.version) >= 20, "prayer_update.json يعلم v20 فأعلى: " + meta.version);
  ok(RAW_HTML.includes(CSS_LINK) && APP_TAG.test(RAW_HTML), "index.html يشير إلى styles.css و app.js");
  ok(RAW_HTML.includes('<meta name="format-detection" content="telephone=no">'), "منع تحويل الأرقام لهواتف مفعّل");
  ok(RAW_HTML.includes('rel="preload" as="image" href="logo.webp"') &&
     RAW_HTML.includes('srcset="logo.webp" type="image/webp"') && RAW_HTML.includes('<img src="logo.png"'),
     "الشعار WebP مع fallback PNG وتحميل مسبق");
  ok((RAW_HTML.match(/spellcheck="false"/g) || []).length >= 5, "حقول الوقت تمنع التصحيح التلقائي");
  ok(RAW_HTML.includes("prefers-color-scheme: dark"), "الوضع الداكن يُقرأ من النظام قبل تحميل الأنماط");
  ok(CSS.includes("touch-action:manipulation") && CSS.includes("scroll-behavior:smooth") &&
     CSS.includes("will-change:transform") && CSS.includes("prefers-reduced-motion:reduce"),
     "تحسينات اللمس والتمرير وwill-change موجودة مع احترام تقليل الحركة");
  const mainTabs = (RAW_HTML.match(/class="tb" data-go=/g) || []).length;
  ok(mainTabs === 3 && RAW_HTML.includes('id="tabSettings"'), "الواجهة مختصرة إلى ٤ تبويبات فقط");
  ok(RAW_HTML.includes('id="moreBtn"') && RAW_HTML.includes('id="moreMenu"') &&
     RAW_HTML.includes('id="advToggle"'), "قائمة المزيد والإعدادات المتقدمة موجودة");
  ok(CSS.includes(".more-menu") && CSS.includes(".settings-panel.show-advanced") &&
     CSS.includes("--lux-shadow"), "الطابع الفاخر والتبسيط موجودان في الأنماط");
  ok(APP_JS.includes("moreMenu") && APP_JS.includes("advToggle"), "ربط القائمة موجود في app.js");

  // v23 — التذكير التلقائي + ضبط الصوت والصلاحيات دون إزعاج
  ok(Number(meta.version) >= 23, "prayer_update.json يعلم v23 فأعلى: " + meta.version);
  ok(Array.isArray(meta.assets) && meta.assets.includes("index.html") &&
     meta.assets.includes("app.js"), "قائمة الأصول منشورة ليُنزَّل أي ملف جديد مستقبلاً");
  ok(fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "java", "com",
       "valenciallc", "pray", "ContentUpdater.java"), "utf8").includes("optJSONArray(\"assets\")"),
     "مُحدِّث أندرويد يقرأ قائمة الأصول من الخادم");
  ok(!RAW_HTML.includes('id="reminderBtn"') && !RAW_HTML.includes('id="tabReminder"'),
     "أزرار التذكير أُزيلت من القائمة والشريط");
  ok(RAW_HTML.includes('id="reminderToggleBtn"') && !RAW_HTML.includes('id="toggleSRemind"') &&
     !RAW_HTML.includes('id="remindInterval"'), "نظام التذكير موحّد — مفتاح واحد وفاصل واحد بلا تكرار");
  ok((RAW_HTML.match(/data-stab-panel="notif"/g) || []).length === 1,
     "لوحة الإشعارات غير مكررة داخل الإعدادات");
  ok(RAW_HTML.includes('<details class="adv-details" id="reminderMore">') &&
     !RAW_HTML.includes('<details class="adv-details" id="reminderMore" open'),
     "خيارات التذكير المتقدمة مخفية افتراضياً");
  const stabNames = Array.from(RAW_HTML.matchAll(/data-stab="([^"]+)"/g)).map(m => m[1]);
  const panelNames = Array.from(RAW_HTML.matchAll(/data-stab-panel="([^"]+)"/g)).map(m => m[1]);
  ok(stabNames.length === 5 && panelNames.length === 5 &&
     stabNames.slice().sort().join(",") === panelNames.slice().sort().join(",") &&
     panelNames.slice().sort().join(",") === "audio,calc,look,notif,system",
     "خمسة تبويبات فقط، كل لوحة موجودة مرة واحدة بلا تكرار");
  ok(!RAW_HTML.includes('data-stab="health"') && !RAW_HTML.includes('data-stab="pro"') &&
     !CSS.includes(".stab[data-stab=\"health\"]") && !CSS.includes(".stab[data-stab=\"pro\"]"),
     "تبويبا الصحة والمتقدم القديمان لم يعودا لوحتين منفصلتين");
  ok((RAW_HTML.match(/class="adv-details/g) || []).length >= 8,
     "كل التفاصيل الدقيقة موجودة كمقاطع قابلة للفتح داخل تبويباتها");
  ok(RAW_HTML.includes("advToggle") && RAW_HTML.includes("المزيد من الإعدادات") &&
     APP_JS.includes('querySelectorAll("details.adv-details")'),
     "زر «المزيد» يفتح كل التفاصيل دفعة واحدة");
  ok(RAW_HTML.includes('class="azk-group-title"') === false &&
     APP_JS.includes("AZK_GROUPS") && RAW_HTML.includes('class="azk-grid"'),
     "مكتبة الأذكار مرتّبة في مجموعات حسب المناسبة بدل قائمة واحدة");
  // v32 — تحسين الإعدادات والحساب: معاينة مباشرة، تحقق من المدخلات، وتعديل دقيق.
  ok(["calcPreview", "calcPreviewStatus", "cpFajr", "cpSunrise", "cpDhuhr", "cpAsr",
      "cpMaghrib", "cpIsha", "adjFajr", "adjIsha", "locMethodDefaults", "tzSuggestBtn"]
     .every(id => RAW_HTML.includes('id="' + id + '"')),
      "واجهة المعاينة والتعديل الدقيق واستعادة زوايا الطريقة موجودة");
  ok(CSS.includes(".calc-preview") && CSS.includes(".cp-grid") && CSS.includes(".cp b"),
      "أنماط معاينة الأوقات موجودة");
  ok(APP_JS.includes("function updateCalcPreview") && APP_JS.includes("function sanitizeLocInputs") &&
     APP_JS.includes("function restoreMethodDefaults") && APP_JS.includes("function suggestTzFromLng") &&
     APP_JS.includes("adjFajr:ADJ_FAJR,adjIsha:ADJ_ISHA"),
      "الحساب يقرأ الإزاحات الدقيقة ويحدّث المعاينة آمنياً");
  ok(RAW_HTML.includes('id="locLat" step="0.001" min="-90" max="90"') &&
     RAW_HTML.includes('id="locLng" step="0.001" min="-180" max="180"') &&
     RAW_HTML.includes('id="locTz" step="0.5" min="-12" max="14"'),
      "حدود صريحة لمدخلات الإحداثيات والتوقيت");
  // v33 — مكتبة الأذكار والأدعية: بحث، مفضلة، نسخ ومشاركة.
  ok(["matTools", "matSearch", "matFavBtn", "matClearBtn", "matStat", "matHint", "duaList"]
     .every(id => RAW_HTML.includes('id="' + id + '"')),
      "واجهة مكتبة المواد والبحث والمفضلة موجودة");
  ok(APP_JS.includes("MAT_FAV_KEY") && APP_JS.includes("function matPass") &&
     APP_JS.includes("function renderDuaLibrary") && APP_JS.includes("data-matfav") &&
     APP_JS.includes("data-matcopy") && APP_JS.includes("data-matshare"),
      "منطق البحث والمفضلة والنسخ والمشاركة موجود");
  ok(CSS.includes(".mat-controls") && CSS.includes(".mat-actions") && CSS.includes(".dua-grid"),
      "أنماط المكتبة وبطاقات الأدعية موجودة");
  ok(/matSearchPh:"[^"]+"/.test(APP_JS) && /matFavEmpty:"[^"]+"/.test(APP_JS),
      "نصوص المكتبة مترجمة ضمن حزمة اللغات");
  ok(/enabled\s*:\s*true/.test(APP_JS) && APP_JS.includes("prayerApp_v3_reminderAuto"),
     "التذكير مفعّل تلقائياً مع ترقية لمرة واحدة");
  ok(RAW_HTML.includes('id="setupOpenBtn"') && APP_JS.includes('$("setupOpenBtn")'),
     "معالج الصلاحيات يُفتح من زر الإعدادات المتقدمة");
  ok(!APP_JS.includes("setTimeout(openSetup") && !APP_JS.includes("setTimeout(openSetup,1500)"),
     "لا نافذة صلاحيات تلقائية عند فتح التطبيق");
  ok(/function\s+syncAudioFromNative\s*\(/.test(APP_JS),
     "دالة مزامنة الصوت الهادئة متاحة لغلاف أندرويد");

  const ANDROID = path.join(ROOT, "android", "app", "src", "main");
  const java = (rel) => fs.readFileSync(path.join(ANDROID, "java", "com", "valenciallc", "pray", rel), "utf8");
  const manifest = fs.readFileSync(path.join(ANDROID, "AndroidManifest.xml"), "utf8");
  ok(fs.existsSync(path.join(ANDROID, "java", "com", "valenciallc", "pray", "PhoneModeReceiver.java")) &&
     manifest.includes("PhoneModeReceiver"), "مستقبل الصامت/عدم الإزعاج موجود ومُسجَّل");
  ok(java("AudioHelper.java").includes("isQuiet") && java("AudioHelper.java").includes("adjustAlarmVolume"),
     "كشف الهدوء والتحكم بتيار Alarm موجودان");
  ok(java("AdhanPlaybackService.java").includes("USAGE_ALARM") &&
     java("AdhanPlaybackService.java").includes("isQuiet"), "الأذان على تيار Alarm ويتوقف عند الهدوء");
  ok(java("MainActivity.java").includes("KEYCODE_VOLUME_UP") &&
     !java("MainActivity.java").includes("POST_NOTIFICATIONS"), "أزرار الصوت الفيزيائية مربوطة بلا طلب إذن تلقائي");
  ok(java("UpdaterBridge.java").includes("TextToSpeech") &&
     java("UpdaterBridge.java").includes("boolean speak"), "نطق عربي أصلي عبر Android TTS موجود في الجسر");
  ok(java("UpdaterBridge.java").includes("showTestNotification") &&
     java("NotificationScheduler.java").includes("testNotification"),
     "إشعار تجريبي أصلي بدل إشعار المتصفح غير المتاح في WebView");
  ok(/br\.speak\(/.test(APP_JS) && /br\.stopSpeak\(/.test(APP_JS),
     "الويب يفضّل النطق الأصلي عند توفره ويتوقف معه");

  // v29 — بنية تحتية + إحصاءات + تحكّم صوتي وإتاحة، كلها في طبقة الويب.
  ok(Number(meta.version) >= 29, "الإصدار 29 يضم البنية التحتية والقدرات الجديدة");
  ok(["insightsTitle", "voiceTitle", "shortcutTitle"].every(k => APP_JS.includes(k + ":")),
     "مفاتيح ترجمة التحليلات والصوت واختصارات لوحة المفاتيح موجودة");
  ok(["voiceModal", "voiceStart", "voiceCommands", "voiceBtn", "voiceClose"].every(id => RAW_HTML.includes('id="' + id + '"')),
     "واجهة الأوامر الصوتية مكتملة");
  ok(["insights", "insTrendBars", "insPrayerBars", "insBestDay", "insConsistencyVal"].every(id => RAW_HTML.includes('id="' + id + '"')),
     "لوحة التحليلات مكتملة");
  ok(APP_JS.includes("function renderInsights()") && APP_JS.includes("renderInsights();"),
     "التحليلات تُحدَّث تلقائياً مع الإحصاءات");
  ok(APP_JS.includes("function handleVoiceText") && APP_JS.includes("function runVoiceCommand"),
     "محرك الأوامر الصوتية موجود");
  ok(APP_JS.includes("voiceRec.lang"), "لغة التعرّف تُضبط صراحةً");
  ok(APP_JS.includes("if(e.ctrlKey||e.altKey||e.metaKey)return") && APP_JS.includes("isContentEditable"),
     "الاختصارات لا تعترض الكتابة داخل حقول الإدخال");
  ok(CSS.includes(".voice-cmd") && CSS.includes(".ins-bar"), "أنماط الأوامر والتحليلات موجودة");
  ok(fs.existsSync(path.join(ROOT, ".github", "workflows", "ci.yml")) &&
     fs.existsSync(path.join(ROOT, ".github", "workflows", "release.yml")),
     "سير عمل CI والإصدار الآلي موجود");

  ok(!!meta.files && ["styles.css", "app.js"].every(name => !!meta.files[name]), "البيانات تحتوي بصمتي الملفين المستقلين");
  for (const name of ["styles.css", "app.js"]) {
    const entry = meta.files && meta.files[name];
    const buf = fs.readFileSync(path.join(ROOT, name));
    ok(!!entry && crypto.createHash("sha256").update(buf).digest("hex") === entry.sha256 &&
       entry.size === buf.length, "بصمة " + name + " مطابقة للملف الفعلي");
  }

  console.log("1) التشغيل الطبيعي");
  const { dom, errors } = await boot(HTML);
  const w = dom.window, d = w.document;
  const text = (id) => ((d.getElementById(id) || {}).textContent || "").trim();
  const count = (id) => ((d.getElementById(id) || {}).children || []).length;

  ok(errors.length === 0, "لا أخطاء تنفيذ غير متوقعة" + (errors.length ? ": " + errors.join(" | ") : ""));
  ok(typeof w.__prayFatalShown === "function" && !w.__prayFatalShown(), "لا تظهر شاشة الخطأ في التشغيل الطبيعي");
  ok(/^\d{2}:\d{2}:\d{2}$/.test(text("clockNow")), "الساعة تعمل: " + JSON.stringify(text("clockNow")));
  ok(/\d{4}/.test(text("dateNow")), "التاريخ الميلادي ظاهر: " + JSON.stringify(text("dateNow")));
  ok(text("hijriNow").indexOf("هـ") > -1, "التاريخ الهجري ظاهر: " + JSON.stringify(text("hijriNow")));
  ok(count("cards") >= 5, "بطاقات الصلوات الخمس ظاهرة (" + count("cards") + ")");
  ok(d.querySelectorAll(".azk-group-title").length === 4 &&
     d.querySelectorAll("#azkGrid .azk-card").length >= 14,
     "الأذكار: اختيار تلقائي + ٤ مجموعات تضم كل التصنيفات (" +
     d.querySelectorAll("#azkGrid .azk-card").length + " بطاقة)");
  ok(count("tblBody") >= 28, "جدول الشهر ظاهر (" + count("tblBody") + " صفاً)");
  // v33运行时: البحث والمفضلة والنسخ تعمل على الأذكار والأدعية فعلياً.
  ok(count("duaList") >= 18 && d.querySelectorAll("#duaList [data-matfav]").length >= 18,
      "مكتبة الأدعية تعرض كل الأدعية مع أزرار المفضلة (" + count("duaList") + ")");
  ok(/\d/.test(text("matStat")) && d.getElementById("matSearch").placeholder.length > 0,
      "عدّاد المواد وحقل البحث مهيآن: " + JSON.stringify(text("matStat")));
  const searchMat = d.getElementById("matSearch");
  searchMat.value = "الكرسي";
  searchMat.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok(d.getElementById("azkGrid").classList.contains("hidden") &&
     Number(d.getElementById("azkList").dataset.shown || 0) >= 1 &&
     /\d/.test(text("matHint")),
      "البحث يعرض نتائج الأذكار عبر التصنيفات ويخفي شبكة التصنيفات (" + text("matHint") + ")");
  ok(!!d.querySelector("#azkList [data-matcopy]") && !!d.querySelector("#azkList [data-matfav]"),
      "كل نتيجة ذكر تدعم النسخ والإضافة للمفضلة");
  d.getElementById("matClearBtn").click();
  ok(!d.getElementById("azkGrid").classList.contains("hidden") && count("duaList") >= 18,
      "مسح البحث يعيد الشبكة وكامل الأدعية");
  const firstFav = d.querySelector("#duaList [data-matfav]");
  if (firstFav) firstFav.click();
  ok((w.localStorage.getItem("prayerApp_v3_matfav") || "").length > 2,
      "تفعيل المفضلة يُحفظ في الذاكرة");
  d.getElementById("matFavBtn").click();
  ok(count("duaList") === 1 && Number(d.getElementById("azkList").dataset.shown || 0) === 0,
      "زر المفضلة يعرض المواد المحفوظة فقط");
  d.getElementById("matFavBtn").click();
  const firstCopy = d.querySelector("#duaList [data-matcopy]");
  try {
    Object.defineProperty(w.navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t) => { w.__copied = t; return Promise.resolve(); } },
    });
  } catch (e) {}
  if (firstCopy) firstCopy.click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  ok(typeof w.__copied === "string" && w.__copied.length > 10, "نسخ المادة يعمل بضغطة واحدة");
  d.getElementById("matClearBtn").click();
  ok(/^\d{2}:\d{2}:\d{2}$/.test(text("cdNum")), "العدّاد يعمل: " + JSON.stringify(text("cdNum")));
  ok(Number(w.eval("APP_VERSION")) >= 20, "APP_VERSION = " + w.eval("APP_VERSION"));

  // v26 — اللغة الافتراضية إنجليزية ومحفوظة تلقائياً، واختيار المستخدم لا يُنسى.
  ok(w.eval("lang") === "en", "اللغة الافتراضية بعد التثبيت هي الإنجليزية: " + w.eval("lang"));
  ok(w.localStorage.getItem("prayerApp_v3_lang") === "en", "اللغة الافتراضية تُحفظ تلقائياً في الذاكرة");
  ok(d.documentElement.lang === "en" && d.documentElement.dir === "ltr", "اتجاه الصفحة ltr مع لغة en");
  w.eval("setLang('ar')");
  ok(w.eval("lang") === "ar" && w.localStorage.getItem("prayerApp_v3_lang") === "ar",
     "تغيير المستخدم يُحفظ فوراً");
  ok(d.documentElement.dir === "rtl", "اتجاه الصفحة يتحدث فور تغيير اللغة");
  const mainJava = fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "java",
    "com", "valenciallc", "pray", "MainActivity.java"), "utf8");
  const serverJava = fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "java",
    "com", "valenciallc", "pray", "LocalWebServer.java"), "utf8");
  ok(mainJava.includes('prefs.getInt("web_port"') && mainJava.includes('putInt("web_port"') &&
     serverJava.includes("new ServerSocket(port,"),
     "منفذ WebView محفوظ وثابت كي لا تُفقد اللغة والإعدادات عند إعادة التشغيل");

  ok(!!d.getElementById("displayOverlay") && !!d.getElementById("contrastToggle"), "شاشة العرض والتباين العالي موجودان");

  // v19: تجربة يومية أذكى — تلميح سياقي واختصارات سريعة.
  const smartIds = ["smartNudge", "snIcon", "snTitle", "snText", "snAction", "qaAzkar", "qaAzkarLabel", "qaWird", "qaDhikr"];
  ok(smartIds.every(id => !!d.getElementById(id)), "عناصر التلميح الذكي والاختصارات موجودة (" + smartIds.length + " عنصراً)");
  ok(typeof w.eval("renderSmartNudge") === "function", "دالة التلميح الذكي محمّلة");
  ok(text("snTitle").length > 0 && text("snText").length > 0, "نص التلميح الذكي ممتلئ: " + JSON.stringify(text("snTitle")));
  ok(!!d.getElementById("snAction") && !!(d.getElementById("snAction").getAttribute("data-act") || ""), "زر التلميح الذكي له إجراء محدد");
  const qaWirdBtn = d.getElementById("qaWird");
  if (qaWirdBtn) qaWirdBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const wirdPanel = d.querySelector('.tab-panel[data-tab="wird"]');
  ok(!!wirdPanel && wirdPanel.classList.contains("active"), "اختصار «ورد اليوم» يفتح تبويب الورد");

  // v18: تحسينات الجوال والإشعارات والإعدادات المتقدمة.
  ok(!!d.getElementById("notifQuickBtn"), "زر الإشعارات السريع موجود في الشريط");
  ok(!!d.getElementById("settingsSearch") && !!d.getElementById("settingsNoResults"), "بحث الإعدادات ورسالة «لا نتائج» موجودان");
  ok(!!d.querySelector('[data-stab="system"]') && !!d.querySelector('[data-stab-panel="system"]'), "تبويب «النظام» ولوحته موجودان");
  const proIds = ["proTestNotify", "proTestAdhan", "proDisplay", "proExport", "proImport", "proReset", "proCopyReport", "proHealth", "proImportFile", "proStatus", "ecoToggle", "ecoStatus", "webScheduleToggle", "webScheduleStatus", "proBuildInfo"];
  ok(proIds.every(id => !!d.getElementById(id)), "أزرار وحالات لوحة النظام موجودة (" + proIds.length + " عنصراً)");
  ok(typeof w.eval("pushWebSchedule") === "function" && typeof w.eval("clearWebSchedule") === "function" && typeof w.eval("renderProStatus") === "function", "دوال الجدولة والإلغاء والحالة محمّلة");

  w.localStorage.setItem("prayerApp_v3_stab", "pro");
  const settings = d.getElementById("settingsBtn");
  if (settings) settings.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(d.querySelector('[data-stab-panel="system"]').classList.contains("active"),
     "تبويب «متقدم» المحفوظ قديماً يُفتح في «النظام والبيانات»");
  w.localStorage.setItem("prayerApp_v3_stab", "calc");
  ok(count("locCountry") > 0, "قائمة البلاد تُعبأ عند فتح الإعدادات (" + count("locCountry") + ")");
  ok(count("locCity") > 0, "قائمة المدن تُعبأ (" + count("locCity") + ")");

  // v32运行时检查：预览随微调更新，方法默认值可恢复，输入会被夹到合法范围。
  const previewIds = ["cpFajr", "cpSunrise", "cpDhuhr", "cpAsr", "cpMaghrib", "cpIsha"];
  const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
  ok(previewIds.every(id => /^\d{2}:\d{2}$/.test(text(id))),
     "معاينة اليوم تعرض الأوقات الستة قبل الحفظ: " + previewIds.map(text).join(" "));
  const baseFajr = text("cpFajr"), baseIsha = text("cpIsha");
  const adjF = d.getElementById("adjFajr"), adjI = d.getElementById("adjIsha");
  adjF.value = "5"; adjF.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok(toMin(text("cpFajr")) - toMin(baseFajr) === 5,
     "تعديل الفجر +٥ دقائق ينعكس فوراً في المعاينة: " + baseFajr + " → " + text("cpFajr"));
  adjF.value = "0"; adjF.dispatchEvent(new w.Event("input", { bubbles: true }));
  adjI.value = "-5"; adjI.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok(toMin(text("cpIsha")) - toMin(baseIsha) === -5,
     "تعديل العشاء -٥ دقائق ينعكس فوراً في المعاينة: " + baseIsha + " → " + text("cpIsha"));
  adjI.value = "0"; adjI.dispatchEvent(new w.Event("input", { bubbles: true }));

  const methodSel = d.getElementById("locMethod");
  methodSel.value = "karachi";
  methodSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const fajrInput = d.getElementById("locFajr");
  fajrInput.value = "99";
  d.getElementById("locMethodDefaults").click();
  ok(fajrInput.value === "18", "استعادة زوايا الطريقة تعيد قيمة زاوية الفجر الصحيحة");
  methodSel.value = "egypt";
  methodSel.dispatchEvent(new w.Event("change", { bubbles: true }));

  const latInput = d.getElementById("locLat"), tzInput = d.getElementById("locTz");
  latInput.value = "999"; tzInput.value = "";
  const sanitized = w.eval("sanitizeLocInputs(false)");
  ok(sanitized.lat === 90 && latInput.value === "90" && Number.isFinite(sanitized.tz),
     "المدخلات الخارجة أو الفارغة تُضبط لقيم صالحة قبل الحفظ");
  d.getElementById("locLng").value = "55.42";
  d.getElementById("tzSuggestBtn").click();
  ok(tzInput.value === "3.5", "اقتراح التوقيت من خط الطول يعمل (" + tzInput.value + ")");
  w.eval("syncLocInputs()");

  const allDetails = Array.from(d.querySelectorAll("details.adv-details"));
  ok(allDetails.length >= 8 && allDetails.every(x => !x.open),
     "التفاصيل الدقيقة مطوية افتراضياً (" + allDetails.length + " مقطعاً)");
  const advBtn = d.getElementById("advToggle");
  if (advBtn) advBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(allDetails.every(x => x.open) && advBtn.getAttribute("aria-expanded") === "true",
     "زر «المزيد من الإعدادات» يفتح كل التفاصيل دفعة واحدة");

  const proTab = d.querySelector('[data-stab="system"]');
  if (proTab) proTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const proPanel = d.querySelector('[data-stab-panel="system"]');
  ok(!!proPanel && proPanel.classList.contains("active"), "الضغط على «النظام» يفتح لوحة النظام والبيانات");

  const search = d.getElementById("settingsSearch");
  const noRes = d.getElementById("settingsNoResults");
  if (search) {
    search.value = "إشعارات";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(d.querySelectorAll(".stab-panel .s-group:not(.hidden)").length > 0, "البحث يُفلتر مجموعات الإعدادات");
    search.value = ("__لا_يوجد__");
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(!!noRes && noRes.classList.contains("show"), "رسالة «لا نتائج» تظهر عند عدم التطابق");
    search.value = "";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(!!noRes && !noRes.classList.contains("show"), "مسح البحث يُعيد كل المجموعات");
  }

  const eco = d.getElementById("ecoToggle");
  if (eco) eco.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(d.documentElement.getAttribute("data-eco") === "1", "الوضع الاقتصادي يُفعّل سمة توفير البطارية");

  // إشعارات غلاف أندرويد: لا رسالة «متصفحك لا يدعم الإشعارات»؛ كل شيء يمر عبر الجسر.
  console.log("   ◇ إشعارات أندرويد عبر الجسر");
  const nativeCalls = [];
  w.AndroidUpdater = {
    requestNotifyPermission() { nativeCalls.push("perm"); },
    permStatus() { return JSON.stringify({ notification: "granted", exact: true, battery: true }); },
    notifyConfig() { return JSON.stringify({ permission: "granted", exact: true, battery: true }); },
    showTestNotification() { nativeCalls.push("test"); },
    setSchedule() { nativeCalls.push("schedule"); },
    checkNow() {},
    getAudioStatus() { return "{}"; },
  };
  ok(w.eval("hasNativeNotify()") === true, "جسر الإشعارات الأصلي مُكتشف");
  w.eval("notifQuickClick()");
  ok(nativeCalls.includes("perm"), "زر الإشعارات السريع يطلب إذن أندرويد");
  ok(!text("toast").includes("لا يدعم"), "لا تظهر رسالة عدم دعم الإشعارات عند ضغط زر الإشعارات");
  w.eval("testWebNotify()");
  await new Promise((resolve) => setTimeout(resolve, 80));
  ok(nativeCalls.includes("test"), "زر الإشعار التجريبي يرسل إشعاراً نظامياً");
  ok(!text("toast").includes("لا يدعم"), "لا تظهر رسالة عدم الدعم عند تجربة الإشعار");

  // توافق مع غلاف 1.3 المثبّت قبل v27: الإشعار التجريبي عبر setSchedule الموجود أصلاً.
  const fallbackCalls = [];
  w.AndroidUpdater = {
    requestNotifyPermission() {},
    permStatus() { return JSON.stringify({ notification: "granted" }); },
    notifyConfig() { return JSON.stringify({ permission: "granted" }); },
    setSchedule(json) { fallbackCalls.push(json); },
    checkNow() {},
    getAudioStatus() { return "{}"; },
  };
  w.eval("testWebNotify()");
  await new Promise((resolve) => setTimeout(resolve, 80));
  ok(fallbackCalls.length > 0 && fallbackCalls[0].includes("إشعار تجريبي"),
     "غلاف أندرويد أقدم يستلم إشعاراً تجريبياً بالجسر الموجود بلا تثبيت جديد");
  ok(!text("toast").includes("لا يدعم"), "لا رسالة عدم دعم حتى مع الغلاف الأقدم");
  w.close();

  console.log("1b) تذكّر اختيار اللغة بعد إعادة الفتح");
  const remembered = await boot(HTML, { prayerApp_v3_lang: "fr" });
  ok(remembered.dom.window.eval("lang") === "fr",
     "اللغة المحفوظة تُقرأ عند إعادة الفتح ولا تُستبدل بالافتراضية");
  ok(remembered.dom.window.localStorage.getItem("prayerApp_v3_lang") === "fr",
     "اختيار المستخدم يبقى محفوظاً كما هو");
  remembered.dom.window.close();

  console.log("1c) التحليلات والأوامر الصوتية والإتاحة");
  const dayAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const hist = {};
  hist[dayAgo(0)] = { Fajr: true, Dhuhr: true, Isha: true };
  hist[dayAgo(1)] = { Fajr: true };
  hist[dayAgo(4)] = { Maghrib: true };
  const smart = await boot(HTML, {
    prayerApp_v3_attend: JSON.stringify({ history: hist, celebrated: [] }),
  });
  const s2 = smart.dom.window, sd2 = s2.document;
  const tx2 = (id) => ((sd2.getElementById(id) || {}).textContent || "").trim();
  const kids = (id) => ((sd2.getElementById(id) || {}).children || []).length;
  ok(smart.errors.length === 0, "التحليلات والأوامر الجديدة لا تُسبب أخطاء تشغيل" +
     (smart.errors.length ? ": " + smart.errors.join(" | ") : ""));
  ok(kids("insTrendBars") === 7, "اتجاه الأسبوع يعرض ٧ أعمدة (" + kids("insTrendBars") + ")");
  ok(kids("insPrayerBars") === 5, "أشرطة الصلوات الخمس ظاهرة (" + kids("insPrayerBars") + ")");
  ok(/\d\d-\d\d/.test(tx2("insBestDay")) && tx2("insBestDay").includes("/5"),
     "أفضل يوم محسوب من السجل: " + JSON.stringify(tx2("insBestDay")));
  ok(tx2("insConsistencyVal").includes("%"), "الانتظام محسوب: " + JSON.stringify(tx2("insConsistencyVal")));
  ok(tx2("insTrendVal").length > 0, "ملخص الاتجاه ظاهر: " + JSON.stringify(tx2("insTrendVal")));

  ok(s2.eval("voiceSupported()") === false, "لا يوجد SpeechRecognition في بيئة الاختبار — وضع الأوامر الموجّهة");
  s2.eval("window.speakText=function(t){window.__spoken=t;return true}");
  sd2.getElementById("voiceBtn").click();
  ok(sd2.getElementById("voiceModal").classList.contains("open"), "زر الأوامر الصوتية يفتح النافذة");
  ok(sd2.querySelectorAll("#voiceCommands [data-voice]").length >= 10,
     "أوامر جاهزة للضغط عند غياب التعرّف على الصوت (" + sd2.querySelectorAll("#voiceCommands [data-voice]").length + ")");
  s2.eval("runVoiceCommand('prayer',true)");
  ok(!sd2.getElementById("voiceModal").classList.contains("open"), "الأمر يُغلق نافذة الصوت عند التنقل");
  ok((sd2.querySelector('.tab-panel[data-tab="pray"]') || {}).classList &&
     sd2.querySelector('.tab-panel[data-tab="pray"]').classList.contains("active"),
     "أمر «الصلاة» يفتح تبويب الصلاة");
  ok(s2.eval("typeof window.__spoken==='string' && window.__spoken.length>0"),
     "الأمر الموجّه يُقرأ صوتياً عبر النطق المتاح");
  s2.eval("handleVoiceText('المسبحة')");
  ok(sd2.querySelector('.tab-panel[data-tab="dhikr"]').classList.contains("active"),
     "نص عربي يُطابق أمر المسبحة بعد التطبيع");
  ok(s2.eval("normVoice('الصَّلَاة')") === "الصلاه", "تطبيع الحروف والتشكيل يعمل");
  s2.eval("handleVoiceText('zzz unknown')");
  ok(tx2("voiceStatus").length > 0, "أمر غير مفهوم يعطي رسالة بدل الصمت");

  sd2.getElementById("voiceClose").click();
  sd2.body.dispatchEvent(new s2.KeyboardEvent("keydown", { key: "v", bubbles: true }));
  ok(sd2.getElementById("voiceModal").classList.contains("open"), "اختصار v يفتح الأوامر الصوتية");
  sd2.getElementById("voiceClose").click();
  const input = sd2.createElement("input");
  sd2.body.appendChild(input);
  input.focus();
  input.dispatchEvent(new s2.KeyboardEvent("keydown", { key: "v", bubbles: true }));
  ok(!sd2.getElementById("voiceModal").classList.contains("open"),
     "الاختصارات لا تعمل أثناء الكتابة في حقل إدخال");
  s2.close();

  console.log("2) حاجز الأخطاء عند خطأ حرج");
  const thrower = "<script>throw new Error(\"SMOKE_TEST_BOOM\")" + "</script>";
  const boomHtml = HTML.replace("<body>", "<body>\n" + thrower + "\n");
  ok(boomHtml !== HTML, "تم حقن خطأ تجريبي في الصفحة");
  const b = await boot(boomHtml);
  ok(b.dom.window.__prayFatalShown(), "شاشة الخطأ تظهر بدل الصفحة الفارغة");
  ok(!!b.dom.window.document.getElementById("fatalRetry"), "زر إعادة المحاولة موجود");
  ok(!!b.dom.window.document.getElementById("fatalReset"), "زر مسح الذاكرة موجود");
  b.dom.window.close();

  console.log(failures ? "\n✖ فشل " + failures + " اختبار" : "\n✔ جميع اختبارات الدخان نجحت");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("✖ تعذّر تشغيل الاختبار:", e);
  process.exit(1);
});
