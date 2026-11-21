package app.wanxiang.tavern;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private final ExecutorService writes = Executors.newSingleThreadExecutor();
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
            showError("请更新 Android System WebView 后重新打开游戏。");
            return;
        }

        final WebFiles files;
        try {
            files = new WebFiles(getAssets(), new File(getFilesDir(), "updates/v1"));
        } catch (Exception error) {
            android.util.Log.e("WanxiangTavern", "Cannot load first pack", error);
            showError("首包资源无法读取，请重新安装游戏。");
            return;
        }

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isLocalOrigin(request.getUrl())) return false;
                openExternalLink(request.getUrl());
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return isLocalOrigin(request.getUrl()) ? files.serve(request) : null;
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                openExternalLink(Uri.parse(url)));
        WebViewCompat.addWebMessageListener(
                webView, "wanxiangNativeUpdate", Collections.singleton(ORIGIN),
                (view, message, source, mainFrame, reply) -> {
                    // The game may run in its same-origin landscape frame.
                    if (!isLocalOrigin(source) || message.getType() != WebMessageCompat.TYPE_ARRAY_BUFFER)
                        return;
                    byte[] bytes = message.getArrayBuffer();
                    writes.execute(() -> {
                        String result = files.change(bytes);
                        runOnUiThread(() -> {
                            if (webView == view) reply.postMessage(result);
                        });
                    });
                });
        setContentView(webView);
        webView.loadUrl(ORIGIN + "/");
    }

    private static boolean isLocalOrigin(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private void openExternalLink(Uri uri) {
        String scheme = uri.getScheme();
        if (isLocalOrigin(uri) || uri.getHost() == null
                || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException | SecurityException error) {
            android.util.Log.w("WanxiangTavern", "Cannot open external link", error);
        }
    }

    private void showError(String message) {
        TextView notice = new TextView(this);
        notice.setText(message);
        setContentView(notice);
    }

    @Override
    protected void onDestroy() {
        writes.shutdownNow();
        if (webView != null) {
            setContentView(new android.widget.FrameLayout(this));
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
