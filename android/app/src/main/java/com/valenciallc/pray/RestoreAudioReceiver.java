package com.valenciallc.pray;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class RestoreAudioReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AudioHelper.restore(context);
    }
}
