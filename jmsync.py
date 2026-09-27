"""多设备同步（坚果云等 WebDAV）和局域网直传。由 server.py 在启动时 init(server 模块)。

同步
----
- 同步的内容：收藏 / 反感 / 拉黑名单、分组、评分和笔记、书单（JM 号）。本地导入的书各设备 ID 不同，
  它们的分组、评分、笔记不同步（书本身可以用「发送到其他设备」传过去）。
- 每一项是一条记录 {"v": 值（None 表示删了）, "t": 修改时间, "d": 哪台设备改的}，合并时按条取最新的，
  所以两台设备改了不同的东西都会保留，删除也能同步过去。
- 本机的改动不用处处埋点：每次同步前把本机现状和上次同步后的快照比一比，不一样的就是本机改过的。
- 云端只放一个加密的 state.bin，外加临时的加密书包 books/*.bin；网盘上看不到任何明文。
  加密：同步密码 → PBKDF2 → AES-256-GCM（pycryptodome，jmcomic 本来就依赖它，安卓上也有）。

局域网直传
----------
接收的一方点「开始接收」，在 LAN_PORT 上临时开一个只收书的小服务，显示本机地址和 6 位配对码；
发送的一方填地址和配对码，直接把书包（ZIP）传过去。15 分钟没动静自动关。
"""
from __future__ import annotations

import base64
import hashlib
import http.client
import json
import os
import re
import secrets
import shutil
import socket
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

S = None   # server 模块，init() 时传进来

JIANGUOYUN_URL = "https://dav.jianguoyun.com/dav/"
REMOTE_DIR = "JM下载器同步"
STATE_FILE = "state.bin"
SYNC_EVERY = 30            # 秒：多久看一次本机有没有改动
PULL_EVERY = 300           # 秒：本机没改动时，多久拉一次别的设备的改动
TOMBSTONE_KEEP = 90 * 86400
TRANSFER_EXPIRE = 7 * 86400
LAN_PORT = 18640
LAN_IDLE = 15 * 60

_SYNC_LOCK = threading.Lock()
_status = {"last_ok": 0, "last_try": 0, "error": "", "received": [], "busy": False}
_outbox: dict[str, dict] = {}      # 不来自本机文件、要直接写进云端状态的记录（传书）
_last_pull = 0.0


def init(server_module) -> None:
    global S
    S = server_module
    threading.Thread(target=_loop, daemon=True).start()


# ============================================================ 配置
def cfg() -> dict:
    return dict(S.CONFIG.get("sync") or {})


def _save_cfg(new: dict) -> None:
    S.CONFIG["sync"] = new
    try:
        on_disk = json.loads(S.CONFIG_PATH.read_text("utf-8-sig")) if S.CONFIG_PATH.exists() else {}
    except Exception:
        on_disk = {}
    on_disk["sync"] = new
    S.CONFIG_PATH.write_text(json.dumps(on_disk, ensure_ascii=False, indent=2), "utf-8")


def device_id() -> str:
    c = cfg()
    if not c.get("device_id"):
        c["device_id"] = uuid.uuid4().hex[:12]
        _save_cfg(c)
    return c["device_id"]


def device_name() -> str:
    return cfg().get("device_name") or ("电脑" if os.name == "nt" else "手机")


def enabled() -> bool:
    c = cfg()
    return bool(c.get("enabled") and c.get("user") and c.get("password") and c.get("passphrase"))


# ============================================================ 加密
MAGIC = b"JMS1"
_KEYS: dict[tuple[str, bytes], bytes] = {}
_SALT = os.urandom(16)   # 本进程加密时用的盐；算一次密钥反复用（PBKDF2 在手机上要一秒左右）


def _key(passphrase: str, salt: bytes) -> bytes:
    k = (passphrase, salt)
    if k not in _KEYS:
        _KEYS[k] = hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, 200_000, 32)
    return _KEYS[k]


def encrypt_bytes(data: bytes, passphrase: str) -> bytes:
    from Crypto.Cipher import AES
    nonce = os.urandom(12)
    c = AES.new(_key(passphrase, _SALT), AES.MODE_GCM, nonce=nonce)
    ct, tag = c.encrypt_and_digest(data)
    return MAGIC + _SALT + nonce + ct + tag


class BadPassphrase(Exception):
    pass


