"""用 icon_src.webp（天蓝底、举着「JM」牌子的方图）生成网页和安卓的图标。

  python make_icons.py

网页：../web/icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png
安卓：D:\\androidbuild\\jmapp 里的 mipmap-*/ic_launcher*.png，
      自适应图标的背景色写进 values/ic_launcher_background.xml（取原图角上的天蓝色）
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / 'web'
RES = Path(r'D:\androidbuild\jmapp\app\src\main\res')

src = Image.open(HERE / 'icon_src.webp').convert('RGBA')
# 背景色：四个角取平均，自适应图标和留边的地方都用它，接缝看不出来
corners = [src.getpixel(p) for p in [(8, 8), (src.width - 9, 8), (8, src.height - 9), (src.width - 9, src.height - 9)]]
BG = tuple(round(sum(c[i] for c in corners) / 4) for i in range(3)) + (255,)


def compose(size, scale=1.0, shape=None):
    """整张图按 scale 缩放后居中放到 size 大小的背景色画布上；shape 为 'rounded'/'circle' 时裁形状。"""
    ss = size * 4   # 先放大画再缩小，边缘平滑
    canvas = Image.new('RGBA', (ss, ss), BG)
    n = round(ss * scale)
    canvas.alpha_composite(src.resize((n, n), Image.LANCZOS), ((ss - n) // 2, (ss - n) // 2))
    if shape:
        mask = Image.new('L', (ss, ss), 0)
        d = ImageDraw.Draw(mask)
        if shape == 'circle':
            d.ellipse((0, 0, ss - 1, ss - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, ss - 1, ss - 1), radius=ss * 0.2, fill=255)
        out = Image.new('RGBA', (ss, ss), (0, 0, 0, 0))
        out.paste(canvas, (0, 0), mask)
        canvas = out
    return canvas.resize((size, size), Image.LANCZOS)


# ---- 网页
compose(192).save(WEB / 'icon-192.png')
compose(512).save(WEB / 'icon-512.png')
# maskable：系统会裁成圆形或圆角，整张缩一点，牌子边角不被裁掉
compose(512, 0.84).save(WEB / 'icon-maskable-512.png')
compose(180).save(WEB / 'apple-touch-icon.png')

# ---- 安卓
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, k in DENS.items():
    d = RES / f'mipmap-{name}'
    d.mkdir(parents=True, exist_ok=True)
    # 自适应图标前景：108dp 画布，桌面只露出中间 72dp；图放到 76dp，只裁掉一圈天蓝色的边，人物更大
    compose(round(108 * k), 76 / 108).save(d / 'ic_launcher_foreground.png')
    # 旧系统（Android 8 以下）直接用的整张图标
    compose(round(48 * k), shape='rounded').save(d / 'ic_launcher.png')
    compose(round(48 * k), shape='circle').save(d / 'ic_launcher_round.png')

hexbg = '#%02X%02X%02X' % BG[:3]
(RES / 'values' / 'ic_launcher_background.xml').write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">{hexbg}</color>
</resources>
''', 'utf-8')
print('ok', hexbg)
