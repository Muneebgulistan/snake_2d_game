package com.muneeb.neonserpents;

import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null) {
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
}
