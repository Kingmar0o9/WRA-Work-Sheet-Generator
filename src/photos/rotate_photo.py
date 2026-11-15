"""Rotate the laid-out kit photo 25 degrees clockwise and extend the grey studio backdrop into the
new corners (push-pull fill from the photo's own backdrop, blended well inside the photo's edge).
usage: rotate_photo.py <in.jpg> <out.png> <check.jpg>"""
import sys, numpy as np
from PIL import Image, ImageFilter
src, out, check = sys.argv[1:4]
im = Image.open(src).convert('RGB'); W, H = im.size
ANG = -25  # Pillow turns counter-clockwise for positive angles, so -25 is clockwise
rot = im.rotate(ANG, resample=Image.BICUBIC, expand=True)
valid = Image.new('L', im.size, 255).rotate(ANG, resample=Image.BILINEAR, expand=True)
a = np.asarray(im).astype(np.float32); fmx, fmn = a.max(2), a.min(2)
subj = Image.fromarray(((~(((fmx - fmn) < 18) & (fmx > 160))) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9))
bb = subj.rotate(ANG, resample=Image.NEAREST, expand=True).getbbox()
cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2; bw, bh = bb[2] - bb[0], bb[3] - bb[1]
fh = max(bh * 1.26, bw * 1.26 * 3 / 4); fw = fh * 4 / 3
x0, y0 = int(round(cx - fw / 2)), int(round(cy - fh / 2)); fw, fh = int(round(fw)), int(round(fh))
def crop(img, mode):
    c = Image.new(mode, (fw, fh), 0); c.paste(img.crop((x0, y0, x0 + fw, y0 + fh))); return c
img = np.asarray(crop(rot, 'RGB')).astype(np.float64)
v = crop(valid, 'L')
known = (np.asarray(v.filter(ImageFilter.MinFilter(41))) > 250).astype(np.float64)  # 20 px inside the edge
def down(x, w):
    h2, w2 = (x.shape[0] + 1) // 2, (x.shape[1] + 1) // 2
    xp = np.zeros((h2 * 2, w2 * 2, 3)); wp = np.zeros((h2 * 2, w2 * 2))
    xp[:x.shape[0], :x.shape[1]] = x * w[..., None]; wp[:w.shape[0], :w.shape[1]] = w
    xs = xp.reshape(h2, 2, w2, 2, 3).sum((1, 3)); ws = wp.reshape(h2, 2, w2, 2).sum((1, 3))
    return xs / np.maximum(ws, 1e-6)[..., None], np.minimum(ws, 1.0)
levels = [(img, known)]
while min(levels[-1][0].shape[:2]) > 2:
    levels.append(down(*levels[-1]))
filled = levels[-1][0]
for x, w in reversed(levels[:-1]):
    u = np.asarray(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).resize((x.shape[1], x.shape[0]), Image.BILINEAR)).astype(np.float64)
    filled = x * w[..., None] + u * (1 - w[..., None])
fill_only = np.asarray(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))).astype(np.float64)
# blend: photo weight reaches 0 about 60 px inside its edge, so no black edge pixels leak in
edge = np.asarray(v.filter(ImageFilter.MinFilter(161)).filter(ImageFilter.GaussianBlur(26))).astype(np.float64)[..., None] / 255
res = img * edge + fill_only * (1 - edge)
rng = np.random.default_rng(7); res += rng.normal(0, 0.75, res.shape) * (1 - edge)
res = np.clip(res, 0, 255).astype(np.uint8)
Image.fromarray(res).save(out)
chk = np.clip((res.astype(np.float32) - res.mean()) * 6 + 128, 0, 255).astype(np.uint8)
small = (fw // 3, fh // 3)
o = Image.new('RGB', (small[0] * 2 + 10, small[1]), 'white')
o.paste(Image.fromarray(res).resize(small), (0, 0)); o.paste(Image.fromarray(chk).resize(small), (small[0] + 10, 0))
o.save(check, quality=85)
print('framed size', (fw, fh))
