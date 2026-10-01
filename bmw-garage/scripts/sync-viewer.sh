#!/usr/bin/env bash
# Rebuild the standalone 3D viewer and copy it into the app (served at ./viewer/).
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 x3-viewer/build/build.py
cp x3-viewer/bmw-x3-viewer.html bmw-garage/public/viewer/bmw-x3-viewer.html
echo "viewer synced"
