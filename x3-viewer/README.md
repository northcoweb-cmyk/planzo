# BMW X3 xDrive35i (F25 LCI) – 3D viewer

`bmw-x3-viewer.html` is one self-contained file (~1 MB): three.js, all textures and all code are inlined, no network needed.
Open it in Safari on iPhone (AirDrop / Files / any static host), or in any desktop browser.

**How it is built.** The body is a low-poly hull traced from the side-view silhouette of the reference photos. The four
photos are projected onto that hull in the shader (left/right/front/rear, calibrated on wheel centres, wheelbase, ground
line and body width), so grille, headlights, taillights, badges, plate, door lines, and trim are the photographed pixels.
Real geometry is used where a flat photo would be wrong: wheels/tyres (rim face from your wheel photo), wheel-arch
openings, mirrors, roof rails, roof spoiler, antenna, twin exhaust tips (rear-left, as photographed), hood roundel.

**Controls.** One finger: orbit (unlimited 360° yaw, pitch 1°–87°) with inertia. Two fingers: pinch zoom. Double-tap:
close-up toggle. Desktop: drag, wheel, arrow keys. Buttons: view presets, detail fly-tos, auto-rotate, hide plate, specs.

**Rebuild** (e.g. with higher-resolution photos of the same 1536×1024 sheet layout):
`pip install pillow && python3 build/build.py [sheet.png]`
Panel crop boxes and calibration constants live in `build/build.py` and `build/viewer.template.html` (`CAL`).
