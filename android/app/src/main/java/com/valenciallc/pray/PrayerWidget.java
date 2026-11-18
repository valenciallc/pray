package com.valenciallc.pray;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

public final class PrayerWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, manager, id);
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PrayerWidget.class));
        for (int id : ids) updateOne(context, manager, id);
    }

    private static void updateOne(Context c, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(c.getPackageName(), R.layout.widget);
        String next = c.getString(R.string.widget_empty);
        String times = "";
        try {
            SharedPreferences p = c.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
            String raw = p.getString("widget_json", "");
            if (raw != null && !raw.isEmpty()) {
                JSONObject o = new JSONObject(raw);
                JSONObject n = o.optJSONObject("next");
                if (n != null) {
                    next = n.optString("key", "") + " · " + n.optString("time", "");
                    if (n.has("epoch") && n.optLong("epoch") > System.currentTimeMillis())
                        next += " ⏳";
                }
                JSONObject prayers = o.optJSONObject("prayers");
                if (prayers != null) {
                    String[] keys = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};
                    StringBuilder b = new StringBuilder();
                    for (String k : keys) {
                        if (b.length() > 0) b.append("  ");
                        b.append(prayers.optString(k, "--:--"));
                    }
                    times = b.toString();
                }
            }
        } catch (Exception ignored) {
        }
        views.setTextViewText(R.id.widgetNext, next);
        views.setTextViewText(R.id.widgetTimes, times);
        Intent open = new Intent(c, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widgetRoot, pi);
        manager.updateAppWidget(id, views);
    }
}
