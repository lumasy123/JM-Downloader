"""一条命令完成打包部署。

  python deploy.py            同步代码 -> 构建 -> 装到 MuMu 并启动（日常迭代用）
  python deploy.py apk        同步代码 -> 构建 -> 输出 JM下载器.apk（要发布时用）
  python deploy.py both       两件事都做

改完 server.py 或 web/ 里的东西，跑一下就行，不用手动同步或改版本号。
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# 安卓外壳工程（Chaquopy + WebView）的源码在仓库的 android/ 里。
# Gradle 不支持含中文的工程路径（仓库在「JM漫画下载器」下），所以每次先镜像到纯英文的构建目录再编译
ANDROID_SRC = ROOT / "android"
ANDROID = Path(r"D:\androidbuild\jmapp")
APP_MAIN = ANDROID / "app" / "src" / "main"

GRADLE = Path(r"D:\androidbuild\gradle-8.7\bin\gradle.bat")
JAVA_HOME = Path(r"D:\androidbuild\jdkx\jdk-21.0.12.1")
SDK = Path(r"D:\androidbuild\sdk")
ADB = SDK / "platform-tools" / "adb.exe"

APK_OUT = ANDROID / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
APK_FINAL = ROOT / "JM下载器.apk"

PACKAGE = "com.jmshelf"
ACTIVITY = f"{PACKAGE}/.MainActivity"
# MuMu 常见的几个调试端口，挨个试
ADB_PORTS = (7555, 5555, 16384)


def step(msg: str) -> None:
    print(f"\n>>> {msg}")


def run(cmd: list, **kw) -> subprocess.CompletedProcess:
    return subprocess.run([str(c) for c in cmd], capture_output=True,
                          text=True, encoding="utf-8", errors="replace", **kw)


# ---------------------------------------------------------------- 同步
def sync() -> str:
    """把服务端和界面复制进安卓工程，顺便按内容算版本号。

    版本号直接用文件内容的哈希，改了就变、没改就不变，
    省得每次手动加一，也避免 WebView 拿旧缓存。
    """
    step("同步代码")
    mirror_android()
    py_dir = APP_MAIN / "python"
    py_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "server.py", py_dir / "server.py")
    shutil.copy2(ROOT / "jmlan.py", py_dir / "jmlan.py")
    (py_dir / "jmsync.py").unlink(missing_ok=True)   # 旧版的同步模块

    web_src = ROOT / "web"
    web_dst = APP_MAIN / "assets" / "web"
    if web_dst.exists():
        shutil.rmtree(web_dst)
    web_dst.mkdir(parents=True)

    digest = hashlib.md5()
    for name in ("app.js", "lists.js", "feed.js", "io.js", "style.css", "pet.js", "mask.js"):
        digest.update((web_src / name).read_bytes())
    version = digest.hexdigest()[:8]

    for f in sorted(web_src.iterdir()):
        if not f.is_file():
            continue
        target = web_dst / f.name
        if f.suffix in (".html", ".js"):
            text = f.read_text("utf-8")
            text = re.sub(r"\?v=[A-Za-z0-9]+", f"?v={version}", text)
            target.write_text(text, "utf-8")
        else:
            shutil.copy2(f, target)

    print(f"  server.py + web/（{len(list(web_dst.iterdir()))} 个文件），资源版本 {version}")
    return version


def mirror_android() -> None:
    """android/ → 构建目录：app/src 整个重建（删掉的资源也跟着删），Gradle 配置文件逐个覆盖。
    构建目录里的 build/、.gradle/ 缓存和 local.properties 保留，增量编译照样快。"""
    ANDROID.mkdir(parents=True, exist_ok=True)
    src_dir = ANDROID / "app" / "src"
    if src_dir.exists():
        shutil.rmtree(src_dir)
    shutil.copytree(ANDROID_SRC / "app" / "src", src_dir)
    for rel in ("build.gradle", "settings.gradle", "gradle.properties", "app/build.gradle"):
        shutil.copy2(ANDROID_SRC / rel, ANDROID / rel)
    if (ANDROID_SRC / "local.properties").exists():
        shutil.copy2(ANDROID_SRC / "local.properties", ANDROID / "local.properties")


# ---------------------------------------------------------------- 构建
def build() -> Path:
    step("构建 APK")
    env = dict(os.environ)
    env["JAVA_HOME"] = str(JAVA_HOME)
    env["ANDROID_HOME"] = str(SDK)
    env["PATH"] = f"{JAVA_HOME / 'bin'};{env.get('PATH', '')}"

    start = time.time()
    proc = subprocess.run(
        [str(GRADLE), "assembleRelease", "--no-daemon"],
        cwd=str(ANDROID), env=env, capture_output=True,
        text=True, encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0 or not APK_OUT.exists():
        print(proc.stdout[-3000:])
        print(proc.stderr[-2000:])
        sys.exit("构建失败")
    size = APK_OUT.stat().st_size / 1024 / 1024
    print(f"  完成，用时 {time.time() - start:.0f}s，{size:.1f}MB")
    return APK_OUT


# ---------------------------------------------------------------- 部署
def connect_device() -> str | None:
    for port in ADB_PORTS:
        run([ADB, "connect", f"127.0.0.1:{port}"])
    out = run([ADB, "devices"]).stdout
    for line in out.splitlines()[1:]:
        if line.strip().endswith("device"):
            return line.split()[0]
    return None


def install_to_mumu(apk: Path) -> None:
    step("安装到 MuMu")
    serial = connect_device()
    if not serial:
        sys.exit("连不上模拟器，请确认 MuMu 已启动且开了 ADB 调试")
    print(f"  设备 {serial}")

    # 绝不自动卸载：卸载会连带清空 Android/data 里的漫画、分组和黑名单。
    # 掉线之类的临时问题就重连再试；签名不一致只报错，让人自己决定。
    for attempt in range(3):
        res = run([ADB, "-s", serial, "install", "-r", str(apk)])
        out = res.stdout + res.stderr
        if "Success" in out:
            break
        if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in out or "signatures do not match" in out:
            sys.exit("签名和已安装的版本不一致，无法覆盖安装。\n"
                     "卸载旧版会清空书架上的所有漫画，请确认后手动卸载再重跑。")
        print(f"  安装失败（{out.strip().splitlines()[-1] if out.strip() else '无输出'}），重连后重试…")
        time.sleep(2)
        serial = connect_device() or serial
    else:
        sys.exit("安装失败，请检查 MuMu 是否正常运行")
    print("  安装成功")
    adb = [ADB, "-s", serial]

    run(adb + ["shell", "am", "force-stop", PACKAGE])
    run(adb + ["logcat", "-c"])
    run(adb + ["shell", "am", "start", "-n", ACTIVITY])
    print("  已启动，等待内置服务就绪…")

    for _ in range(40):
        time.sleep(1)
        alive = run(adb + ["shell", "pidof", PACKAGE]).stdout.strip()
        if not alive:
            continue
        # 8777 的十六进制是 2249，出现在 tcp 表里就说明服务在监听
        tcp = run(adb + ["shell", "cat", "/proc/net/tcp"]).stdout
        if ":2249" in tcp.upper():
            print("  服务已就绪")
            break
    else:
        crash = run(adb + ["logcat", "-d", "-v", "brief"]).stdout
        bad = [l for l in crash.splitlines()
               if any(k in l for k in ("FATAL", "PyException", "AndroidRuntime"))]
        print("  服务未就绪，日志片段：")
        print("\n".join(bad[-12:]) or "  （没抓到明显错误）")
        return

    run([ADB, "-s", serial, "forward", "tcp:8777", "tcp:8777"])
    print("  已把 8777 转发到电脑，可用 http://127.0.0.1:8777 调试")


def export_apk(apk: Path) -> None:
    step("导出 APK")
    shutil.copy2(apk, APK_FINAL)
    print(f"  {APK_FINAL}（{APK_FINAL.stat().st_size / 1024 / 1024:.1f}MB）")


def main() -> None:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "mumu").lower()
    if mode not in ("mumu", "apk", "both"):
        sys.exit(__doc__)

    sync()
    apk = build()
    if mode in ("mumu", "both"):
        install_to_mumu(apk)
    if mode in ("apk", "both"):
        export_apk(apk)
    print("\n完成。")


if __name__ == "__main__":
    main()
