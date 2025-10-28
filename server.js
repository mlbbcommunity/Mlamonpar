// server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const mega = require('mega');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(helmet());

const upload = multer({ dest: 'tmp/' });
const PORT = process.env.PORT || 8080;
const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || 'auth_files';

// 🔒 Connect to MEGA
let megaStorage;
function getMegaStorage() {
  return new Promise((resolve, reject) => {
    if (megaStorage) return resolve(megaStorage);
    const storage = mega({ email: process.env.MEGA_EMAIL, password: process.env.MEGA_PASSWORD });
    storage.on('ready', () => {
      megaStorage = storage;
      resolve(storage);
    });
    storage.on('error', reject);
  });
}

// Home page upload form
app.get('/', (req, res) => {
  res.send(`
    <h2>Upload WhatsApp auth_info</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="authfile" accept=".json" required>
      <button type="submit">Upload to MEGA</button>
    </form>
  `);
});

// Handle uploads
app.post('/upload', upload.single('authfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const storage = await getMegaStorage();

    // Ensure target folder exists
    let folder = storage.root.children.find(c => c.name === UPLOAD_FOLDER);
    if (!folder) {
      folder = storage.root.mkdir(UPLOAD_FOLDER);
      await new Promise(r => folder.once('ready', r));
    }

    const filePath = path.resolve(req.file.path);
    const fileName = path.basename(req.file.originalname);

    const up = storage.upload({
      name: fileName,
      target: folder
    }, fs.createReadStream(filePath));

    up.on('complete', file => {
      fs.unlinkSync(filePath); // cleanup
      res.send(`<p>✅ Uploaded <b>${fileName}</b> to MEGA folder <b>${UPLOAD_FOLDER}</b>.</p>`);
    });
    up.on('error', err => {
      fs.unlinkSync(filePath);
      res.status(500).send('MEGA upload failed: ' + err.message);
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error.');
  }
});

// List uploaded files (optional)
app.get('/files', async (req, res) => {
  try {
    const storage = await getMegaStorage();
    const folder = storage.root.children.find(c => c.name === UPLOAD_FOLDER);
    if (!folder) return res.send('No uploads yet.');
    const list = folder.children.map(f => f.name).join('<br>');
    res.send(`<h3>Files in MEGA/${UPLOAD_FOLDER}</h3>${list}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching files.');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
