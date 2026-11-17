#!/usr/bin/env python3
"""أداة إصدار تطبيق أوقات الصلاة.

تقوم بـ:
  1) مزامنة رقم الإصدار بين prayer_update.json و sw.js و index.html و README.
  2) حساب SHA-256 والحجم والتاريخ الفعلي لـ index.html.
  3) بناء مجلد dist/ الجاهز للنشر على GitHub Pages.
  4) فحص اتساق كل ذلك عبر --check.

الاستخدام:
  python3 tools/release.py              # رفع الإصدار واحد وبناء dist
  python3 tools/release.py --set 20     # تحديد رقم إصدار معين
  python3 tools/release.py --no-bump    # إصلاح البصمة دون تغيير الرقم
  python3 tools/release.py --check      # فحص فقط بدون تعديل أي ملف
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"
META = ROOT / "prayer_update.json"
README = ROOT / "README-apk-ar.md"
DIST = ROOT / "dist"

ASSETS = [
    "index.html",
    "sw.js",
    "manifest.json",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
    "logo.png",
    "السريحي.mp3",
    "اقامة.mp3",
    "prayer_update.json",
]
ASSET_DIRS = ["icons"]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and read(path) == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    new, count = re.subn(pattern, replacement, text, count=1)
    if count != 1:
        raise RuntimeError(f"لم أجد نمط {label} بالشكل المتوقع ({count} تطابق)")
    return new


def load_meta() -> dict:
    if not META.exists():
        raise RuntimeError(f"ملف غير موجود: {META}")
    data = json.loads(read(META))
    if not isinstance(data.get("version"), int):
        raise RuntimeError("prayer_update.json يجب أن يحتوي على version كرقم صحيح")
    return data


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def version_from(pattern: str, path: Path, label: str) -> int | None:
    if not path.exists():
        return None
    m = re.search(pattern, read(path))
    return int(m.group(1)) if m else None


def sync_version_files(version: int) -> list[str]:
    changed: list[str] = []

    if SW.exists():
        sw = read(SW)
        sw = replace_once(sw, r"/\* أوقات الصلاة — عامل الخدمة v\d+",
                          f"/* أوقات الصلاة — عامل الخدمة v{version}", "تعليق sw.js")
        sw = replace_once(sw, r"const SW_VERSION = \d+;",
                          f"const SW_VERSION = {version};", "SW_VERSION")
        if write_if_changed(SW, sw):
            changed.append(SW.name)

    if INDEX.exists():
        html = read(INDEX)
        html = replace_once(html, r"const APP_VERSION=\d+;",
                            f"const APP_VERSION={version};", "APP_VERSION")
        html = replace_once(html, r"الإصدار \d+(?= — الفحص التلقائي)",
                            f"الإصدار {version}", "تلميح الإصدار في الإعدادات")
        if write_if_changed(INDEX, html):
            changed.append(INDEX.name)

    if README.exists():
        doc = read(README)
        doc = replace_once(doc, r"النسخة الحالية: \d+",
                           f"النسخة الحالية: {version}", "النسخة الحالية في README")
        if write_if_changed(README, doc):
            changed.append(README.name)

    return changed


def write_meta(version: int) -> None:
    if not INDEX.exists():
        raise RuntimeError(f"ملف غير موجود: {INDEX}")
    payload = {
        "version": version,
        "index": "index.html",
        "sha256": sha256_of(INDEX),
        "size": INDEX.stat().st_size,
        "releasedAt": datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
    }
    write_if_changed(META, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def build_dist() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    missing = [name for name in ASSETS + ASSET_DIRS if not (ROOT / name).exists()]
    if missing:
        raise RuntimeError("ملفات ناقصة لا يمكن بناء dist بدونها: " + ", ".join(missing))

    for name in ASSETS:
        shutil.copy2(ROOT / name, DIST / name)
    for name in ASSET_DIRS:
        shutil.copytree(ROOT / name, DIST / name)
    # يمنع معالجة Jekyll للملفات الثابتة عند النشر من فرع بدلاً من Actions.
    (DIST / ".nojekyll").write_text("", encoding="utf-8")


def check() -> int:
    errors: list[str] = []

    try:
        meta = load_meta()
    except (RuntimeError, ValueError, json.JSONDecodeError) as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1

    version = meta["version"]

    if not INDEX.exists():
        errors.append("index.html غير موجود")
    else:
        actual_hash = sha256_of(INDEX)
        actual_size = INDEX.stat().st_size
        if meta.get("sha256") != actual_hash:
            errors.append(f"SHA-256 غير مطابق: json={meta.get('sha256')} الفعلي={actual_hash}")
        if meta.get("size") != actual_size:
            errors.append(f"الحجم غير مطابق: json={meta.get('size')} الفعلي={actual_size}")
        if meta.get("index") != "index.html":
            errors.append("حقل index في prayer_update.json يجب أن يكون index.html")

    expected = {
        "sw.js (SW_VERSION)": (r"const SW_VERSION = (\d+);", SW),
        "index.html (APP_VERSION)": (r"const APP_VERSION=(\d+);", INDEX),
        "README (النسخة الحالية)": (r"النسخة الحالية: (\d+)", README),
    }
    for label, (pattern, path) in expected.items():
        found = version_from(pattern, path, label)
        if found != version:
            errors.append(f"{label}: {found} ≠ {version}")

    html = read(INDEX) if INDEX.exists() else ""
    if not re.search(rf"الإصدار {version}(?= — الفحص التلقائي)", html):
        errors.append(f"تلميح الإصدار داخل الإعدادات لا يعرض {version}")

    if not DIST.exists():
        errors.append("مجلد dist/ غير موجود — شغّل python3 tools/release.py")
    else:
        for name in ASSETS + ASSET_DIRS:
            if not (DIST / name).exists():
                errors.append(f"dist/{name} غير موجود")
        if not (DIST / ".nojekyll").exists():
            errors.append("dist/.nojekyll غير موجود — أعد بناء dist")
        if (DIST / "index.html").exists() and sha256_of(DIST / "index.html") != meta.get("sha256"):
            errors.append("dist/index.html يختلف عن البصمة المسجلة — أعد البناء")

    if errors:
        print("✖ فحص الإصدار فشل:")
        for e in errors:
            print("  - " + e)
        return 1

    print(f"✔ كل شيء متسق — الإصدار {version}")
    print(f"  SHA-256: {meta['sha256']}")
    print(f"  الحجم:   {meta['size']} bytes")
    print(f"  dist/:   جاهز ({len(ASSETS)} ملفات + {len(ASSET_DIRS)} مجلد)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="إصدار وتحديث تطبيق أوقات الصلاة")
    parser.add_argument("--set", type=int, metavar="N", help="فرض رقم الإصدار")
    parser.add_argument("--no-bump", action="store_true", help="الإبقاء على الرقم الحالي")
    parser.add_argument("--check", action="store_true", help="فحص فقط بدون تعديل")
    args = parser.parse_args()

    if args.check:
        return check()

    try:
        meta = load_meta()
        current = meta["version"]
        if args.set is not None:
            version = args.set
        elif args.no_bump:
            version = current
        else:
            version = current + 1

        changed = sync_version_files(version)
        write_meta(version)
        build_dist()
    except (RuntimeError, ValueError, OSError) as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1

    print(f"✔ تم إعداد الإصدار {version}" + (f" (كان {current})" if version != current else ""))
    if changed:
        print("  ملفات تم مزامنتها: " + ", ".join(changed))
    print(f"  البصمة: {sha256_of(INDEX)}")
    print(f"  dist/:  {DIST.relative_to(ROOT)} جاهز للنشر")
    print("  للتحقق: python3 tools/release.py --check")
    return 0


if __name__ == "__main__":
    sys.exit(main())
