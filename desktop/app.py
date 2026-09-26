"""JM下载器 · Windows 桌面端入口。

和安卓 App 一个思路：后台跑同一份 server.py，前面用系统的 Edge 内核（WebView2）开一个窗口显示网页界面。
手机专用的几个原生接口，在这里换成电脑上的做法（见 DesktopApi）；其余功能和网页版完全一样。

数据（书、收藏、评分……）默认放在 %APPDATA%\\JM下载器，可以在设置里换到别的文件夹；
config.json 始终留在 %APPDATA%\\JM下载器，里面的 download_dir 指向当前的数据位置。程序本身可以装在任何地方。
打包见 desktop/build.py。
"""
from __future__ import annotations

import ctypes
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
from pathlib import Path

APP_NAME = "JM下载器"
# 端口固定：网页里的阅读进度、设置存在 localStorage，按「地址 + 端口」区分，换端口就全丢了
PORT = 18630

# 打包后资源在 PyInstaller 解出来的目录里；直接用 python 跑时就在仓库里
BUNDLE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
DATA = Path(os.environ.get("APPDATA") or Path.home()) / APP_NAME
DATA.mkdir(parents=True, exist_ok=True)


def _log_to_file() -> None:
    """打包成无窗口程序后没有控制台，print 和报错写到数据目录的日志里，出问题时好查。"""
    if sys.stdout is None or getattr(sys, "frozen", False):
        log = open(DATA / "desktop.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log


def _wait_for_previous() -> None:
    """换了存储位置后自己重启：等上一个进程完全退出（放开端口）再往下走。"""
    if "--after" not in sys.argv:
        return
    pid = int(sys.argv[sys.argv.index("--after") + 1])
    handle = ctypes.windll.kernel32.OpenProcess(0x00100000, False, pid)   # SYNCHRONIZE
    if handle:
        ctypes.windll.kernel32.WaitForSingleObject(handle, 15000)
        ctypes.windll.kernel32.CloseHandle(handle)


def _single_instance() -> bool:
    """已经开着一个的话，把那个窗口提到前面，自己退出。"""
    ctypes.windll.kernel32.CreateMutexW(None, False, "JMDownloaderDesktopSingleton")
    if ctypes.windll.kernel32.GetLastError() == 183:   # ERROR_ALREADY_EXISTS
        hwnd = ctypes.windll.user32.FindWindowW(None, APP_NAME)
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)   # SW_RESTORE
            ctypes.windll.user32.SetForegroundWindow(hwnd)
        return False
    return True


def _port_free(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _prepare_env() -> int:
    """在 import server 之前把配置、网页、端口都指到桌面端的位置。"""
    config = DATA / "config.json"
    if not config.exists():
        # 第一次启动：下载目录放在数据目录里，写成绝对路径，之后在设置里改也方便看懂
        config.write_text(json.dumps({"download_dir": str(DATA / "downloads")},
                                     ensure_ascii=False, indent=2), "utf-8")
    os.environ["JM_CONFIG"] = str(config)
    os.environ["JM_WEB_DIR"] = str(BUNDLE / "web")
    port = PORT
    if not _port_free(port):
        # 被别的程序占了：退而求其次随便挑一个（这次打开时的阅读进度会和平时分开存）
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
    os.environ["JM_PORT"] = str(port)
    return port


class DesktopApi:
    """网页里通过 window.pywebview.api 调用；app.js 会把它包成和安卓一样的 window.AndroidApp。"""

    def __init__(self) -> None:
        self._window = None

    def save_file(self, path: str) -> bool:
        """安卓上是系统分享；电脑上弹「另存为」，存好后在资源管理器里选中它。"""
        import server
        import webview
        src = Path(path).resolve()
        if src.parent != server.BACKUP_DIR.resolve() or not src.is_file():
            return False
        target = self._window.create_file_dialog(
            webview.FileDialog.SAVE, directory=str(Path.home() / "Downloads"), save_filename=src.name)
        if not target:
            return False
        dest = Path(target if isinstance(target, str) else target[0])
        shutil.copyfile(src, dest)
        self._window.evaluate_js(f"toast({json.dumps('已保存到 ' + str(dest))})")
        subprocess.Popen(["explorer", "/select,", str(dest)])
        return True

    def toggle_fullscreen(self) -> None:
        """阅读器的「横屏」按钮，在电脑上就是全屏 / 退出全屏。"""
        self._window.toggle_fullscreen()

    # ---- 存储位置 ----
    def get_data_location(self) -> str:
        import server
        return str(server.DOWNLOAD_DIR.parent)

    def open_data_folder(self) -> None:
        import server
        os.startfile(server.DOWNLOAD_DIR.parent)

    def change_data_location(self) -> dict:
        """选一个新文件夹，把书和各种数据搬过去（那边已经有书架的话直接切过去用），然后重启。"""
        import server
        import webview
        old = server.DOWNLOAD_DIR.parent
        picked = self._window.create_file_dialog(webview.FileDialog.FOLDER, directory=str(old))
        if not picked:
            return {"status": "cancel"}
        new = Path(picked if isinstance(picked, str) else picked[0]).resolve()
        if new == old:
            return {"status": "cancel"}
        if old in new.parents:
            return {"status": "error", "message": "不能选当前数据文件夹里面的文件夹"}
        if (new / "downloads").is_dir():
            if not self._window.create_confirmation_dialog(
                    "那里已经有书架了", f"{new}\n里已经有 JM下载器的数据，直接切换过去用那边的吗？（这边的数据留在原处不动）"):
                return {"status": "cancel"}
        else:
            busy = [t for t in list(server.TASKS.values()) if t.status in ("running", "queued")]
            if busy:
                return {"status": "error", "message": "还有任务在下载，等下完或暂停后再换位置"}
            try:
                _move_data(old, new)
            except Exception as e:
                return {"status": "error", "message": f"搬的时候出错了：{e}"}
        config = Path(os.environ["JM_CONFIG"])
        cfg = json.loads(config.read_text("utf-8-sig"))
        cfg["download_dir"] = str(new / "downloads")
        config.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), "utf-8")
        threading.Timer(1.2, _restart).start()   # 先让网页把「搬好了」显示出来
        return {"status": "ok", "path": str(new)}


