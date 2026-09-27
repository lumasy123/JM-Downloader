"""打包 Windows 桌面端：PyInstaller 打成程序文件夹 → Inno Setup 做成安装包。

    python desktop/build.py            输出 dist/JM下载器-安装包-<版本>.exe
    python desktop/build.py --no-setup 只打程序文件夹（build/desktop/dist/JMDownloader），不做安装包

需要：pip install pyinstaller pywebview；Inno Setup 6（winget install JRSoftware.InnoSetup）。
打进去的只有程序：server.py、web/、desktop/app.py 和依赖库。个人数据（config.json、收藏、评分、
下载的书……）都不在里面——程序第一次运行时在 %APPDATA%\\JM下载器 里新建。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

VERSION = "1.1.0"

ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / "desktop"
BUILD = ROOT / "build" / "desktop"
APP_DIST = BUILD / "dist" / "JMDownloader"
OUT = ROOT / "dist"
ISCC_CANDIDATES = [
    Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
    Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
    Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
]

# web/ 里不该进安装包的东西（目前没有，留个口子）
WEB_EXCLUDE: set[str] = set()


def step(msg: str) -> None:
    print(f"\n>>> {msg}", flush=True)


def make_icon() -> Path:
    """用网页的 512 图标生成 Windows 需要的多尺寸 .ico。"""
    from PIL import Image
    ico = BUILD / "icon.ico"
    ico.parent.mkdir(parents=True, exist_ok=True)
    Image.open(ROOT / "web" / "icon-512.png").convert("RGBA").save(
        ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return ico


def stage_web() -> Path:
    """把 web/ 拷一份干净的出来打包（排除个人或临时文件）。"""
    dst = BUILD / "web"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(ROOT / "web", dst, ignore=lambda d, names: [n for n in names if n in WEB_EXCLUDE])
    return dst


def pyinstaller(ico: Path, web: Path) -> None:
    step("PyInstaller 打包程序")
    t = time.time()
    cmd = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed",
        "--name", "JMDownloader", "--icon", str(ico),
        "--distpath", str(BUILD / "dist"), "--workpath", str(BUILD / "work"), "--specpath", str(BUILD),
        "--paths", str(ROOT), "--hidden-import", "server", "--hidden-import", "jmlan",
        "--collect-submodules", "jmcomic", "--collect-data", "jmcomic",
        "--collect-all", "curl_cffi",
        "--add-data", f"{web}{os.pathsep}web",
        "--exclude-module", "tkinter",
        str(DESKTOP / "app.py"),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)
    size = sum(f.stat().st_size for f in APP_DIST.rglob("*") if f.is_file()) / 1024 / 1024
    print(f"  完成，用时 {time.time() - t:.0f}s，{size:.0f}MB：{APP_DIST}")


def check_no_personal_data() -> None:
    """保险：确认打包结果里没有个人数据文件。"""
    bad = {"config.json", "blacklist.json", "favorites.json", "ratings.json", "notes.json",
           "bookmarks.json", "groups.json", "feed.json", "info_cache.json", "queue.json"}
    found = [p for p in APP_DIST.rglob("*") if p.name in bad or p.name == "downloads"]
    if found:
        raise SystemExit(f"打包结果里混进了个人数据，停止：{found}")


def inno(ico: Path) -> Path:
    step("Inno Setup 做安装包")
    iscc = next((p for p in ISCC_CANDIDATES if p.exists()), None)
    if not iscc:
        raise SystemExit("没找到 Inno Setup 6，先运行：winget install JRSoftware.InnoSetup")
    shutil.copyfile(ico, DESKTOP / "icon.ico")   # .iss 里按相对路径找图标
    OUT.mkdir(exist_ok=True)
    try:
        subprocess.run([str(iscc), "/Q", f"/DAppVersion={VERSION}", f"/DDistDir={APP_DIST}",
                        f"/DOutDir={OUT}", str(DESKTOP / "installer.iss")], check=True)
    finally:
        (DESKTOP / "icon.ico").unlink(missing_ok=True)
    setup = OUT / f"JM下载器-安装包-{VERSION}.exe"
    print(f"  {setup}（{setup.stat().st_size / 1024 / 1024:.1f}MB）")
    return setup


def main() -> None:
    ico = make_icon()
    web = stage_web()
    pyinstaller(ico, web)
    check_no_personal_data()
    if "--no-setup" not in sys.argv:
        inno(ico)
    print("\n完成。")


if __name__ == "__main__":
    main()
