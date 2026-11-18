# النشر على GitHub Pages — ملفات الجذر

المستودع `valenciallc/pray` يخدم **ملفات الجذر** مباشرة من الفرع `main`.
لا يوجد مجلد `dist/` ولا workflow داخل المستودع؛ الصفحة تعمل كـ PWA دون إنترنت بعد أول فتح.

## 1) تحقّق قبل النشر (على جهازك)

```bash
cd /home/co/Desktop/pray-main
python3 tools/release.py --check
npm test        # يشغّل sw_test.js ثم smoke_test.js
```

يجب أن يظهر `✔ كل شيء متسق — الإصدار 21` و`✔ جميع اختبارات الدخان نجحت`.
إن ظهر أي خطأ، شغّل `python3 tools/release.py` ثم أعد الفحص والاختبار.

## 2) انشر التغييرات

ادفع **ملفات الجذر المحدّثة فقط** حتى لا تعيد إضافة المجلدات التي حُذفت من المستودع:

```bash
git add index.html styles.css app.js sw.js prayer_update.json README-apk-ar.md README-GITHUB-PAGES.md CHANGELOG.md
git commit -m "Prayer app v21 - mobile and performance polish"
git push
```

إن كان الفرع مختلفاً غيّر الرابط أولاً: `git remote set-url origin https://github.com/اسمك/المستودع.git`.
يجب أن يكون المستودع **Public** حتى يعمل Pages مجاناً.

## 3) إعداد Pages مرة واحدة

1. المستودع ← **Settings** ← **Pages**.
2. تحت **Build and deployment** اختر **Source: Deploy from a branch**.
3. اختر `main` ثم `/ (root)` ← **Save**.
4. الرابط: `https://valenciallc.github.io/pray/`.

## 4) بعد النشر

1. افتح الرابط على الهاتف مرة واحدة وأنت متصل بالإنترنت ليُخزّن عامل الخدمة الملفات.
2. اضغط زر 🔕 في الشريط لتفعيل إشعارات المتصفح، ثم جرّب «🧪 إشعار تجريبي» من الإعدادات ← «⚡ متقدم».
3. جرّب وضع الطيران: يجب أن يستمر التطبيق في العمل.
4. الإعدادات ← «تحديث التطبيق من الداخل» ← الصق الرابط `https://valenciallc.github.io/pray` ← «حفظ رابط التحديثات».

## 5) نشر تحديث لاحق

```bash
# 1) عدّل index.html و/أو styles.css و/أو app.js
python3 tools/release.py        # يرفع الإصدار ويحسب بصمات الملفات الثلاثة
npm test
python3 tools/release.py --check
# 2) أدفع ملفات الجذر كما في القسم 2
```

## ملاحظات تقنية

- كل المسارات في التطبيق **نسبية**، لذا يعمل تحت المسار الفرعي `/pray/` دون تعديل.
- من v20: `index.html` يشير إلى `styles.css` و`app.js` في الجذر، و`prayer_update.json` يحمل بصمتهما؛ انسخ الملفات الثلاثة معاً عند كل تحديث.
- من v21: أضف `logo.webp` مع `logo.png` في الجذر؛ كلاهما مخزّن في عامل الخدمة، والصفحة تختار WebP تلقائياً مع fallback.
- عامل الخدمة يسجّل من الجذر، ونطاقه يصبح `/pray/` تلقائياً.
- ملفات الأذان (`السريحي.mp3`, `اقامة.mp3`) في الجذر، لذلك يعمل الأذان دون إنترنت.
- إن ظهرت شاشة «تعذّر تشغيل التطبيق»، استخدم زر **إعادة المحاولة** أو **مسح الذاكرة وإعادة التحميل**؛ بياناتك لا تُحذف إلا بالزر الأخير.
- أدوات `tools/` و`package.json` تبقى على جهازك للفحص والاختبار ولا تُنشر ضمن الصفحة.
