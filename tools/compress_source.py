#!/usr/bin/env python3
"""Compress source masters from Dropbox into assets/sources/ at 720p, no audio."""
import os, re, subprocess, json

REPO = '/Users/chowpeijun/Library/CloudStorage/Dropbox/Claude/portfolio'
VIDEOS_ROOT = os.path.join(REPO, 'videos')
OUT_DIR = os.path.join(REPO, 'assets', 'sources')
DATA = os.path.join(REPO, 'data.json')

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

def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(DATA) as f: data = json.load(f)
    title_to_project = {p.get('title'): p for p in data['projects']}

    total_in, total_out = 0, 0
    for title, rel in SOURCE_MAP.items():
        src = os.path.join(VIDEOS_ROOT, rel)
        if not os.path.exists(src):
            print(f'! Missing: {title}'); continue
        in_size = os.path.getsize(src)
        total_in += in_size
        out = os.path.join(OUT_DIR, f'{slug(title)}.mp4')
        rel_out = os.path.relpath(out, REPO)
        print(f'\n=== {title} ({in_size/1024/1024:.0f} MB) → {rel_out}')
        cmd = [
            'ffmpeg','-y','-loglevel','error','-stats','-i', src,
            '-c:v','libx264','-crf','26','-preset','medium',
            '-pix_fmt','yuv420p','-vf','scale=-2:min(720\\,ih)',
            '-an','-movflags','+faststart', out
        ]
        r = subprocess.run(cmd)
        if r.returncode == 0 and os.path.exists(out):
            out_size = os.path.getsize(out)
            total_out += out_size
            print(f'   {in_size/1024/1024:6.1f} MB → {out_size/1024/1024:6.1f} MB ({out_size/in_size*100:.0f}%)')
            if title in title_to_project:
                title_to_project[title]['sourceVideo'] = rel_out
        else:
            print(f'   FAILED')

    with open(DATA, 'w') as f: json.dump(data, f, indent=2)
    print(f'\n--- Total: {total_in/1024/1024:.0f} MB → {total_out/1024/1024:.0f} MB ({total_out/total_in*100:.0f}%) ---')

if __name__ == '__main__': main()
