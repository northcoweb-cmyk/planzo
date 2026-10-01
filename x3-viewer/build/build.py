#!/usr/bin/env python3
"""Build the standalone BMW X3 viewer.

Reads reference-sheet.png (the 4-view contact sheet), cuts the photo panels
into JPEG textures, inlines them together with three.js and writes
../bmw-x3-viewer.html (one self-contained file, no network needed).

Usage:  python3 build.py [reference-sheet.png]
Requires: pillow
"""
import base64, io, os, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "reference-sheet.png")
OUT = os.path.join(HERE, "..", "bmw-x3-viewer.html")

im = Image.open(SRC).convert("RGB")
assert im.size == (1536, 1024), "calibration below assumes the 1536x1024 sheet"

# Panels (x0, y0, x1, y1) in sheet pixels. Calibration constants in the
# template are expressed in the *local* pixel space of these crops.
PANELS = {
    "front": (0, 0, 768, 475),
    "rear": (768, 0, 1536, 475),
    "left": (0, 476, 768, 810),
    "right": (768, 476, 1536, 810),
}


def bg_fill(img, box):
    """Paint over a caption with the surrounding background colour."""
    x0, y0, x1, y1 = box
    px = img.getpixel((x1 + 6, y1 + 6))
    ImageDraw.Draw(img).rectangle(box, fill=px)


def jpeg_b64(img, q=90):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=q, optimize=True, subsampling=0)
    return base64.b64encode(buf.getvalue()).decode()


tex = {}
for name, box in PANELS.items():
    c = im.crop(box)
    # blank the "FRONT VIEW" etc. captions (top-left of each panel)
    bg_fill(c, (10, 8, 190, 42) if name in ("front", "rear") else (10, 8, 190, 42))
    tex[name] = c

# Privacy variant of the rear panel: licence plate blurred out.
rear_priv = tex["rear"].copy()
plate = (316, 188, 414, 240)  # local px in rear panel
region = rear_priv.crop(plate).filter(ImageFilter.GaussianBlur(9))
region = Image.blend(region, Image.new("RGB", region.size, (150, 150, 150)), 0.55)
rear_priv.paste(region, plate)

# Wheel face: elliptical rim in the detail crop -> stretched to a square.
wcx, wcy, wrx, wry = 1271.75, 899.25, 61.0, 66.5   # 1.5% margin around the measured rim ellipse
wheel = im.crop(
    (round(wcx - wrx), round(wcy - wry), round(wcx + wrx), round(wcy + wry))
).resize((256, 256), Image.LANCZOS)

assets = {
    "TEX_LEFT": jpeg_b64(tex["left"]),
    "TEX_RIGHT": jpeg_b64(tex["right"]),
    "TEX_FRONT": jpeg_b64(tex["front"]),
    "TEX_REAR": jpeg_b64(tex["rear"]),
    "TEX_REAR_PRIVATE": jpeg_b64(rear_priv),
    "TEX_WHEEL": jpeg_b64(wheel, 92),
}

with open(os.path.join(HERE, "viewer.template.html"), encoding="utf-8") as f:
    html = f.read()
with open(os.path.join(HERE, "three.r149.min.js"), encoding="utf-8") as f:
    three = f.read().replace("</script", "<\\/script")

html = html.replace("/*__THREE__*/", three)
for k, v in assets.items():
    html = html.replace("__" + k + "__", "data:image/jpeg;base64," + v)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", os.path.abspath(OUT), round(len(html) / 1024), "KB")
