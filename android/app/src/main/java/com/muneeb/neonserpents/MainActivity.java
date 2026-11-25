package com.muneeb.neonserpents;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final class NativeBuildBridge {
        private final boolean debugBuild;

        NativeBuildBridge(boolean debugBuild) {
            this.debugBuild = debugBuild;
        }

        @JavascriptInterface
        public String getBuildEnvironment() {
            return debugBuild ? "development" : "production";
        }

        @JavascriptInterface
        public boolean isDebugBuild() {
            return debugBuild;
        }
    }

    @Override
    protected void load() {
        final boolean isDebugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView preWebView = findViewById(com.getcapacitor.android.R.id.webview);
        if (preWebView != null) {
            preWebView.addJavascriptInterface(new NativeBuildBridge(isDebugBuild), "SerpentBuildConfig");
        }
        super.load();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        final boolean isDebugBuild = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebugBuild);

        super.onCreate(savedInstanceState);

        // Enforce WebView debugging state after Bridge initialization as well
        WebView.setWebContentsDebuggingEnabled(isDebugBuild);

        Window window = getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            window.setStatusBarColor(Color.parseColor("#080D18"));
            window.setNavigationBarColor(Color.parseColor("#080D18"));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.parseColor("#080D18"));
            webView.addJavascriptInterface(new NativeBuildBridge(isDebugBuild), "SerpentBuildConfig");

            WebSettings settings = webView.getSettings();
            if (settings != null) {
                settings.setAllowFileAccess(false);
                settings.setAllowContentAccess(false);
                settings.setGeolocationEnabled(false);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    dispatchToSystem();
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "window.handleAndroidBack ? window.handleAndroidBack() : false",
                    handled -> {
                        if (!"true".equals(handled)) dispatchToSystem();
                    }
                );
            }

            private void dispatchToSystem() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    @Override
    public void onPause() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "if (window.onNativeAppPause) window.onNativeAppPause();",
                null
            );
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().evaluateJavascript(
                "if (window.onNativeAppResume) window.onNativeAppResume();",
                null
            );
        }
    }
}
