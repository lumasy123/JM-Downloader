"""服务端的离线测试：名单、评分、笔记、号单导出、搜索语法、缓存、PDF / 压缩、动态、备份。

不联网、不碰真实数据：整个服务跑在临时目录里（JM_CONFIG / JM_DOWNLOAD_DIR 指过去），
用到的「书」是现场画的几张图。在项目根目录运行：

    python -m unittest discover tests -v
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="jmtest-"))
(TMP / "config.json").write_text(json.dumps({"port": 0, "download_dir": str(TMP / "downloads")}), "utf-8")
os.environ["JM_CONFIG"] = str(TMP / "config.json")
os.environ["JM_DOWNLOAD_DIR"] = str(TMP / "downloads")

spec = importlib.util.spec_from_file_location("server", ROOT / "server.py")
srv = importlib.util.module_from_spec(spec)
sys.modules["server"] = srv
spec.loader.exec_module(srv)


def make_book(album_id: str, pages: int = 3, name: str = "测试本", chapters: int = 1) -> Path:
    """在临时书架上画一本书：每页一张渐变 JPEG。"""
    from PIL import Image
    album = srv.DOWNLOAD_DIR / album_id
    for c in range(1, chapters + 1):
        d = album / str(c)
        d.mkdir(parents=True, exist_ok=True)
        for i in range(1, pages + 1):
            im = Image.linear_gradient("L").resize((1600, 2200)).convert("RGB")
            im.save(d / f"{i:05d}.jpg", "JPEG", quality=95)
    (album / "meta.json").write_text(json.dumps({
        "name": name, "author": "作者甲", "tags": ["校服", "全彩"], "complete": True, "added_at": time.time(),
    }, ensure_ascii=False), "utf-8")
    return album


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=20) as r:
            return json.load(r)

    def post(self, path, body):
        req = urllib.request.Request(self.base + path, json.dumps(body).encode(),
                                     {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            return json.load(e)


class TestNames(Base):
    def test_add_remove_dedupe(self):
        res = self.post("/api/names", {"list": "fav", "kind": "tags", "add": ["校服", "Glasses"]})
        self.assertEqual(res["favorites"]["tags"], ["校服", "Glasses"])
        # 大小写不同算同一个，新加的排前面
        res = self.post("/api/names", {"list": "fav", "kind": "tags", "add": ["glasses"]})
        self.assertEqual(len(res["favorites"]["tags"]), 2)
        res = self.post("/api/names", {"list": "fav", "kind": "tags", "remove": ["GLASSES", "校服"]})
        self.assertEqual(res["favorites"]["tags"], [])

    def test_bad_params(self):
        self.assertIn("error", self.post("/api/names", {"list": "x", "kind": "tags"}))
        self.assertIn("error", self.post("/api/names", {"list": "black", "kind": "dislikes"}))

    def test_fav_dislike_exclusive(self):
        self.post("/api/names", {"list": "fav", "kind": "tags", "add": ["NTR", "眼镜"]})
        # 收藏里的标签加进反感：从收藏挪走，并告诉前端挪了哪些
        res = self.post("/api/names", {"list": "fav", "kind": "dislikes", "add": ["ntr"]})
        self.assertEqual(res["favorites"]["tags"], ["眼镜"])
        self.assertEqual(res["favorites"]["dislikes"], ["ntr"])
        self.assertEqual(res["moved"], ["NTR"])
        res = self.post("/api/names", {"list": "fav", "kind": "tags", "add": ["NTR"]})
        self.assertEqual(res["favorites"]["dislikes"], [])
        self.assertEqual(res["moved"], ["ntr"])
        self.post("/api/names", {"list": "fav", "kind": "tags", "remove": ["NTR", "眼镜"]})
        # 拉黑也一样：加进黑名单就从收藏里拿走
        self.post("/api/names", {"list": "fav", "kind": "tags", "add": ["触手"]})
        res = self.post("/api/names", {"list": "black", "kind": "tags", "add": ["触手"]})
        self.assertEqual(res["favorites"]["tags"], [])
        self.assertEqual(res["blacklist"]["tags"], ["触手"])
        res = self.post("/api/names", {"list": "fav", "kind": "dislikes", "add": ["触手"]})
        self.assertEqual(res["blacklist"]["tags"], [])
        self.post("/api/names", {"list": "fav", "kind": "dislikes", "remove": ["触手"]})

    def test_author_keys(self):
        self.assertEqual(srv.author_keys("甲、乙 & 丙"), {"甲、乙 & 丙", "甲", "乙", "丙"})


class TestRatingsNotes(Base):
    def setUp(self):
        make_book("100001")

    def tearDown(self):
        shutil.rmtree(srv.DOWNLOAD_DIR / "100001", ignore_errors=True)

    def test_rating_average_and_criteria(self):
        crit = self.get("/api/ratings")["criteria"]
        self.assertEqual(crit, srv.DEFAULT_CRITERIA)
        self.post("/api/rating", {"id": "100001", "criterion": crit[0], "score": 5})
        res = self.post("/api/rating", {"id": "100001", "criterion": crit[1], "score": 2})
        self.assertEqual(res["rating"], 3.5)
        # 去掉一条标准：那条的分留着，但不算进平均
        self.post("/api/rating/criteria", {"criteria": [crit[0], crit[2]]})
        book = [b for b in self.get("/api/shelf")["items"] if b["id"] == "100001"][0]
        self.assertEqual(book["rating"], 5.0)
        self.assertEqual(book["scores"][crit[1]], 2)
        self.post("/api/rating/criteria", {"criteria": crit})
        # 清掉
        for c in crit:
            self.post("/api/rating", {"id": "100001", "criterion": c, "score": 0})
        self.assertIsNone([b for b in self.get("/api/shelf")["items"] if b["id"] == "100001"][0]["rating"])

    def test_half_star_and_rename(self):
        crit = self.get("/api/ratings")["criteria"]
        self.post("/api/rating", {"id": "100001", "criterion": crit[0], "score": 3.5})
        self.assertEqual(self.get("/api/ratings")["scores"]["100001"][crit[0]], 3.5)
        self.post("/api/rating", {"id": "100001", "criterion": crit[0], "score": 3.3})   # 取到最近的半颗
        self.assertEqual(self.get("/api/ratings")["scores"]["100001"][crit[0]], 3.5)
        res = self.post("/api/rating/criteria/rename", {"from": crit[0], "to": "作画"})
        self.assertEqual(res["criteria"][0], "作画")
        self.assertEqual(self.get("/api/ratings")["scores"]["100001"]["作画"], 3.5)
        self.assertIn("error", self.post("/api/rating/criteria/rename", {"from": "作画", "to": crit[1]}))
        self.post("/api/rating/criteria/rename", {"from": "作画", "to": crit[0]})
        self.post("/api/rating", {"id": "100001", "criterion": crit[0], "score": 0})

    def test_rating_needs_downloaded_book(self):
        self.assertIn("error", self.post("/api/rating", {"id": "999999", "criterion": "画面", "score": 3}))

    def test_rating_removed_with_book(self):
        self.post("/api/rating", {"id": "100001", "criterion": "画面", "score": 4})
        req = urllib.request.Request(self.base + "/api/album?id=100001", method="DELETE")
        urllib.request.urlopen(req, timeout=20).read()
        self.assertNotIn("100001", self.get("/api/ratings")["scores"])

    def test_note(self):
        self.post("/api/note", {"id": "100001", "text": "  第二话好看  "})
        book = [b for b in self.get("/api/shelf")["items"] if b["id"] == "100001"][0]
        self.assertEqual(book["note"], "第二话好看")
        self.post("/api/note", {"id": "100001", "text": ""})
        self.assertNotIn("100001", srv.load_notes())


class TestBookmarks(Base):
    def test_add_remove_and_cleanup(self):
        make_book("100005")
        self.assertEqual(self.post("/api/bookmark", {"id": "100005", "page": 2, "on": True})["pages"], [2])
        self.assertEqual(self.post("/api/bookmark", {"id": "100005", "page": 0, "on": True})["pages"], [0, 2])
        self.assertEqual(self.get("/api/bookmarks?id=100005")["pages"], [0, 2])
        self.assertIn("error", self.post("/api/bookmark", {"id": "100005", "page": -1, "on": True}))
        self.assertIn("error", self.post("/api/bookmark", {"id": "999999", "page": 1, "on": True}))
        backup = json.loads(Path(self.post("/api/backup/export", {})["path"]).read_text("utf-8"))
        self.assertEqual(backup["bookmarks"]["100005"], [0, 2])
        self.assertEqual(self.post("/api/bookmark", {"id": "100005", "page": 0, "on": False})["pages"], [2])
        req = urllib.request.Request(self.base + "/api/album?id=100005", method="DELETE")
        urllib.request.urlopen(req, timeout=20).read()
        self.assertNotIn("100005", srv.load_bookmarks())   # 删书时书签一起删


class TestListExport(Base):
    def test_sections_only_ids(self):
        make_book("100002", name="带标题的本子")
        self.post("/api/names", {"list": "black", "kind": "authors", "add": ["坏作者"]})
        res = self.post("/api/list/export", {"parts": ["shelf", "black"], "file": False})
        text = res["text"]
        self.assertIn("[书架]\nJM100002\n", text)
        self.assertNotIn("带标题的本子", text)          # 只写 JM 号
        self.assertIn("[黑名单·作者]\n坏作者", text)
        self.assertNotIn("收藏", text.split("\n", 2)[2])  # 没勾收藏就没有收藏那段
        self.assertNotIn("path", res)                    # 只要文字就不写文件
        self.post("/api/names", {"list": "black", "kind": "authors", "remove": ["坏作者"]})
        shutil.rmtree(srv.DOWNLOAD_DIR / "100002", ignore_errors=True)


class TestSearchSyntax(unittest.TestCase):
    def test_build_query(self):
        self.assertEqual(srv.build_query("甲 乙", "and"), "+甲 +乙")
        self.assertEqual(srv.build_query("甲 乙", "or"), "甲 乙")
        self.assertEqual(srv.build_query("甲 -乙", "and"), "+甲 -乙")
        self.assertEqual(srv.build_query("单个", "and"), "单个")


class TestInfoCache(unittest.TestCase):
    def test_persist_and_reload(self):
        with srv._INFO_LOCK:
            srv._INFO_CACHE["123"] = {"id": "123", "tags": ["a"], "_t": time.time()}
            srv._INFO_CACHE["old"] = {"id": "old", "tags": [], "_t": time.time() - srv.INFO_TTL - 10}
        srv._save_info_cache()
        loaded = srv._load_info_cache()
        self.assertIn("123", loaded)
        self.assertNotIn("old", loaded)   # 过期的不再读回来


class TestJobs(unittest.TestCase):
    def test_pdf_and_compress(self):
        album = make_book("100003", pages=3)
        out = TMP / "t.pdf"
        job = {"done": 0}
        srv._write_pdf(srv._album_images(album), out, job)
        data = out.read_bytes()
        self.assertTrue(data.startswith(b"%PDF-1.4"))
        self.assertEqual(data.count(b"/Type /Page "), 3)
        try:
            import pypdf
            self.assertEqual(len(pypdf.PdfReader(str(out), strict=True).pages), 3)
        except ImportError:
            pass
        before = sum(f.stat().st_size for f in srv._album_images(album))
        job = {"done": 0, "total": 0, "freed": 0}
        srv._job_compress(album, job)
        after = sum(f.stat().st_size for f in srv._album_images(album))
        self.assertEqual(job["done"], 3)
        self.assertEqual(before - after, job["freed"])
        self.assertLess(after, before)
        shutil.rmtree(album, ignore_errors=True)


class TestImport(Base):
    def upload(self, files):
        token = self.post("/api/import/begin", {})["token"]
        for i, (name, data) in enumerate(files):
            url = f"{self.base}/api/import/file?" + urllib.parse.urlencode({"token": token, "seq": i, "name": name})
            req = urllib.request.Request(url, data, {"Content-Type": "application/octet-stream"})
            with urllib.request.urlopen(req, timeout=30) as r:
                self.assertTrue(json.load(r)["ok"])
        return token

    def jpeg(self, color):
        import io
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (60, 80), color).save(buf, "JPEG")
        return buf.getvalue()

    def shelf_item(self, album_id):
        return [b for b in self.get("/api/shelf")["items"] if b["id"] == album_id][0]

    def test_images_zip_pdf(self):
        import io
        import zipfile
        # 散图：按文件名自然排序（p2 在 p10 前面）
        token = self.upload([("p10.jpg", self.jpeg("red")), ("p2.jpg", self.jpeg("blue"))])
        res = self.post("/api/import/finish", {"token": token, "name": "我的本子", "author": "我", "tags": ["原创"]})
        self.assertEqual(res["pages"], 2)
        album_id = res["id"]
        self.assertTrue(srv.is_local_id(album_id))
        book = self.shelf_item(album_id)
        self.assertTrue(book["local"])
        self.assertEqual((book["name"], book["author"], book["tags"]), ("我的本子", "我", ["原创"]))
        first = srv.DOWNLOAD_DIR / album_id / "1" / "00001.jpg"
        from PIL import Image
        self.assertGreater(Image.open(first).getpixel((5, 5))[2], 200)   # 蓝的（p2）排第一
        self.assertFalse(any(srv.IMPORT_TMP.iterdir()))   # 临时文件清掉了
        # 号单导出不含本地导入的
        exported = self.post("/api/list/export", {"parts": ["shelf"], "file": False})
        self.assertNotIn(f"JM{album_id}", exported.get("text", ""))

        # ZIP 里分了两个文件夹：分成两话；ID 接着往下排
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for folder in ("第1话", "第2话"):
                for k in (1, 2, 3):
                    z.writestr(f"书/{folder}/{k}.jpg", self.jpeg("green"))
            z.writestr("__MACOSX/书/._1.jpg", b"junk")
        res2 = self.post("/api/import/finish", {"token": self.upload([("书.cbz", buf.getvalue())]), "name": ""})
        self.assertEqual((res2["pages"], res2["chapters"]), (6, 2))
        self.assertEqual(int(res2["id"]), int(album_id) + 1)
        detail = self.get("/api/album?id=" + res2["id"])
        self.assertEqual([c["name"] for c in detail["chapters"]], ["第1话", "第2话"])
        self.assertEqual(detail["name"], "第1话")   # 没写书名时用第一话的名字

        # 本 App 导出的 PDF 能原样导回来
        pdf = TMP / "imp.pdf"
        srv._write_pdf(srv._album_images(srv.DOWNLOAD_DIR / res2["id"]), pdf, {"done": 0})
        res3 = self.post("/api/import/finish", {"token": self.upload([("导出.pdf", pdf.read_bytes())]), "name": "PDF"})
        self.assertEqual(res3["pages"], 6)

        # 不支持的文件
        bad = self.post("/api/import/finish", {"token": self.upload([("a.txt", b"hi")]), "name": "x"})
        self.assertIn("error", bad)
        # 本地导入的可以改书名、作者、标签
        edited = self.post("/api/album/meta", {"id": album_id, "name": "新名字", "author": "作者乙", "tags": ["纯爱", "纯爱", "彩色"]})
        self.assertEqual((edited["name"], edited["tags"]), ("新名字", ["纯爱", "彩色"]))
        self.assertEqual(self.shelf_item(album_id)["author"], "作者乙")
        for i in (album_id, res2["id"], res3["id"]):
            shutil.rmtree(srv.DOWNLOAD_DIR / i, ignore_errors=True)


class TestGroupsAndListExtras(Base):
    def test_by_author_and_list_sections(self):
        for i, author in [("100011", "甲、乙"), ("100012", "甲"), ("100013", "丙")]:
            make_book(i, pages=1)
            meta = srv.DOWNLOAD_DIR / i / "meta.json"
            m = json.loads(meta.read_text("utf-8"))
            m["author"] = author
            meta.write_text(json.dumps(m, ensure_ascii=False), "utf-8")
        res = self.post("/api/group/by-author", {})
        self.assertEqual((res["created"], res["moved"]), (1, 2))   # 丙只有一本，不分
        groups = srv.load_groups()
        self.assertEqual(groups["assign"].get("100011"), "甲")
        self.assertNotIn("100013", groups["assign"])
        self.post("/api/rating", {"id": "100011", "criterion": "画面", "score": 4.5})
        self.post("/api/note", {"id": "100012", "text": "好看\n第二行"})
        text = self.post("/api/list/export", {"parts": ["groups", "ratings"], "file": False})["text"]
        self.assertIn("[分组]\n甲\tJM100011 JM100012", text.replace("JM100012 JM100011", "JM100011 JM100012"))
        self.assertIn("JM100011\t画面 4.5", text)
        self.assertIn("JM100012\t\t好看 第二行", text)
        # 只有本地导入的书能改信息
        self.assertIn("error", self.post("/api/album/meta", {"id": "100011", "tags": ["x"]}))
        for i in ("100011", "100012", "100013"):
            self.post("/api/rating", {"id": i, "criterion": "画面", "score": 0})
            self.post("/api/note", {"id": i, "text": ""})
            shutil.rmtree(srv.DOWNLOAD_DIR / i, ignore_errors=True)
        srv.save_groups({"groups": [], "assign": {}})


class TestFeedAndBackup(Base):
    def test_dismiss_and_seen(self):
        self.post("/api/feed/dismiss", {"id": "555"})
        self.post("/api/feed/seen", {"ids": ["555", "u:1:3"]})
        data = srv.load_feed()
        self.assertIn("555", data["dismissed"])
        self.assertIn("u:1:3", data["seen"])
        keep = srv._feed_keep()
        self.assertFalse(keep({"id": "555", "author": "", "updated": 0}))
        self.assertTrue(keep({"id": "556", "author": "", "updated": 0}))

    def test_backup_roundtrip(self):
        make_book("100004")
        self.post("/api/names", {"list": "fav", "kind": "authors", "add": ["作者甲"]})
        self.post("/api/rating", {"id": "100004", "criterion": "画面", "score": 4})
        self.post("/api/note", {"id": "100004", "text": "备份测试"})
        res = self.post("/api/backup/export", {"progress": {"100004": 3}, "opens": {"100004": 7}})
        backup = json.loads(Path(res["path"]).read_text("utf-8"))
        self.assertEqual(backup["favorites"]["authors"], ["作者甲"])
        self.assertEqual(backup["ratings"]["scores"]["100004"]["画面"], 4)
        self.assertEqual(backup["notes"]["100004"], "备份测试")
        self.assertEqual(backup["opens"]["100004"], 7)
        # 清空后导回去
        self.post("/api/names", {"list": "fav", "kind": "authors", "remove": ["作者甲"]})
        self.post("/api/note", {"id": "100004", "text": ""})
        self.post("/api/rating", {"id": "100004", "criterion": "画面", "score": 0})
        back = self.post("/api/backup/import", backup)
        self.assertEqual(back["opens"]["100004"], 7)
        self.assertEqual(srv.load_favorites()["authors"], ["作者甲"])
        self.assertEqual(srv.load_notes()["100004"], "备份测试")
        self.assertEqual(srv.load_ratings()["scores"]["100004"]["画面"], 4)
        # 收拾干净，别影响别的用例
        self.post("/api/names", {"list": "fav", "kind": "authors", "remove": ["作者甲"]})
        self.post("/api/note", {"id": "100004", "text": ""})
        self.post("/api/rating", {"id": "100004", "criterion": "画面", "score": 0})
        shutil.rmtree(srv.DOWNLOAD_DIR / "100004", ignore_errors=True)


class TestStatic(Base):
    def test_web_files_served(self):
        for name in ("lists.js", "app.js", "feed.js", "io.js", "pet.js", "mask.js", "pet-lines.json"):
            with urllib.request.urlopen(f"{self.base}/{name}", timeout=20) as r:
                self.assertEqual(r.status, 200, name)

    def test_backups_no_escape(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/backups/..%2Fconfig.json", timeout=20)
        ctx.exception.close()


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
