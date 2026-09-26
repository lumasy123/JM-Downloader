"""JM 漫画本地书架服务器。

手机浏览器访问即可：输入 JM 号下载，下载后的漫画放在书架上离线看。
只依赖 jmcomic + Pillow，HTTP 部分用标准库，方便在 PC 或手机 Termux 里跑。

启动：python server.py
"""
from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import shutil
import socket
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import jmcomic

# 这几个路径在安卓 App 里由 Kotlin 通过环境变量指定，
# 在电脑上则都落在脚本所在目录，同一份代码两边通用。
ROOT = Path(__file__).resolve().parent
WEB_DIR = Path(os.environ.get("JM_WEB_DIR") or ROOT / "web")
CONFIG_PATH = Path(os.environ.get("JM_CONFIG") or ROOT / "config.json")

DEFAULT_CONFIG = {
    "port": 8080,
    "proxy": "",            # 例如 "127.0.0.1:7890"，留空用系统代理
    "download_dir": "downloads",
    "threads": 20,          # 单本内同时下载的图片数
    "concurrent": 2,        # 同时下载几本，多了会互相抢带宽
    "image_format": "webp", # 新下载的图片存成 webp（省空间）或 jpg（兼容性最好）
    "image_quality": 80,    # 需要重新编码时用的质量，50~95
}

# 设置页可以改的项和取值范围
SETTING_RULES = {
    "concurrent": (int, 1, 5),
    "threads": (int, 2, 32),
    "image_quality": (int, 50, 95),
    "image_format": (str, ("webp", "jpg")),
    "proxy": (str, None),
}

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
# 老版本 Python 的 mimetypes 不认识 .webp，不补上浏览器会当成二进制文件
mimetypes.add_type("image/webp", ".webp")


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text("utf-8")))
        except Exception as e:
            print(f"config.json 读取失败，使用默认配置：{e}")
    else:
        CONFIG_PATH.write_text(
            json.dumps(cfg, ensure_ascii=False, indent=2), "utf-8"
        )
    return cfg


CONFIG = load_config()
if os.environ.get("JM_PORT"):
    CONFIG["port"] = int(os.environ["JM_PORT"])

_dl = os.environ.get("JM_DOWNLOAD_DIR") or CONFIG["download_dir"]
DOWNLOAD_DIR = Path(_dl) if Path(_dl).is_absolute() else (ROOT / _dl)
DOWNLOAD_DIR = DOWNLOAD_DIR.resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 搜索结果的封面缓存。放在 downloads 外面，免得被当成一本漫画
COVER_DIR = DOWNLOAD_DIR.parent / "covers"
COVER_DIR.mkdir(parents=True, exist_ok=True)

# 书架分组。和漫画文件分开存，删漫画不影响分组表
GROUPS_PATH = DOWNLOAD_DIR.parent / "groups.json"

# 拉黑的漫画，搜索时过滤掉
BLACKLIST_PATH = DOWNLOAD_DIR.parent / "blacklist.json"

# 收藏的标签、作者（搜索时排前面、动态页追更新），以及书架上加了星的本子
FAVORITES_PATH = DOWNLOAD_DIR.parent / "favorites.json"

# 书架上每本的小笔记
NOTES_PATH = DOWNLOAD_DIR.parent / "notes.json"

# 阅读器里加的页面书签：{漫画id: [页码...]}
BOOKMARKS_PATH = DOWNLOAD_DIR.parent / "bookmarks.json"

# 评分：自定义的几条标准（画面、剧情……），每本按每条打 1~5 分，平均分用来排序、筛选
RATINGS_PATH = DOWNLOAD_DIR.parent / "ratings.json"
DEFAULT_CRITERIA = ["画面", "剧情", "实用性"]

# 「动态」页：收藏作者的新本、和收藏标签最搭的新本的缓存，以及已经提醒过的新本
FEED_PATH = DOWNLOAD_DIR.parent / "feed.json"

# 书架用的小缩略图。和封面缓存一样放在 downloads 外面
THUMB_DIR = DOWNLOAD_DIR.parent / "thumbs"
THUMB_DIR.mkdir(parents=True, exist_ok=True)
THUMB_WIDTH = 320

# 导出的备份文件
BACKUP_DIR = DOWNLOAD_DIR.parent / "backups"

# 搜索结果每页显示多少本（禁漫接口自己的分页大小不固定，这里重新切页）
PAGE_SIZE = 15

# curl_cffi 是原生库，安卓上装不了，那边用纯 Python 的 requests 顶上。
# commonX 的 RequestsPostman 会自动丢掉 impersonate 参数，可以直接替换。
try:
    import curl_cffi  # noqa: F401
    POSTMAN_TYPE = "curl_cffi"
except Exception:
    POSTMAN_TYPE = "requests"
if os.environ.get("JM_POSTMAN"):
    POSTMAN_TYPE = os.environ["JM_POSTMAN"]

MAX_CONCURRENT = max(1, int(CONFIG.get("concurrent", 2)))

logging.getLogger("jmcomic").setLevel(logging.WARNING)

OPTION = None


def default_suffix() -> str:
    return ".jpg" if CONFIG.get("image_format") == "jpg" else ".webp"


def make_option(suffix: str):
    """按当前配置生成 jmcomic 的 option。suffix 决定图片存成什么格式。"""
    return jmcomic.create_option_by_str(f"""
log: false
client:
  impl: api
  retry_times: 5
  postman:
    type: {POSTMAN_TYPE}
    meta_data:
      proxies: {CONFIG['proxy'] or 'system'}
download:
  cache: true
  image:
    decode: true
    suffix: {suffix}
  threading:
    image: {int(CONFIG['threads'])}
dir_rule:
  base_dir: {DOWNLOAD_DIR.as_posix()}
  rule: Bd_Aid_Pindex
""")


def build_option():
    """按当前配置重建默认 option（改设置后要调用）。"""
    global OPTION
    OPTION = make_option(default_suffix())
    return OPTION


build_option()


def install_save_hook() -> None:
    """jmcomic 需要重新编码的图片都经过 JmImageTool.save_image，在这里统一
    按设置的质量保存。不需要拼图还原的图 jmcomic 会直接写原始字节，不经过这里。
    """
    from jmcomic.jm_toolkit import JmImageTool
    original = JmImageTool.save_image.__func__

    def save_image(cls, image, filepath):
        quality = int(CONFIG.get("image_quality", 80))
        low = str(filepath).lower()
        if low.endswith(".webp"):
            try:
                import android_webp  # 安卓：Pillow 没有 WebP 编码器，用系统的
                if android_webp.encode_webp:
                    return android_webp.encode_webp(image, filepath, quality)
            except ImportError:
                pass
            return image.save(filepath, "WEBP", quality=quality, method=4)
        if low.endswith((".jpg", ".jpeg")):
            # PIL 默认质量是 75，比预期低，这里显式指定
            return image.convert("RGB").save(filepath, "JPEG", quality=quality)
        return original(cls, image, filepath)

    JmImageTool.save_image = classmethod(save_image)


install_save_hook()


def save_settings(changes: dict) -> dict:
    """校验并保存设置，立即生效。只写设置页管的那几项，其余保持原样。"""
    clean = {}
    for key, value in changes.items():
        rule = SETTING_RULES.get(key)
        if rule is None:
            continue
        kind, *limits = rule
        if kind is int:
            try:
                value = int(value)
            except (TypeError, ValueError):
                continue
            lo, hi = limits
            clean[key] = max(lo, min(hi, value))
        else:
            value = str(value or "").strip()
            allowed = limits[0]
            if allowed is None or value in allowed:
                clean[key] = value[:200]

    CONFIG.update(clean)
    try:
        on_disk = json.loads(CONFIG_PATH.read_text("utf-8")) if CONFIG_PATH.exists() else {}
    except Exception:
        on_disk = {}
    on_disk.update(clean)
    CONFIG_PATH.write_text(json.dumps(on_disk, ensure_ascii=False, indent=2), "utf-8")

    global MAX_CONCURRENT
    MAX_CONCURRENT = max(1, int(CONFIG.get("concurrent", 2)))
    build_option()
    with TASKS_LOCK:
        _pump()   # 并发数调大了，排队的可以马上开始
    return current_settings()


def current_settings() -> dict:
    return {key: CONFIG.get(key, DEFAULT_CONFIG.get(key)) for key in SETTING_RULES}


# --------------------------------------------------------------------------
# 书架
# --------------------------------------------------------------------------
def natural_key(text: str):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", text)]


def chapter_dirs(album_dir: Path) -> list[Path]:
    return sorted(
        (d for d in album_dir.iterdir() if d.is_dir()),
        key=lambda d: natural_key(d.name),
    )


def page_files(chapter_dir: Path) -> list[Path]:
    return sorted(
        (f for f in chapter_dir.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES),
        key=lambda f: natural_key(f.name),
    )


def read_meta(album_dir: Path) -> dict:
    meta_file = album_dir / "meta.json"
    if meta_file.exists():
        try:
            return json.loads(meta_file.read_text("utf-8"))
        except Exception:
            pass
    return {}


_GROUPS_LOCK = threading.Lock()


def load_groups() -> dict:
    """{"groups": [分组名...], "assign": {漫画id: 分组名}}"""
    if GROUPS_PATH.exists():
        try:
            data = json.loads(GROUPS_PATH.read_text("utf-8"))
            return {
                "groups": [str(g) for g in data.get("groups", [])],
                "assign": {str(k): str(v) for k, v in data.get("assign", {}).items()},
            }
        except Exception:
            pass
    return {"groups": [], "assign": {}}


def save_groups(data: dict) -> None:
    GROUPS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


_BLACKLIST_LOCK = threading.Lock()


def _clean_names(raw) -> list[str]:
    """标签 / 作者名单：去空、去首尾空格、按大小写不敏感去重，保持原顺序。"""
    out, seen = [], set()
    for x in raw or []:
        t = str(x).strip()[:60]
        if t and norm_tag(t) not in seen:
            seen.add(norm_tag(t))
            out.append(t)
    return out


def load_blacklist() -> dict:
    """{"items": [{"id", "name"}], "tags": [标签, ...], "authors": [作者, ...]}

    items 是单本拉黑（存名字是为了黑名单列表能显示标题），tags、authors 是按标签、作者拉黑。
    """
    if BLACKLIST_PATH.exists():
        try:
            data = json.loads(BLACKLIST_PATH.read_text("utf-8"))
            return {
                "items": [
                    {"id": str(x.get("id")), "name": str(x.get("name", ""))}
                    for x in data.get("items", []) if x.get("id")
                ],
                "tags": _clean_names(data.get("tags")),
                "authors": _clean_names(data.get("authors")),
            }
        except Exception:
            pass
    return {"items": [], "tags": [], "authors": []}


_FAVORITES_LOCK = threading.Lock()


def load_favorites() -> dict:
    """{"tags": [收藏的标签], "authors": [收藏的作者], "dislikes": [反感的标签]}

    反感不是拉黑：带反感标签的本子照样显示，只是排序时「收藏标签数 - 反感标签数」往后排。
    同一个标签只能在收藏、反感其中一边。
    """
    if FAVORITES_PATH.exists():
        try:
            data = json.loads(FAVORITES_PATH.read_text("utf-8"))
            return {
                "tags": _clean_names(data.get("tags")),
                "authors": _clean_names(data.get("authors")),
                "dislikes": _clean_names(data.get("dislikes")),
                "books": [str(x) for x in data.get("books", []) if str(x).isdigit()],
            }
        except Exception:
            pass
    return {"tags": [], "authors": [], "dislikes": [], "books": []}


def save_favorites(data: dict) -> None:
    FAVORITES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


_NOTES_LOCK = threading.Lock()


def load_notes() -> dict[str, str]:
    if NOTES_PATH.exists():
        try:
            data = json.loads(NOTES_PATH.read_text("utf-8"))
            return {str(k): str(v) for k, v in data.items() if str(k).isdigit() and str(v).strip()}
        except Exception:
            pass
    return {}


