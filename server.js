const express = require('express');
const fs = require('fs');
const path = require('path');
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

app.listen(PORT, () => {
  console.log(`\n  ✦  Portfolio Admin`);
  console.log(`  →  http://localhost:${PORT}/admin.html\n`);
});