# 数据文件夹里要搬的东西（config.json 不在这里，它固定在 %APPDATA%\JM下载器）
DATA_ITEMS = ["downloads", "covers", "thumbs", "backups", "groups.json", "blacklist.json", "favorites.json",
              "notes.json", "bookmarks.json", "ratings.json", "feed.json", "info_cache.json", "queue.json"]


def _move_data(old: Path, new: Path) -> None:
    new.mkdir(parents=True, exist_ok=True)
    for name in DATA_ITEMS:
        src = old / name
        if src.exists():
            shutil.move(str(src), str(new / name))   # 跨盘时是复制完再删


def _restart() -> None:
    """开一个新的自己（等这个退出后再启动），然后退出。"""
    args = [sys.executable] + ([] if getattr(sys, "frozen", False) else [str(Path(__file__).resolve())])
    subprocess.Popen(args + ["--after", str(os.getpid())], close_fds=True)
    os._exit(0)


def _window_geometry() -> dict:
    try:
        g = json.loads((DATA / "window.json").read_text("utf-8"))
        return {"width": max(420, int(g["width"])), "height": max(560, int(g["height"]))}
    except Exception:
        return {"width": 1200, "height": 820}


def main() -> None:
    _log_to_file()
    _wait_for_previous()
    if not _single_instance():
        return
    port = _prepare_env()

    sys.path.insert(0, str(BUNDLE))
    import server   # noqa: E402  环境变量设好之后才能 import，它一加载就读配置
    import webview  # noqa: E402

    def serve() -> None:
        threading.Thread(target=server.backfill_meta, daemon=True).start()
        threading.Thread(target=server.warm_feed, daemon=True).start()
        server.ThreadingHTTPServer(("127.0.0.1", port), server.Handler).serve_forever()

    threading.Thread(target=serve, daemon=True).start()

    api = DesktopApi()
    window = webview.create_window(
        APP_NAME, f"http://127.0.0.1:{port}/", js_api=api,
        min_size=(420, 560), background_color="#14141a", text_select=True, **_window_geometry())
    api._window = window   # 下划线开头：pywebview 不会去遍历它（否则会卡住）

    def on_closing():
        # 还有任务在下的话先问一句；关掉后下次打开可以在任务页继续
        busy = [t for t in list(server.TASKS.values()) if t.status in ("running", "queued")]
        if busy and not window.create_confirmation_dialog(
                "还有任务在下载", f"还有 {len(busy)} 个下载任务没完成，现在退出会中断，下次打开可以继续。确定退出吗？"):
            return False
        try:
            (DATA / "window.json").write_text(
                json.dumps({"width": window.width, "height": window.height}), "utf-8")
        except Exception:
            pass
        return True

    window.events.closing += on_closing
    # 关掉无痕模式并指定存储目录：localStorage（阅读进度、设置）才能留到下次
    try:
        webview.start(gui="edgechromium", private_mode=False, storage_path=str(DATA / "webview"))
    except Exception as e:
        # 极少数精简版 Windows 没有 WebView2 运行库
        print("窗口启动失败:", repr(e))
        ctypes.windll.user32.MessageBoxW(
            None, "打不开窗口：这台电脑缺少 Microsoft Edge WebView2 运行库。\n\n"
                  "点「确定」打开微软的下载页，装好后再打开 JM下载器。", APP_NAME, 0x30)
        os.startfile("https://developer.microsoft.com/microsoft-edge/webview2/")
    os._exit(0)   # 后台的下载线程、服务线程不用等，直接退


if __name__ == "__main__":
    main()