def save_notes(data: dict) -> None:
    NOTES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


_RATINGS_LOCK = threading.Lock()


def load_ratings() -> dict:
    """{"criteria": [标准...], "scores": {漫画id: {标准: 1~5}}}"""
    if RATINGS_PATH.exists():
        try:
            data = json.loads(RATINGS_PATH.read_text("utf-8"))
            criteria = [str(c).strip()[:12] for c in data.get("criteria", []) if str(c).strip()]
            scores = {
                str(k): {str(c): _half(n) for c, n in v.items() if _half(n)}
                for k, v in (data.get("scores") or {}).items() if str(k).isdigit() and isinstance(v, dict)
            }
            return {"criteria": criteria, "scores": scores}
        except Exception:
            pass
    return {"criteria": list(DEFAULT_CRITERIA), "scores": {}}


def _half(n) -> float | int | None:
    """分数只认 0.5~5、以半颗星为单位的；整数分存成整数。不合法的给 None。"""
    try:
        v = round(float(n) * 2) / 2
    except (TypeError, ValueError):
        return None
    if not 0.5 <= v <= 5:
        return None
    return int(v) if v == int(v) else v


def save_ratings(data: dict) -> None:
    RATINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


_BOOKMARKS_LOCK = threading.Lock()


def load_bookmarks() -> dict[str, list[int]]:
    if BOOKMARKS_PATH.exists():
        try:
            data = json.loads(BOOKMARKS_PATH.read_text("utf-8"))
            return {str(k): sorted({int(x) for x in v if int(x) >= 0})
                    for k, v in data.items() if str(k).isdigit() and isinstance(v, list) and v}
        except Exception:
            pass
    return {}


def save_bookmarks(data: dict) -> None:
    BOOKMARKS_PATH.write_text(json.dumps(data, ensure_ascii=False), "utf-8")


def rating_of(scores: dict, criteria: list[str]) -> float | None:
    """按现在的几条标准取平均；删掉的标准打过的分留着，但不算进平均。一条都没打就是 None。"""
    vals = [scores[c] for c in criteria if c in scores]
    return round(sum(vals) / len(vals), 2) if vals else None


def author_keys(author) -> set[str]:
    """作者字段里可能写着好几个人（「甲、乙」「甲 & 乙」），拆开来一个个比对。"""
    text = str(author or "")
    parts = re.split(r"[、,，/／&＆;；]+", text)
    return {norm_tag(x) for x in [text, *parts] if norm_tag(x)}


def change_names(which: str, kind: str, add, remove) -> list[str]:
    """黑名单 / 收藏 / 反感名单里的标签、作者，一次加减一批。

    一个标签只能在收藏、反感、拉黑其中一种里：加进一种时，从另外两种里拿走（前端会先问用户放哪种）。
    作者同理，收藏和拉黑只能二选一。返回被这样挪过来的名字。
    """
    adding = {norm_tag(x) for x in (add or [])}
    # 同一种名字（标签 / 作者）的所有名单：(文件, 字段)
    groups = {"tags": [("fav", "tags"), ("fav", "dislikes"), ("black", "tags")],
              "dislikes": [("fav", "tags"), ("fav", "dislikes"), ("black", "tags")],
              "authors": [("fav", "authors"), ("black", "authors")]}
    moved: list[str] = []
    with _BLACKLIST_LOCK, _FAVORITES_LOCK:
        files = {"black": load_blacklist(), "fav": load_favorites()}
        data = files[which]
        drop = {norm_tag(x) for x in (remove or [])}
        cur = [x for x in data[kind] if norm_tag(x) not in drop]
        # 新加的排在前面，名单里最近加的一眼能看到
        data[kind] = _clean_names([*(add or []), *cur])
        touched = {which}
        for f, field in groups[kind]:
            if (f, field) == (which, kind) or not adding:
                continue
            lst = files[f][field]
            hit = [x for x in lst if norm_tag(x) in adding]
            if hit:
                moved += hit
                files[f][field] = [x for x in lst if norm_tag(x) not in adding]
                touched.add(f)
        if "black" in touched:
            save_blacklist(files["black"])
        if "fav" in touched:
            save_favorites(files["fav"])
    return moved


def norm_tag(tag) -> str:
    return str(tag or "").strip().lower()


def blocked_tags() -> set[str]:
    return {norm_tag(t) for t in load_blacklist()["tags"]}


def save_blacklist(data: dict) -> None:
    BLACKLIST_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def blocked_ids() -> set[str]:
    return {x["id"] for x in load_blacklist()["items"]}


def blocked_authors() -> set[str]:
    return {norm_tag(a) for a in load_blacklist()["authors"]}


def write_meta(album_dir: Path, album, chapters: list, *,
               complete: bool, expected: int, added_at: float) -> None:
    """写 meta.json。先写临时文件再替换，进程中途被杀也不会留下写坏的文件
    （写坏的 meta 读出来是空的，会被当成"完整"，残缺的本子就混进书架了）。"""
    data = {
        "id": album_dir.name,
        "name": album.name,
        "author": str(getattr(album, "author", "") or ""),
        "tags": [str(t) for t in (getattr(album, "tags", None) or [])],
        "chapters": chapters,
        "expected_pages": expected,
        "complete": complete,
        "added_at": added_at,
    }
    tmp = album_dir / "meta.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    os.replace(tmp, album_dir / "meta.json")


def image_is_complete(f: Path) -> bool:
    """判断图片文件是不是完整写完了（下载被打断时可能只写了一半）。"""
    try:
        size = f.stat().st_size
        if size < 12:
            return False
        with f.open("rb") as fh:
            head = fh.read(12)
            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                # WebP 头里记着"文件总长 - 8"，实际不够长就是被截断了
                return int.from_bytes(head[4:8], "little") + 8 <= size
            if head[:2] == b"\xff\xd8":
                # 完整的 JPEG 以 FFD9 结尾；有的服务器会在后面补几个字节，所以看末尾 64 字节
                fh.seek(max(0, size - 64))
                return b"\xff\xd9" in fh.read()
        return True   # 其他格式没法便宜地判断，当它是好的
    except OSError:
        return False


def drop_broken_images(album_dir: Path) -> int:
    """删掉只写了一半的图，好让 jmcomic 把它们重新下一遍。"""
    removed = 0
    for f in album_dir.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES and not image_is_complete(f):
            f.unlink(missing_ok=True)
            removed += 1
    return removed


def existing_suffix(album_dir: Path) -> str | None:
    """已下了一部分的本子沿用原来的格式续传。

    否则设置里换了格式后续传，会同时出现 00001.jpg 和 00001.webp，页数翻倍。
    """
    if album_dir.is_dir():
        for ch in chapter_dirs(album_dir):
            pages = page_files(ch)
            if pages:
                return pages[0].suffix.lower()
    return None


def first_page(album_dir: Path) -> Path | None:
    for ch in chapter_dirs(album_dir):
        pages = page_files(ch)
        if pages:
            return pages[0]
    return None


def thumb_url(album_id: str, first: Path) -> str:
    # 用首页的修改时间当版本号：重新下载后地址会变，不会拿到旧的缓存图
    return f"/thumb/{album_id}?v={int(first.stat().st_mtime)}"


def album_summary(album_dir: Path) -> dict | None:
    chapters = chapter_dirs(album_dir)
    if not chapters:
        return None
    meta = read_meta(album_dir)
    total = 0
    first = None
    for ch in chapters:
        pages = page_files(ch)
        total += len(pages)
        if first is None and pages:
            first = pages[0]
    if first is None:
        return None
    return {
        "id": album_dir.name,
        "name": meta.get("name") or f"JM{album_dir.name}",
        "author": meta.get("author", ""),
        "tags": meta.get("tags", []),
        "chapters": len(chapters),
        "pages": total,
        # 旧版下载的 meta 没有这两个字段，按"完整"处理
        "complete": bool(meta.get("complete", True)),
        "expected": int(meta.get("expected_pages") or total),
        "cover": thumb_url(album_dir.name, first),
        "added_at": meta.get("added_at", album_dir.stat().st_mtime),
    }


def build_shelf() -> list[dict]:
    assign = load_groups()["assign"]
    ratings = load_ratings()
    notes = load_notes()
    items = []
    for d in DOWNLOAD_DIR.iterdir():
        if d.is_dir():
            item = album_summary(d)
            if item:
                item["group"] = assign.get(item["id"], "")
                item["scores"] = ratings["scores"].get(item["id"], {})
                item["rating"] = rating_of(item["scores"], ratings["criteria"])
                item["note"] = notes.get(item["id"], "")
                items.append(item)
    items.sort(key=lambda x: x["added_at"], reverse=True)
    return items


def album_detail(album_id: str) -> dict | None:
    album_dir = DOWNLOAD_DIR / album_id
    if not album_dir.is_dir():
        return None
    meta = read_meta(album_dir)
    names = {str(c.get("index")): c.get("name", "") for c in meta.get("chapters", [])}
    chapters = []
    for ch in chapter_dirs(album_dir):
        pages = page_files(ch)
        if not pages:
            continue
        chapters.append({
            "index": ch.name,
            "name": names.get(ch.name, "") or f"第 {ch.name} 话",
            "pages": [f"/img/{album_id}/{ch.name}/{p.name}" for p in pages],
        })
    if not chapters:
        return None
    total = sum(len(c["pages"]) for c in chapters)
    return {
        "id": album_id,
        "name": meta.get("name") or f"JM{album_id}",
        "author": meta.get("author", ""),
        "tags": meta.get("tags", []),
        "chapters": chapters,
        "complete": bool(meta.get("complete", True)),
        "expected": int(meta.get("expected_pages") or total),
        "thumb": thumb_url(album_id, first_page(album_dir)),
    }


# --------------------------------------------------------------------------
# 下载任务
# --------------------------------------------------------------------------
class Task:
    def __init__(self, album_id: str):
        self.id = album_id
        self.name = f"JM{album_id}"
        self.status = "queued"       # queued | running | done | error
        self.message = "排队中…"
        self.done = 0
        self.total = 0
        self.started_at = time.time()
        self.speed = 0.0      # 字节/秒，平滑过的
        self.rate = 0.0       # 页/秒，平滑过的，用来估剩余时间

    def as_dict(self) -> dict:
        eta = None
        if self.status == "running" and self.rate > 0 and self.total > self.done:
            eta = int((self.total - self.done) / self.rate)
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "done": self.done,
            "total": self.total,
            "started_at": self.started_at,
            "speed": int(self.speed),
            "eta": eta,
        }


TASKS: dict[str, Task] = {}
TASKS_LOCK = threading.Lock()

# 下载队列落盘：App 被杀或重启后，还能知道上次有哪些没下完
QUEUE_PATH = DOWNLOAD_DIR.parent / "queue.json"


def _load_pending() -> list[dict]:
    try:
        data = json.loads(QUEUE_PATH.read_text("utf-8"))
        return [{"id": str(x["id"]), "name": str(x.get("name", ""))}
                for x in data.get("items", []) if re.fullmatch(r"\d+", str(x.get("id", "")))]
    except Exception:
        return []


# 上次没下完、这次还没处理的（启动时读出来，由用户决定继续还是放弃）
PENDING: list[dict] = _load_pending()


def persist_queue() -> None:
    """把排队中 / 下载中的任务，连同还没处理的上次遗留一起写盘。调用方需持有 TASKS_LOCK。"""
    items = [{"id": t.id, "name": t.name} for t in TASKS.values()
             if t.status in ("queued", "running")]
    seen = {x["id"] for x in items}
    items += [x for x in PENDING if x["id"] not in seen]
    try:
        tmp = QUEUE_PATH.with_name(QUEUE_PATH.name + ".tmp")
        tmp.write_text(json.dumps({"items": items}, ensure_ascii=False), "utf-8")
        os.replace(tmp, QUEUE_PATH)
    except OSError:
        pass


