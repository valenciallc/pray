package com.valenciallc.pray;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** يفحص prayer_update.json على GitHub وينزّل المحتوى ويتحقق من SHA-256 قبل الاستبدال. */
final class ContentUpdater {
    interface Callback {
        void onResult(boolean ok, String message, int version);
    }

    static final String PREF_URL = "update_url";
    static final String PREF_VERSION = "current_version";
    static final String PREF_BUNDLED = "bundled_version";
    static final String PREF_LAST_CHECK = "last_check";

    private static final List<String> CORE = Arrays.asList(
            "index.html", "styles.css", "app.js", "sw.js", "prayer_update.json",
            "logo.webp", "logo.png", "manifest.json", "icon.svg",
            "icon-192.png", "icon-512.png", "السريحي.mp3", "اقامة.mp3");

    private final Context ctx;
    private final SharedPreferences prefs;
    private final File www;
    private final File stage;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private Callback callback;
    private volatile boolean running;

    ContentUpdater(Context context) {
        ctx = context.getApplicationContext();
        prefs = ctx.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
        www = new File(ctx.getFilesDir(), "www");
        stage = new File(ctx.getFilesDir(), "update-new");
    }

    void setCallback(Callback cb) {
        callback = cb;
    }

    File webRoot() {
        return www;
    }

    int currentVersion() {
        return prefs.getInt(PREF_VERSION, 0);
    }

    int bundledVersion() {
        return prefs.getInt(PREF_BUNDLED, BuildConfig.BUNDLED_VERSION);
    }

    String updateUrl() {
        String u = prefs.getString(PREF_URL, "");
        return u == null || u.trim().isEmpty() ? BuildConfig.UPDATE_URL : u.trim();
    }

    String lastCheck() {
        String s = prefs.getString(PREF_LAST_CHECK, "");
        return s == null ? "" : s;
    }

    void setUpdateUrl(String url) {
        if (url == null) return;
        String u = url.trim();
        if (u.startsWith("https://")) prefs.edit().putString(PREF_URL, u).apply();
    }

    /** يُنسخ المحتوى المضمّن مرة واحدة عند أول تشغيل، أو إذا حُذفت الملفات. */
    void installBundledIfNeeded() {
        if (new File(www, "index.html").isFile() && currentVersion() >= BuildConfig.BUNDLED_VERSION) return;
        deleteRecursive(www);
        if (!www.mkdirs()) return;
        try {
            copyAssets(ctx.getAssets(), "www", www);
        } catch (IOException ignored) {
        }
        prefs.edit().putInt(PREF_VERSION, BuildConfig.BUNDLED_VERSION)
                .putInt(PREF_BUNDLED, BuildConfig.BUNDLED_VERSION).apply();
    }

    void checkAsync(boolean manual) {
        if (running) return;
        running = true;
        exec.execute(() -> {
            try {
                doCheck(manual);
            } finally {
                running = false;
            }
        });
    }

