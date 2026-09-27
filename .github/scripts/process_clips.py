#!/usr/bin/env python3
"""Extract labelled sub-clips from a project's source video.

Triggered by the admin's `repository_dispatch: process-clips` event. Reads the
client payload, trims each clip with ffmpeg (frame-accurate seek + re-encode),
writes the result to assets/clips/<slug>-<i>.mp4, and records the path back on
the matching clip in data.json. The workflow commits whatever changed.

Times accept either "M:SS", "M:SS.mmm" or plain (decimal) seconds, so the admin
scrubber can store exact frame boundaries as fractional seconds.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

payload = json.loads(os.environ["PAYLOAD"])
title = (payload.get("project_title") or "").strip()
sources = payload.get("sources") or (
    [payload["source_video"]] if payload.get("source_video") else []
)
clips = payload.get("clips") or []

if not title:
    print("::error::no project_title in payload")
    sys.exit(1)


def parse_time(v):
    """"M:SS(.mmm)" or plain seconds -> float seconds."""
    if v is None or v == "":
        return 0.0
    s = str(v).strip()
    if ":" in s:
        parts = s.split(":")
        try:
            return float(parts[0] or 0) * 60 + float(parts[1] or 0)
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


data = json.load(open("data.json"))
proj = next((p for p in data["projects"] if p.get("title") == title), None)
if proj is None:
    print(f"::error::project not found: {title!r}")
    sys.exit(1)

os.makedirs("assets/clips", exist_ok=True)
sl = slug(title) or "clip"
proj_clips = proj.get("clips") or []
made = 0

for i, clip in enumerate(clips):
    start = parse_time(clip.get("start"))
    end = parse_time(clip.get("end"))
    if end <= start:
        print(f"::warning::clip {i} has empty/invalid range ({start}->{end}); skipping")
        continue
    dur = round(end - start, 3)

    src = clip.get("sourceVideo") or (sources[0] if sources else "")
    if not src:
        print(f"::warning::clip {i} has no source; skipping")
        continue

    local = src
    if src.startswith("http://") or src.startswith("https://"):
        local = f"/tmp/src_{i}.mp4"
        print(f"downloading {src}")
        urllib.request.urlretrieve(src, local)
    if not os.path.exists(local):
        print(f"::warning::source file missing in repo: {src}; skipping clip {i}")
        continue

    out = f"assets/clips/{sl}-{i}.mp4"
    # -ss before -i = fast seek; with re-encode ffmpeg still lands frame-accurate.
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}",
        "-i", local,
        "-t", f"{dur:.3f}",
        "-an",                       # muted loop
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
    ]
    print("run:", " ".join(cmd))
    subprocess.run(cmd, check=True)

    if i < len(proj_clips):
        proj_clips[i]["clipFile"] = out
    made += 1

if made == 0:
    print("no clips produced")
    sys.exit(0)

with open("data.json", "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"extracted {made} clip(s) for {title!r}")
