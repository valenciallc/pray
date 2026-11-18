package com.valenciallc.pray;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/** الجسر الذي يستدعيه app.js من داخل WebView. كل دالة آمنة ولا ترمي استثناءً للـ JS. */
public final class UpdaterBridge {
    private final Activity activity;
    private final ContentUpdater updater;
    private final WebView webView;
    private final SharedPreferences prefs;

    UpdaterBridge(Activity activity, ContentUpdater updater, WebView webView) {
        this.activity = activity;
        this.updater = updater;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String config() {
        JSONObject o = new JSONObject();
        try {
            o.put("updateUrl", updater.updateUrl());
            o.put("currentVersion", updater.currentVersion());
            o.put("bundledVersion", updater.bundledVersion());
            o.put("lastCheck", updater.lastCheck());
            o.put("pending", false);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public String notifyConfig() {
        JSONObject o = new JSONObject();
        try {
            NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            o.put("permission", nm != null && nm.areNotificationsEnabled() ? "granted" : "denied");
            AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            boolean exact = am == null || Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            o.put("exact", exact);
            o.put("scheduled", activity.getSharedPreferences(NotificationScheduler.PREF, Context.MODE_PRIVATE)
                    .getInt("schedule_count", 0));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public String permStatus() {
        JSONObject o = new JSONObject();
        try {
            NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            o.put("notification", nm != null && nm.areNotificationsEnabled() ? "granted" : "denied");
            AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            o.put("exact", am == null || Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
            PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
            o.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName()));
            boolean dnd = false;
            if (nm != null && Build.VERSION.SDK_INT >= 24) {
                dnd = nm.isNotificationPolicyAccessGranted()
                        && nm.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL;
            }
            o.put("dnd", dnd);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public String getAudioStatus() {
        JSONObject o = new JSONObject();
        try {
            AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                o.put("alarmVolume", am.getStreamVolume(AudioManager.STREAM_ALARM));
                o.put("notificationVolume", am.getStreamVolume(AudioManager.STREAM_NOTIFICATION));
                o.put("mediaVolume", am.getStreamVolume(AudioManager.STREAM_MUSIC));
                o.put("alarmMuted", prefs.getBoolean("muted", false)
                        || am.getRingerMode() == AudioManager.RINGER_MODE_SILENT);
            }
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public void setStreamVolume(final String stream, final int value) {
        try {
            AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int type;
            if ("alarm".equals(stream)) type = AudioManager.STREAM_ALARM;
            else if ("notification".equals(stream)) type = AudioManager.STREAM_NOTIFICATION;
            else type = AudioManager.STREAM_MUSIC;
            am.setStreamVolume(type, Math.max(0, Math.min(am.getStreamMaxVolume(type), value)), 0);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setMute(final boolean mute) {
        try {
            prefs.edit().putBoolean("muted", mute).apply();
            AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) am.setRingerMode(mute ? AudioManager.RINGER_MODE_SILENT : AudioManager.RINGER_MODE_NORMAL);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setSilentFor(final int minutes, final String mode) {
        try {
            AudioHelper.setSilentFor(activity, minutes, mode);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setSchedule(String json) {
        try {
            NotificationScheduler.schedule(activity, json);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setUpdateUrl(String url) {
        try {
            updater.setUpdateUrl(url);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void checkNow() {
        try {
            updater.checkAsync(true);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void updateWidget(String json) {
        try {
            prefs.edit().putString("widget_json", json).apply();
            PrayerWidget.refresh(activity);
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void requestNotifyPermission() {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 33 &&
                        activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void openBatterySettings() {
        activity.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(i);
            } catch (Exception e) {
                try {
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                } catch (Exception ignored) {
                }
            }
        });
    }

    @JavascriptInterface
    public void openExactAlarmSettings() {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 31) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                } else {
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                }
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void openDndSettings() {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void requestDndPermission() {
        openDndSettings();
    }

    /** يُنادى من النشاط بعد تحديث المحتوى: يُزيل عامل الخدمة القديم ثم يُعيد التحميل. */
    void reloadPage() {
        webView.post(() -> webView.evaluateJavascript(
                "(async function(){try{if(navigator.serviceWorker){var rs=await navigator.serviceWorker.getRegistrations();" +
                        "for(var i=0;i<rs.length;i++)await rs[i].unregister();}}catch(e){}" +
                        "try{if(window.caches){var ks=await caches.keys();for(var j=0;j<ks.length;j++)await caches.delete(ks[j]);}}catch(e){}" +
                        "location.reload();})()", null));
    }
}
