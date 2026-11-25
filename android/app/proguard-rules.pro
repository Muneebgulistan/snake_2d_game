# Add project specific ProGuard rules here.
# Preserve line number information for crash stack traces in Google Play Console
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,JavascriptInterface,Signature,InnerClasses,EnclosingMethod

# Keep Capacitor Core, Bridge & Plugins (reflection-loaded)
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.NativePlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep class com.getcapacitor.community.admob.** { *; }
-keep class com.muneeb.neonserpents.** { *; }

# Keep WebView JavascriptInterface methods and bridge classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep @android.webkit.JavascriptInterface class * { *; }

# Keep Google Mobile Ads (AdMob), UMP Consent SDK & Advertising ID
-keep class com.google.android.gms.ads.** { *; }
-keep interface com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep interface com.google.android.ump.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.android.ump.**
