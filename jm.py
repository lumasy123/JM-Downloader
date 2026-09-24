"""输入 JM 号下载漫画（基于 jmcomic_plugin_for_maibot 所用的 jmcomic 库，独立运行，无需 MaiBot/QQ）。

用法：
  python jm.py                 交互模式，反复输入 JM 号
  python jm.py 123456 234567   直接下载这些 JM 号
每个 JM 号下载整本（全部章节）图片，并额外合成一个 PDF。
"""
import logging
import re
import sys
from pathlib import Path

import jmcomic
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent / "downloads"
PROXY = ""        # 需要代理时填写，例如 "127.0.0.1:7890"；留空则用系统代理
MAKE_PDF = True   # 是否额外生成 PDF
PDF_MAX_SIDE = 1500  # PDF 中图片最长边（与插件一致，用于压缩体积）

OPTION_YAML = f"""
log: false
client:
  impl: api
  retry_times: 5
  postman:
    meta_data:
      proxies: {PROXY or 'system'}
download:
  cache: true
  image:
    decode: true
    suffix: .jpg
  threading:
    image: 20
dir_rule:
  base_dir: {BASE_DIR.as_posix()}
  rule: Bd_Aid_Pindex
"""

logging.getLogger("jmcomic").setLevel(logging.WARNING)
option = jmcomic.create_option_by_str(OPTION_YAML)


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(p))]


def make_pdf(album_dir: Path, title: str) -> Path | None:
    images = sorted(
        (p for p in album_dir.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}),
        key=lambda p: natural_key(p.relative_to(album_dir)),
    )
    if not images:
        return None
    safe_title = re.sub(r'[\\/:*?"<>|]', "_", title)[:80]
    pdf_path = album_dir.parent / f"{album_dir.name}_{safe_title}.pdf"

    def load(p: Path) -> Image.Image:
        im = Image.open(p).convert("RGB")
        im.thumbnail((PDF_MAX_SIDE, PDF_MAX_SIDE))
        return im

    first = load(images[0])
    first.save(pdf_path, save_all=True, quality=75,
               append_images=(load(p) for p in images[1:]))
    return pdf_path


def download(jm_id: str) -> None:
    jm_id = re.sub(r"\D", "", jm_id)
    if not jm_id:
        print("请输入数字 JM 号")
        return
    print(f"开始下载 JM{jm_id} ...")
    try:
        album, _ = jmcomic.download_album(jm_id, option)
    except Exception as e:
        print(f"下载失败：{e}")
        return
    album_dir = BASE_DIR / jm_id
    print(f"完成：《{album.name}》，共 {len(album)} 章 -> {album_dir}")
    if MAKE_PDF:
        try:
            pdf = make_pdf(album_dir, album.name)
            if pdf:
                print(f"PDF：{pdf}")
        except Exception as e:
            print(f"PDF 生成失败（图片已下载）：{e}")


def main() -> None:
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            download(arg)
        return
    print("输入 JM 号下载（可用空格分隔多个），直接回车退出。")
    while True:
        line = input("\nJM号> ").strip()
        if not line:
            break
        for jm_id in line.split():
            download(jm_id)


if __name__ == "__main__":
    main()
