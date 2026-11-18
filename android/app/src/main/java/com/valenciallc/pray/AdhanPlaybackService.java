package com.valenciallc.pray;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.File;

/** يشغّل نغمة الأذان محلياً على تيار Alarm، ويتوقف فوراً عند الصامت أو «لا تُزعج». */
public final class AdhanPlaybackService extends Service {
    public static final String ACTION_STOP = "com.valenciallc.pray.STOP_ADHAN";
    private static final int ID = 2;
    private static final String CHANNEL = "adhan";
    private MediaPlayer player;
    private BroadcastReceiver quietReceiver;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::stop;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stop();
            return START_NOT_STICKY;
        }
        startForeground(ID, notification());
        registerQuietReceiver();

        // احترام الصامت و«لا تُزعج»: إشعار فقط بلا صوت.
        if (AudioHelper.isQuiet(this)) {
            stop();
            return START_NOT_STICKY;
        }

        String file = intent == null ? null : intent.getStringExtra("file");
        if (file == null || file.isEmpty()) file = "السريحي.mp3";
        File source = new File(new File(getFilesDir(), "www"), file);
        try {
            player = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= 21) {
                player.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
            } else {
                player.setAudioStreamType(3); // STREAM_ALARM
            }
            player.setDataSource(source.getAbsolutePath());
            player.prepare();
            player.setOnCompletionListener(mp -> stop());
            player.start();
        } catch (Exception e) {
            stop();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, 3 * 60 * 1000L);
        return START_NOT_STICKY;
    }

    private void registerQuietReceiver() {
        if (quietReceiver != null) return;
        quietReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getBooleanExtra(PhoneModeReceiver.EXTRA_QUIET, false)
                        || AudioHelper.isQuiet(context)) {
                    stop();
                }
            }
        };
        IntentFilter filter = new IntentFilter(PhoneModeReceiver.ACTION_QUIET);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(quietReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(quietReceiver, filter);
    }

    private void stop() {
        handler.removeCallbacks(timeout);
        unregisterQuietReceiver();
        releasePlayer();
        stopForeground(true);
        stopSelf();
    }

    private void unregisterQuietReceiver() {
        if (quietReceiver == null) return;
        try {
            unregisterReceiver(quietReceiver);
        } catch (Exception ignored) {
        }
        quietReceiver = null;
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
        Intent stopIntent = new Intent(this, AdhanPlaybackService.class).setAction(ACTION_STOP);
        PendingIntent stop = PendingIntent.getService(this, 0, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("الأذان")
                .setContentText("جارٍ تشغيل الأذان — اضغط لإيقافه")
                .addAction(android.R.drawable.ic_media_pause, getString(R.string.stop_adhan), stop)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(timeout);
        unregisterQuietReceiver();
        releasePlayer();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
