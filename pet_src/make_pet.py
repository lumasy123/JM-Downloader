"""把原图拆成看板娘用的三层：身体 / 小鲸鱼 / 闭眼贴片，画布大小一致方便叠放。

在本目录运行 python make_pet.py，直接输出到 ../web/pet-*.webp，预览图留在本目录。
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / 'web'
SRC = HERE / 'src.webp'
OUT_H = 420                     # 输出高度（显示约 140px，留 3 倍给高分屏）
SEAM = 272                      # 小鲸鱼层的下沿（原图坐标），往下是头发和鳍
SKIN = np.array([254, 240, 224])
LASH = (88, 44, 40, 255)

im = Image.open(SRC).convert('RGBA')
a = np.asarray(im).astype(np.int32)

# ---- 闭眼贴片：眼睛区域里不像皮肤的像素都盖成皮肤色，再画一道闭眼线
eyes = {
    # 覆盖椭圆（中心、半径，避开头发和耳朵）   闭眼线：左端、中间控制点、右端、眼角小翘
    'L': ((336, 692, 73, 68), (282, 708), (340, 738), (402, 704), 'left'),
    'R': ((570, 688, 75, 70), (508, 700), (572, 736), (640, 700), 'right'),
}
H, W = a.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
fill = a[..., :3].astype(float).copy()
cover = np.zeros((H, W), float)
for (cx, cy, rx, ry), *_ in eyes.values():
    e = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    inside = e <= 1
    # 每一列用椭圆上下边外面的皮肤色做线性过渡，腮红的渐变能保留下来
    # 上边是额头，颜色均匀，直接用肤色；下边往下找第一个像皮肤（含腮红）的像素
    def skinlike(p):
        return p[0] > 235 and p[1] > 180 and p[2] > 170
    for x in range(cx - rx, cx + rx + 1):
        col = np.nonzero(inside[:, x])[0]
        if not len(col):
            continue
        top, bot = col[0] - 4, col[-1] + 4
        c1 = SKIN.astype(float)
        for y in range(bot, bot + 30):
            if skinlike(a[y, x]):
                c1 = a[y:y + 3, x, :3].mean(0)
                break
        t = np.linspace(0, 1, bot - top + 1)[:, None]
        fill[top:bot + 1, x] = SKIN * (1 - t) + c1 * t
    # 横向抹匀，去掉逐列插值留下的竖条纹
    region = np.zeros((H, W), bool)
    region[cy - ry - 8:cy + ry + 8, cx - rx - 8:cx + rx + 8] = True
    for ch in range(3):
        sm = ndimage.gaussian_filter(fill[..., ch], 6)
        fill[..., ch] = np.where(region, sm, fill[..., ch])
    # 边缘羽化：椭圆内全盖，外面几像素渐隐
    cover = np.maximum(cover, np.clip((1.12 - np.sqrt(e)) / 0.12, 0, 1))

SS = 4
patch = Image.fromarray(np.dstack([fill, cover * 255]).astype(np.uint8), 'RGBA')

big = Image.new('RGBA', (im.width * SS, im.height * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(big)
def bez(p0, p1, p2, n=40):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.array, (p0, p1, p2))
    return [tuple(v * SS) for v in ((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2)]
for _, p0, pc, p2, side in eyes.values():
    pts = bez(p0, pc, p2)
    d.line(pts, fill=LASH, width=13 * SS, joint='curve')
    for p in (pts[0], pts[-1]):
        r = 6.5 * SS
        d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=LASH)
    # 外眼角的小睫毛
    ox, oy = (p0 if side == 'left' else p2)
    dx = -1 if side == 'left' else 1
    d.line([(ox * SS, oy * SS), ((ox + dx * 16) * SS, (oy - 12) * SS)], fill=LASH, width=8 * SS)
lines = big.resize(im.size, Image.LANCZOS)
patch.alpha_composite(lines)

# ---- 小鲸鱼：接缝以上的部分单独一层
whale = Image.new('RGBA', im.size, (0, 0, 0, 0))
whale.paste(im.crop((280, 0, 700, SEAM)), (280, 0))

# ---- 统一裁到角色外框，缩放输出
ys, xs = np.nonzero(a[..., 3] > 8)
box = (xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7)
scale = OUT_H / (box[3] - box[1])
size = (round((box[2] - box[0]) * scale), OUT_H)
for name, layer in (('body', im), ('whale', whale), ('blink', patch)):
    out = layer.crop(box).resize(size, Image.LANCZOS)
    out.save(WEB / f'pet-{name}.webp', 'WEBP', quality=90, method=6, exact=False)
print('size', size, 'seam at %.4f of height' % ((SEAM - box[1]) / (box[3] - box[1])),
      'seam-x center %.4f' % ((485 - box[0]) / (box[2] - box[0])))

# 预览：睁眼 / 闭眼 并排
prev = Image.new('RGBA', (size[0] * 2 + 20, OUT_H), (40, 150, 90, 255))
b = Image.open(WEB / 'pet-body.webp'); k = Image.open(WEB / 'pet-blink.webp')
prev.alpha_composite(b, (0, 0)); c = b.copy(); c.alpha_composite(k); prev.alpha_composite(c, (size[0] + 20, 0))
prev.save(HERE / 'preview.png')
full = im.copy(); full.alpha_composite(patch)
bg = Image.new('RGBA', im.size, (40, 150, 90, 255)); bg.alpha_composite(full)
bg.crop((250, 590, 700, 790)).resize((900, 400)).save(HERE / 'preview_eyes.png')
