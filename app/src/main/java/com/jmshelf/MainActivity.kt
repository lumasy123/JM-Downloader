package com.jmshelf

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket

/**
 * 整个 App 就是一层壳：
 * 后台跑内置的 Python 书架服务，前台用 WebView 显示它的页面。
 * 这样界面和下载逻辑跟电脑版完全共用一套代码。
 */
class MainActivity : Activity() {

    companion object {
        private const val REQ_FILE = 1
        private const val REQ_NOTIFY = 2

        // Python 服务跑在进程里。下载服务让进程活着时，Activity 可能被系统
        // 回收再重建，这时不能再起一份服务（端口已被占用）
        @Volatile private var serverStarted = false
    }

    private val port = SERVER_PORT
    private lateinit var web: WebView
    private lateinit var splash: TextView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var askedNotify = false

    // 只在阅读器里、且设置里开着时才拦音量键，其他页面音量键照常调音量
    @Volatile private var volumeKeys = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installCrashLog()
        // 隐私开关存在本地，一启动就套上，不用等网页加载完
        applyPrivacy(getSharedPreferences("jmshelf", MODE_PRIVATE).getBoolean("privacy", true))

        splash = TextView(this).apply {
            text = "JM下载器启动中…"
            setTextColor(Color.parseColor("#9a9aab"))
            textSize = 15f
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(Color.parseColor("#14141a"))
        }
        setContentView(splash)

