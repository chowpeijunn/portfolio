const REPO   = 'chowpeijunn/portfolio';
const FILE   = 'data.json';
const BRANCH = 'main';

// Keep any clipFile the live data.json already has when the incoming save is
// missing it for the same clip (same project title, same clip index + times).
// This stops a publish/auto-save that raced the background extractor from
// blanking out freshly-extracted clip pointers.
function preserveClipFiles(incoming, current) {
  if (!incoming || !Array.isArray(incoming.projects)) return incoming;
  if (!current || !Array.isArray(current.projects)) return incoming;
  const curByTitle = Object.create(null);
  current.projects.forEach(p => { if (p && p.title) curByTitle[p.title] = p; });
  incoming.projects.forEach(p => {
    if (!p || !Array.isArray(p.clips)) return;
    const cur = curByTitle[p.title];
    if (!cur || !Array.isArray(cur.clips)) return;
    p.clips.forEach((clip, i) => {
      const c = cur.clips[i];
      if (clip && c && !clip.clipFile && c.clipFile &&
          String(clip.start) === String(c.start) &&
          String(clip.end) === String(c.end)) {
        clip.clipFile = c.clipFile;
      }
    });
  });
  return incoming;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { GITHUB_TOKEN, ADMIN_SECRET } = process.env;

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured on server.' });
  }

  if (ADMIN_SECRET && req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const api = `https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'portfolio-admin'
  };

  // Retry up to 3 times to handle SHA conflicts from concurrent workflow runs
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const shaRes = await fetch(api, { headers });
      const shaData = await shaRes.json();
      if (!shaRes.ok) throw new Error(shaData.message || `GitHub ${shaRes.status}`);

      // Merge against the live file so a stale publish can never wipe clip
      // references that the "Save & extract" GitHub Action added in the
      // background (its mp4s stay in the repo; only these pointers were at risk).
      let body = req.body;
      try {
        if (shaData.content) {
          const current = JSON.parse(Buffer.from(shaData.content, 'base64').toString('utf8'));
          body = preserveClipFiles(req.body, current);
        }
      } catch (_) { /* fall back to the raw body if the live file can't be parsed */ }

      const content = Buffer.from(JSON.stringify(body, null, 2)).toString('base64');

      const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: 'Admin: update content',
          content,
          sha: shaData.sha,
          branch: BRANCH
        })
      });
      const putData = await putRes.json();

      if (putRes.status === 409) {
        // SHA conflict — remote changed between our GET and PUT, retry
        if (attempt < 3) continue;
        throw new Error('Conflict: file was updated externally. Please try again.');
      }
      if (!putRes.ok) throw new Error(putData.message || `GitHub commit failed ${putRes.status}`);

      return res.json({ ok: true, message: 'Published! Vercel is deploying now (~30 seconds).' });
    } catch (e) {
      if (attempt === 3) return res.status(500).json({ error: e.message });
    }
  }
};
