# Add project specific ProGuard rules here.
# Preserve line number information for crash stack traces in Google Play Console
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,JavascriptInterface

# Keep Capacitor Core & Plugins
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.community.admob.** { *; }
-keep class com.muneeb.neonserpents.** { *; }

# Keep WebView JavascriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Google Mobile Ads (AdMob) & UMP Consent SDK
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-dontwarn com.google.android.gms.**
