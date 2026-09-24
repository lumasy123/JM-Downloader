"""把 generated/<拼图>.png（2x2 绿底四个动作）抠成透明图，对齐到和 pet-body 一样的画布。

  python make_poses.py g_emote_v3 happy sad angry surprised
  python make_poses.py g_action_v3 wave explain ok think
  python make_poses.py g_read2_v3 read read-laugh - read-talk
  python make_poses.py g_read3 - - read-shock -
  python make_poses.py g_tease_v3 tease peek giggle read-flip

g_* 这几张是拿 guide_grid.png（原图摆成 2x2）当底图、在原位改动作生成的，
头身比、眼睛大小都被底图锁住；prompts/g_*.txt 是对应的提示词。

名字按 左上、右上、左下、右下 的顺序，输出 ../web/pet-<名字>.webp；写 - 的格子跳过。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / 'web'
SHEET, *NAMES = sys.argv[1:] or ['poses', 'happy', 'sad', '-', 'angry']

body = Image.open(WEB / 'pet-body.webp')
CW, CH = body.size
bal = np.asarray(body)[..., 3]
bys, bxs = np.nonzero(bal > 8)
# 原图角色在画布里的高度（小鲸鱼顶到脚底），新图按这个高度缩放
TARGET_H = bys.max() - bys.min() + 1
FOOT = bys.max()

sheet = np.asarray(Image.open(HERE / 'generated' / f'{SHEET}.png').convert('RGB')).astype(np.float32)
r, g, b = sheet[..., 0], sheet[..., 1], sheet[..., 2]
spill = g - np.maximum(r, b)
alpha = np.clip(1 - (spill - 25) / 90, 0, 1)
# 去绿边：半透明边缘的绿色压回去
g2 = np.where(spill > 0, np.maximum(r, b) + np.clip(spill, 0, None) * alpha * 0.3, g)
rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)

H, W = alpha.shape
cells = [(0, 0), (W // 2, 0), (0, H // 2), (W // 2, H // 2)]
for name, (x0, y0) in zip(NAMES, cells):
    if name == '-':
        continue
    a = alpha[y0:y0 + H // 2, x0:x0 + W // 2] > 0.5
    # 只留角色本体和靠得近的小东西（z、汗滴），去掉零星噪点
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=12))
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400])
    cell = rgba[y0:y0 + H // 2, x0:x0 + W // 2].copy()
    cell[..., 3] = np.where(keep, cell[..., 3], 0)
    ys, xs = np.nonzero(cell[..., 3] > 8)
    im = Image.fromarray(cell).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = TARGET_H / im.height
    if im.width * s > CW - 4:
        s = (CW - 4) / im.width
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    out.alpha_composite(im, ((CW - im.width) // 2, FOOT + 1 - im.height))
    out.save(WEB / f'pet-{name}.webp', 'WEBP', quality=90, method=6)
    print(name, im.size)

# 预览：原图 + 四个表情并排
done = [n for n in NAMES if n != '-']
prev = Image.new('RGBA', (CW * (len(done) + 1), CH), (40, 40, 52, 255))
prev.alpha_composite(body, (0, 0))
for i, n in enumerate(done):
    prev.alpha_composite(Image.open(WEB / f'pet-{n}.webp'), (CW * (i + 1), 0))
prev.save(HERE / f'preview_{SHEET}.png')
