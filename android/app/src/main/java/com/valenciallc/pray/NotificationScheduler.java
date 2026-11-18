package com.valenciallc.pray;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** يحول جدول الأحداث القادم من صفحة الويب إلى تنبيهات نظام حقيقية. */
final class NotificationScheduler {
    static final String PREF = "pray_schedule";
    private static final String KEY_JSON = "json";
    private static final String KEY_IDS = "ids";
    private static final String CHANNEL = "prayer_times";
    private static final String CHANNEL_ADHAN = "adhan";

    private NotificationScheduler() {
    }

    static void schedule(Context c, String json) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        p.edit().putString(KEY_JSON, json).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (String id : p.getString(KEY_IDS, "").split(",")) {
            if (id.isEmpty()) continue;
            try {
                am.cancel(PendingIntent.getBroadcast(c, Integer.parseInt(id),
                        new Intent(c, AlarmReceiver.class),
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            } catch (Exception ignored) {
            }
        }
        try {
            JSONObject root = new JSONObject(json);
            JSONArray events = root.optJSONArray("events");
            long now = System.currentTimeMillis();
            int count = 0;
            StringBuilder ids = new StringBuilder();
            for (int i = 0; events != null && i < events.length(); i++) {
                JSONObject e = events.getJSONObject(i);
                long epoch = e.optLong("epoch");
                if (epoch <= now || epoch > now + 3L * 24 * 3600 * 1000) continue;
                int req = e.optString("id", "e" + i).hashCode() & 0x7fffffff;
                Intent in = new Intent(c, AlarmReceiver.class);
                in.putExtra("title", e.optString("title"));
                in.putExtra("text", e.optString("text"));
                in.putExtra("kind", e.optString("kind"));
                in.putExtra("key", e.optString("key"));
                in.putExtra("adhanMode", e.optString("adhanMode", "full"));
                JSONObject silent = e.optJSONObject("silent");
                if (silent != null) {
                    in.putExtra("silentMinutes", silent.optInt("minutes", 0));
                    in.putExtra("silentMode", silent.optString("mode", "silent"));
                }
                PendingIntent pi = PendingIntent.getBroadcast(c, req, in,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                setAlarm(am, epoch, pi);
                if (ids.length() > 0) ids.append(',');
                ids.append(req);
                count++;
            }
            p.edit().putString(KEY_IDS, ids.toString()).putInt("schedule_count", count).apply();
        } catch (Exception ignored) {
        }
    }

    /** إشعار تجريبي يُرسل من زر «تجربة إشعار» داخل WebView. */
    static void testNotification(Context c) {
        Intent data = new Intent();
        data.putExtra("title", "🔔 إشعار تجريبي");
        data.putExtra("text", "إشعارات الصلاة تعمل بنجاح");
        data.putExtra("kind", "test");
        show(c, data);
    }

    static void reschedule(Context c) {
        String json = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_JSON, "");
        if (json != null && !json.isEmpty()) schedule(c, json);
    }

    private static void setAlarm(AlarmManager am, long at, PendingIntent pi) {
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void show(Context c, Intent data) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        createChannels(nm);
        String title = data.getStringExtra("title");
        String text = data.getStringExtra("text");
        String kind = data.getStringExtra("kind");
        String adhanMode = data.getStringExtra("adhanMode");
        Intent open = new Intent(c, MainActivity.class);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL)
                : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title == null ? "أوقات الصلاة" : title)
                .setContentText(text == null ? "" : text)
                .setAutoCancel(true)
                .setContentIntent(tap);
        nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());

        int silent = data.getIntExtra("silentMinutes", 0);
        if (silent > 0) AudioHelper.setSilentFor(c, silent, data.getStringExtra("silentMode"));

        // الصامت و«لا تُزعج»: يبقى الإشعار والاهتزاز فقط، بلا أذان مسموع.
        if ("adhan".equals(kind) && adhanMode != null && !"none".equals(adhanMode)
                && !AudioHelper.isQuiet(c)) {
            Intent svc = new Intent(c, AdhanPlaybackService.class);
            svc.putExtra("file", "السريحي.mp3");
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(svc);
                else c.startService(svc);
            } catch (Exception ignored) {
                try {
                    c.startService(svc);
                } catch (Exception ignored2) {
                }
            }
        }
    }

    private static void createChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel normal = new NotificationChannel(CHANNEL, "أوقات الصلاة", NotificationManager.IMPORTANCE_HIGH);
        normal.setDescription("تنبيهات الأذان والإقامة في وقتها");
        nm.createNotificationChannel(normal);
        NotificationChannel adhan = new NotificationChannel(CHANNEL_ADHAN, "الأذان", NotificationManager.IMPORTANCE_HIGH);
        adhan.setDescription("تشغيل نغمة الأذان الكاملة");
        nm.createNotificationChannel(adhan);
    }
}
