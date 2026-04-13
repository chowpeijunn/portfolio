const REPO = 'chowpeijunn/portfolio';
const FILE = 'data.json';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { GITHUB_TOKEN, ADMIN_SECRET } = process.env;

  if (ADMIN_SECRET && req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const api = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'portfolio-admin'
  };

  try {
    // Fetch current SHA (required for update)
    const shaRes = await fetch(api, { headers });
    const shaData = await shaRes.json();
    if (!shaRes.ok) throw new Error(shaData.message || `GitHub ${shaRes.status}`);

    // Encode and commit
    const content = Buffer.from(JSON.stringify(req.body, null, 2)).toString('base64');
    const putRes = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Admin: update content',
        content,
        sha: shaData.sha
      })
    });
    const putData = await putRes.json();
    if (!putRes.ok) throw new Error(putData.message || `GitHub commit failed ${putRes.status}`);

    res.json({ ok: true, message: 'Published! Vercel is deploying now (~30 seconds).' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
