const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = 3333;
const DATA_FILE = path.join(__dirname, 'data.json');
const THUMBS_DIR = path.join(__dirname, 'assets', 'thumbs');

// Multer: save uploads to assets/thumbs/ keeping original filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, THUMBS_DIR),
  filename: (req, file, cb) => {
    // Sanitise: lowercase, spaces → dashes, keep extension
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_.]/g, '');
    // Avoid overwriting: append timestamp if file exists
    let name = base + ext;
    if (fs.existsSync(path.join(THUMBS_DIR, name))) {
      name = base + '-' + Date.now() + ext;
    }
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP or GIF images are allowed'));
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Read data.json
app.get('/api/data', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Write data.json
app.post('/api/save', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List thumbnail files
app.get('/api/thumbs', (req, res) => {
  try {
    const files = fs.readdirSync(THUMBS_DIR)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort();
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload a new thumbnail
app.post('/api/upload-thumb', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ ok: true, path: `assets/thumbs/${req.file.filename}` });
});

// Source video upload — file held in RAM only (never written to disk).
// Server responds immediately then uploads to GitHub in the background.
const uploadSourceMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

function sanitizeFilename(name) {
  const ext  = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name))
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '');
  return base + ext;
}

app.post('/api/upload-source', uploadSourceMem.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const token    = req.headers['x-github-token'];
  if (!token)    return res.status(400).json({ error: 'No GitHub token provided' });

  const safeName    = sanitizeFilename(req.file.originalname);
  const repoPath    = `assets/sources/${safeName}`;
  const fileBuffer  = req.file.buffer; // RAM only — freed after upload completes

  // Respond immediately so the browser (and user) can move on
  res.json({ ok: true, path: repoPath });

  // Push to GitHub in background — no files touched on disk
  (async () => {
    const REPO    = 'chowpeijunn/portfolio';
    const BRANCH  = 'main';
    const api     = `https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=${BRANCH}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'portfolio-admin'
    };

    try {
      let sha;
      const existRes = await fetch(api, { headers });
      if (existRes.ok) { sha = (await existRes.json()).sha; }

      const base64 = fileBuffer.toString('base64');
      const body   = { message: `Admin: upload source ${safeName}`, content: base64, branch: BRANCH };
      if (sha) body.sha = sha;

      const putRes  = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
        method: 'PUT', headers, body: JSON.stringify(body)
      });
      let putData;
      try { putData = await putRes.json(); } catch { putData = {}; }

      if (!putRes.ok) {
        console.error(`[upload-source] GitHub error ${putRes.status}: ${putData.message || 'unknown'}`);
      } else {
        console.log(`[upload-source] ✓ pushed ${repoPath}`);
      }
    } catch (e) {
      console.error(`[upload-source] failed: ${e.message}`);
    }
  })();
});


// Publish: write data.json, commit, pull --rebase, push
app.post('/api/publish', (req, res) => {
  try {
    const msg = (req.body && req.body.message) || 'Admin: update content';
    const opts = { cwd: __dirname };
    // Write the posted data directly so it's always in sync
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    execSync('git add data.json', opts);
    const status = execSync('git status --porcelain', opts).toString().trim();
    if (!status) return res.json({ ok: true, message: 'Nothing new to publish — already up to date.' });
    execSync(`git commit -m "${msg.replace(/"/g, "'")}"`, opts);
    // Pull rebase before push to avoid stale-branch rejections
    try { execSync('git pull --rebase origin main', opts); } catch (_) {}
    execSync('git push', opts);
    res.json({ ok: true, message: 'Published! Vercel is deploying now (~30 seconds).' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ✦  Portfolio Admin`);
  console.log(`  →  http://localhost:${PORT}/admin.html\n`);
});