def decrypt_bytes(blob: bytes, passphrase: str) -> bytes:
    from Crypto.Cipher import AES
    if blob[:4] != MAGIC or len(blob) < 48:
        raise BadPassphrase("云端文件格式不对")
    salt, nonce = blob[4:20], blob[20:32]
    c = AES.new(_key(passphrase, salt), AES.MODE_GCM, nonce=nonce)
    try:
        return c.decrypt_and_verify(blob[32:-16], blob[-16:])
    except ValueError:
        raise BadPassphrase("同步密码和其他设备上的不一样") from None


def encrypt_file(src: Path, dst: Path, passphrase: str) -> None:
    from Crypto.Cipher import AES
    nonce = os.urandom(12)
    c = AES.new(_key(passphrase, _SALT), AES.MODE_GCM, nonce=nonce)
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        fo.write(MAGIC + _SALT + nonce)
        while chunk := fi.read(1 << 20):
            fo.write(c.encrypt(chunk))
        fo.write(c.digest())


def decrypt_file(src: Path, dst: Path, passphrase: str) -> None:
    from Crypto.Cipher import AES
    size = src.stat().st_size
    with open(src, "rb") as fi, open(dst, "wb") as fo:
        head = fi.read(32)
        if head[:4] != MAGIC:
            raise BadPassphrase("书包格式不对")
        c = AES.new(_key(passphrase, head[4:20]), AES.MODE_GCM, nonce=head[20:32])
        left = size - 32 - 16
        while left > 0:
            chunk = fi.read(min(1 << 20, left))
            if not chunk:
                break
            fo.write(c.decrypt(chunk))
            left -= len(chunk)
        try:
            c.verify(fi.read(16))
        except ValueError:
            raise BadPassphrase("书包解不开：同步密码不对或文件损坏") from None


# ============================================================ WebDAV
class DavError(Exception):
    pass


class _Counting:
    """上传时边读边记进度。"""

    def __init__(self, fp, on_read):
        self.fp, self.on_read = fp, on_read

    def read(self, n=-1):
        b = self.fp.read(n if n and n > 0 else 1 << 16)
        if b:
            self.on_read(len(b))
        return b


class Dav:
    def __init__(self, url: str, user: str, password: str):
        self.base = url.rstrip("/") + "/" + urllib.parse.quote(REMOTE_DIR) + "/"
        token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
        self.auth = "Basic " + token
        # 坚果云在国内，直连；不走给禁漫配的代理
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _req(self, method: str, path: str = "", data=None, headers=None, timeout=60):
        req = urllib.request.Request(self.base + urllib.parse.quote(path), data=data, method=method,
                                     headers={"Authorization": self.auth, **(headers or {})})
        try:
            return self.opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise DavError("网盘账号或应用密码不对") from None
            if e.code == 404:
                return None
            if e.code in (405, 409) and method == "MKCOL":
                return None   # 已经有了
            if e.code == 507:
                raise DavError("网盘空间或本月流量不够了") from None
            raise DavError(f"网盘返回 {e.code}") from None
        except urllib.error.URLError as e:
            raise DavError(f"连不上网盘：{e.reason}") from None
        except (TimeoutError, socket.timeout):
            raise DavError("连网盘超时") from None

    def ensure_dirs(self) -> None:
        self._req("MKCOL")
        self._req("MKCOL", "books")

    def get(self, path: str) -> bytes | None:
        r = self._req("GET", path)
        return r.read() if r else None

    def get_to_file(self, path: str, dst: Path, on_read=None) -> bool:
        r = self._req("GET", path, timeout=120)
        if not r:
            return False
        with open(dst, "wb") as fo:
            while chunk := r.read(1 << 20):
                fo.write(chunk)
                if on_read:
                    on_read(len(chunk))
        return True

    def put(self, path: str, data: bytes) -> None:
        self._req("PUT", path, data=data, headers={"Content-Type": "application/octet-stream"})

    def put_file(self, path: str, src: Path, on_read=None) -> None:
        size = src.stat().st_size
        with open(src, "rb") as fp:
            body = _Counting(fp, on_read or (lambda n: None))
            self._req("PUT", path, data=body, timeout=600,
                      headers={"Content-Type": "application/octet-stream", "Content-Length": str(size)})

    def delete(self, path: str) -> None:
        self._req("DELETE", path)


