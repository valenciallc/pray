# النشر على GitHub Pages — دليل مختصر

المشروع مهيّأ للنشر كتطبيق ويب (PWA) يعمل دون إنترنت بعد أول فتح.
لا حاجة إلى خادم ولا إلى ملف APK لهذا المسار.

## 1) تحقّق قبل النشر

من داخل مجلد `pray-main`:

```bash
python3 tools/release.py --check
```

يجب أن يظهر:

```text
✔ كل شيء متسق — الإصدار 16
```

إن ظهر أي خطأ، شغّل `python3 tools/release.py` ثم أعد الفحص.
**مهم:** انسخ محتويات `dist/` كما هي؛ لا ترفع جذر المشروع إلى Pages.

## 2) أنشئ المستودع وادفع الملفات

```bash
cd /home/co/Desktop/pray-main
git init
git add .
git commit -m "Prayer app v16 — GitHub Pages ready"
git branch -M main
git remote add origin https://github.com/اسمك/prayer-app.git
git push -u origin main
```

استبدل `اسمك` باسم حسابك. يجب أن يكون المستودع **Public** حتى يعمل Pages مجاناً.

## 3) فعّل Pages

1. افتح المستودع على GitHub ← **Settings** ← **Pages**.
2. تحت **Build and deployment** اختر **Source: GitHub Actions**
   (لا تختر "Deploy from a branch" لأن لدينا workflow جاهزاً).
3. افتح تبويب **Actions**: سيظهر `Deploy to GitHub Pages`. انتظر حتى يصبح أخضر ✔.
4. الرابط النهائي: `https://اسمك.github.io/prayer-app/`.

> إذا فضّلت النشر من فرع بدلاً من Actions:
> اختر **Deploy from a branch** ← `main` ← `/ (root)` ← Save.
> في هذه الحالة انسخ محتويات `dist/` إلى جذر المستودع، واترك ملف `.nojekyll`.

## 4) داخل التطبيق بعد النشر

1. افتح الرابط على الهاتف مرة واحدة وأنت متصل بالإنترنت، ليُخزّن عامل الخدمة الملفات.
2. جرّب وضع الطيران: يجب أن يستمر التطبيق في العمل.
3. الإعدادات ← «تحديث التطبيق من الداخل» ← الصق الرابط
   `https://اسمك.github.io/prayer-app` ← «حفظ رابط التحديثات».
   (يعمل أيضاً تلقائياً من نفس المنشأ دون إعداد يدوي.)

## 5) نشر تحديث لاحق

```bash
# 1) عدّل index.html
python3 tools/release.py        # يرفع الإصدار ويحسب البصمة ويعيد بناء dist
python3 tools/release.py --check
git add .
git commit -m "Prayer app v17"
git push
```

الـ workflow سيفحص الاتساق ثم ينشر `dist/` تلقائياً.
إن نسيت تشغيل `release.py` قبل الـ push، سيفشل الـ check ولن تُنشر نسخة مكسورة.

## ملاحظات تقنية

- كل المسارات في التطبيق **نسبية** (`./index.html`, `sw.js`, …)، لذا يعمل تحت مسار فرعي مثل `/prayer-app/` بدون تعديل.
- عامل الخدمة يسجّل من نفس المجلد، ونطاقه (`scope`) يصبح `/prayer-app/` تلقائياً.
- ملف `.nojekyll` موجود داخل `dist/` لمنع أي معالجة غير مرغوبة للملفات الثابتة.
- ملفات الأذان (`السريحي.mp3`, `اقامة.mp3`) ضمن `dist/`، لذلك يعمل الأذان دون إنترنت.
- لتخصص نطاقك الخاص لاحقاً: أضف ملف `CNAME` داخل `dist/` يحتوي على النطاق، واضبط DNS حسب تعليمات GitHub.
