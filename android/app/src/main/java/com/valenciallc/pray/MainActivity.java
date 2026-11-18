package com.valenciallc.pray;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;

/** غلاف أندرويد هادئ: يعرض المحتوى المحلي ويحدّثه تلقائياً من GitHub. */
public final class MainActivity extends Activity {
    private WebView webView;
    private LocalWebServer server;
    private ContentUpdater updater;
    private UpdaterBridge bridge;
    private SharedPreferences prefs;
    private int port = -1;
    private int knownVersion = 0;
    private boolean quietUiRegistered;

    private final BroadcastReceiver quietUiReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            syncAudioUi();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pray_updater", MODE_PRIVATE);
        prefs.edit().putBoolean(PhoneModeReceiver.PREF_QUIET, AudioHelper.isQuiet(this)).apply();
        updater = new ContentUpdater(this);
        updater.installBundledIfNeeded();
        knownVersion = updater.currentVersion();

        port = startLocalServer();
        if (port <= 0) Toast.makeText(this, "تعذر تشغيل الخادم المحلي", Toast.LENGTH_LONG).show();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF121815);
        setContentView(webView);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings st = webView.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setDatabaseEnabled(true);
        st.setAllowFileAccess(false);
        st.setAllowContentAccess(false);
        st.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        st.setLoadWithOverviewMode(true);
        st.setUseWideViewPort(true);
        st.setCacheMode(WebSettings.LOAD_NO_CACHE);
        st.setMediaPlaybackRequiresUserGesture(false);

        final int servingPort = port;
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("127.0.0.1".equals(uri.getHost()) && uri.getPort() == servingPort) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        bridge = new UpdaterBridge(this, updater, webView);
        webView.addJavascriptInterface(bridge, "AndroidUpdater");
        updater.setCallback((ok, message, version) -> runOnUiThread(() -> {
            Toast.makeText(this, (ok ? "✔ " : "✖ ") + message, Toast.LENGTH_LONG).show();
            if (ok && version > knownVersion) {
                knownVersion = version;
                bridge.reloadPage();
            }
        }));

        String url = port > 0
                ? "http://127.0.0.1:" + port + "/index.html"
                : "file:///android_asset/www/index.html";
        webView.loadUrl(url);

        NotificationScheduler.reschedule(this);
        // لا طلب إذن تلقائي عند الإقلاع — المستخدم يطلبه بنفسه من الإعدادات عند الحاجة.
        maybeAutoCheck();
    }

    /** يثبّت منفذ الخادم عبر إعادة التشغيل حتى يبقى أصل WebView ثابتاً فتُحفظ اللغة والإعدادات. */
    private int startLocalServer() {
        int saved = prefs.getInt("web_port", 0);
        int[] candidates = saved > 0
                ? new int[]{saved, 8765, 8766, 8767, 0}
                : new int[]{8765, 8766, 8767, 0};
        for (int candidate : candidates) {
            LocalWebServer candidateServer = new LocalWebServer(updater.webRoot(), candidate);
            try {
                int actual = candidateServer.start();
                server = candidateServer;
                prefs.edit().putInt("web_port", actual).apply();
                return actual;
            } catch (IOException ignored) {
                candidateServer.stop();
            }
        }
        return -1;
    }

    private void maybeAutoCheck() {
        long last = prefs.getLong("last_auto_check", 0L);
        if (System.currentTimeMillis() - last < 6 * 3600 * 1000L) return;
        prefs.edit().putLong("last_auto_check", System.currentTimeMillis()).apply();
        updater.checkAsync(false);
    }

    private void syncAudioUi() {
        if (webView != null) webView.evaluateJavascript("syncAudioFromNative()", null);
    }

    /** أزرار الصوت الفيزيائية تتحكم في تيار الأذان (Alarm) مباشرة. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            AudioHelper.adjustAlarmVolume(this, keyCode == KeyEvent.KEYCODE_VOLUME_UP ? 1 : -1);
            syncAudioUi();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!quietUiRegistered) {
            IntentFilter f = new IntentFilter(PhoneModeReceiver.ACTION_QUIET);
            if (Build.VERSION.SDK_INT >= 33)
                registerReceiver(quietUiReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            else
                registerReceiver(quietUiReceiver, f);
            quietUiRegistered = true;
        }
        syncAudioUi();
        if (updater != null) maybeAutoCheck();
    }

    @Override
    protected void onPause() {
        if (quietUiRegistered) {
            try {
                unregisterReceiver(quietUiReceiver);
            } catch (Exception ignored) {
            }
            quietUiRegistered = false;
        }
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.release();
        if (server != null) server.stop();
        super.onDestroy();
    }
}