def scan_album(album_dir: Path) -> tuple[int, int]:
    """一次遍历拿到已下的页数和总字节数。"""
    pages = size = 0
    if album_dir.is_dir():
        for f in album_dir.rglob("*"):
            try:
                if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES:
                    pages += 1
                    size += f.stat().st_size
            except OSError:
                pass
    return pages, size


def count_downloaded(album_dir: Path) -> int:
    if not album_dir.is_dir():
        return 0
    return sum(
        1
        for f in album_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in IMAGE_SUFFIXES
    )


def download_worker(album_id: str) -> None:
    task = TASKS[album_id]
    album_dir = DOWNLOAD_DIR / album_id
    stop_poll = threading.Event()

    def poll():
        # 每秒看一眼目录：已下页数 + 总字节数，由变化量算速度和剩余时间
        last_t = time.time()
        last_pages, last_bytes = scan_album(album_dir)
        while not stop_poll.wait(1.0):
            now = time.time()
            pages, size = scan_album(album_dir)
            task.done = pages
            dt = now - last_t
            if dt > 0:
                # 指数平滑，免得速度数字一跳一跳的
                task.speed = 0.3 * max(0, size - last_bytes) / dt + 0.7 * task.speed
                task.rate = 0.3 * max(0, pages - last_pages) / dt + 0.7 * task.rate
            last_t, last_pages, last_bytes = now, pages, size

    try:
        client = OPTION.new_jm_client()
        album = client.get_album_detail(album_id)
        task.name = album.name
        task.message = "正在统计页数…"

        chapters = []
        total = 0
        for photo in album:
            detail = client.get_photo_detail(photo.photo_id, False)
            pages = len(detail)
            total += pages
            chapters.append({
                "index": str(detail.index),
                "photo_id": str(detail.photo_id),
                "name": detail.name,
                "pages": pages,
            })
        task.total = total
        task.message = "正在下载…"

        # 先落一份"未完成"的元数据：之后不管是断网、失败还是 App 被杀，
        # 书架都能认出这本是残缺的，而不是把它当成一本完整的漫画
        album_dir.mkdir(parents=True, exist_ok=True)
        added_at = read_meta(album_dir).get("added_at") or time.time()
        write_meta(album_dir, album, chapters,
                   complete=False, expected=total, added_at=added_at)
        # 上次被打断时正在写的图可能只有半张，删掉让它重下；
        # 完整的图 jmcomic 的缓存会跳过，所以这就是断点续传
        drop_broken_images(album_dir)

        suffix = existing_suffix(album_dir) or default_suffix()
        option = OPTION if suffix == default_suffix() else make_option(suffix)

        threading.Thread(target=poll, daemon=True).start()
        jmcomic.download_album(album_id, option)
        stop_poll.set()

        task.done = count_downloaded(album_dir)
        if task.done < total:
            raise RuntimeError(f"只下到了 {task.done}/{total} 页")
        write_meta(album_dir, album, chapters,
                   complete=True, expected=total, added_at=added_at)
        task.status = "done"
        task.message = f"完成，共 {task.done} 页"
    except Exception as e:
        stop_poll.set()
        task.status = "error"
        task.message = str(e) or e.__class__.__name__
    finally:
        # 这本结束了，把队列里的下一本顶上来
        with TASKS_LOCK:
            _pump()
            persist_queue()


QUEUE: list[str] = []


def _pump() -> None:
    """有空位就从队列里取下一本开下。调用方需持有 TASKS_LOCK。"""
    running = sum(1 for t in TASKS.values() if t.status == "running")
    while QUEUE and running < MAX_CONCURRENT:
        album_id = QUEUE.pop(0)
        task = TASKS.get(album_id)
        if task is None or task.status != "queued":
            continue
        task.status = "running"
        task.message = "正在获取漫画信息…"
        running += 1
        threading.Thread(target=download_worker, args=(album_id,),
                         daemon=True).start()


def start_download(album_id: str) -> dict:
    with TASKS_LOCK:
        existing = TASKS.get(album_id)
        if existing and existing.status in ("running", "queued"):
            return existing.as_dict()
        task = Task(album_id)
        TASKS[album_id] = task
        QUEUE.append(album_id)
        # 重新开始下了，就不再算"上次遗留"
        PENDING[:] = [x for x in PENDING if x["id"] != album_id]
        _pump()
        persist_queue()
        return task.as_dict()


def cancel_download(album_id: str) -> dict:
    """只能取消还在排队的。已经在下的没法干净地中断 jmcomic，不做假承诺。"""
    with TASKS_LOCK:
        task = TASKS.get(album_id)
        if task is None:
            return {"error": "没有这个任务"}
        if task.status != "queued":
            return {"error": "已经在下载了，取消不了"}
        if album_id in QUEUE:
            QUEUE.remove(album_id)
        TASKS.pop(album_id, None)
        persist_queue()
        return {"ok": True}


def pending_items() -> list[dict]:
    """上次遗留里，现在确实还没下完的（期间可能已经在别处下完了）。"""
    done = {b["id"] for b in build_shelf() if b["complete"]}
    return [x for x in PENDING if x["id"] not in done]


# --------------------------------------------------------------------------
# 搜索 / 封面
# --------------------------------------------------------------------------
# 和禁漫站内一致的几种搜法
SEARCH_KINDS = {
    "site": "search_site",      # 综合
    "work": "search_work",      # 标题
    "author": "search_author",  # 作者
    "tag": "search_tag",        # 标签
}


def cover_file(album_id: str) -> Path:
    return COVER_DIR / f"{album_id}.jpg"


def fetch_cover(album_id: str) -> Path | None:
    """取封面，下过一次就存着，之后离线也能看到。"""
    path = cover_file(album_id)
    if path.exists() and path.stat().st_size > 0:
        return path
    try:
        OPTION.new_jm_client().download_album_cover(album_id, str(path))
    except Exception:
        path.unlink(missing_ok=True)
        return None
    return path if path.exists() and path.stat().st_size > 0 else None


# 单本详情（标签、作者、章节数）的缓存。存到磁盘上：安卓版每次打开 App 都会重启内置服务，
# 只放内存的话，拉黑过滤、收藏排序、动态页每次都得从头逐本查标签
INFO_CACHE_PATH = DOWNLOAD_DIR.parent / "info_cache.json"
INFO_TTL = 30 * 86400      # 标签很少改，一个月内不重查
INFO_MAX = 8000            # 最多记这么多本，多了扔掉最早查的
_INFO_LOCK = threading.Lock()
_INFO_SAVE_TIMER: threading.Timer | None = None


def _load_info_cache() -> dict[str, dict]:
    try:
        data = json.loads(INFO_CACHE_PATH.read_text("utf-8"))
        now = time.time()
        return {k: v for k, v in data.items() if now - v.get("_t", 0) < INFO_TTL}
    except Exception:
        return {}


_INFO_CACHE: dict[str, dict] = _load_info_cache()


def _save_info_cache() -> None:
    global _INFO_SAVE_TIMER
    with _INFO_LOCK:
        _INFO_SAVE_TIMER = None
        items = sorted(_INFO_CACHE.items(), key=lambda kv: kv[1].get("_t", 0))[-INFO_MAX:]
        _INFO_CACHE.clear()
        _INFO_CACHE.update(items)
        text = json.dumps(_INFO_CACHE, ensure_ascii=False)
    tmp = INFO_CACHE_PATH.with_name(INFO_CACHE_PATH.name + ".tmp")
    tmp.write_text(text, "utf-8")
    os.replace(tmp, INFO_CACHE_PATH)


def _save_info_cache_later() -> None:
    """攒几秒再一起写盘，一页几十本查完只写一次。调用时要持有 _INFO_LOCK。"""
    global _INFO_SAVE_TIMER
    if _INFO_SAVE_TIMER is None:
        _INFO_SAVE_TIMER = threading.Timer(5, _save_info_cache)
        _INFO_SAVE_TIMER.daemon = True
        _INFO_SAVE_TIMER.start()


def album_info(album_id: str, fresh: bool = False) -> dict:
    """单本的标签、作者、章节数。

    搜索接口不返回标签，得逐本查详情。按标签搜一页能有八十条，
    一次性全查会让搜索卡好几秒，所以改成前端按需来问、这里加缓存。
    fresh=True 时跳过缓存重查（追连载更新要看最新的章节数）。
    """
    if not fresh:
        with _INFO_LOCK:
            hit = _INFO_CACHE.get(album_id)
        if hit is not None:
            return hit

    try:
        album = OPTION.new_jm_client().get_album_detail(album_id)
        info = {
            "id": album_id,
            "name": album.name,
            "author": str(getattr(album, "author", "")),
            # 不截断：标签拉黑要拿全部标签来比对，界面显示时再截
            "tags": [str(t) for t in (getattr(album, "tags", None) or [])],
            "episodes": max(1, len(getattr(album, "episode_list", None) or [])),
            "_t": time.time(),
        }
    except Exception as e:
        return {"id": album_id, "error": str(e), "tags": []}

    with _INFO_LOCK:
        _INFO_CACHE[album_id] = info
        _save_info_cache_later()
    return info


def album_infos(ids: list[str]) -> dict[str, dict]:
    """一批本子的详情，并发查（有缓存的直接给）。"""
    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(zip(ids, pool.map(album_info, ids)))


def _parse_results(result) -> list[dict]:
    items = []
    for entry in result.content:
        # content 的元素是 (album_id, 详情字典)
        if isinstance(entry, (tuple, list)) and len(entry) == 2:
            album_id, info = entry
        else:
            album_id, info = entry, {}
        info = info if isinstance(info, dict) else {}
        category = info.get("category") or {}
        items.append({
            "id": str(album_id),
            "name": str(info.get("name") or ""),
            "author": str(info.get("author") or ""),
            "category": str(category.get("title") or ""),
            "tags": [],
            "cover": f"/cover/{album_id}",
            # 最后更新时间（秒），动态页按它排、只留一个月内的
            "updated": int(info.get("update_at") or 0),
        })
    return items


# 禁漫每页给多少条不固定（综合搜是 10、标签搜是 80），
# 所以先攒到这里，再按 PAGE_SIZE 切成我们自己的页。
_SEARCH_CACHE: dict[tuple, dict] = {}
_SEARCH_LOCK = threading.Lock()


def _fill_tags(items: list[dict]) -> None:
    """并发查一批本子的标签（album_info 有缓存，查过的不会再请求）。"""
    with ThreadPoolExecutor(max_workers=8) as pool:
        for it, info in zip(items, pool.map(lambda x: album_info(x["id"]), items)):
            # 查不到的当作没有标签，免得一本查不到就卡住整页
            it["tags"] = list(info.get("tags") or [])
            it["tags_checked"] = True


def build_query(keyword: str, mode: str) -> str:
    """空格隔开的多个关键字按模式拼成禁漫的搜索语法。

    禁漫站内搜索：「+甲 +乙」是同时包含，「甲 乙」是包含其一，「-甲」是排除。
    自己写了 + / - 的词原样保留，其余的词按模式处理。
    """
    words = keyword.split()
    if len(words) < 2:
        return keyword
    return " ".join(w if w[0] in "+-" or mode == "or" else "+" + w for w in words)


# 「收藏排序：多取几页」时，前 POOL_PAGES 页的结果先合在一起按收藏排好再分页
POOL_PAGES = 5