    private void doCheck(boolean manual) {
        String stamp = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(new Date());
        prefs.edit().putString(PREF_LAST_CHECK, stamp).apply();
        try {
            String base = updateUrl().replaceAll("/+$", "");
            JSONObject meta = new JSONObject(new String(fetchBytes(base + "/prayer_update.json"), StandardCharsets.UTF_8));
            int remote = meta.optInt("version", 0);
            int current = currentVersion();
            if (remote <= current && !manual) {
                report(true, "محدث — v" + current, current);
                return;
            }
            if (remote <= 0 || current == 0) throw new IOException("بيانات إصدار غير صالحة");

            String indexName = meta.optString("index", "index.html");
            JSONObject files = meta.optJSONObject("files");
            deleteRecursive(stage);
            if (!stage.mkdirs()) throw new IOException("تعذر إنشاء مجلد التنزيل");

            Set<String> names = new LinkedHashSet<>(CORE);
            collectLocal(www, "", names);
            // القائمة القادمة من الخادم هي المصدر الأهم: تضمن تنزيل ملفات جديدة أُضيفت في إصدار لاحق.
            JSONArray assets = meta.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    String name = assets.optString(i, "");
                    if (name != null && !name.isEmpty()) names.add(name);
                }
            }
            for (String name : names) {
                byte[] body = fetchBytes(base + "/" + encodePath(name));
                if (body.length == 0) throw new IOException("ملف فارغ: " + name);
                String hash = null;
                long size = -1;
                if (name.equals(indexName)) {
                    hash = meta.optString("sha256", "");
                    size = meta.optLong("size", -1);
                } else if (files != null && files.has(name)) {
                    JSONObject entry = files.getJSONObject(name);
                    hash = entry.optString("sha256", "");
                    size = entry.optLong("size", -1);
                }
                if (hash != null && !hash.isEmpty() && !sha256(body).equalsIgnoreCase(hash))
                    throw new IOException("فشل التحقق: " + name);
                if (size > 0 && body.length != size)
                    throw new IOException("حجم غير مطابق: " + name);
                File out = new File(stage, name);
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (OutputStream os = new FileOutputStream(out)) {
                    os.write(body);
                }
            }

            File backup = new File(ctx.getFilesDir(), "www-old");
            deleteRecursive(backup);
            if (www.exists() && !www.renameTo(backup)) throw new IOException("تعذر استبدال المحتوى الحالي");
            if (!stage.renameTo(www)) {
                if (backup.exists()) backup.renameTo(www);
                throw new IOException("تعذر تثبيت المحتوى الجديد");
            }
            deleteRecursive(backup);
            prefs.edit().putInt(PREF_VERSION, remote).apply();
            report(true, "تم التحديث إلى v" + remote, remote);
        } catch (Exception e) {
            deleteRecursive(stage);
            String msg = e.getMessage();
            report(false, msg == null || msg.isEmpty() ? "تعذر التحديث" : msg, currentVersion());
        }
    }

    private void report(boolean ok, String message, int version) {
        Callback cb = callback;
        if (cb != null) cb.onResult(ok, message, version);
    }

    private static String encodePath(String path) throws IOException {
        StringBuilder b = new StringBuilder();
        String[] parts = path.split("/");
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) b.append('/');
            b.append(URLEncoder.encode(parts[i], "UTF-8"));
        }
        return b.toString();
    }

    private static byte[] fetchBytes(String url) throws IOException {
        URL u = new URL(url);
        if (!"https".equalsIgnoreCase(u.getProtocol())) throw new IOException("رابط التحديث يجب أن يكون HTTPS");
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = c.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + code);
            if (!"https".equalsIgnoreCase(c.getURL().getProtocol())) throw new IOException("تحويل غير آمن");
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } finally {
            c.disconnect();
        }
    }

    private static void collectLocal(File dir, String prefix, Set<String> out) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File f : children) {
            String rel = prefix.isEmpty() ? f.getName() : prefix + "/" + f.getName();
            if (f.isDirectory()) collectLocal(f, rel, out);
            else out.add(rel);
        }
    }

    private static void copyAssets(AssetManager am, String path, File dest) throws IOException {
        String[] list = am.list(path);
        if (list == null) return;
        for (String name : list) {
            String child = path + "/" + name;
            String[] sub = am.list(child);
            if (sub != null && sub.length > 0) {
                File d = new File(dest, name);
                if (d.mkdirs() || d.isDirectory()) copyAssets(am, child, d);
            } else {
                try (InputStream in = am.open(child); OutputStream out = new FileOutputStream(new File(dest, name))) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        }
    }

    private static String sha256(byte[] data) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder b = new StringBuilder(digest.length * 2);
        for (byte x : digest) b.append(String.format("%02x", x & 0xff));
        return b.toString();
    }

    static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        if (!f.delete()) f.deleteOnExit();
    }
}
