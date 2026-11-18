package com.valenciallc.pray;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.app.NotificationManager;

/** يراقب الصامت و«لا تُزعج» ويُخطر النشاط وخدمة الأذان ليتوقفا تلقائياً. */
public final class PhoneModeReceiver extends BroadcastReceiver {
    static final String ACTION_QUIET = "com.valenciallc.pray.QUIET_MODE_CHANGED";
    static final String EXTRA_QUIET = "quiet";
    static final String PREF_QUIET = "quiet_mode";
    private static final String INTERRUPTION_FILTER_CHANGED = "android.app.action.INTERRUPTION_FILTER_CHANGED";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        if (!AudioManager.RINGER_MODE_CHANGED_ACTION.equals(action)
                && !INTERRUPTION_FILTER_CHANGED.equals(action)) return;

        boolean quiet = AudioHelper.isQuiet(context);
        SharedPreferences p = context.getSharedPreferences("pray_updater", Context.MODE_PRIVATE);
        p.edit().putBoolean(PREF_QUIET, quiet).apply();

        Intent notify = new Intent(ACTION_QUIET).setPackage(context.getPackageName());
        notify.putExtra(EXTRA_QUIET, quiet);
        context.sendBroadcast(notify);
    }
}
