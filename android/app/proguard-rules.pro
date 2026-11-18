# لا نضغط javascript interface: أسماء دوال الجسر يجب أن تبقى كما هي.
-keepclassmembers class com.valenciallc.pray.UpdaterBridge {
    @android.webkit.JavascriptInterface *;
}
-keep class com.valenciallc.pray.UpdaterBridge { *; }
