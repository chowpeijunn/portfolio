#!/usr/bin/env python3
"""
Extract project clips from local Dropbox-synced source videos using ffmpeg.

WHEN TO RUN:
  After editing any project's clip start/end times in the admin panel and
  saving, run this script from the repo root:

      python3 tools/extract_clips.py

  Then `git add assets/clips/ data.json && git commit && git push`.

WHAT IT DOES:
  - Reads `data.json` for projects that have a `clips` array
  - Looks up each project's source MP4 via SOURCE_MAP below
  - Trims each clip to a silent, looping 480p mp4 at `assets/clips/{slug}-{i}.mp4`
  - Updates `data.json` with the resulting `clipFile` paths

ADDING A NEW PROJECT:
  Add an entry to SOURCE_MAP mapping the project's exact `title` (as in
  data.json) to the relative path inside `videos/`.

REQUIREMENTS:
  - ffmpeg installed (`brew install ffmpeg`)
  - Dropbox synced locally to ../videos relative to this repo
"""
import json, os, re, subprocess, sys

REPO        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEOS_ROOT = os.path.join(REPO, 'videos')
DATA_PATH   = os.path.join(REPO, 'data.json')
OUT_DIR     = os.path.join(REPO, 'assets', 'clips')

# Project title -> relative path inside videos/
SOURCE_MAP = {
    'KFC Brand Video':          'TVC/2025/Brand Video - KFC/250829_KFC Brand_16x9_60s_Digital_Masters.mp4',
    'PHC 2026':                 'TVC/2026/PHC 2026 - Public Hygiene Council (PHC)/260402_PHC 2026_Main_Digital_Subless, No lower thirds_Digital_Master.mp4',
    'Samyang Buldak Carbonara': 'TVC/2026/Samyang Buldak - KFC/260320_KFC Samyang_Main_16X9_Master_Digital_Clean.mov',
    'Thrive BT':                'TVC/2026/Thrive - The Business Times/2602011_Thrive BT_Main_16x9_Digital_Subless_CleanEndFrame_Master.mp4',
    'Thai Curry':               'TVC/2025/Thai Curry - Pizzahut/250905_Pizza Hut Thai_16x9_30s_GreenCurry_NoSubs_Digtal_Master.mov',
    'Solo Sliders':             'TVC/2026/Solo Sliders - Pizzahut/260310_Pizzahut Sliders_16x9_Main_Endframe 02_Digital_Master.mp4',
    'Shopee 3.3':               'TVC/2026/Shopee 3.3 - Shopee/260219_Shopee 3.3_Horror_35s_Online_16X9_Digital_Masters.mp4',
    'Shopee VIP':               'TVC/2026/Shopee VIP - Shopee/260220_Shopee VIP_33s_16x9_Digital_master.mp4',
}

def to_sec(tc):
    s = str(tc).strip()
    if not s: return 0
    parts = s.split(':')
    try:
        if len(parts) == 1: return float(parts[0])
        if len(parts) == 2: return int(parts[0])*60 + float(parts[1])
        if len(parts) == 3: return int(parts[0])*3600 + int(parts[1])*60 + float(parts[2])
    except ValueError:
        return 0
    return 0

def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(DATA_PATH) as f: data = json.load(f)

    extracted, skipped, missing = [], [], []
    for p in data['projects']:
        title = p.get('title','')
        clips = p.get('clips') or []
        if not clips: continue
        if title not in SOURCE_MAP:
            missing.append(title); continue
        src = os.path.join(VIDEOS_ROOT, SOURCE_MAP[title])
        if not os.path.exists(src):
            print(f'! Source file not found for {title!r}: {src}', file=sys.stderr)
            missing.append(title); continue

        print(f'\n=== {title} ===')
        slug = slugify(title)
        for i, clip in enumerate(clips):
            start, end = to_sec(clip.get('start', 0)), to_sec(clip.get('end', 0))
            if end <= start:
                print(f'  [{i}] skip — invalid range {start}→{end}')
                skipped.append((title, i)); continue
            out     = os.path.join(OUT_DIR, f'{slug}-{i}.mp4')
            rel_out = os.path.relpath(out, REPO)
            print(f'  [{i}] {start}s → {end}s  →  {rel_out}')
            r = subprocess.run([
                'ffmpeg','-y','-loglevel','error','-i', src,
                '-ss', str(start), '-to', str(end),
                '-c:v','libx264','-crf','28','-preset','fast',
                '-pix_fmt','yuv420p','-vf','scale=-2:min(480\\,ih)',
                '-an','-movflags','+faststart', out
            ])
            if r.returncode == 0 and os.path.exists(out):
                size_kb = os.path.getsize(out) / 1024
                clip['clipFile'] = rel_out
                extracted.append((title, i, rel_out, size_kb))
                print(f'      OK ({size_kb:.0f} KB)')
            else:
                print(f'      FAILED'); skipped.append((title, i))

    with open(DATA_PATH, 'w') as f: json.dump(data, f, indent=2)
    print(f'\n--- Done ---')
    print(f'Extracted : {len(extracted)} clip(s)')
    print(f'Skipped   : {len(skipped)} (no times set or ffmpeg failed)')
    if missing:
        print(f'Missing source mapping for: {", ".join(sorted(set(missing)))}')
        print(f'  → add an entry to SOURCE_MAP in tools/extract_clips.py')
    print(f'\nNext: git add assets/clips/ data.json && git commit && git push')

if __name__ == '__main__': main()
