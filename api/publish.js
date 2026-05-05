const REPO   = 'chowpeijunn/portfolio';
const FILE   = 'data.json';
const BRANCH = 'main';

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

  const content = Buffer.from(JSON.stringify(req.body, null, 2)).toString('base64');

  // Retry up to 3 times to handle SHA conflicts from concurrent workflow runs
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const shaRes = await fetch(api, { headers });
      const shaData = await shaRes.json();
      if (!shaRes.ok) throw new Error(shaData.message || `GitHub ${shaRes.status}`);

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
