"""安卓版的图片处理：解码、拼图还原、编码全程在 Java 端完成。

背景：
- Chaquopy 的 Pillow 安卓轮子没有 WebP 支持，而禁漫的图片几乎全是 WebP。
- 禁漫的大图原始像素动辄几十 MB，在 Python 和 Java 之间搬运像素极慢
  （实测 2 页要两分钟）。

所以这里让 jmcomic 拿到的"图片"只是一个装着原始字节的占位对象 RawImage，
等到保存时，由 Java 端一次完成：解码 → 拼图还原 → 按目标格式编码 → 写文件。
跨语言传递的只有压缩后的字节，像素一个都不过桥。

挂钩点（都是 jmcomic 的 JmImageTool）：
- open_image：收到字节时返回 RawImage，不解码
- decode_and_save：RawImage 在 Java 端还原并保存
- save_image：RawImage 在 Java 端解码并保存
"""
from __future__ import annotations

import io

# install() 之后才有值
encode_webp = None     # server.py 的保存钩子遇到 PIL 图片存 .webp 时的兜底
small_image = None     # 生成书架缩略图用：按比例缩小解码


class RawImage:
    """还没解码的图片字节，只是个占位；真正的处理都在 Java 端。"""

    def __init__(self, data: bytes):
        self.data = data


def install(quality_getter) -> bool:
    """挂上钩子。quality_getter() 返回当前设置的编码质量。非安卓环境返回 False。"""
    global encode_webp, small_image
    try:
        from java import jclass
    except ImportError:
        return False  # 不在安卓上，PC 版的 Pillow 什么都能做

    from PIL import Image
    from jmcomic.jm_toolkit import JmImageTool

    BitmapFactory = jclass("android.graphics.BitmapFactory")
    Options = jclass("android.graphics.BitmapFactory$Options")
    Bitmap = jclass("android.graphics.Bitmap")
    Config = jclass("android.graphics.Bitmap$Config")
    CompressFormat = jclass("android.graphics.Bitmap$CompressFormat")
    Canvas = jclass("android.graphics.Canvas")
    Rect = jclass("android.graphics.Rect")
    FileOutputStream = jclass("java.io.FileOutputStream")
    ByteArrayOutputStream = jclass("java.io.ByteArrayOutputStream")
    sdk = jclass("android.os.Build$VERSION").SDK_INT
    # 安卓 11 起旧的 WEBP 常量废弃，有损压缩要用 WEBP_LOSSY
    webp = CompressFormat.WEBP_LOSSY if sdk >= 30 else CompressFormat.WEBP

    def target_format(path: str):
        low = path.lower()
        if low.endswith(".webp"):
            return webp
        if low.endswith(".png"):
            return CompressFormat.PNG
        return CompressFormat.JPEG

    def decode(data: bytes):
        bitmap = BitmapFactory.decodeByteArray(data, 0, len(data))
        if bitmap is None:
            raise OSError("安卓无法解码这张图片")
        return bitmap

    def write(bitmap, path: str) -> None:
        stream = FileOutputStream(path)
        try:
            if not bitmap.compress(target_format(path), int(quality_getter()), stream):
                raise OSError("安卓编码图片失败")
        finally:
            stream.close()

    def descramble_and_save(data: bytes, num: int, path: str) -> None:
        """和 jmcomic 的 decode_and_save 同一套算法：横切成 num 条，倒序拼回。"""
        src = decode(data)
        out = src
        try:
            if num > 0:
                w, h = src.getWidth(), src.getHeight()
                out = Bitmap.createBitmap(w, h, Config.ARGB_8888)
                canvas = Canvas(out)
                over = h % num
                for i in range(num):
                    move = h // num
                    y_src = h - move * (i + 1) - over
                    y_dst = move * i
                    if i == 0:
                        move += over
                    else:
                        y_dst += over
                    canvas.drawBitmap(src, Rect(0, y_src, w, y_src + move),
                                      Rect(0, y_dst, w, y_dst + move), None)
            write(out, path)
        finally:
            if out is not src:
                out.recycle()
            src.recycle()

    def to_pil(bitmap, quality: int = 92) -> Image.Image:
        # 只在少数场合需要 PIL 图片（缩略图、兜底），用 JPEG 字节中转，体积小、传得快
        buf = ByteArrayOutputStream()
        bitmap.compress(CompressFormat.JPEG, quality, buf)
        return Image.open(io.BytesIO(bytes(buf.toByteArray())))

    # ---------------------------------------------------------------- 钩子
    orig_open = JmImageTool.open_image.__func__
    orig_decode_save = JmImageTool.decode_and_save.__func__
    orig_save = JmImageTool.save_image.__func__

    def open_image(cls, fp):
        if isinstance(fp, (bytes, bytearray)):
            return RawImage(bytes(fp))      # 不解码，留给 Java 端
        if isinstance(fp, str):
            bitmap = BitmapFactory.decodeFile(fp)
            if bitmap is not None:
                try:
                    return to_pil(bitmap)
                finally:
                    bitmap.recycle()
        return orig_open(cls, fp)

    def decode_and_save(cls, num, img_src, decoded_save_path):
        if isinstance(img_src, RawImage):
            return descramble_and_save(img_src.data, int(num), str(decoded_save_path))
        return orig_decode_save(cls, num, img_src, decoded_save_path)

    def save_image(cls, image, filepath):
        if isinstance(image, RawImage):
            return descramble_and_save(image.data, 0, str(filepath))
        return orig_save(cls, image, filepath)

    JmImageTool.open_image = classmethod(open_image)
    JmImageTool.decode_and_save = classmethod(decode_and_save)
    JmImageTool.save_image = classmethod(save_image)

    # ---------------------------------------------------------------- 给 server.py 用
    def _encode_webp(image: Image.Image, path: str, quality: int) -> None:
        buf = io.BytesIO()
        image.convert("RGB").save(buf, "JPEG", quality=95)
        bitmap = decode(buf.getvalue())
        try:
            stream = FileOutputStream(path)
            try:
                bitmap.compress(webp, int(quality), stream)
            finally:
                stream.close()
        finally:
            bitmap.recycle()

    def _small_image(path: str, width: int) -> Image.Image:
        """按 2 的倍数缩小解码，几千像素的大图也只解出缩略图大小，快而省内存。"""
        bounds = Options()
        bounds.inJustDecodeBounds = True
        BitmapFactory.decodeFile(path, bounds)
        sample = 1
        while bounds.outWidth // (sample * 2) >= width:
            sample *= 2
        opts = Options()
        opts.inSampleSize = sample
        bitmap = BitmapFactory.decodeFile(path, opts)
        if bitmap is None:
            raise OSError("安卓无法解码这张图片")
        try:
            return to_pil(bitmap, 90)
        finally:
            bitmap.recycle()

    encode_webp = _encode_webp
    small_image = _small_image
    return True