def _dav() -> Dav:
    c = cfg()
    return Dav(c.get("url") or JIANGUOYUN_URL, c["user"], c["password"])


# ============================================================ 本机数据 ↔ 记录
NAME_KINDS = ("fav-tags", "fav-authors", "fav-dislikes", "black-tags", "black-authors")


def _synced(key: str) -> bool:
    """哪些记录来自本机文件（要和快照比对）；传书、设备登记是另外写的。"""
    return not key.startswith(("transfer|", "device|"))


def local_map() -> dict:
    fav, bl = S.load_favorites(), S.load_blacklist()
    g, r, notes = S.load_groups(), S.load_ratings(), S.load_notes()
    m: dict = {}
    lists = {"fav-tags": fav["tags"], "fav-authors": fav["authors"], "fav-dislikes": fav["dislikes"],
             "black-tags": bl["tags"], "black-authors": bl["authors"]}
    for kind, names in lists.items():
        for n in names:
            m[f"{kind}|{S.norm_tag(n)}"] = n
    for x in bl["items"]:
        m[f"black-books|{x['id']}"] = x.get("name", "")
    for name in g["groups"]:
        m[f"groups|{name}"] = 1
    for i, name in g["assign"].items():
        if not S.is_local_id(i):
            m[f"group|{i}"] = name
    m["criteria"] = list(r["criteria"])
    for i, sc in r["scores"].items():
        if not S.is_local_id(i):
            for c, v in sc.items():
                m[f"score|{i}|{c}"] = v
    for i, t in notes.items():
        if not S.is_local_id(i):
            m[f"note|{i}"] = t
    for b in S.build_shelf():
        if not b.get("local"):
            m[f"shelf|{b['id']}"] = b["name"]
    return m


def _values(items: dict, prefix: str) -> dict:
    """某一类记录里还在的：{key 后半段: 值}。"""
    n = len(prefix)
    return {k[n:]: e["v"] for k, e in items.items() if k.startswith(prefix) and e.get("v") is not None}


def apply_items(items: dict) -> None:
    """把合并后的记录写回本机文件（只改有变化的，本地导入书的数据原样保留）。"""
    with S._FAVORITES_LOCK:
        fav = S.load_favorites()
        new = dict(fav)
        for kind, field in (("fav-tags", "tags"), ("fav-authors", "authors"), ("fav-dislikes", "dislikes")):
            new[field] = _merge_names(fav[field], _values(items, kind + "|"))
        if new != fav:
            S.save_favorites(new)
    with S._BLACKLIST_LOCK:
        bl = S.load_blacklist()
        new = dict(bl)
        new["tags"] = _merge_names(bl["tags"], _values(items, "black-tags|"))
        new["authors"] = _merge_names(bl["authors"], _values(items, "black-authors|"))
        want = _values(items, "black-books|")
        kept = [x for x in bl["items"] if x["id"] in want]
        have = {x["id"] for x in kept}
        new["items"] = kept + [{"id": i, "name": str(n)[:120]} for i, n in want.items() if i not in have]
        if new != bl:
            S.save_blacklist(new)
    with S._GROUPS_LOCK:
        g = S.load_groups()
        names = _values(items, "groups|")
        assign = {i: str(n)[:20] for i, n in _values(items, "group|").items()}
        groups = [x for x in g["groups"] if x in names] + [x for x in names if x not in g["groups"]]
        for n in assign.values():
            if n not in groups:
                groups.append(n)
        local_assign = {i: n for i, n in g["assign"].items() if S.is_local_id(i)}
        for n in local_assign.values():
            if n not in groups:
                groups.append(n)
        new = {"groups": groups, "assign": {**assign, **local_assign}}
        if new != g:
            S.save_groups(new)
    with S._RATINGS_LOCK:
        r = S.load_ratings()
        scores: dict[str, dict] = {i: sc for i, sc in r["scores"].items() if S.is_local_id(i)}
        for k, v in _values(items, "score|").items():
            i, c = k.split("|", 1)
            if S._half(v):
                scores.setdefault(i, {})[c] = S._half(v)
        crit = items.get("criteria", {}).get("v") or r["criteria"]
        new = {"criteria": [str(c)[:12] for c in crit][:8] or r["criteria"], "scores": scores}
        if new != r:
            S.save_ratings(new)
    with S._NOTES_LOCK:
        notes = S.load_notes()
        new = {i: t for i, t in notes.items() if S.is_local_id(i)}
        new.update({i: str(t)[:2000] for i, t in _values(items, "note|").items() if str(t).strip()})
        if new != notes:
            S.save_notes(new)