def search_albums(keyword: str, kind: str, page: int, show_blocked: bool = False,
                  mode: str = "and", fav: str = "page") -> dict:
    """第 page 页固定对应搜索结果里的第 (page-1)*15+1 ~ page*15 条。

    这样可以直接跳到任意页（只取那几条所在的禁漫分页），总页数也是准的。
    代价是拉黑的会从本页里去掉、不从下一页补，所以有拉黑时一页可能不足 15 本。
    """
    kind = kind if kind in SEARCH_KINDS else "site"
    keyword = build_query(keyword, mode)
    key = (kind, keyword)

    with _SEARCH_LOCK:
        state = _SEARCH_CACHE.get(key)
        # 回到第一页就重新搜一次，保证结果是新的
        if state is None or page == 1:
            state = {"jm": {}, "size": 0, "total": 0}
            _SEARCH_CACHE[key] = state
            if len(_SEARCH_CACHE) > 8:
                _SEARCH_CACHE.pop(next(iter(_SEARCH_CACHE)))

    client = OPTION.new_jm_client()
    method = getattr(client, SEARCH_KINDS[kind])

    def jm_page(n: int) -> list[dict]:
        """禁漫的第 n 页，拿过的缓存起来。"""
        if n not in state["jm"]:
            result = method(search_query=keyword, page=n)
            state["jm"][n] = _parse_results(result)
            state["total"] = getattr(result, "total", 0) or state["total"]
            if n == 1:
                # 禁漫每页多少条不固定（综合搜是 10、标签搜是 80），以第一页为准
                state["size"] = len(state["jm"][n]) or PAGE_SIZE
        return state["jm"][n]

    first = jm_page(1)
    size = state["size"] or PAGE_SIZE
    total = state["total"] or len(first)
    pages = max(1, -(-total // PAGE_SIZE))

    # 本页对应的原始位置 [start, end)，换算成要取禁漫的哪几页。
    # 收藏排序选了「多取几页」的话，前几页一律取整个池子，排好序再切出本页
    pooled = fav == "pool" and page <= POOL_PAGES
    start = 0 if pooled else (page - 1) * PAGE_SIZE
    end = min(POOL_PAGES * PAGE_SIZE if pooled else start + PAGE_SIZE, total)
    window: list[dict] = []
    if end > start:
        for n in range(start // size + 1, (end - 1) // size + 2):
            base = (n - 1) * size
            window += [it for k, it in enumerate(jm_page(n)) if start <= base + k < end]

    blocked = blocked_ids()
    bad_tags = blocked_tags()
    bad_authors = blocked_authors()
    favorites = load_favorites()
    fav_tags = {norm_tag(t) for t in favorites["tags"]}
    dis_tags = {norm_tag(t) for t in favorites["dislikes"]}
    fav_authors = {norm_tag(a) for a in favorites["authors"]}

    def hit_tags(it: dict) -> list[str]:
        return [t for t in it.get("tags") or [] if norm_tag(t) in bad_tags]

    def author_bad(it: dict) -> bool:
        return bool(author_keys(it.get("author")) & bad_authors)

    if show_blocked:
        # 显示已拉黑的：照常返回、标出原因。标签只用已缓存的（不为了标记去联网），
        # 没缓存的由前端等卡片的标签加载出来再标
        for it in window:
            if not it.get("tags_checked"):
                with _INFO_LOCK:
                    cached = _INFO_CACHE.get(it["id"])
                if cached:
                    it["tags"] = list(cached.get("tags") or [])
        shown = [dict(it, blocked=it["id"] in blocked, blocked_tags=hit_tags(it),
                      blocked_author=author_bad(it))
                 for it in window]
    else:
        shown = [it for it in window if it["id"] not in blocked and not author_bad(it)]
        if bad_tags:
            # 搜索接口不返回标签，只好把本页这几本的标签查一下（有缓存）
            _fill_tags([it for it in shown if not it.get("tags_checked")])
            shown = [it for it in shown if not hit_tags(it)]
    hidden = len(window) - len(shown) if not show_blocked else 0

    # 按喜好排序：「命中的收藏标签数 - 反感标签数」越大越前，一样的有收藏作者的更前，再按原来的顺序
    if fav_tags or dis_tags:
        _fill_tags([it for it in shown if not it.get("tags_checked")])
    for it in shown:
        it["fav_tags"] = [t for t in it.get("tags") or [] if norm_tag(t) in fav_tags]
        it["dis_tags"] = [t for t in it.get("tags") or [] if norm_tag(t) in dis_tags]
        it["fav_author"] = bool(author_keys(it.get("author")) & fav_authors)
    if fav_tags or dis_tags or fav_authors:
        shown.sort(key=lambda it: (-(len(it["fav_tags"]) - len(it["dis_tags"])), -it["fav_author"]))  # 稳定排序
    if pooled:
        shown = shown[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
        hidden = 0
    return {
        "items": shown,
        "total": total,
        "page": page,
        "pages": pages,
        "page_size": PAGE_SIZE,
        "has_more": page < pages,
        # 本页原本有多少条、被拉黑滤掉了几条，界面上说明为什么这页不足 15 本
        "hidden": hidden,
    }


# --------------------------------------------------------------------------
# 动态：收藏作者的新本、和收藏标签最搭的新本
# --------------------------------------------------------------------------
FEED_TTL = 3600            # 结果缓存一小时，下拉 / 点刷新才强制重查
FEED_DAYS = 30
FEED_MAX_AUTHORS = 30      # 收藏太多时只查前面这些，免得一次发几十个请求
FEED_MAX_TAGS = 10
FEED_TAG_CANDIDATES = 40   # 标签那部分最多查这么多本的标签来算重合度
_FEED_LOCK = threading.Lock()


def load_feed() -> dict:
    if FEED_PATH.exists():
        try:
            return json.loads(FEED_PATH.read_text("utf-8"))
        except Exception:
            pass
    return {}


def save_feed(data: dict) -> None:
    FEED_PATH.write_text(json.dumps(data, ensure_ascii=False), "utf-8")


def _latest(method, query: str) -> list[dict]:
    """某个作者 / 标签一个月内的最新一页。查不到就当没有，不影响别的。"""
    try:
        result = method(search_query=query, page=1,
                        order_by=jmcomic.JmMagicConstants.ORDER_BY_LATEST,
                        time=jmcomic.JmMagicConstants.TIME_MONTH)
        return _parse_results(result)
    except Exception:
        return []


FEED_CHECK_BATCH = 25      # 追连载：每次最多查这么多本书架上的书
FEED_CHECK_EVERY = 86400   # 一本书一天最多查一次章节数


def _feed_keep(fav=None):
    """动态里要去掉的：拉黑的、点过「不感兴趣」的、一个月以前的。"""
    since = time.time() - FEED_DAYS * 86400
    blocked = blocked_ids()
    bad_tags = blocked_tags()
    bad_authors = blocked_authors()
    dismissed = set(load_feed().get("dismissed", []))

    def keep(it: dict) -> bool:
        if it["id"] in blocked or it["id"] in dismissed or author_keys(it.get("author")) & bad_authors:
            return False
        if it.get("tags_checked") and any(norm_tag(t) in bad_tags for t in it["tags"]):
            return False
        # 没有时间的（接口偶尔不给）也留着，交给禁漫的「一个月内」筛选
        return not it.get("updated") or it["updated"] >= since
    return keep


def _feed_authors(fav: dict) -> list[dict]:
    """收藏作者一个月内的新本，按更新时间从新到旧。"""
    client = OPTION.new_jm_client()
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(lambda a: _latest(client.search_author, a), fav["authors"][:FEED_MAX_AUTHORS]))
    by_id: dict[str, dict] = {}
    for items in pages:
        for it in items:
            by_id.setdefault(it["id"], it)
    items = list(by_id.values())
    if blocked_tags():
        _fill_tags(items)
    keep = _feed_keep()
    return sorted([it for it in items if keep(it)], key=lambda it: -it["updated"])


def _feed_tags(fav: dict, exclude: set[str]) -> list[dict]:
    """收藏标签一个月内的新本，按和收藏标签的重合个数排。"""
    fav_tags = {norm_tag(t) for t in fav["tags"]}
    dis_tags = {norm_tag(t) for t in fav["dislikes"]}
    if not fav_tags:
        return []
    client = OPTION.new_jm_client()
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(lambda t: _latest(client.search_tag, t), fav["tags"][:FEED_MAX_TAGS]))
    cand: dict[str, dict] = {}
    for items in pages:
        for it in items:
            if it["id"] not in exclude:
                cand.setdefault(it["id"], it)
    pool_items = sorted(cand.values(), key=lambda it: -it["updated"])[:FEED_TAG_CANDIDATES]
    _fill_tags(pool_items)
    for it in pool_items:
        it["fav_tags"] = [t for t in it["tags"] if norm_tag(t) in fav_tags]
        it["dis_tags"] = [t for t in it["tags"] if norm_tag(t) in dis_tags]
        it["score"] = len(it["fav_tags"]) - len(it["dis_tags"])
    keep = _feed_keep()
    return sorted([it for it in pool_items if it["score"] > 0 and keep(it)],
                  key=lambda it: (-it["score"], -it["updated"]))


def _feed_updates() -> list[dict]:
    """书架上的连载出了新章节：禁漫上的章节数比本地多的。每次轮着查一批，一本一天最多查一次。"""
    shelf = {b["id"]: b for b in build_shelf()}
    with _FEED_LOCK:
        chk = load_feed().get("chk", {})
    now = time.time()
    due = sorted((i for i in shelf if now - chk.get(i, {}).get("t", 0) > FEED_CHECK_EVERY),
                 key=lambda i: chk.get(i, {}).get("t", 0))[:FEED_CHECK_BATCH]
    if due:
        with ThreadPoolExecutor(max_workers=4) as pool:
            infos = list(pool.map(lambda i: album_info(i, fresh=True), due))
        for i, info in zip(due, infos):
            if not info.get("error"):
                chk[i] = {"t": now, "remote": int(info.get("episodes") or 1)}
        with _FEED_LOCK:
            data = load_feed()
            data["chk"] = {k: v for k, v in {**data.get("chk", {}), **chk}.items() if k in shelf}
            save_feed(data)
    out = []
    for i, b in shelf.items():
        remote = chk.get(i, {}).get("remote", 0)
        if remote > b["chapters"]:
            out.append({"id": i, "name": b["name"], "author": b["author"], "tags": b["tags"],
                        "tags_checked": True, "cover": f"/cover/{i}", "category": "",
                        "local": b["chapters"], "remote": remote,
                        "updated": int(chk[i]["t"]), "key": f"u:{i}:{remote}"})
    return sorted(out, key=lambda it: -it["updated"])


FEED_PARTS = ("updates", "authors", "tags")


def build_feed_part(part: str, force: bool = False) -> dict:
    """动态页的一块：updates 书架连载更新 / authors 收藏作者新本 / tags 和收藏标签最搭的新本。

    各块分开缓存、分开请求：前端先拿到快的那块就先显示，不用等最慢的标签那块。
    """
    fav = load_favorites()
    sig = json.dumps([part, fav["authors"][:FEED_MAX_AUTHORS], fav["tags"][:FEED_MAX_TAGS]],
                     ensure_ascii=False) if part != "updates" else "updates"
    with _FEED_LOCK:
        cache = load_feed()
        cached = cache.get("parts", {}).get(part)
        seen = set(cache.get("seen", []))
    fresh = cached and time.time() - cached.get("built_at", 0) < FEED_TTL and cached.get("sig") == sig
    if not fresh or force:
        if part == "authors":
            items = _feed_authors(fav)
        elif part == "tags":
            with _FEED_LOCK:
                exclude = {x["id"] for x in load_feed().get("parts", {}).get("authors", {}).get("items", [])}
            items = _feed_tags(fav, exclude)
        else:
            items = _feed_updates()
        cached = {"built_at": time.time(), "sig": sig, "items": items}
        with _FEED_LOCK:
            data = load_feed()
            data.setdefault("parts", {})[part] = cached
            save_feed(data)
    # 缓存里的也按现在的黑名单、「不感兴趣」再筛一遍（拉黑是随时发生的）
    keep = _feed_keep()
    items = [it for it in cached["items"] if part == "updates" or keep(it)]
    new = [] if part == "tags" else [it.get("key", it["id"]) for it in items
                                     if it.get("key", it["id"]) not in seen]
    return {"part": part, "built_at": cached["built_at"], "items": items, "new": new}


def warm_feed() -> None:
    """服务刚启动时在后台先把动态算好：打开「动态」页就不用等。"""
    time.sleep(10)
    for part in ("updates", "authors"):
        try:
            if part == "authors" and not load_favorites()["authors"]:
                continue
            build_feed_part(part)
        except Exception:
            pass


EXPLORE_SIZE = 15
EXPLORE_TAGS_PER_ROUND = 4     # 每次随机挑这么多个收藏标签去搜，请求别太多
EXPLORE_CANDIDATES = 40        # 最多查这么多本的标签来算和收藏标签的重合


EXPLORE_MODES = ("tags", "authors", "hot")


def _split_authors(author) -> list[str]:
    """「甲、乙」拆成能拿去搜的名字（保留原来的大小写）。"""
    return [x.strip() for x in re.split(r"[、,，/／&＆;；]+", str(author or "")) if x.strip()]


def _explore_sources(mode: str, fav: dict, client, rnd) -> tuple[list[str], list[list[dict]]]:
    """按探索方式去禁漫取几页候选，返回（用了哪些来源，每个来源的结果）。"""
    c = jmcomic.JmMagicConstants
    orders = [c.ORDER_BY_LATEST, c.ORDER_BY_VIEW, c.ORDER_BY_LIKE, c.ORDER_BY_SCORE]

    def search(fn, query):
        def one():
            try:
                items = _parse_results(fn(search_query=query, page=rnd.randint(1, 3),
                                          order_by=rnd.choice(orders), time=c.TIME_ALL))
                if not items:   # 冷门的翻到后面就空了，退回第一页
                    items = _parse_results(fn(search_query=query, page=1,
                                              order_by=rnd.choice(orders), time=c.TIME_ALL))
                return items
            except Exception:
                return []
        return one

    if mode == "tags":
        picked = rnd.sample(fav["tags"], min(EXPLORE_TAGS_PER_ROUND, len(fav["tags"])))
        jobs = [search(client.search_tag, t) for t in picked]
    elif mode == "authors":
        # 收藏的作者 + 书架上的作者（打过 4 分以上的优先），各挑两位去搜他们的其他作品
        bad = blocked_authors()
        fav_names = [a for a in fav["authors"] if norm_tag(a) not in bad]
        ratings = load_ratings()
        liked, others = [], []
        for d in DOWNLOAD_DIR.iterdir() if DOWNLOAD_DIR.is_dir() else []:
            if not d.is_dir():
                continue
            r = rating_of(ratings["scores"].get(d.name, {}), ratings["criteria"])
            for a in _split_authors(read_meta(d).get("author")):
                if norm_tag(a) in bad or norm_tag(a) in {norm_tag(x) for x in fav_names}:
                    continue
                (liked if r is not None and r >= 4 else others).append(a)
        shelf_names = list(dict.fromkeys(liked)) or list(dict.fromkeys(others))
        picked = rnd.sample(fav_names, min(2, len(fav_names)))
        picked += rnd.sample(shelf_names, min(EXPLORE_TAGS_PER_ROUND - len(picked), len(shelf_names)))
        jobs = [search(client.search_author, a) for a in picked]
    else:
        # 近期热门：周榜、月榜各随机翻一页
        page_w, page_m = rnd.randint(1, 3), rnd.randint(1, 3)
        picked = [f"周榜第 {page_w} 页", f"月榜第 {page_m} 页"]

        def rank(fn, page):
            def one():
                try:
                    return _parse_results(fn(page))
                except Exception:
                    return []
            return one
        jobs = [rank(client.week_ranking, page_w), rank(client.month_ranking, page_m)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(lambda f: f(), jobs))
    return picked, pages


def explore(exclude: set[str], mode: str = "tags") -> dict:
    """探索，三种方式：
    - tags：从收藏标签里随机挑几个、随机换排序和页码去搜，只要和收藏标签有重合的；
    - authors：搜收藏的作者、书架上高分作者的其他作品；
    - hot：周榜、月榜。
    都按「收藏标签数 - 反感标签数」排，挑 15 本还没下载过的。exclude 是这一轮已经给过的，换一批时不重复。"""
    import random
    fav = load_favorites()
    fav_tags = {norm_tag(t) for t in fav["tags"]}
    dis_tags = {norm_tag(t) for t in fav["dislikes"]}
    if mode == "tags" and not fav_tags:
        return {"items": [], "error": "还没有收藏标签"}
    client = OPTION.new_jm_client()
    picked, pages = _explore_sources(mode, fav, client, random)
    if not picked:
        return {"items": [], "error": "还没有收藏的作者，书架上也没有作者信息"}
    blocked = blocked_ids()
    bad_authors = blocked_authors()
    cand: dict[str, dict] = {}
    for items in pages:
        for it in items:
            i = it["id"]
            if (i in exclude or i in blocked or (DOWNLOAD_DIR / i).is_dir()
                    or author_keys(it.get("author")) & bad_authors):
                continue
            cand.setdefault(i, it)
    pool_items = random.sample(list(cand.values()), min(EXPLORE_CANDIDATES, len(cand)))
    _fill_tags(pool_items)
    bad_tags = blocked_tags()
    scored = []
    for it in pool_items:
        if any(norm_tag(t) in bad_tags for t in it["tags"]):
            continue
        it["fav_tags"] = [t for t in it["tags"] if norm_tag(t) in fav_tags]
        it["dis_tags"] = [t for t in it["tags"] if norm_tag(t) in dis_tags]
        score = len(it["fav_tags"]) - len(it["dis_tags"])
        # 按标签探索只要和收藏有重合的；另外两种只去掉反感比收藏多的
        if score > 0 or (mode != "tags" and score >= 0):
            scored.append((score, random.random(), it))
    scored.sort(key=lambda x: (-x[0], x[1]))   # 得分高的在前，一样的随机
    return {"items": [it for _, _, it in scored[:EXPLORE_SIZE]], "tags": picked, "mode": mode}


def mark_feed_seen(ids: list[str]) -> None:
    with _FEED_LOCK:
        data = load_feed()
        seen = data.get("seen", [])
        seen = [*seen, *[i for i in ids if i not in seen]][-3000:]   # 只记最近这些，文件别越长越大
        data["seen"] = seen
        save_feed(data)


def dismiss_feed(album_id: str) -> None:
    """「不感兴趣」：这本以后不在动态里出现。"""
    with _FEED_LOCK:
        data = load_feed()
        dismissed = data.get("dismissed", [])
        if album_id not in dismissed:
            dismissed.append(album_id)
        data["dismissed"] = dismissed[-3000:]
        save_feed(data)


# --------------------------------------------------------------------------
# 缩略图 / 存储 / 备份
# --------------------------------------------------------------------------
# 一次打开书架可能同时要几十张缩略图，限制并发生成，免得手机内存被撑爆
_THUMB_SEM = threading.Semaphore(2)


PAGE_THUMB_WIDTH = 180   # 阅读器"页面总览"里每页的小图


def cached_thumb(src: Path, dst: Path, width: int) -> Path:
    """把 src 缩成 width 宽的 JPEG 存到 dst，之后直接用缓存；原图更新过就重新生成。"""
    def fresh() -> bool:
        return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime

    if fresh():
        return dst
    with _THUMB_SEM:
        if fresh():
            return dst
        try:
            from PIL import Image
            if src.suffix.lower() in (".jpg", ".jpeg"):
                with Image.open(src) as im:
                    # draft 让 libjpeg 直接按 1/2、1/4… 的比例解码，
                    # 不用先把整张原图解出来再缩，快而且省内存
                    im.draft("RGB", (width, width * 4))
                    small = im.convert("RGB")
            else:
                try:
                    import android_webp   # 安卓：系统解码器按比例缩小解码
                    shrink = android_webp.small_image
                except ImportError:
                    shrink = None
                if shrink:
                    small = shrink(str(src), width).convert("RGB")
                else:
                    small = Image.open(src).convert("RGB")
            small.thumbnail((width, width * 4))
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.with_name(dst.name + ".tmp")
            small.save(tmp, "JPEG", quality=80)
            os.replace(tmp, dst)
        except Exception:
            return src  # 生成不了就退回原图，至少能显示
    return dst


def thumb_for(album_id: str) -> Path | None:
    """书架封面用的小图。"""
    album_dir = DOWNLOAD_DIR / album_id
    src = first_page(album_dir) if album_dir.is_dir() else None
    if src is None:
        return None
    return cached_thumb(src, THUMB_DIR / f"{album_id}.jpg", THUMB_WIDTH)


def page_thumb_dir(album_id: str) -> Path:
    return THUMB_DIR / "pages" / album_id


def page_thumb(album_dir: Path, chapter: str, filename: str) -> Path | None:
    """阅读器"页面总览"里单页的小图。"""
    src = album_dir / chapter / filename
    if not src.is_file():
        return None
    dst = page_thumb_dir(album_dir.name) / chapter / (Path(filename).stem + ".jpg")
    return cached_thumb(src, dst, PAGE_THUMB_WIDTH)


def dir_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    total = 0
    for f in path.rglob("*"):
        try:
            if f.is_file():
                total += f.stat().st_size
        except OSError:
            pass
    return total


def storage_report() -> dict:
    books = []
    for d in DOWNLOAD_DIR.iterdir():
        if d.is_dir():
            meta = read_meta(d)
            books.append({
                "id": d.name,
                "name": meta.get("name") or f"JM{d.name}",
                "size": dir_size(d),
            })
    books.sort(key=lambda b: b["size"], reverse=True)
    return {
        "books": books,
        "books_total": sum(b["size"] for b in books),
        # 搜索封面 + 书架缩略图，删了会按需重新生成
        "cache": dir_size(COVER_DIR) + dir_size(THUMB_DIR),
    }


def clear_cache() -> int:
    freed = 0
    for folder in (COVER_DIR, THUMB_DIR):
        for f in folder.iterdir():
            try:
                if f.is_file():
                    size = f.stat().st_size
                    f.unlink()
                    freed += size
                elif f.is_dir():          # 页面缩略图按本子分了子目录
                    size = dir_size(f)
                    shutil.rmtree(f, ignore_errors=True)
                    freed += size
            except OSError:
                pass
    return freed


# --------------------------------------------------------------------------
# 单本的后台活：压缩画质、导出 ZIP / PDF。都可能要几十秒，放后台跑，前端轮询进度
# --------------------------------------------------------------------------
COMPRESS_WIDTH = 1200      # 压缩后最宽这么多像素（手机屏幕看足够了）
COMPRESS_QUALITY = 70
PDF_MAX_SIDE = 1500
JOBS: dict[tuple[str, str], dict] = {}
_JOBS_LOCK = threading.Lock()


def _album_images(album_dir: Path) -> list[Path]:
    return [f for ch in chapter_dirs(album_dir) for f in page_files(ch)]


def _open_scaled(path: Path, width: int):
    """按宽度缩小后打开一张图。安卓的 Pillow 解不了 WebP，交给系统解码器。"""
    from PIL import Image
    try:
        import android_webp
        if path.suffix.lower() == ".webp" and android_webp.small_image:
            return android_webp.small_image(str(path), width).convert("RGB")
    except ImportError:
        pass
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    return im


def _save_small(im, path: Path) -> None:
    if path.suffix.lower() == ".webp":
        try:
            import android_webp
            if android_webp.encode_webp:
                return android_webp.encode_webp(im, str(path), COMPRESS_QUALITY)
        except ImportError:
            pass
        return im.save(path, "WEBP", quality=COMPRESS_QUALITY, method=4)
    return im.save(path, "JPEG", quality=COMPRESS_QUALITY)


def _job_compress(album_dir: Path, job: dict) -> None:
    files = _album_images(album_dir)
    job["total"] = len(files)
    for f in files:
        before = f.stat().st_size
        tmp = f.with_name(f.stem + ".small" + f.suffix)
        try:
            _save_small(_open_scaled(f, COMPRESS_WIDTH), tmp)
            # 只有真的变小了才换，已经压过的、本来就小的原样留着
            if tmp.exists() and 0 < tmp.stat().st_size < before:
                job["freed"] += before - tmp.stat().st_size
                os.replace(tmp, f)
        finally:
            tmp.unlink(missing_ok=True)
        job["done"] += 1


def _write_pdf(files: list[Path], out: Path, job: dict) -> None:
    """一页一页写 PDF：每页一张 JPEG，写完就扔，长本也不会把内存撑爆。"""
    import io
    offsets: list[int] = []
    page_ids: list[int] = []
    with open(out, "wb") as fp:
        def obj(n: int, body: bytes) -> None:
            offsets.append(fp.tell())
            fp.write(f"{n} 0 obj\n".encode() + body + b"\nendobj\n")

        fp.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        n = 3                                   # 1 是目录，2 是页面树，放到最后写
        for f in files:
            im = _open_scaled(f, PDF_MAX_SIDE)
            if im.height > PDF_MAX_SIDE * 3:    # 超长条再按高度压一下
                im = im.resize((round(im.width * PDF_MAX_SIDE * 3 / im.height), PDF_MAX_SIDE * 3))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=80)
            data = buf.getvalue()
            w, h = im.size
            img_n, content_n, page_n = n, n + 1, n + 2
            obj(img_n, f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB "
                       f"/BitsPerComponent 8 /Filter /DCTDecode /Length {len(data)} >>\nstream\n".encode()
                + data + b"\nendstream")
            draw = f"q {w} 0 0 {h} 0 0 cm /Im0 Do Q".encode()
            obj(content_n, f"<< /Length {len(draw)} >>\nstream\n".encode() + draw + b"\nendstream")
            obj(page_n, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] "
                        f"/Resources << /XObject << /Im0 {img_n} 0 R >> >> /Contents {content_n} 0 R >>".encode())
            page_ids.append(page_n)
            n += 3
            job["done"] += 1
        kids = " ".join(f"{i} 0 R" for i in page_ids)
        obj(2, f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode())
        obj(1, b"<< /Type /Catalog /Pages 2 0 R >>")
        # 交叉引用表按对象编号排
        order = sorted(zip([*range(3, n), 2, 1], offsets))
        xref = fp.tell()
        fp.write(f"xref\n0 {n}\n0000000000 65535 f \n".encode())
        for _, off in order:
            fp.write(f"{off:010d} 00000 n \n".encode())
        fp.write(f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())


