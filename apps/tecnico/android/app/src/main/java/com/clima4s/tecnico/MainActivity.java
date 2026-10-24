package com.clima4s.tecnico;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.os.Message;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.getSettings().setSupportMultipleWindows(true);
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    WebView.HitTestResult result = view.getHitTestResult();
                    String data = result != null ? result.getExtra() : null;
                    if (data != null && (
                        data.startsWith("http://") || 
                        data.startsWith("https://") || 
                        data.startsWith("tel:") || 
                        data.startsWith("mailto:") || 
                        data.startsWith("geo:")
                    )) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(data));
                        view.getContext().startActivity(intent);
                        return false;
                    }
                    return super.onCreateWindow(view, isDialog, isUserGesture, resultMsg);
                }
            });
        }
    }
}
