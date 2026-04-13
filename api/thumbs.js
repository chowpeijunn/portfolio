const REPO = 'chowpeijunn/portfolio';

module.exports = async (req, res) => {
  const { GITHUB_TOKEN, ADMIN_SECRET } = process.env;

  if (ADMIN_SECRET && req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/contents/assets/thumbs`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'portfolio-admin'
        }
      }
    );
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.message || `GitHub ${r.status}`);
    }
    const files = await r.json();
    const names = Array.isArray(files)
      ? files
          .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
          .map(f => f.name)
          .sort()
      : [];
    res.json(names);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