def _job_export(album_dir: Path, job: dict, fmt: str) -> None:
    import zipfile
    files = _album_images(album_dir)
    job["total"] = len(files)
    meta = read_meta(album_dir)
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", str(meta.get("name") or ""))[:40].strip("_")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    out = BACKUP_DIR / f"JM{album_dir.name}{'_' + safe if safe else ''}.{fmt}"
    tmp = out.with_name(out.name + ".part")
    if fmt == "zip":
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as z:   # 图片本来就压过，不再压
            for f in files:
                z.write(f, f"{f.parent.name}/{f.name}")
                job["done"] += 1
    else:
        _write_pdf(files, tmp, job)
    os.replace(tmp, out)
    job["path"] = str(out)
    job["name"] = out.name


def _job_cover(album_dir: Path, job: dict) -> None:
    """把封面（第一页）复制一份到备份目录，拿去分享。"""
    files = _album_images(album_dir)
    if not files:
        raise RuntimeError("这本没有图片")
    job["total"] = 1
    meta = read_meta(album_dir)
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", str(meta.get("name") or ""))[:40].strip("_")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    out = BACKUP_DIR / f"JM{album_dir.name}{'_' + safe if safe else ''}_封面{files[0].suffix.lower()}"
    shutil.copyfile(files[0], out)
    job["done"] = 1
    job["path"] = str(out)
    job["name"] = out.name


