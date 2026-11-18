'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
// UPLOADS_DIR lets tests and deployments keep uploads outside the repository.
const UPLOAD_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(ROOT, 'uploads');
const SUBDIRS = ['avatars', 'posts', 'stories', 'chat', 'ads'];
const MAX_BYTES = 8 * 1024 * 1024;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function ensureUploadDirs() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  for (const dir of SUBDIRS) {
    const full = path.join(UPLOAD_DIR, dir);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
}

ensureUploadDirs();

function randomName(ext) {
  return `${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
}

// Saves a base64 data URL (used by the multi-step registration flow).
function saveDataUrl(dataUrl, subdir = 'avatars') {
  if (typeof dataUrl !== 'string') throw new Error('invalid image');
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('unsupported image format');
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new Error('empty image');
  if (buffer.length > MAX_BYTES) throw new Error('image too large');
  const ext = MIME_EXT[mime];
  const dir = SUBDIRS.includes(subdir) ? subdir : 'avatars';
  const filename = randomName(ext);
  const full = path.join(UPLOAD_DIR, dir, filename);
  fs.writeFileSync(full, buffer);
  return `/uploads/${dir}/${filename}`;
}

function writeSvg(svgContent, subdir = 'avatars') {
  const dir = SUBDIRS.includes(subdir) ? subdir : 'avatars';
  const filename = randomName('svg');
  fs.writeFileSync(path.join(UPLOAD_DIR, dir, filename), svgContent, 'utf8');
  return `/uploads/${dir}/${filename}`;
}

// Deletes an uploaded file by its public path, protecting against traversal.
function deleteUpload(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return false;
  const relative = publicPath.replace(/^\/uploads\//, '');
  const full = path.resolve(UPLOAD_DIR, relative);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) return false;
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
  } catch (err) {
    return false;
  }
  return false;
}

function videoOrImageType(file) {
  if (!file) return null;
  const byMime = MIME_EXT[file.mimetype];
  const ext = path.extname(file.originalname || '').replace('.', '').toLowerCase();
  if (!byMime) return null;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) && byMime !== ext.replace('jpeg', 'jpg')) {
    return null;
  }
  return byMime;
}

module.exports = {
  ROOT,
  UPLOAD_DIR,
  SUBDIRS,
  MAX_BYTES,
  ensureUploadDirs,
  saveDataUrl,
  writeSvg,
  deleteUpload,
  randomName,
  videoOrImageType
};
