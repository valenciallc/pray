package com.valenciallc.pray;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pray_updater", MODE_PRIVATE);
        updater = new ContentUpdater(this);
        updater.installBundledIfNeeded();
        knownVersion = updater.currentVersion();

        try {
            server = new LocalWebServer(updater.webRoot());
            port = server.start();
        } catch (IOException e) {
            Toast.makeText(this, "تعذر تشغيل الخادم المحلي", Toast.LENGTH_LONG).show();
        }

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
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
        maybeAutoCheck();
    }

    private void maybeAutoCheck() {
        long last = prefs.getLong("last_auto_check", 0L);
        if (System.currentTimeMillis() - last < 6 * 3600 * 1000L) return;
        prefs.edit().putLong("last_auto_check", System.currentTimeMillis()).apply();
        updater.checkAsync(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updater != null) maybeAutoCheck();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        super.onDestroy();
    }
}