def start_job(album_id: str, kind: str) -> dict:
    album_dir = DOWNLOAD_DIR / album_id
    if not album_dir.is_dir():
        return {"error": "书架上没有这本"}
    key = (album_id, kind)
    with _JOBS_LOCK:
        job = JOBS.get(key)
        if job and job["state"] == "running":
            return job
        job = {"state": "running", "done": 0, "total": 0, "freed": 0}
        JOBS[key] = job

    def run():
        try:
            if kind == "compress":
                _job_compress(album_dir, job)
            elif kind == "cover":
                _job_cover(album_dir, job)
            else:
                _job_export(album_dir, job, kind)
            job["state"] = "done"
        except Exception as e:
            job["state"] = "error"
            job["error"] = str(e)

    threading.Thread(target=run, daemon=True).start()
    return job


def _clean_numbers(raw) -> dict[str, int]:
    """把前端传来的 {漫画id: 数字} 清洗一遍，丢掉不合法的键值。"""
    out = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            k = re.sub(r"\D", "", str(k))
            try:
                v = int(v)
            except (TypeError, ValueError):
                continue
            if k and v >= 0:
                out[k] = v
    return out


def export_backup(body: dict) -> dict:
    """分组、黑名单在服务端，阅读进度在前端的本地存储里，这里合成一个文件。"""
    shelf = [{"id": b["id"], "name": b["name"]} for b in build_shelf()]
    data = {
        "app": "jmshelf",
        "version": 1,
        "exported_at": time.time(),
        "groups": load_groups(),
        "blacklist": load_blacklist()["items"],
        "blacklist_tags": load_blacklist()["tags"],
        "blacklist_authors": load_blacklist()["authors"],
        "favorites": load_favorites(),
        "notes": load_notes(),
        "ratings": load_ratings(),
        "bookmarks": load_bookmarks(),
        # 只存书目不存图片：换手机后可以照着这份清单重新下载
        "shelf": shelf,
        "progress": _clean_numbers(body.get("progress")),
        "read": _clean_numbers(body.get("read")),
        "opens": _clean_numbers(body.get("opens")),
        "settings": body.get("settings") if isinstance(body.get("settings"), dict) else {},
    }
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    auto = bool(body.get("auto"))
    name = time.strftime(("jmshelf-auto-" if auto else "jmshelf-backup-") + "%Y%m%d-%H%M%S.json")
    path = BACKUP_DIR / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    if auto:
        # 自动备份只留最近 4 份
        for old in sorted(BACKUP_DIR.glob("jmshelf-auto-*.json"))[:-4]:
            old.unlink(missing_ok=True)
    return {"path": str(path), "name": name,
            "size": path.stat().st_size, "books": len(shelf)}


# 号单里的分段名，导入时按这些认
LIST_SECTIONS = {
    "shelf": "书架",
    "black-books": "黑名单·本子", "black-tags": "黑名单·标签", "black-authors": "黑名单·作者",
    "fav-tags": "收藏·标签", "fav-authors": "收藏·作者", "fav-dislikes": "反感·标签",
}


def export_jm_list(ids: list[str] | None = None, parts=None, to_file: bool = True) -> dict:
    """导出号单：纯文本，按「[书架]」「[黑名单·标签]」这样分段。

    用纯文本是为了能直接贴进聊天软件、用记事本打开。书架、黑名单本子每行只写 JM 号
    （标题导入时再查）；标签、作者名单每行一个。
    parts 选导出哪几块：shelf / black / fav。
    """
    parts = set(parts or ["shelf"])

    def one_line(text: str) -> str:
        return re.sub(r"[\t\r\n]+", " ", str(text or "")).strip()

    sections: list[tuple[str, list[str]]] = []
    count = 0
    if "shelf" in parts:
        books = build_shelf()
        if ids:
            keep = set(ids)
            books = [b for b in books if b["id"] in keep]
        count = len(books)
        sections.append(("shelf", [f"JM{b['id']}" for b in books]))
    if "black" in parts:
        bl = load_blacklist()
        sections += [
            ("black-books", [f"JM{x['id']}" for x in bl["items"]]),
            ("black-tags", [one_line(t) for t in bl["tags"]]),
            ("black-authors", [one_line(a) for a in bl["authors"]]),
        ]
    if "fav" in parts:
        fav = load_favorites()
        sections += [
            ("fav-tags", [one_line(t) for t in fav["tags"]]),
            ("fav-authors", [one_line(a) for a in fav["authors"]]),
            ("fav-dislikes", [one_line(t) for t in fav["dislikes"]]),
        ]
    sections = [(k, rows) for k, rows in sections if rows]
    total = sum(len(rows) for _, rows in sections)

    lines = [
        f"# JM下载器 号单 · {time.strftime('%Y-%m-%d %H:%M')}",
        "# 书、标签、作者每行一个。导入时按 [分段] 认",
    ]
    for key, rows in sections:
        lines += ["", f"[{LIST_SECTIONS[key]}]", *rows]
    text = "\n".join(lines) + "\n"

    out = {"count": count, "total": total, "text": text}
    if to_file:
        # 和备份放同一个目录：安卓上这个目录已经配置成可以通过系统分享发出去
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        name = time.strftime("jm-list-%Y%m%d-%H%M%S.txt")
        path = BACKUP_DIR / name
        path.write_text(text, "utf-8")
        out.update(path=str(path), name=name)
    return out


