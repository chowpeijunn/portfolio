const REPO = 'chowpeijunn/portfolio';

// Allow up to 8 MB body (base64-encoded images can be ~33% larger than raw)
module.exports.config = { api: { bodyParser: { sizeLimit: '8mb' } } };

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

  // Sanitise filename
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const base = filename
    .substring(0, filename.lastIndexOf('.'))
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '');
  const safe = base + ext;

  const api = `https://api.github.com/repos/${REPO}/contents/assets/thumbs/${safe}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'portfolio-admin'
  };

  try {
    // If file already exists, grab its SHA so we can overwrite
    let sha;
    const existRes = await fetch(api, { headers });
    if (existRes.ok) {
      const existData = await existRes.json();
      sha = existData.sha;
    }

    const body = { message: `Admin: upload ${safe}`, content };
    if (sha) body.sha = sha;

    const putRes = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    const putData = await putRes.json();
    if (!putRes.ok) throw new Error(putData.message || `GitHub ${putRes.status}`);

    res.json({ ok: true, path: `assets/thumbs/${safe}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