def _merge_names(cur: list[str], want: dict) -> list[str]:
    """保持本机原来的顺序，新来的排前面（和手动添加时一样）。"""
    have = {S.norm_tag(n) for n in cur}
    kept = [n for n in cur if S.norm_tag(n) in want]
    return [str(want[k])[:60] for k in want if k not in have] + kept


def merge(a: dict, b: dict) -> dict:
    """两份记录按条合并：时间新的赢，一样新按设备 ID 定，保证各设备算出来一样。"""
    out = dict(a)
    for k, e in b.items():
        cur = out.get(k)
        if cur is None or (e.get("t", 0), e.get("d", "")) > (cur.get("t", 0), cur.get("d", "")):
            out[k] = e
    return out


def resolve_exclusive(items: dict) -> None:
    """一个标签只能在收藏 / 反感 / 拉黑其中一种，作者只能收藏或拉黑其中一种。
    两台设备各自把同一个标签放进了不同名单时，留最后改的那一边。"""
    for kinds in (("fav-tags", "fav-dislikes", "black-tags"), ("fav-authors", "black-authors")):
        by: dict[str, list[str]] = {}
        for kind in kinds:
            for k, e in items.items():
                if k.startswith(kind + "|") and e.get("v") is not None:
                    by.setdefault(k[len(kind) + 1:], []).append(k)
        for keys in by.values():
            if len(keys) < 2:
                continue
            keys.sort(key=lambda k: (items[k].get("t", 0), items[k].get("d", "")))
            win = items[keys[-1]]
            for k in keys[:-1]:
                items[k] = {"v": None, "t": win["t"], "d": win.get("d", "")}


def _prune(items: dict, now: float) -> dict:
    return {k: e for k, e in items.items()
            if e.get("v") is not None or now - e.get("t", 0) < TOMBSTONE_KEEP}


# ============================================================ 同步
def _snapshot_path() -> Path:
    return S.DOWNLOAD_DIR.parent / "sync_state.json"


def _load_snapshot() -> dict:
    try:
        return json.loads(_snapshot_path().read_text("utf-8"))
    except Exception:
        return {"items": {}, "ignored": []}


def _save_snapshot(snap: dict) -> None:
    _snapshot_path().write_text(json.dumps(snap, ensure_ascii=False), "utf-8")


def local_changed() -> bool:
    snap = _load_snapshot()
    old = {k: e.get("v") for k, e in snap.get("items", {}).items() if _synced(k) and e.get("v") is not None}
    return local_map() != old


def sync_once() -> dict:
    """同步一轮：本机改动记成记录 → 拉云端 → 合并 → 推回去 → 写回本机 → 处理发给本机的书。"""
    global _last_pull
    if not enabled():
        return {"error": "还没开启同步"}
    with _SYNC_LOCK:
        _status.update(busy=True, last_try=time.time())
        try:
            c = cfg()
            me = device_id()
            now = time.time()
            dav = _dav()
            snap = _load_snapshot()
            base = snap.get("items", {})
            local = local_map()
            mine = dict(base)
            for k in set(local) | {k for k in base if _synced(k)}:
                old = base.get(k)
                lv = local.get(k)
                if (old.get("v") if old else None) != lv:
                    # 本机的改动至少要比它所基于的那个版本新：设备之间时钟不准时，也不会被旧值盖回去
                    t = max(now, (old.get("t", 0) if old else 0) + 0.001)
                    mine[k] = {"v": lv, "t": t, "d": me}
            mine.update(_outbox)
            mine[f"device|{me}"] = {"v": {"name": device_name(), "seen": now}, "t": now, "d": me}

            dav.ensure_dirs()
            blob = dav.get(STATE_FILE)
            remote = json.loads(decrypt_bytes(blob, c["passphrase"])) if blob else {"items": {}}
            merged = merge(remote.get("items", {}), mine)
            resolve_exclusive(merged)
            merged = _prune(merged, now)
            if merged != remote.get("items"):
                dav.put(STATE_FILE, encrypt_bytes(json.dumps({"v": 1, "items": merged}, ensure_ascii=False)
                                                  .encode("utf-8"), c["passphrase"]))
            _outbox.clear()
            apply_items(merged)
            snap["items"] = merged
            _save_snapshot(snap)
            _last_pull = now
            _status.update(last_ok=now, error="")
        except (DavError, BadPassphrase) as e:
            _status["error"] = str(e)
            return {"error": str(e)}
        except Exception as e:
            _status["error"] = f"同步出错：{e}"
            return {"error": _status["error"]}
        finally:
            _status["busy"] = False
    threading.Thread(target=_handle_transfers, daemon=True).start()
    return {"ok": True}


