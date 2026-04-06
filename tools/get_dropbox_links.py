#!/usr/bin/env python3
"""
get_dropbox_links.py
--------------------
Reads all local video src= paths from index.html, creates Dropbox shared
links for each one, and rewrites index.html with the CDN URLs.

Usage:
    python3 tools/get_dropbox_links.py YOUR_DROPBOX_ACCESS_TOKEN

How to get a token:
  1. Go to https://www.dropbox.com/developers/apps
  2. Click "Create app" → "Scoped access" → "Full Dropbox"
  3. Give it any name → Create
  4. Under "Permissions" enable: sharing.write, sharing.read, files.metadata.read
  5. Under "Settings" → "Generated access token" → click Generate
  6. Copy that token and pass it as the argument above
"""

import sys, re, json
from pathlib import Path
from urllib.parse import unquote
try:
    import dropbox
    from dropbox.sharing import RequestedVisibility, SharedLinkSettings
    from dropbox.exceptions import ApiError
except ImportError:
    print("ERROR: run  pip3 install dropbox  first")
    sys.exit(1)

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(1)

TOKEN       = sys.argv[1]
PORTFOLIO   = Path(__file__).parent.parent          # .../portfolio/
INDEX_HTML  = PORTFOLIO / "index.html"
DROPBOX_ROOT = "/Claude/portfolio"                   # path inside Dropbox

dbx = dropbox.Dropbox(TOKEN)

# ── Collect every  src="videos/..."  from index.html ──────────────────────
html = INDEX_HTML.read_text(encoding="utf-8")
raw_paths = re.findall(r'src="(videos/[^"]+)"', html)

print(f"Found {len(raw_paths)} video references")

# ── For each path get / create a shared link ───────────────────────────────
replacements = {}   # local_src → cdn_url

for rel in raw_paths:
    local_decoded = unquote(rel)                         # "videos/2026/Vogue x MBS/..."
    dropbox_path  = f"{DROPBOX_ROOT}/{local_decoded}"   # "/Claude/portfolio/videos/..."

    # Try to get existing link first
    try:
        links = dbx.sharing_list_shared_links(path=dropbox_path)
        if links.links:
            url = links.links[0].url
        else:
            raise ApiError(None, None, None, None)   # force creation
    except Exception:
        try:
            settings = SharedLinkSettings(
                requested_visibility=RequestedVisibility.public
            )
            result = dbx.sharing_create_shared_link_with_settings(
                dropbox_path, settings=settings
            )
            url = result.url
        except ApiError as e:
            if hasattr(e, 'error') and 'shared_link_already_exists' in str(e):
                links = dbx.sharing_list_shared_links(path=dropbox_path)
                url = links.links[0].url
            else:
                print(f"  SKIP {rel}: {e}")
                continue

    # Convert share URL → direct-download CDN URL
    # www.dropbox.com/scl/fi/<id>/<name>?rlkey=<key>&dl=0
    # → dl.dropboxusercontent.com/scl/fi/<id>/<name>?rlkey=<key>&raw=1
    cdn = url.replace("www.dropbox.com", "dl.dropboxusercontent.com")
    cdn = re.sub(r'[?&]dl=\d', '', cdn)   # remove ?dl=0 or &dl=0
    if '?' in cdn:
        cdn += '&raw=1'
    else:
        cdn += '?raw=1'

    replacements[rel] = cdn
    print(f"  ✓ {Path(rel).name}")
    print(f"      {cdn[:80]}...")

# ── Rewrite index.html ─────────────────────────────────────────────────────
if not replacements:
    print("\nNo replacements made — check token and permissions.")
    sys.exit(1)

new_html = html
for local, cdn in replacements.items():
    new_html = new_html.replace(f'src="{local}"', f'src="{cdn}"')

INDEX_HTML.write_text(new_html, encoding="utf-8")
print(f"\n✅  Rewrote {INDEX_HTML.name} with {len(replacements)} CDN URLs")
print("    Deploy the portfolio/ folder (without /videos) to Netlify.")