def import_backup(data: dict) -> dict:
    """合并导入，不覆盖本机已有的东西。阅读进度交回前端去合并。"""
    if not isinstance(data, dict) or data.get("app") != "jmshelf":
        return {"error": "这不是本 App 导出的备份文件"}

    groups = data.get("groups") if isinstance(data.get("groups"), dict) else {}
    with _GROUPS_LOCK:
        cur = load_groups()
        for name in groups.get("groups") or []:
            name = str(name).strip()[:20]
            if name and name not in cur["groups"]:
                cur["groups"].append(name)
        for album_id, name in (groups.get("assign") or {}).items():
            album_id = re.sub(r"\D", "", str(album_id))
            name = str(name).strip()[:20]
            if album_id and name:
                if name not in cur["groups"]:
                    cur["groups"].append(name)
                cur["assign"][album_id] = name
        save_groups(cur)

    added = 0
    with _BLACKLIST_LOCK:
        cur_bl = load_blacklist()
        known = {x["id"] for x in cur_bl["items"]}
        for x in data.get("blacklist") or []:
            if not isinstance(x, dict):
                continue
            album_id = re.sub(r"\D", "", str(x.get("id", "")))
            if album_id and album_id not in known:
                cur_bl["items"].append(
                    {"id": album_id, "name": str(x.get("name", ""))[:120]})
                known.add(album_id)
                added += 1
        known_tags = {norm_tag(t) for t in cur_bl["tags"]}
        for t in data.get("blacklist_tags") or []:
            t = str(t).strip()[:40]
            if t and norm_tag(t) not in known_tags:
                cur_bl["tags"].append(t)
                known_tags.add(norm_tag(t))
        cur_bl["authors"] = _clean_names([*cur_bl["authors"], *(data.get("blacklist_authors") or [])])
        save_blacklist(cur_bl)

    fav_in = data.get("favorites") if isinstance(data.get("favorites"), dict) else {}
    with _FAVORITES_LOCK:
        fav = load_favorites()
        fav["tags"] = _clean_names([*fav["tags"], *(fav_in.get("tags") or [])])
        fav["authors"] = _clean_names([*fav["authors"], *(fav_in.get("authors") or [])])
        liked = {norm_tag(t) for t in fav["tags"]}
        fav["dislikes"] = [t for t in _clean_names([*fav["dislikes"], *(fav_in.get("dislikes") or [])])
                           if norm_tag(t) not in liked]
        for x in fav_in.get("books") or []:
            x = re.sub(r"\D", "", str(x))
            if x and x not in fav["books"]:
                fav["books"].append(x)
        save_favorites(fav)

    ratings_in = data.get("ratings") if isinstance(data.get("ratings"), dict) else {}
    with _RATINGS_LOCK:
        ratings = load_ratings()
        ratings["criteria"] = _clean_names([*ratings["criteria"], *(ratings_in.get("criteria") or [])])[:8]
        for k, v in (ratings_in.get("scores") or {}).items():
            k = re.sub(r"\D", "", str(k))
            if k and isinstance(v, dict) and k not in ratings["scores"]:   # 本机已打过分的不覆盖
                ratings["scores"][k] = {str(c): _half(n) for c, n in v.items() if _half(n)}
        save_ratings(ratings)

    marks_in = data.get("bookmarks") if isinstance(data.get("bookmarks"), dict) else {}
    with _BOOKMARKS_LOCK:
        marks = load_bookmarks()
        for k, v in marks_in.items():
            k = re.sub(r"\D", "", str(k))
            if k and isinstance(v, list):
                marks[k] = sorted({*marks.get(k, []), *(int(x) for x in v if str(x).isdigit())})
        save_bookmarks(marks)

    notes_in = data.get("notes") if isinstance(data.get("notes"), dict) else {}
    with _NOTES_LOCK:
        notes = load_notes()
        for k, v in notes_in.items():
            k = re.sub(r"\D", "", str(k))
            if k and str(v).strip() and k not in notes:   # 本机已有的笔记不覆盖
                notes[k] = str(v).strip()[:2000]
        save_notes(notes)

    local = {b["id"] for b in build_shelf()}
    missing = []
    for x in data.get("shelf") or []:
        if not isinstance(x, dict):
            continue
        album_id = re.sub(r"\D", "", str(x.get("id", "")))
        if album_id and album_id not in local:
            missing.append({"id": album_id, "name": str(x.get("name", ""))})

    return {
        "ok": True,
        "groups": len(groups.get("groups") or []),
        "blacklist": added,
        "progress": _clean_numbers(data.get("progress")),
        "read": _clean_numbers(data.get("read")),
        "opens": _clean_numbers(data.get("opens")),
        "settings": data.get("settings") if isinstance(data.get("settings"), dict) else {},
        "missing": missing,
    }


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "JMShelf/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 安静一点
        pass

    # ---- 工具 ----
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path, cache: str = "no-cache"):
        if not path.is_file():
            self.send_json({"error": "not found"}, 404)
            return
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(data)

    def body_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def safe_album_dir(self, album_id: str) -> Path | None:
        if not re.fullmatch(r"\d+", album_id or ""):
            return None
        path = (DOWNLOAD_DIR / album_id).resolve()
        if DOWNLOAD_DIR not in path.parents and path != DOWNLOAD_DIR:
            return None
        return path

    # ---- 路由 ----
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            return self.send_file(WEB_DIR / "index.html")

        if (path in ("/manifest.json", "/sw.js", "/app.js", "/style.css", "/pet.js", "/mask.js", "/pet-lines.json",
                     "/lists.js", "/feed.js", "/io.js",
                     "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png")
                or re.fullmatch(r"/pet-[a-z-]+\.webp", path)):   # 看板娘的各张图
            # 界面文件很小，每次都重新取，改完刷新就生效，不会被旧缓存卡住
            return self.send_file(WEB_DIR / path.lstrip("/"), "no-cache")

        if path == "/api/shelf":
            return self.send_json({"items": build_shelf()})

        if path == "/api/album":
            detail = album_detail((query.get("id") or [""])[0])
            return self.send_json(detail or {"error": "not found"},
                                  200 if detail else 404)

        if path == "/api/groups":
            return self.send_json(load_groups())

        if path == "/api/blacklist":
            return self.send_json(load_blacklist())

        if path == "/api/favorites":
            return self.send_json(load_favorites())

        if path == "/api/ratings":
            return self.send_json(load_ratings())

        if path == "/api/bookmarks":
            album_id = re.sub(r"\D", "", (query.get("id") or [""])[0])
            return self.send_json({"pages": load_bookmarks().get(album_id, [])})

        if path == "/api/album/job":
            key = (re.sub(r"\D", "", (query.get("id") or [""])[0]), (query.get("kind") or [""])[0])
            with _JOBS_LOCK:
                job = JOBS.get(key)
            return self.send_json(job or {"state": "none"})

        if path.startswith("/backups/"):
            # 网页版下载导出的 ZIP / PDF / 号单。只给备份目录里的文件，不许跳出去
            name = urllib.parse.unquote(path[len("/backups/"):])
            target = (BACKUP_DIR / name).resolve()
            if target.parent != BACKUP_DIR.resolve() or not target.is_file():
                return self.send_json({"error": "not found"}, 404)
            return self.send_file(target)

        if path == "/api/feed":
            part = (query.get("part") or ["authors"])[0]
            if part not in FEED_PARTS:
                return self.send_json({"error": "参数不对"}, 400)
            force = (query.get("force") or ["0"])[0] == "1"
            try:
                return self.send_json(build_feed_part(part, force))
            except Exception as e:
                return self.send_json({"error": str(e)}, 502)

        if path == "/api/tasks":
            with TASKS_LOCK:
                tasks = [t.as_dict() for t in TASKS.values()]
            tasks.sort(key=lambda t: t["started_at"], reverse=True)
            return self.send_json({"tasks": tasks})

        if path == "/api/search":
            keyword = (query.get("q") or [""])[0].strip()
            kind = (query.get("kind") or ["site"])[0]
            try:
                page = max(1, int((query.get("page") or ["1"])[0]))
            except ValueError:
                page = 1
            if not keyword:
                return self.send_json({"items": [], "total": 0, "has_more": False})
            try:
                show_blocked = (query.get("show_blocked") or ["0"])[0] == "1"
                mode = (query.get("mode") or ["and"])[0]
                fav = (query.get("fav") or ["page"])[0]
                return self.send_json(search_albums(keyword, kind, page, show_blocked, mode, fav))
            except Exception as e:
                return self.send_json({"error": str(e)}, 502)

        if path == "/api/info" and query.get("ids"):
            # 一次查一批：搜索结果一页的卡片合在一起问，不用每张卡片各发一个请求
            ids = [x for x in (query.get("ids") or [""])[0].split(",") if re.fullmatch(r"\d+", x)][:40]
            return self.send_json({"items": album_infos(ids)})

        if path == "/api/info":
            album_id = (query.get("id") or [""])[0]
            if not re.fullmatch(r"\d+", album_id):
                return self.send_json({"error": "bad id"}, 400)
            return self.send_json(album_info(album_id))

        if path == "/api/storage":
            return self.send_json(storage_report())

        if path == "/api/settings":
            return self.send_json(current_settings())

        if path == "/api/pending":
            return self.send_json({"items": pending_items()})

        if path.startswith("/thumb/"):
            album_id = path[len("/thumb/"):]
            if not re.fullmatch(r"\d+", album_id):
                return self.send_json({"error": "bad id"}, 400)
            found = thumb_for(album_id)
            if found is None:
                return self.send_json({"error": "not found"}, 404)
            # 地址里带了版本号，内容变了地址就会变，可以放心长缓存
            return self.send_file(found, "max-age=2592000")

        if path.startswith("/pthumb/"):
            parts = path[len("/pthumb/"):].split("/")
            if len(parts) != 3:
                return self.send_json({"error": "bad path"}, 400)
            album_id, chapter, filename = parts
            album_dir = self.safe_album_dir(album_id)
            if album_dir is None or not re.fullmatch(r"[\w.-]+", chapter) \
                    or not re.fullmatch(r"[\w.-]+", filename) or ".." in filename:
                return self.send_json({"error": "bad path"}, 400)
            found = page_thumb(album_dir, chapter, filename)
            if found is None:
                return self.send_json({"error": "not found"}, 404)
            return self.send_file(found, "max-age=2592000")

        if path.startswith("/cover/"):
            album_id = path[len("/cover/"):]
            if not re.fullmatch(r"\d+", album_id):
                return self.send_json({"error": "bad id"}, 400)
            found = fetch_cover(album_id)
            if found is None:
                return self.send_json({"error": "no cover"}, 404)
            return self.send_file(found, "max-age=604800")

        if path.startswith("/img/"):
            parts = path[len("/img/"):].split("/")
            if len(parts) != 3:
                return self.send_json({"error": "bad path"}, 400)
            album_id, chapter, filename = parts
            album_dir = self.safe_album_dir(album_id)
            if album_dir is None or "/" in chapter or ".." in filename:
                return self.send_json({"error": "bad path"}, 400)
            target = (album_dir / chapter / filename).resolve()
            if album_dir not in target.parents:
                return self.send_json({"error": "bad path"}, 400)
            return self.send_file(target, "max-age=604800")

        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/download":
            album_id = re.sub(r"\D", "", str(self.body_json().get("id", "")))
            if not album_id:
                return self.send_json({"error": "请输入数字 JM 号"}, 400)
            return self.send_json(start_download(album_id))

        if path == "/api/download/cancel":
            album_id = re.sub(r"\D", "", str(self.body_json().get("id", "")))
            if not album_id:
                return self.send_json({"error": "缺少漫画 id"}, 400)
            res = cancel_download(album_id)
            return self.send_json(res, 200 if res.get("ok") else 409)

        if path == "/api/download/retry":
            album_id = re.sub(r"\D", "", str(self.body_json().get("id", "")))
            if not album_id:
                return self.send_json({"error": "缺少漫画 id"}, 400)
            with TASKS_LOCK:
                running = TASKS.get(album_id)
                if running and running.status in ("running", "queued"):
                    return self.send_json({"error": "这本已在下载队列里"}, 409)
            # 把下了一半的图片清掉，否则 jmcomic 的缓存会跳过它们
            album_dir = self.safe_album_dir(album_id)
            if album_dir and album_dir.is_dir():
                shutil.rmtree(album_dir, ignore_errors=True)
            (THUMB_DIR / f"{album_id}.jpg").unlink(missing_ok=True)
            shutil.rmtree(page_thumb_dir(album_id), ignore_errors=True)
            return self.send_json(start_download(album_id))

        if path == "/api/storage/clear":
            return self.send_json({"freed": clear_cache()})

        if path == "/api/backup/export":
            return self.send_json(export_backup(self.body_json()))

        if path == "/api/list/export":
            body = self.body_json()
            raw = body.get("ids") if isinstance(body.get("ids"), list) else None
            ids = [x for x in (re.sub(r"\D", "", str(v)) for v in raw or []) if x]
            parts = body.get("parts") if isinstance(body.get("parts"), list) else None
            return self.send_json(export_jm_list(ids or None, parts, bool(body.get("file", True))))

        if path == "/api/backup/import":
            res = import_backup(self.body_json())
            return self.send_json(res, 400 if res.get("error") else 200)

        if path == "/api/group/assign":
            body = self.body_json()
            # 单本传 id，批量传 ids
            raw = body.get("ids") if isinstance(body.get("ids"), list) else [body.get("id", "")]
            ids = [x for x in (re.sub(r"\D", "", str(v)) for v in raw) if x]
            group = str(body.get("group", "")).strip()[:20]
            if not ids:
                return self.send_json({"error": "缺少漫画 id"}, 400)
            with _GROUPS_LOCK:
                data = load_groups()
                if group and group not in data["groups"]:
                    data["groups"].append(group)
                for album_id in ids:
                    if group:
                        data["assign"][album_id] = group
                    else:
                        data["assign"].pop(album_id, None)  # 空字符串表示移出分组
                save_groups(data)
            return self.send_json(data)

        if path == "/api/settings":
            return self.send_json(save_settings(self.body_json()))

        if path == "/api/pending/resume":
            items = pending_items()
            for x in items:
                start_download(x["id"])
            return self.send_json({"resumed": len(items)})

        if path == "/api/pending/clear":
            with TASKS_LOCK:
                PENDING.clear()
                persist_queue()
            return self.send_json({"ok": True})

        if path == "/api/blacklist/add":
            body = self.body_json()
            album_id = re.sub(r"\D", "", str(body.get("id", "")))
            if not album_id:
                return self.send_json({"error": "缺少漫画 id"}, 400)
            with _BLACKLIST_LOCK:
                data = load_blacklist()
                if album_id not in {x["id"] for x in data["items"]}:
                    data["items"].insert(0, {
                        "id": album_id,
                        "name": str(body.get("name", "")).strip()[:120],
                    })
                    save_blacklist(data)
            return self.send_json(data)

        if path in ("/api/blacklist/tag/add", "/api/blacklist/tag/remove"):
            tag = str(self.body_json().get("tag", "")).strip()[:40]
            if not tag:
                return self.send_json({"error": "标签不能为空"}, 400)
            with _BLACKLIST_LOCK:
                data = load_blacklist()
                # 大小写、首尾空格不同也算同一个标签
                data["tags"] = [t for t in data["tags"] if norm_tag(t) != norm_tag(tag)]
                if path.endswith("/add"):
                    data["tags"].insert(0, tag)
                save_blacklist(data)
            return self.send_json(data)

        if path == "/api/feed/seen":
            keys = [str(x)[:40] for x in self.body_json().get("ids") or [] if re.fullmatch(r"[\w:]+", str(x))]
            mark_feed_seen(keys)
            return self.send_json({"ok": True})

        if path == "/api/album/job":
            # 单本的后台活：{id, kind: compress | zip | pdf}
            body = self.body_json()
            album_id = re.sub(r"\D", "", str(body.get("id", "")))
            kind = body.get("kind")
            if not album_id or kind not in ("compress", "zip", "pdf", "cover"):
                return self.send_json({"error": "参数不对"}, 400)
            return self.send_json(start_job(album_id, kind))

        if path == "/api/explore":
            body = self.body_json()
            ex = {re.sub(r"\D", "", str(x)) for x in body.get("exclude") or []}
            mode = body.get("mode") if body.get("mode") in EXPLORE_MODES else "tags"
            try:
                return self.send_json(explore(ex, mode))
            except Exception as e:
                return self.send_json({"error": str(e)}, 502)

        if path == "/api/feed/dismiss":
            album_id = re.sub(r"\D", "", str(self.body_json().get("id", "")))
            if album_id:
                dismiss_feed(album_id)
            return self.send_json({"ok": True})

        if path == "/api/names":
            # 黑名单 / 收藏里的标签、作者批量加减：{list: black|fav, kind: tags|authors, add: [], remove: []}
            body = self.body_json()
            which, kind = body.get("list"), body.get("kind")
            if which not in ("black", "fav") or kind not in ("tags", "authors", "dislikes") \
                    or (kind == "dislikes" and which != "fav"):
                return self.send_json({"error": "参数不对"}, 400)
            moved = change_names(which, kind, body.get("add"), body.get("remove"))
            return self.send_json({"blacklist": load_blacklist(), "favorites": load_favorites(),
                                   "moved": moved})

        if path == "/api/rating":
            # 给一本书的某条标准打分：{id, criterion, score}，score 为 0 就是清掉这条
            body = self.body_json()
            album_id = re.sub(r"\D", "", str(body.get("id", "")))
            criterion = str(body.get("criterion", "")).strip()[:12]
            score = _half(body.get("score", 0)) or 0   # 可以是半颗星，比如 3.5
            if not album_id or not (DOWNLOAD_DIR / album_id).is_dir():
                return self.send_json({"error": "只能给已下载的本子打分"}, 400)
            with _RATINGS_LOCK:
                ratings = load_ratings()
                if criterion not in ratings["criteria"]:
                    return self.send_json({"error": "没有这条评分标准"}, 400)
                mine = ratings["scores"].setdefault(album_id, {})
                if score:
                    mine[criterion] = score
                else:
                    mine.pop(criterion, None)
                if not mine:
                    ratings["scores"].pop(album_id, None)
                save_ratings(ratings)
            return self.send_json({"scores": mine, "rating": rating_of(mine, ratings["criteria"])})

        if path == "/api/bookmark":
            # 加 / 去一个页面书签：{id, page, on}
            body = self.body_json()
            album_id = re.sub(r"\D", "", str(body.get("id", "")))
            try:
                page = int(body.get("page"))
            except (TypeError, ValueError):
                page = -1
            if not album_id or page < 0 or not (DOWNLOAD_DIR / album_id).is_dir():
                return self.send_json({"error": "参数不对"}, 400)
            with _BOOKMARKS_LOCK:
                data = load_bookmarks()
                pages = set(data.get(album_id, []))
                if body.get("on"):
                    pages.add(page)
                else:
                    pages.discard(page)
                if pages:
                    data[album_id] = sorted(pages)
                else:
                    data.pop(album_id, None)
                save_bookmarks(data)
            return self.send_json({"pages": data.get(album_id, [])})

        if path == "/api/rating/criteria/rename":
            # 改评分项的名字：各本书在这一项打过的分跟着改名
            body = self.body_json()
            old = str(body.get("from", "")).strip()
            new = str(body.get("to", "")).strip()[:12]
            with _RATINGS_LOCK:
                ratings = load_ratings()
                if old not in ratings["criteria"]:
                    return self.send_json({"error": "没有这个评分项"}, 400)
                if not new:
                    return self.send_json({"error": "名字不能为空"}, 400)
                if new != old and new in ratings["criteria"]:
                    return self.send_json({"error": "已经有同名的评分项了"}, 400)
                ratings["criteria"] = [new if c == old else c for c in ratings["criteria"]]
                for mine in ratings["scores"].values():
                    if old in mine:
                        mine[new] = mine.pop(old)
                save_ratings(ratings)
            return self.send_json({"criteria": ratings["criteria"]})

        if path == "/api/rating/criteria":
            criteria = _clean_names(self.body_json().get("criteria"))[:8]
            criteria = [c[:12] for c in criteria]
            if not criteria:
                return self.send_json({"error": "至少留一条评分标准"}, 400)
            with _RATINGS_LOCK:
                ratings = load_ratings()
                ratings["criteria"] = criteria
                save_ratings(ratings)
            return self.send_json({"criteria": criteria})

        if path == "/api/note":
            body = self.body_json()
            album_id = re.sub(r"\D", "", str(body.get("id", "")))
            text = str(body.get("text", "")).strip()[:2000]
            if not album_id:
                return self.send_json({"error": "缺少漫画 id"}, 400)
            with _NOTES_LOCK:
                notes = load_notes()
                if text:
                    notes[album_id] = text
                else:
                    notes.pop(album_id, None)
                save_notes(notes)
            return self.send_json({"ok": True, "note": text})

        if path == "/api/blacklist/remove":
            album_id = re.sub(r"\D", "", str(self.body_json().get("id", "")))
            with _BLACKLIST_LOCK:
                data = load_blacklist()
                data["items"] = [x for x in data["items"] if x["id"] != album_id]
                save_blacklist(data)
            return self.send_json(data)

        if path == "/api/group/create":
            name = str(self.body_json().get("name", "")).strip()[:20]
            if not name:
                return self.send_json({"error": "分组名不能为空"}, 400)
            with _GROUPS_LOCK:
                data = load_groups()
                if name in data["groups"]:
                    return self.send_json({"error": "这个分组已经有了"}, 400)
                data["groups"].append(name)
                save_groups(data)
            return self.send_json(data)

        if path == "/api/group/rename":
            body = self.body_json()
            old = str(body.get("old", "")).strip()
            new = str(body.get("new", "")).strip()[:20]
            if not new:
                return self.send_json({"error": "分组名不能为空"}, 400)
            with _GROUPS_LOCK:
                data = load_groups()
                if old not in data["groups"]:
                    return self.send_json({"error": "分组不存在"}, 404)
                if new != old and new in data["groups"]:
                    return self.send_json({"error": "这个分组已经有了"}, 400)
                data["groups"] = [new if g == old else g for g in data["groups"]]
                data["assign"] = {k: (new if v == old else v)
                                  for k, v in data["assign"].items()}
                save_groups(data)
            return self.send_json(data)

        if path == "/api/group/delete":
            group = str(self.body_json().get("group", "")).strip()
            with _GROUPS_LOCK:
                data = load_groups()
                data["groups"] = [g for g in data["groups"] if g != group]
                # 组没了，里面的漫画回到「未分组」，本身不受影响
                data["assign"] = {k: v for k, v in data["assign"].items()
                                  if v != group}
                save_groups(data)
            return self.send_json(data)
        self.send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/album":
            query = urllib.parse.parse_qs(parsed.query)
            album_dir = self.safe_album_dir((query.get("id") or [""])[0])
            if album_dir is None or not album_dir.is_dir():
                return self.send_json({"error": "not found"}, 404)
            shutil.rmtree(album_dir, ignore_errors=True)
            (THUMB_DIR / f"{album_dir.name}.jpg").unlink(missing_ok=True)
            shutil.rmtree(page_thumb_dir(album_dir.name), ignore_errors=True)
            with TASKS_LOCK:
                TASKS.pop(album_dir.name, None)
            with _GROUPS_LOCK:
                data = load_groups()
                if data["assign"].pop(album_dir.name, None) is not None:
                    save_groups(data)
            with _RATINGS_LOCK:
                ratings = load_ratings()
                if ratings["scores"].pop(album_dir.name, None) is not None:
                    save_ratings(ratings)
            with _BOOKMARKS_LOCK:
                marks = load_bookmarks()
                if marks.pop(album_dir.name, None) is not None:
                    save_bookmarks(marks)
            return self.send_json({"ok": True})
        self.send_json({"error": "not found"}, 404)