        Thread {
            try {
                val webDir = unpackWeb()
                startPython(webDir)
                waitForServer()
                runOnUiThread { showWebView() }
            } catch (e: Throwable) {
                saveCrash(e)
                runOnUiThread {
                    splash.text = "启动失败：\n${e}\n\n详细日志已写入\nAndroid/data/com.jmshelf/files/crash.log"
                }
            }
        }.start()
    }

    /**
     * 崩溃时把堆栈写到 Android/data/com.jmshelf/files/crash.log，
     * 用文件管理器就能取出来，不用接 adb。
     */
    private fun installCrashLog() {
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            saveCrash(error)
            prev?.uncaughtException(thread, error)
        }
    }

    private fun saveCrash(error: Throwable) {
        try {
            val dir = getExternalFilesDir(null) ?: filesDir
            File(dir, "crash.log").appendText(
                buildString {
                    append("\n===== ")
                    append(java.text.SimpleDateFormat(
                        "yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                        .format(java.util.Date()))
                    append(" =====\n")
                    append("abi: ").append(android.os.Build.SUPPORTED_ABIS.joinToString())
                    append("\nsdk: ").append(android.os.Build.VERSION.SDK_INT).append('\n')
                    append(android.util.Log.getStackTraceString(error))
                }
            )
        } catch (_: Throwable) {
            // 记日志本身失败就算了，不能因为它再崩一次
        }
    }

    /** 把打包进 APK 的界面文件释放到可读写目录，Python 那边按普通文件读取。 */
    private fun unpackWeb(): File {
        val dest = File(filesDir, "web")
        dest.mkdirs()
        assets.list("web")?.forEach { name ->
            assets.open("web/$name").use { input ->
                File(dest, name).outputStream().use { input.copyTo(it) }
            }
        }
        return dest
    }

    private fun startPython(webDir: File) {
        if (!Python.isStarted()) Python.start(AndroidPlatform(this))
        val py = Python.getInstance()

        // 漫画存到 App 的外部私有目录：不用申请存储权限，
        // 用文件管理器也能找到，卸载 App 时会一起清掉。
        val external = getExternalFilesDir(null) ?: filesDir
        val downloads = File(external, "downloads")
        downloads.mkdirs()

        val os = py.getModule("os")
        val env = os.get("environ")!!
        env.callAttr("__setitem__", "JM_WEB_DIR", webDir.absolutePath)
        env.callAttr("__setitem__", "JM_DOWNLOAD_DIR", downloads.absolutePath)
        // 配置放在外部私有目录，用文件管理器就能改（比如临时指定代理）
        env.callAttr("__setitem__", "JM_CONFIG", File(external, "config.json").absolutePath)
        env.callAttr("__setitem__", "JM_PORT", port.toString())
        env.callAttr("__setitem__", "JM_POSTMAN", "requests")

        if (serverStarted) return
        serverStarted = true
        Thread {
            // 这个调用会一直阻塞着跑服务，所以单开一条线程
            py.getModule("server").callAttr("start_for_android")
        }.apply { isDaemon = true }.start()
    }

    private fun waitForServer() {
        val deadline = System.currentTimeMillis() + 40_000
        while (System.currentTimeMillis() < deadline) {
            try {
                Socket().use { it.connect(InetSocketAddress("127.0.0.1", port), 400) }
                return
            } catch (_: Exception) {
                Thread.sleep(250)
            }
        }
        throw IllegalStateException("书架服务启动超时")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showWebView() {
        web = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(Color.parseColor("#14141a"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)       // 缩放由页面自己实现，关掉原生的免得打架
            settings.builtInZoomControls = false
            webViewClient = WebViewClient()
            webChromeClient = object : WebChromeClient() {
                // 网页里的 <input type="file">（导入备份）要靠这里接系统文件选择器
                override fun onShowFileChooser(
                    view: WebView, callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams,
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    val pick = Intent(Intent.ACTION_GET_CONTENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*")
                    return try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(Intent.createChooser(pick, "选择备份文件"), REQ_FILE)
                        true
                    } catch (_: Exception) {
                        fileCallback = null
                        false
                    }
                }
            }
            addJavascriptInterface(Bridge(), "AndroidApp")
        }
        setContentView(web)
        web.loadUrl("http://127.0.0.1:$port/")
    }

    inner class Bridge {
        /** 页面上的横屏按钮，返回切换后的方向。 */
        @JavascriptInterface
        fun toggleOrientation(): String {
            val toLandscape = resources.configuration.orientation ==
                android.content.res.Configuration.ORIENTATION_PORTRAIT
            Handler(Looper.getMainLooper()).post {
                requestedOrientation = if (toLandscape)
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                else
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            }
            return if (toLandscape) "landscape" else "portrait"
        }

        /** 网页一发现有下载任务就会调这里，挂上前台服务保活。 */
        @JavascriptInterface
        fun startDownloadService() {
            runOnUiThread {
                // 安卓 13 起通知要单独授权；不给也能下，只是看不到进度通知
                if (Build.VERSION.SDK_INT >= 33 && !askedNotify &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
                ) {
                    askedNotify = true
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
                }
                DownloadService.start(this@MainActivity)
            }
        }

        /**
         * 手机当前是不是深色模式。App 的主题是写死的深色，WebView 里的
         * prefers-color-scheme 反映的是它而不是手机，所以"跟随系统"得问这里。
         */
        @JavascriptInterface
        fun isNightMode(): Boolean =
            (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES

        /** 状态栏 / 导航栏跟着页面主题变色；light 时图标用深色。 */
        @JavascriptInterface
        fun setSystemBars(light: Boolean) {
            runOnUiThread {
                val color = Color.parseColor(if (light) "#F3F3F7" else "#14141A")
                window.statusBarColor = color
                window.navigationBarColor = color
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = light
                    isAppearanceLightNavigationBars = light
                }
            }
        }

        /** 阅读器里调屏幕亮度，0~1；传负数表示还给系统。只影响本 App 窗口。 */
        @JavascriptInterface
        fun setBrightness(level: Float) {
            runOnUiThread {
                window.attributes = window.attributes.apply {
                    screenBrightness =
                        if (level < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        else level.coerceIn(0.01f, 1f)
                }
            }
        }

        /** 复制到剪贴板（WebView 里网页自己的剪贴板接口不一定可用）。 */
        @JavascriptInterface
        fun copyText(text: String) {
            runOnUiThread {
                val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("JM 号单", text))
            }
        }

        /** 设置页的隐私开关。 */
        @JavascriptInterface
        fun setPrivacy(enabled: Boolean) {
            getSharedPreferences("jmshelf", MODE_PRIVATE).edit().putBoolean("privacy", enabled).apply()
            runOnUiThread { applyPrivacy(enabled) }
        }

        /** 进出阅读器时由页面开关。 */
        @JavascriptInterface
        fun setVolumeKeys(enabled: Boolean) {
            volumeKeys = enabled
        }

        /** 用系统分享面板把备份文件发出去（存网盘、发给自己等）。 */
        @JavascriptInterface
        fun shareFile(path: String): Boolean {
            val base = getExternalFilesDir(null) ?: return false
            val file = File(path)
            // 只允许分享 App 自己目录下的文件
            if (!file.isFile || !file.canonicalPath.startsWith(base.canonicalPath)) return false
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
            // 号单是纯文本，聊天软件对 text/plain 更友好；备份是 JSON
            val mime = if (file.name.endsWith(".txt")) "text/plain" else "application/json"
            val send = Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            runOnUiThread { startActivity(Intent.createChooser(send, "保存或发送备份")) }
            return true
        }
    }

    /**
     * 切到后台时最近任务里不显示 App 画面。
     * 安卓 13 起系统有专门的接口，只隐藏缩略图、不影响截屏；
     * 更早的系统只能用 FLAG_SECURE，副作用是同时禁止截屏。
     */
    private fun applyPrivacy(enabled: Boolean) {
        if (Build.VERSION.SDK_INT >= 33) {
            setRecentsScreenshotEnabled(!enabled)
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else if (enabled) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    private fun isVolumeKey(keyCode: Int) =
        keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (volumeKeys && isVolumeKey(keyCode) && this::web.isInitialized) {
            val dir = if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) 1 else -1
            web.evaluateJavascript("window.onVolumeKey && window.onVolumeKey($dir)", null)
            return true   // 吃掉这次按键，不然还会弹出系统音量条
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (volumeKeys && isVolumeKey(keyCode)) return true
        return super.onKeyUp(keyCode, event)
    }

    /** 系统切换深浅色时（清单里声明了 uiMode，Activity 不会重建），让页面重新套主题。 */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (this::web.isInitialized) {
            web.evaluateJavascript("window.applyTheme && window.applyTheme()", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::web.isInitialized && web.canGoBack()) web.goBack()
        else super.onBackPressed()
    }
}
