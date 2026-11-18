package com.valenciallc.pray;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Build;

/** يضع الهاتف في الصامت عند الأذان ثم يعيد الوضع السابق تلقائياً. */
final class AudioHelper {
    private AudioHelper() {
    }

    static void setSilentFor(Context c, int minutes, String mode) {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            SharedPreferences p = c.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
            p.edit().putInt("prev_ringer", am.getRingerMode()).apply();
            am.setRingerMode("vibrate".equals(mode) ? AudioManager.RINGER_MODE_VIBRATE : AudioManager.RINGER_MODE_SILENT);
            AlarmManager alarm = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (alarm == null) return;
            Intent i = new Intent(c, RestoreAudioReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(c, 77, i,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long at = System.currentTimeMillis() + Math.max(1, minutes) * 60000L;
            if (Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms())
                alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Exception ignored) {
        }
    }

    static void restore(Context c) {
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        try {
            SharedPreferences p = c.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
            am.setRingerMode(p.getInt("prev_ringer", AudioManager.RINGER_MODE_NORMAL));
        } catch (Exception ignored) {
        }
    }
}