def backfill_meta() -> None:
    """给缺少 meta.json 的旧下载补上标题等信息（后台静默执行）。"""
    pending = [
        d for d in DOWNLOAD_DIR.iterdir()
        if d.is_dir() and not (d / "meta.json").exists() and chapter_dirs(d)
    ]
    if not pending:
        return
    try:
        client = OPTION.new_jm_client()
    except Exception:
        return
    for album_dir in pending:
        try:
            album = client.get_album_detail(album_dir.name)
            (album_dir / "meta.json").write_text(
                json.dumps(
                    {
                        "id": album_dir.name,
                        "name": album.name,
                        "author": getattr(album, "author", ""),
                        "tags": list(getattr(album, "tags", []) or []),
                        "chapters": [],
                        "added_at": album_dir.stat().st_mtime,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                "utf-8",
            )
        except Exception:
            continue


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("223.5.5.5", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def start_for_android() -> None:
    """安卓 App 入口，由 Kotlin 在后台线程调用。

    只绑 127.0.0.1：服务只给自己的 WebView 用，不暴露到局域网。
    """
    # 安卓的 Pillow 没有 WebP 支持，得先挂上系统解码器（PC 上不需要）
    try:
        import android_webp
        ok = android_webp.install(lambda: int(CONFIG.get("image_quality", 80)))
        print("安卓图片处理钩子:", "已启用" if ok else "跳过")
    except Exception as e:
        print("安卓图片处理钩子安装失败:", e)

    threading.Thread(target=backfill_meta, daemon=True).start()
    threading.Thread(target=warm_feed, daemon=True).start()   # 后台先把动态算好
    ThreadingHTTPServer(("127.0.0.1", int(CONFIG["port"])), Handler).serve_forever()


def main() -> None:
    port = int(CONFIG["port"])
    threading.Thread(target=backfill_meta, daemon=True).start()
    threading.Thread(target=warm_feed, daemon=True).start()   # 后台先把动态算好
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 46)
    print("  JM下载器已启动")
    print(f"  本机打开：  http://127.0.0.1:{port}")
    print(f"  手机打开：  http://{local_ip()}:{port}")
    print(f"  漫画目录：  {DOWNLOAD_DIR}")
    print("  手机浏览器里选「添加到主屏幕」即可当 App 用")
    print("  按 Ctrl+C 停止")
    print("=" * 46)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
