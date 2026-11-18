package com.valenciallc.pray;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.File;

/** يشغّل نغمة الأذان المخزّنة محلياً عند حلول الوقت. */
public final class AdhanPlaybackService extends Service {
    private static final String STOP = "com.valenciallc.pray.STOP_ADHAN";
    private static final int ID = 2;
    private static final String CHANNEL = "adhan";
    private MediaPlayer player;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stop();
            return START_NOT_STICKY;
        }
        startForeground(ID, notification());
        String file = intent == null ? null : intent.getStringExtra("file");
        if (file == null || file.isEmpty()) file = "السريحي.mp3";
        File source = new File(new File(getFilesDir(), "www"), file);
        try {
            player = new MediaPlayer();
            player.setDataSource(source.getAbsolutePath());
            player.prepare();
            player.setOnCompletionListener(mp -> stop());
            player.start();
        } catch (Exception e) {
            stop();
            return START_NOT_STICKY;
        }
        new Handler(Looper.getMainLooper()).postDelayed(this::stop, 3 * 60 * 1000L);
        return START_NOT_STICKY;
    }

    private void stop() {
        releasePlayer();
        stopForeground(true);
        stopSelf();
    }

    private void releasePlayer() {
        try {
            if (player != null) {
                if (player.isPlaying()) player.stop();
                player.release();
            }
        } catch (Exception ignored) {
        }
        player = null;
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "الأذان", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
        }
        Intent stopIntent = new Intent(this, AdhanPlaybackService.class).setAction(STOP);
        PendingIntent stop = PendingIntent.getService(this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("الأذان")
                .setContentText("جارٍ تشغيل الأذان")
                .addAction(android.R.drawable.ic_media_pause, getString(R.string.stop_adhan), stop)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