def _loop() -> None:
    time.sleep(6)
    while True:
        try:
            if enabled() and (local_changed() or time.time() - _last_pull > PULL_EVERY):
                sync_once()
        except Exception:
            pass
        time.sleep(SYNC_EVERY)


def status() -> dict:
    snap = _load_snapshot()
    items = snap.get("items", {})
    me = cfg().get("device_id", "")
    devices = [{"id": k[7:], "name": e["v"].get("name", ""), "seen": e["v"].get("seen", 0), "me": k[7:] == me}
               for k, e in items.items() if k.startswith("device|") and e.get("v")]
    devices.sort(key=lambda d: (not d["me"], -d["seen"]))
    on_shelf = {b["id"] for b in S.build_shelf()}
    ignored = set(snap.get("ignored", []))
    missing = [{"id": i, "name": n} for i, n in _values(items, "shelf|").items()
               if i not in on_shelf and i not in ignored]
    incoming = [e["v"] for k, e in items.items()
                if k.startswith("transfer|") and e.get("v") and e["v"].get("to") == me]
    c = cfg()
    out = {
        "enabled": enabled(), "user": c.get("user", ""), "url": c.get("url") or JIANGUOYUN_URL,
        "device_name": device_name(), "device_id": me, "has_password": bool(c.get("password")),
        "last_ok": _status["last_ok"], "error": _status["error"], "busy": _status["busy"],
        "devices": devices, "missing": missing, "incoming": len(incoming),
        "received": list(_status["received"]), "jobs": list(JOBS.values()),
    }
    _status["received"].clear()
    return out


def configure(body: dict) -> dict:
    """保存网盘账号和同步密码：先试连一次（顺便检查同步密码和云端已有的对不对得上）再保存。"""
    c = cfg()
    user = str(body.get("user", c.get("user", ""))).strip()
    password = str(body.get("password") or c.get("password", "")).strip()
    passphrase = str(body.get("passphrase") or c.get("passphrase", ""))
    url = str(body.get("url") or c.get("url") or JIANGUOYUN_URL).strip()
    if not user or not password:
        return {"error": "请填网盘账号和应用密码"}
    if len(passphrase) < 6:
        return {"error": "同步密码至少 6 位"}
    try:
        dav = Dav(url, user, password)
        dav.ensure_dirs()
        blob = dav.get(STATE_FILE)
        if blob:
            decrypt_bytes(blob, passphrase)
    except (DavError, BadPassphrase) as e:
        return {"error": str(e)}
    c.update(enabled=True, user=user, password=password, passphrase=passphrase, url=url,
             device_name=str(body.get("device_name") or device_name()).strip()[:20])
    _save_cfg(c)
    device_id()
    return sync_once()


def disable() -> dict:
    c = cfg()
    c["enabled"] = False
    _save_cfg(c)
    return {"ok": True}


def ignore_missing(ids: list[str]) -> dict:
    snap = _load_snapshot()
    snap["ignored"] = list({*snap.get("ignored", []), *[re.sub(r"\D", "", str(i)) for i in ids]})[-5000:]
    _save_snapshot(snap)
    return {"ok": True}


# ============================================================ 书包（云端和局域网共用）
def pack_book(album_id: str, dst: Path, job: dict | None = None) -> None:
    """一本书打成 ZIP（不压缩，图片本来就压过）：meta.json + 各话图片。"""
    album_dir = S.DOWNLOAD_DIR / album_id
    meta = S.read_meta(album_dir)
    meta.setdefault("name", S.album_summary(album_dir)["name"] if S.album_summary(album_dir) else "")
    meta["id"] = album_id
    meta["local"] = bool(meta.get("local")) or S.is_local_id(album_id)
    files = [(ch.name, f) for ch in S.chapter_dirs(album_dir) for f in S.page_files(ch)]
    if job is not None:
        job["total"] = len(files)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_STORED) as z:
        z.writestr("meta.json", json.dumps(meta, ensure_ascii=False))
        for ch, f in files:
            z.write(f, f"{ch}/{f.name}")
            if job is not None:
                job["done"] += 1


