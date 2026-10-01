#!/usr/bin/env python3
"""Generate PWA icons + iOS splash screens (Pillow). Neutral mark - not a BMW trademark."""
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
BG0, BG1 = (16, 20, 28), (5, 6, 9)
BLUE_A, BLUE_B = (110, 170, 255), (28, 105, 212)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def mark(size, pad=0.0, bg=True, transparent_bg=False):
    """Dark gradient tile with a glowing blue ring + quadrant mark."""
    S = size * 2  # supersample
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bg:
        g = Image.new('RGB', (1, S))
        for y in range(S): g.putpixel((0, y), lerp(BG0, BG1, y / S))
        g = g.resize((S, S))
        im.paste(g, (0, 0))
        # radial blue glow behind the mark
        glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([S*0.2, S*0.2, S*0.8, S*0.8], fill=(40, 100, 220, 120))
        glow = glow.filter(ImageFilter.GaussianBlur(S * 0.09))
        im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    c = S / 2
    r = S * (0.30 - pad * 0.5)
    ring = max(2, int(S * 0.028))
    # ring (gradient via stacked arcs)
    for i in range(ring):
        t = i / max(1, ring - 1)
        col = lerp(BLUE_A, BLUE_B, t) + (255,)
        d.ellipse([c - r + i, c - r + i, c + r - i, c + r - i], outline=col, width=1)
    # neutral SUV side-profile (not a manufacturer mark)
    pts = [(-0.92, 0.22), (-0.95, -0.02), (-0.80, -0.14), (-0.62, -0.30), (-0.40, -0.34), (0.12, -0.35), (0.34, -0.30), (0.56, -0.12), (0.88, -0.02), (0.95, 0.10), (0.92, 0.22)]
    k = ri = r * 0.78
    poly = [(c + x * k, c + y * k * 1.0 + k * 0.02) for x, y in pts]
    d.polygon(poly, fill=(238, 242, 248, 255))
    # window
    win = [(-0.58, -0.12), (-0.38, -0.27), (0.08, -0.28), (0.30, -0.24), (0.46, -0.10)]
    d.polygon([(c + x * k, c + y * k) for x, y in win], fill=(20, 28, 42, 255))
    d.line([c + 0.0 * k, c - 0.27 * k, c + 0.0 * k, c - 0.10 * k], fill=(238, 242, 248, 255), width=max(2, int(S * 0.008)))
    # wheels
    for wx in (-0.52, 0.55):
        cx, cy, wr = c + wx * k, c + 0.24 * k, k * 0.25
        d.ellipse([cx - wr * 1.18, cy - wr * 1.18, cx + wr * 1.18, cy + wr * 1.18], fill=BG1 + (255,))
        d.ellipse([cx - wr, cy - wr, cx + wr, cy + wr], fill=(34, 40, 52, 255), outline=(238, 242, 248, 255), width=max(2, int(S * 0.008)))
        d.ellipse([cx - wr * 0.38, cy - wr * 0.38, cx + wr * 0.38, cy + wr * 0.38], fill=BLUE_A + (255,))
    # light strip under mark
    strip = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    y = c + r * 1.28
    sd.rounded_rectangle([c - r * 0.9, y, c + r * 0.9, y + S * 0.012], radius=S * 0.006, fill=(150, 195, 255, 255))
    glow2 = strip.filter(ImageFilter.GaussianBlur(S * 0.012))
    im = Image.alpha_composite(im, glow2)
    im = Image.alpha_composite(im, strip)
    return im.resize((size, size), Image.LANCZOS)

def save(img, name): img.convert('RGBA' if img.mode == 'RGBA' else 'RGB').save(os.path.join(OUT, name), optimize=True); print('wrote', name)

save(mark(512).convert('RGB'), 'icon-512.png')
save(mark(192).convert('RGB'), 'icon-192.png')
save(mark(180).convert('RGB'), 'apple-touch-icon.png')       # iOS applies its own rounding
save(mark(512, pad=0.18).convert('RGB'), 'icon-maskable-512.png')  # extra safe-zone padding

def splash(w, h):
    im = Image.new('RGB', (w, h), BG1)
    g = Image.new('RGB', (1, h))
    for y in range(h): g.putpixel((0, y), lerp((12, 16, 24), BG1, y / h))
    im.paste(g.resize((w, h)), (0, 0))
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([w*0.1, h*0.30, w*0.9, h*0.62], fill=(40, 100, 220, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.12))
    im = Image.alpha_composite(im.convert('RGBA'), glow).convert('RGB')
    m = mark(int(w * 0.34), bg=False)
    im.paste(m, ((w - m.width) // 2, int(h * 0.40)), m)
    return im

for w, h in [(1290, 2796), (1179, 2556), (1284, 2778), (1170, 2532), (1125, 2436), (750, 1334)]:
    save(splash(w, h), f'splash-{w}x{h}.png')
