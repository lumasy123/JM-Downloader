"""用 icon_src.webp（天蓝底、举着「JM」牌子的方图）生成网页和安卓的图标。

  python make_icons.py

网页：../web/icon-192.png、icon-512.png（四角小圆角）、icon-maskable-512.png、apple-touch-icon.png（方的，系统自己裁）
安卓：../android/app/src/main/res/mipmap-*/ic_launcher*.png，四角小圆角。
      不用自适应图标：那样形状由桌面决定（常被裁成圆形），和电脑版、安装包的圆角方图对不上
电脑版的 exe、安装包图标由 desktop/build.py 从 icon-512.png 生成，所以也是同一个圆角图
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / 'web'
RES = HERE.parent / 'android' / 'app' / 'src' / 'main' / 'res'
# 圆角半径占边长的比例：小圆角
RADIUS = 0.12

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
            d.rounded_rectangle((0, 0, ss - 1, ss - 1), radius=ss * RADIUS, fill=255)
        out = Image.new('RGBA', (ss, ss), (0, 0, 0, 0))
        out.paste(canvas, (0, 0), mask)
        canvas = out
    return canvas.resize((size, size), Image.LANCZOS)


# ---- 网页
compose(192, shape='rounded').save(WEB / 'icon-192.png')
compose(512, shape='rounded').save(WEB / 'icon-512.png')
# maskable：系统会裁成圆形或圆角，整张缩一点，牌子边角不被裁掉
compose(512, 0.84).save(WEB / 'icon-maskable-512.png')
compose(180).save(WEB / 'apple-touch-icon.png')

# ---- 安卓：只用圆角方图（旧的自适应图标配置删掉）
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, k in DENS.items():
    d = RES / f'mipmap-{name}'
    d.mkdir(parents=True, exist_ok=True)
    img = compose(round(48 * k), shape='rounded')
    img.save(d / 'ic_launcher.png')
    img.save(d / 'ic_launcher_round.png')   # 清单里 roundIcon 也指向同一个圆角图
    (d / 'ic_launcher_foreground.png').unlink(missing_ok=True)
for old in [RES / 'mipmap-anydpi-v26' / 'ic_launcher.xml', RES / 'mipmap-anydpi-v26' / 'ic_launcher_round.xml',
            RES / 'values' / 'ic_launcher_background.xml']:
    old.unlink(missing_ok=True)
anydpi = RES / 'mipmap-anydpi-v26'
if anydpi.exists() and not any(anydpi.iterdir()):
    anydpi.rmdir()
print('ok')