def install_package(src: Path) -> dict:
    """收到的书包放进书架。JM 下载的书书架上已经有就跳过；本地导入的换一个本机的新 ID。"""
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        meta = json.loads(z.read("meta.json").decode("utf-8")) if "meta.json" in names else {}
        pages = [n for n in names if re.fullmatch(r"\d+/[^/\\]+", n)
                 and Path(n).suffix.lower() in S.IMAGE_SUFFIXES]
        if not pages:
            raise ValueError("书包里没有图片")
        src_id = re.sub(r"\D", "", str(meta.get("id", "")))
        local = bool(meta.get("local")) or not src_id or S.is_local_id(src_id)
        if not local and (S.DOWNLOAD_DIR / src_id).is_dir():
            return {"id": src_id, "name": meta.get("name", ""), "skipped": True}
        tmp = Path(tempfile.mkdtemp(dir=S.DOWNLOAD_DIR.parent))
        try:
            for n in pages:
                target = tmp / n
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(n) as fi, open(target, "wb") as fo:
                    shutil.copyfileobj(fi, fo)
            with S._IMPORT_LOCK:
                album_id = S._new_local_id() if local else src_id
                meta.update(id=album_id, added_at=time.time())
                if local:
                    meta["local"] = True
                (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
                os.replace(tmp, S.DOWNLOAD_DIR / album_id)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return {"id": album_id, "name": meta.get("name", ""), "pages": len(pages)}


# ============================================================ 传书任务
JOBS: dict[str, dict] = {}


def _new_job(kind: str, name: str) -> dict:
    job = {"id": uuid.uuid4().hex[:10], "kind": kind, "name": name, "state": "running",
           "stage": "打包", "done": 0, "total": 0, "error": "", "t": time.time()}
    JOBS[job["id"]] = job
    for k in [k for k, j in JOBS.items() if time.time() - j["t"] > 3600 and j["state"] != "running"]:
        JOBS.pop(k, None)
    return job


def _tmpdir() -> Path:
    d = S.DOWNLOAD_DIR.parent / "sync_tmp"
    d.mkdir(exist_ok=True)
    return d


def send_cloud(album_id: str, to: str) -> dict:
    """打包 → 加密 → 传到网盘 books/，再在同步记录里登记「给某台设备的书」。对方同步时自动收下并删掉云端那份。"""
    if not enabled():
        return {"error": "还没开启同步"}
    album_dir = S.DOWNLOAD_DIR / album_id
    summary = S.album_summary(album_dir) if album_id and album_dir.is_dir() else None
    if not summary:
        return {"error": "书架上没有这本"}
    job = _new_job("cloud", summary["name"])

    def run():
        tid = uuid.uuid4().hex
        zp, ep = _tmpdir() / f"{tid}.zip", _tmpdir() / f"{tid}.bin"
        try:
            pack_book(album_id, zp, job)
            job.update(stage="加密", done=0, total=1)
            encrypt_file(zp, ep, cfg()["passphrase"])
            size = ep.stat().st_size
            job.update(stage="上传", done=0, total=size)
            _dav().put_file(f"books/{tid}.bin", ep, lambda n: job.__setitem__("done", job["done"] + n))
            _outbox[f"transfer|{tid}"] = {"v": {"id": tid, "name": summary["name"], "pages": summary["pages"],
                                                 "size": size, "from": device_id(), "from_name": device_name(),
                                                 "to": to, "t": time.time()},
                                          "t": time.time(), "d": device_id()}
            job["stage"] = "登记"
            res = sync_once()
            if res.get("error"):
                raise RuntimeError(res["error"])
            job.update(state="done", stage="已发出")
        except Exception as e:
            job.update(state="error", error=str(e))
        finally:
            zp.unlink(missing_ok=True)
            ep.unlink(missing_ok=True)

    threading.Thread(target=run, daemon=True).start()
    return job


def _handle_transfers() -> None:
    """同步后：收下发给本机的书；清掉自己发出、7 天都没人收的。"""
    items = _load_snapshot().get("items", {})
    me = device_id()
    done_any = False
    for k, e in items.items():
        v = e.get("v")
        if not k.startswith("transfer|") or not v:
            continue
        tid = v.get("id", "")
        if not re.fullmatch(r"[0-9a-f]{32}", tid):
            continue
        if v.get("to") == me:
            job = _new_job("receive", v.get("name", ""))
            ep, zp = _tmpdir() / f"{tid}.bin", _tmpdir() / f"{tid}.zip"
            try:
                job.update(stage="下载", total=v.get("size", 0))
                if not _dav().get_to_file(f"books/{tid}.bin", ep, lambda n: job.__setitem__("done", job["done"] + n)):
                    raise RuntimeError("云端找不到这本（可能已经收过了）")
                job["stage"] = "解密"
                decrypt_file(ep, zp, cfg()["passphrase"])
                res = install_package(zp)
                _status["received"].append({"name": res.get("name") or v.get("name", ""), "from": v.get("from_name", ""),
                                            "skipped": bool(res.get("skipped")), "id": res.get("id")})
                _dav().delete(f"books/{tid}.bin")
                job.update(state="done", stage="已收下")
            except Exception as ex:
                job.update(state="error", error=str(ex))
                continue
            finally:
                ep.unlink(missing_ok=True)
                zp.unlink(missing_ok=True)
        elif v.get("from") == me and time.time() - v.get("t", 0) > TRANSFER_EXPIRE:
            try:
                _dav().delete(f"books/{tid}.bin")
            except Exception:
                continue
        else:
            continue
        _outbox[k] = {"v": None, "t": time.time(), "d": me}
        done_any = True
    if done_any:
        sync_once()


# ============================================================ 局域网直传
_lan: dict = {"server": None, "code": "", "port": 0, "until": 0.0, "received": []}


class _LanHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, data: dict, code: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _code_ok(self) -> bool:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        return bool(_lan["code"]) and secrets.compare_digest((q.get("code") or [""])[0], _lan["code"])

    def do_GET(self):
        if not self.path.startswith("/lan/ping") or not self._code_ok():
            return self._json({"error": "配对码不对"}, 403)
        _lan["until"] = time.time() + LAN_IDLE
        self._json({"name": device_name()})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not self.path.startswith("/lan/book") or not self._code_ok():
            self.rfile.read(min(length, 1 << 20))
            return self._json({"error": "配对码不对"}, 403)
        _lan["until"] = time.time() + LAN_IDLE
        zp = _tmpdir() / f"lan-{uuid.uuid4().hex}.zip"
        try:
            with open(zp, "wb") as fo:
                left = length
                while left > 0:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk:
                        break
                    fo.write(chunk)
                    left -= len(chunk)
            if left:
                return self._json({"error": "传输中断"}, 400)
            res = install_package(zp)
            _lan["received"].append({"name": res.get("name", ""), "skipped": bool(res.get("skipped")),
                                     "id": res.get("id")})
            _status["received"].append({"name": res.get("name", ""), "from": "局域网",
                                        "skipped": bool(res.get("skipped")), "id": res.get("id")})
            self._json({"ok": True, **res})
        except Exception as e:
            self._json({"error": str(e)}, 400)
        finally:
            zp.unlink(missing_ok=True)


def lan_start() -> dict:
    if not _lan["server"]:
        srv = None
        for port in (LAN_PORT, 0):
            try:
                srv = ThreadingHTTPServer(("0.0.0.0", port), _LanHandler)
                break
            except OSError:
                continue
        if not srv:
            return {"error": "开不了接收端口"}
        _lan.update(server=srv, port=srv.server_address[1], code=f"{secrets.randbelow(10 ** 6):06d}", received=[],
                    until=time.time() + LAN_IDLE)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        threading.Thread(target=_lan_watchdog, args=(srv,), daemon=True).start()
    _lan["until"] = time.time() + LAN_IDLE
    return lan_status()


def _lan_watchdog(srv) -> None:
    while _lan["server"] is srv:
        if time.time() > _lan["until"]:
            lan_stop()
            break
        time.sleep(5)


def lan_stop() -> dict:
    srv = _lan["server"]
    _lan.update(server=None, code="")
    if srv:
        threading.Thread(target=srv.shutdown, daemon=True).start()
    return {"ok": True}


def lan_status() -> dict:
    return {"running": bool(_lan["server"]), "ip": S.local_ip(), "port": _lan["port"], "code": _lan["code"],
            "name": device_name(), "received": list(_lan["received"])}


def lan_send(album_id: str, addr: str, code: str) -> dict:
    album_dir = S.DOWNLOAD_DIR / album_id
    summary = S.album_summary(album_dir) if album_id and album_dir.is_dir() else None
    if not summary:
        return {"error": "书架上没有这本"}
    addr = addr.strip().replace("http://", "").rstrip("/")
    host, _, port = addr.partition(":")
    if not re.fullmatch(r"[\w.\-]+", host or ""):
        return {"error": "地址不对，形如 192.168.1.5:18640"}
    port = int(port) if port.isdigit() else LAN_PORT
    code = re.sub(r"\D", "", code)
    try:
        conn = http.client.HTTPConnection(host, port, timeout=5)
        conn.request("GET", f"/lan/ping?code={code}")
        r = conn.getresponse()
        info = json.loads(r.read() or b"{}")
        if r.status != 200:
            return {"error": info.get("error") or "对方拒绝了"}
    except OSError:
        return {"error": "连不上对方：确认两台设备在同一个 Wi-Fi，对方已经点了「开始接收」"}
    job = _new_job("lan", summary["name"])
    job["to_name"] = info.get("name", "")

    def run():
        zp = _tmpdir() / f"lan-send-{uuid.uuid4().hex}.zip"
        try:
            pack_book(album_id, zp, job)
            size = zp.stat().st_size
            job.update(stage="发送", done=0, total=size)
            c = http.client.HTTPConnection(host, port, timeout=120)
            c.putrequest("POST", f"/lan/book?code={code}")
            c.putheader("Content-Type", "application/zip")
            c.putheader("Content-Length", str(size))
            c.endheaders()
            with open(zp, "rb") as fp:
                while chunk := fp.read(1 << 20):
                    c.send(chunk)
                    job["done"] += len(chunk)
            r = c.getresponse()
            res = json.loads(r.read() or b"{}")
            if r.status != 200:
                raise RuntimeError(res.get("error") or f"对方返回 {r.status}")
            job.update(state="done", stage="对方已收下" if not res.get("skipped") else "对方书架上已经有了")
        except Exception as e:
            job.update(state="error", error=str(e))
        finally:
            zp.unlink(missing_ok=True)

    threading.Thread(target=run, daemon=True).start()
    return job


# ============================================================ 路由（server.py 的 Handler 转过来）
def route(h, method: str, path: str) -> bool:
    q = urllib.parse.parse_qs(urllib.parse.urlparse(h.path).query)
    body = h.body_json() if method == "POST" else {}
    if path == "/api/sync/status":
        h.send_json(status())
    elif path == "/api/sync/config" and method == "POST":
        res = configure(body)
        h.send_json(res, 400 if res.get("error") else 200)
    elif path == "/api/sync/now" and method == "POST":
        res = sync_once()
        h.send_json(res, 400 if res.get("error") else 200)
    elif path == "/api/sync/disable" and method == "POST":
        h.send_json(disable())
    elif path == "/api/sync/ignore" and method == "POST":
        h.send_json(ignore_missing(body.get("ids") or []))
    elif path == "/api/sync/send" and method == "POST":
        res = send_cloud(re.sub(r"\D", "", str(body.get("id", ""))), str(body.get("to", "")))
        h.send_json(res, 400 if res.get("error") else 200)
    elif path == "/api/lan/start" and method == "POST":
        h.send_json(lan_start())
    elif path == "/api/lan/stop" and method == "POST":
        h.send_json(lan_stop())
    elif path == "/api/lan/status":
        h.send_json(lan_status())
    elif path == "/api/lan/send" and method == "POST":
        res = lan_send(re.sub(r"\D", "", str(body.get("id", ""))), str(body.get("addr", "")), str(body.get("code", "")))
        h.send_json(res, 400 if res.get("error") else 200)
    elif path == "/api/xfer":
        job = JOBS.get((q.get("id") or [""])[0])
        h.send_json(job or {"state": "none"})
    else:
        return False
    return True
