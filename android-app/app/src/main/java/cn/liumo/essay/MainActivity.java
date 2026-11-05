package cn.liumo.essay;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int PICK_IMAGE = 2417;
    private static final int TAKE_PHOTO = 2418;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private File pendingPhoto;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
            window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        } else {
            window.setStatusBarColor(android.graphics.Color.rgb(36, 75, 70));
            window.setNavigationBarColor(android.graphics.Color.rgb(244, 243, 239));
            if (Build.VERSION.SDK_INT >= 26) {
                window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        }

        webView = new WebView(this);
        webView.setBackgroundColor(android.graphics.Color.rgb(244, 243, 239));
        if (Build.VERSION.SDK_INT >= 30) {
            webView.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                android.graphics.Insets systemBars = windowInsets.getInsets(
                        android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
                return windowInsets;
            });
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/camera/", path -> {
                    File photo = pendingPhoto;
                    if (photo == null || !photo.isFile()) return null;
                    try {
                        return new android.webkit.WebResourceResponse("image/jpeg", "binary",
                                new FileInputStream(photo));
                    } catch (Exception exception) {
                        return null;
                    }
                })
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return assetLoader.shouldInterceptRequest(Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                return !"appassets.androidplatform.net".equals(request.getUrl().getHost());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(intent, PICK_IMAGE);
                    return true;
                } catch (Exception exception) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "无法打开系统图片选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });
        setContentView(webView);
        webView.requestApplyInsets();
        Uri assetUri = Uri.parse("https://appassets.androidplatform.net/assets/index.html");
        webView.loadUrl(assetUri.toString());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == TAKE_PHOTO) {
            if (resultCode == RESULT_OK && pendingPhoto != null && pendingPhoto.isFile() && pendingPhoto.length() > 0) {
                webView.evaluateJavascript("window.receiveCameraPhoto('https://appassets.androidplatform.net/camera/capture.jpg')", null);
            } else {
                if (pendingPhoto != null) pendingPhoto.delete();
                Toast.makeText(this, "未拍摄照片", Toast.LENGTH_SHORT).show();
            }
            return;
        }
        if (requestCode != PICK_IMAGE || fileCallback == null) return;
        Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null
                ? new Uri[]{data.getData()} : null;
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (pendingPhoto != null) pendingPhoto.delete();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public boolean takePhoto() {
            runOnUiThread(() -> {
                try {
                    Intent camera = new Intent("android.media.action.IMAGE_CAPTURE");
                    if (camera.resolveActivity(getPackageManager()) == null) {
                        Toast.makeText(MainActivity.this, "未找到可用的相机应用", Toast.LENGTH_LONG).show();
                        return;
                    }
                    File directory = new File(getCacheDir(), "camera");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot create camera cache");
                    pendingPhoto = new File(directory, "capture.jpg");
                    Uri output = FileProvider.getUriForFile(MainActivity.this, "cn.liumo.essay.files", pendingPhoto);
                    camera.putExtra(MediaStore.EXTRA_OUTPUT, output);
                    camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    startActivityForResult(camera, TAKE_PHOTO);
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(MainActivity.this, "未找到可用的相机应用", Toast.LENGTH_LONG).show();
                } catch (Exception exception) {
                    Toast.makeText(MainActivity.this, "无法启动相机", Toast.LENGTH_LONG).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean savePng(String dataUrl, String requestedName) {
            if (dataUrl == null || !dataUrl.startsWith("data:image/png;base64,")) return false;
            Uri destination = null;
            try {
                String encoded = dataUrl.substring("data:image/png;base64,".length());
                byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
                if (bytes.length < 24 || bytes[0] != (byte) 0x89 || bytes[1] != 'P'
                        || bytes[2] != 'N' || bytes[3] != 'G') return false;
                String displayName = safeName(requestedName);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, displayName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                if (Build.VERSION.SDK_INT >= 29) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES + "/LiMo");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                }
                destination = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (destination == null) return false;
                try (OutputStream stream = getContentResolver().openOutputStream(destination)) {
                    if (stream == null) throw new IllegalStateException("Cannot open image");
                    stream.write(bytes);
                    stream.flush();
                }
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues complete = new ContentValues();
                    complete.put(MediaStore.Images.Media.IS_PENDING, 0);
                    getContentResolver().update(destination, complete, null, null);
                }
                return true;
            } catch (Exception exception) {
                if (destination != null) getContentResolver().delete(destination, null, null);
                return false;
            }
        }

        private String safeName(String name) {
            String result = name == null ? "留墨_阅卷.png" : name;
            result = result.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (!result.toLowerCase(Locale.ROOT).endsWith(".png")) result += ".png";
            return result;
        }
    }
}
