package app.wanxiang.tavern;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.TextView;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private final ExecutorService writes = Executors.newSingleThreadExecutor();
    private final Set<Dialog> jsDialogs = new HashSet<>();
    private WebView webView;
    private WebExports exports;
    private ValueCallback<Uri[]> pendingFileSelection;

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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (pendingFileSelection != null) {
                    callback.onReceiveValue(null);
                    return true;
                }
                int mode = params.getMode();
                if (mode != FileChooserParams.MODE_OPEN && mode != FileChooserParams.MODE_OPEN_MULTIPLE) {
                    callback.onReceiveValue(null);
                    return true;
                }
                pendingFileSelection = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException | SecurityException error) {
                    android.util.Log.w("WanxiangTavern", "Cannot open file chooser", error);
                    clearFileSelection(null);
                    android.widget.Toast.makeText(MainActivity.this,
                            "系统无法打开文件选择器", android.widget.Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                if (!isLocalOrigin(Uri.parse(url))) return false;
                AlertDialog dialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, which) -> result.confirm())
                        .create();
                showJsDialog(dialog, result);
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!isLocalOrigin(Uri.parse(url))) return false;
                AlertDialog dialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, which) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, which) -> result.cancel())
                        .create();
                showJsDialog(dialog, result);
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue,
                    JsPromptResult result) {
                if (!isLocalOrigin(Uri.parse(url))) return false;
                EditText input = new EditText(MainActivity.this);
                input.setText(defaultValue == null ? "" : defaultValue);
                AlertDialog dialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton(android.R.string.ok,
                                (d, which) -> result.confirm(input.getText().toString()))
                        .setNegativeButton(android.R.string.cancel, (d, which) -> result.cancel())
                        .create();
                showJsDialog(dialog, result);
                return true;
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
        exports = new WebExports(this);
        WebViewCompat.addWebMessageListener(
                webView, "wanxiangNativeExport", Collections.singleton(ORIGIN),
                (view, message, source, mainFrame, reply) -> {
                    if (exports != null && webView == view && isLocalOrigin(source)
                            && message.getType() == WebMessageCompat.TYPE_ARRAY_BUFFER) {
                        exports.receive(message.getArrayBuffer(), reply);
                    }
                });
        setContentView(webView);
        webView.loadUrl(ORIGIN + "/");
    }

    private static boolean isLocalOrigin(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private void showJsDialog(AlertDialog dialog, JsResult result) {
        dialog.setOnCancelListener(d -> result.cancel());
        dialog.setOnDismissListener(d -> jsDialogs.remove(dialog));
        jsDialogs.add(dialog);
        dialog.show();
    }

    private void showJsDialog(AlertDialog dialog, JsPromptResult result) {
        dialog.setOnCancelListener(d -> result.cancel());
        dialog.setOnDismissListener(d -> jsDialogs.remove(dialog));
        jsDialogs.add(dialog);
        dialog.show();
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

    private void clearFileSelection(Uri[] selection) {
        ValueCallback<Uri[]> callback = pendingFileSelection;
        pendingFileSelection = null;
        if (callback != null) callback.onReceiveValue(selection);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (exports != null && exports.onActivityResult(requestCode, resultCode, data)) return;
        if (requestCode != FILE_CHOOSER_REQUEST) return;
        if (pendingFileSelection == null) return;
        Uri[] parsed;
        try {
            ClipData clips = data == null ? null : data.getClipData();
            if (resultCode == RESULT_OK && clips != null) {
                parsed = new Uri[clips.getItemCount()];
                for (int index = 0; index < clips.getItemCount(); index++) {
                    parsed[index] = clips.getItemAt(index).getUri();
                }
            } else {
                parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
        } catch (Exception error) {
            android.util.Log.w("WanxiangTavern", "Cannot parse file chooser result", error);
            clearFileSelection(null);
            return;
        }
        ArrayList<Uri> accepted = new ArrayList<>();
        if (parsed != null) {
            for (Uri uri : parsed) {
                if (uri == null) continue;
                if (!"content".equalsIgnoreCase(uri.getScheme())) continue;
                if (uri.getAuthority() == null || uri.getAuthority().isEmpty()) continue;
                accepted.add(uri);
            }
        }
        if (accepted.isEmpty()) {
            clearFileSelection(null);
        } else {
            clearFileSelection(accepted.toArray(new Uri[0]));
        }
    }

    private void showError(String message) {
        TextView notice = new TextView(this);
        notice.setText(message);
        setContentView(notice);
    }

    @Override
    protected void onDestroy() {
        if (exports != null) {
            exports.close();
            exports = null;
        }
        for (Dialog dialog : new ArrayList<>(jsDialogs)) {
            dialog.cancel();
        }
        jsDialogs.clear();
        clearFileSelection(null);
        writes.shutdownNow();
        if (webView != null) {
            setContentView(new android.widget.FrameLayout(this));
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
