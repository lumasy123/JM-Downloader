"""局域网直传：同一个 Wi-Fi 下，把书从一台设备直接传到另一台（不经过任何网盘）。

接收的一方点「开始接收」，在 LAN_PORT 上临时开一个只收书的小服务，显示本机地址和 6 位配对码；
发送的一方填地址和配对码，把书打成 ZIP 直接传过去。15 分钟没动静自动关。
由 server.py 在启动时 init(server 模块)。
"""
from __future__ import annotations

import http.client
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
import urllib.parse
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

S = None   # server 模块，init() 时传进来

LAN_PORT = 18640
LAN_IDLE = 15 * 60


def init(server_module) -> None:
    global S
    S = server_module


def device_name() -> str:
    return "电脑" if os.name == "nt" else "手机"


# ============================================================ 书包
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
    d = S.DOWNLOAD_DIR.parent / "lan_tmp"
    d.mkdir(exist_ok=True)
    return d


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
    if path == "/api/lan/start" and method == "POST":
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
