const REPO = 'chowpeijunn/portfolio';

// Base64 of a ~90 MB compressed video is ~120 MB — allow up to 150 MB body.
module.exports.config = { api: { bodyParser: { sizeLimit: '150mb' } } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { GITHUB_TOKEN, ADMIN_SECRET } = process.env;

  if (ADMIN_SECRET && req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { filename, content } = req.body || {};
  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }

  // Sanitise filename → kebab-case .mp4
  const base = filename
    .substring(0, filename.lastIndexOf('.') > -1 ? filename.lastIndexOf('.') : filename.length)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '');
  const safe = base + '.mp4';

  const api = `https://api.github.com/repos/${REPO}/contents/assets/sources/${safe}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'portfolio-admin'
  };

  try {
    // Grab existing SHA so we can overwrite if file already exists
    let sha;
    const existRes = await fetch(api, { headers });
    if (existRes.ok) {
      const existData = await existRes.json();
      sha = existData.sha;
    }

    const body = { message: `Admin: upload source ${safe}`, content };
    if (sha) body.sha = sha;

    const putRes = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    const putData = await putRes.json();
    if (!putRes.ok) throw new Error(putData.message || `GitHub ${putRes.status}`);

    res.json({ ok: true, path: `assets/sources/${safe}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
