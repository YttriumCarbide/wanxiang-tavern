package app.wanxiang.tavern;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String NEXT_TREE_REQUEST = "nextTreeRequest";
    private static final int FIRST_TREE_REQUEST = 1004;
    private final ExecutorService writes = Executors.newSingleThreadExecutor();
    private final Set<Dialog> jsDialogs = new HashSet<>();
    private WebView webView;
    private FrameLayout content;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private WebExports exports;
    private PendingFileSelection pendingFileSelection;
    private boolean backPending;
    private int nextTreeRequest = FIRST_TREE_REQUEST;

    private record PendingFileSelection(int requestCode, ValueCallback<Uri[]> callback) {}

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) nextTreeRequest = state.getInt(NEXT_TREE_REQUEST, FIRST_TREE_REQUEST);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
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
        exports = new WebExports(this, () -> pendingFileSelection != null, () -> nextTreeRequest++);
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

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view == webView) recoverRenderer(view);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (view != webView || exports == null) return true;
                if (pendingFileSelection != null || exports.isChoosing()) {
                    callback.onReceiveValue(null);
                    return true;
                }
                int mode = params.getMode();
                if (mode != FileChooserParams.MODE_OPEN && mode != FileChooserParams.MODE_OPEN_MULTIPLE) {
                    callback.onReceiveValue(null);
                    return true;
                }
                try {
                    launchFileChooser(params, callback);
                } catch (ActivityNotFoundException | SecurityException error) {
                    android.util.Log.w("WanxiangTavern", "Cannot open file chooser", error);
                    clearFileSelection(callback, null);
                    android.widget.Toast.makeText(MainActivity.this,
                            "系统无法打开文件选择器", android.widget.Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenCallback != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenCallback = callback;
                content.addView(view, new FrameLayout.LayoutParams(-1, -1));
                webView.setVisibility(View.INVISIBLE);
                setFullscreen(true);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenCallback == null) return;
                CustomViewCallback callback = fullscreenCallback;
                fullscreenCallback = null;
                content.removeViewAt(1);
                webView.setVisibility(View.VISIBLE);
                setFullscreen(false);
                callback.onCustomViewHidden();
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
                    if (webView != view || !isLocalOrigin(source)
                            || message.getType() != WebMessageCompat.TYPE_ARRAY_BUFFER) return;
                    byte[] bytes = message.getArrayBuffer();
                    writes.execute(() -> {
                        String result = files.change(bytes);
                        runOnUiThread(() -> {
                            if (webView == view) reply.postMessage(result);
                        });
                    });
                });
        WebViewCompat.addWebMessageListener(
                webView, "wanxiangNativeExport", Collections.singleton(ORIGIN),
                (view, message, source, mainFrame, reply) -> {
                    if (exports != null && webView == view && isLocalOrigin(source)
                            && message.getType() == WebMessageCompat.TYPE_ARRAY_BUFFER) {
                        exports.receive(message.getArrayBuffer(), reply);
                    }
                });
        content = new FrameLayout(this);
        content.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 35) {
            content.setOnApplyWindowInsetsListener((view, insets) -> {
                var safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                var keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, Math.max(safe.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(content);
        webView.loadUrl(ORIGIN + "/");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void setFullscreen(boolean fullscreen) {
        if (Build.VERSION.SDK_INT >= 30) {
            var controller = getWindow().getInsetsController();
            if (controller == null) return;
            if (fullscreen) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            } else {
                controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            getWindow().getDecorView().setSystemUiVisibility(fullscreen ? flags : 0);
        }
    }

    @Override
    @SuppressLint("GestureBackNavigation") // Android 13+ registers an OnBackInvokedCallback above.
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (backPending || isFinishing()) return;
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        if (fullscreenCallback != null) {
            webView.getWebChromeClient().onHideCustomView();
            return;
        }
        WebView view = webView;
        backPending = true;
        view.evaluateJavascript("""
                (() => {
                    const dialogs = [...document.querySelectorAll('dialog:modal')];
                    const dialog = dialogs.reverse().find((node) => node.contains(document.activeElement))
                        || dialogs[0];
                    if (!dialog || dialog.id === 'start-screen') return false;
                    if (dialog.requestClose) dialog.requestClose();
                    else if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
                    return true;
                })()
                """, handled -> {
            backPending = false;
            if (webView != view || isFinishing() || "true".equals(handled)) return;
            if (view.canGoBack()) view.goBack();
            else super.onBackPressed();
        });
    }

    private void startFileChooser(Intent intent, ValueCallback<Uri[]> callback) {
        int requestCode = nextTreeRequest++;
        pendingFileSelection = new PendingFileSelection(requestCode, callback);
        startActivityForResult(intent, requestCode);
    }

    private void launchFileChooser(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        Set<String> types = new LinkedHashSet<>();
        boolean json = false;
        String[] accepted = params.getAcceptTypes();
        for (String raw : accepted == null ? new String[0] : accepted) {
            for (String part : raw.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                if (".json".equals(type) || "application/json".equals(type)) json = true;
                if (type.startsWith(".")) {
                    type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                }
                if (type != null && type.contains("/")) types.add(type);
            }
        }
        // File providers may label portable JSON exports as text or binary.
        intent.setType(!json && types.size() == 1 ? types.iterator().next() : "*/*");
        if (!json && types.size() > 1 && !types.contains("*/*")) {
            intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        }
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
        try {
            startFileChooser(intent, callback);
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            intent.setAction(Intent.ACTION_GET_CONTENT);
            startFileChooser(intent, callback);
        }
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

    private void clearFileSelection(PendingFileSelection expected, Uri[] selection) {
        if (expected == null || pendingFileSelection != expected) return;
        pendingFileSelection = null;
        expected.callback().onReceiveValue(selection);
    }

    private void clearFileSelection(ValueCallback<Uri[]> callback, Uri[] selection) {
        PendingFileSelection current = pendingFileSelection;
        if (current != null && current.callback() == callback) clearFileSelection(current, selection);
    }

    private void clearFileSelection(Uri[] selection) {
        clearFileSelection(pendingFileSelection, selection);
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        // Keep all picker request codes unique across Activity recreation.
        state.putInt(NEXT_TREE_REQUEST, nextTreeRequest);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (exports != null && exports.onActivityResult(requestCode, resultCode, data)) return;
        PendingFileSelection pending = pendingFileSelection;
        if (pending == null || requestCode != pending.requestCode()) return;
        if (resultCode != RESULT_OK || data == null) {
            clearFileSelection(pending, null);
            return;
        }
        Uri[] parsed;
        try {
            ClipData clips = data.getClipData();
            if (clips != null && clips.getItemCount() > 0) {
                parsed = new Uri[clips.getItemCount()];
                for (int index = 0; index < clips.getItemCount(); index++) {
                    parsed[index] = clips.getItemAt(index).getUri();
                }
            } else {
                parsed = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
        } catch (Exception error) {
            android.util.Log.w("WanxiangTavern", "Cannot parse file chooser result", error);
            clearFileSelection(pending, null);
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
            clearFileSelection(pending, null);
        } else {
            clearFileSelection(pending, accepted.toArray(new Uri[0]));
        }
    }

    private void recoverRenderer(WebView failedView) {
        // The old renderer cannot receive chooser, dialog, or fullscreen callbacks.
        webView = null;
        backPending = false;
        pendingFileSelection = null;
        fullscreenCallback = null;
        setFullscreen(false);
        if (exports != null) {
            exports.close();
            exports = null;
        }
        for (Dialog dialog : new ArrayList<>(jsDialogs)) {
            dialog.dismiss();
        }
        jsDialogs.clear();
        content.removeAllViews();
        failedView.destroy();

        Button reload = new Button(this);
        reload.setText("游戏画面已中断，点此重新载入");
        reload.setOnClickListener(button -> {
            button.setEnabled(false);
            recreate();
        });
        content.addView(reload, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
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
            if (fullscreenCallback != null) webView.getWebChromeClient().onHideCustomView();
            setContentView(new android.widget.FrameLayout(this));
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
