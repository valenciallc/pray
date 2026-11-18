package com.valenciallc.pray;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Build;

/** يضع الهاتف في الصامت عند الأذان ثم يعيد الوضع السابق تلقائياً، ويتعرف على أوضاع الهدوء. */
final class AudioHelper {
    private AudioHelper() {
    }

    /** صامت/اهتزاز أو «لا تُزعج» يعني أن الأذان لا يجب أن يُشغَّل بصوت. */
    static boolean isQuiet(Context c) {
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return true;
            if (Build.VERSION.SDK_INT >= 24) {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null && nm.isNotificationPolicyAccessGranted()
                        && nm.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL)
                    return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /** أزرار الصوت الفيزيائية تضبط تيار الأذان (Alarm) مع ظهور مؤشر النظام. */
    static void adjustAlarmVolume(Context c, int direction) {
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int flags = AudioManager.FLAG_SHOW_UI;
            if (!isQuiet(c)) flags |= AudioManager.FLAG_PLAY_SOUND;
            am.adjustStreamVolume(AudioManager.STREAM_ALARM, direction, flags);
        } catch (Exception ignored) {
        }
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
