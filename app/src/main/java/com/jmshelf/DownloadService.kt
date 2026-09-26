package com.jmshelf

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** 内置书架服务的端口，Activity 和下载服务共用 */
const val SERVER_PORT = 8777

/**
 * 下载期间的前台服务。
 *
 * 安卓会把退到后台的 App 限速甚至杀掉，锁屏时更明显。下载时挂一个前台服务
 * （通知栏常驻进度），进程就能一直活着；全部下完后自动退出，并发一条完成通知。
 * 进度直接轮询本地的 /api/tasks，和网页上看到的是同一份数据。
 */
class DownloadService : Service() {

    companion object {
        private const val CHANNEL_PROGRESS = "download_progress"
        private const val CHANNEL_DONE = "download_done"
        private const val ID_PROGRESS = 1

        fun start(context: Context) {
            val intent = Intent(context, DownloadService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
            else context.startService(intent)
        }
    }

    private val lock = Any()
    private var worker: Thread? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastStartId = 0
    @Volatile private var restartRequested = false
    @Volatile private var destroyed = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannels()
        // 必须在几秒内转成前台，否则系统会报错
        ServiceCompat.startForeground(
            this, ID_PROGRESS, progressNotification("准备下载…", null, 0, 0),
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0,
        )
        synchronized(lock) {
            lastStartId = startId
            if (worker == null) {
                // 锁屏后 CPU 会休眠，拿一个部分唤醒锁让下载线程继续跑；最长 6 小时兜底
                wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jmshelf:download")
                    .apply { acquire(6 * 60 * 60 * 1000L) }
                worker = Thread({ watch() }, "download-watch").apply { start() }
            } else {
                // 监视线程可能正准备退出，告诉它又有新下载了
                restartRequested = true
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        destroyed = true
        synchronized(lock) { releaseWakeLock() }
        super.onDestroy()
    }

    private fun watch() {
        val seen = mutableSetOf<String>()        // 这次服务期间出现过的任务
        val names = mutableMapOf<String, String>()
        var lastStatus = mapOf<String, String>()
        var idle = 0
        var failures = 0

        while (!destroyed) {
            val tasks = fetchTasks()
            if (tasks == null) {
                // 连不上本地服务，多给几次机会，还不行就收工
                if (++failures >= 5) break
            } else {
                failures = 0
                var running = 0
                var queued = 0
                var done = 0L
                var total = 0L
                val status = mutableMapOf<String, String>()
                for (i in 0 until tasks.length()) {
                    val t = tasks.getJSONObject(i)
                    val id = t.optString("id")
                    val st = t.optString("status")
                    status[id] = st
                    names[id] = t.optString("name", "JM$id")
                    when (st) {
                        "running" -> {
                            running++; seen.add(id)
                            done += t.optLong("done"); total += t.optLong("total")
                        }
                        "queued" -> { queued++; seen.add(id) }
                    }
                }
                lastStatus = status

                if (running + queued > 0) {
                    idle = 0
                    val title = "正在下载 $running 本" + if (queued > 0) "，排队 $queued 本" else ""
                    val text = if (total > 0) "$done / $total 页" else "正在获取漫画信息…"
                    notify(ID_PROGRESS, progressNotification(title, text, done, total))
                } else if (++idle >= 2) {
                    // 连续两次都没任务才算下完，避开"刚点下载、还没入队"的空窗
                    val keepGoing = synchronized(lock) {
                        if (restartRequested) {
                            restartRequested = false
                            true
                        } else {
                            finish(seen, lastStatus, names)
                            false
                        }
                    }
                    if (!keepGoing) return
                    idle = 0
                }
            }
            try {
                Thread.sleep(1500)
            } catch (_: InterruptedException) {
                break
            }
        }
        synchronized(lock) { finish(seen, lastStatus, names) }
    }

    /** 调用方需持有 lock。 */
    private fun finish(seen: Set<String>, status: Map<String, String>, names: Map<String, String>) {
        worker = null
        // 不发「下载完成」通知：这个 App 不在通知栏留任何消息，下完由 App 里的提示告诉你
        releaseWakeLock()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // 只在没有更新的启动请求时才真正停掉，避免刚好撞上新下载
        stopSelfResult(lastStartId)
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun fetchTasks(): JSONArray? = try {
        val conn = URL("http://127.0.0.1:$SERVER_PORT/api/tasks").openConnection() as HttpURLConnection
        conn.connectTimeout = 2000
        conn.readTimeout = 4000
        try {
            val body = conn.inputStream.bufferedReader(Charsets.UTF_8).readText()
            JSONObject(body).getJSONArray("tasks")
        } finally {
            conn.disconnect()
        }
    } catch (_: Exception) {
        null
    }

    private fun openAppIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun progressNotification(title: String, text: String?, done: Long, total: Long): Notification =
        NotificationCompat.Builder(this, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_download)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openAppIntent())
            .apply {
                if (total > 0) setProgress(100, (done * 100 / total).toInt().coerceIn(0, 100), false)
                else setProgress(0, 0, true)
            }
            .build()

    private fun notify(id: Int, n: Notification) {
        try {
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(id, n)
        } catch (_: SecurityException) {
            // 没给通知权限：只是看不到通知，下载本身照常进行
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_PROGRESS, "下载进度", NotificationManager.IMPORTANCE_LOW))
        nm.deleteNotificationChannel(CHANNEL_DONE)   // 旧版本建过「下载完成」渠道，清掉
    }
}
