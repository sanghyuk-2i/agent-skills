#!/usr/bin/env python3
"""manifest.json이 가리키는 표시용 이미지 경로를 NUL로 구분해 출력한다.

    manifest-images.py <manifest.json> <out-dir>

sideBySide/before/after만 낸다. raw 원본과 박스 크롭은 코멘트에 쓰지 않으므로 올리지 않는다.
"""
import json
import os
import sys

manifest, out_dir = sys.argv[1], sys.argv[2]
routes = json.load(open(manifest))["routes"]

seen = []
for route in routes:
    for key in ("sideBySide", "before", "after"):
        f = route["files"].get(key)
        if f and f not in seen:
            seen.append(f)

for f in seen:
    sys.stdout.write(os.path.join(out_dir, f) + "\0")
