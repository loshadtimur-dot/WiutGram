'use strict';

const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, MAX_BYTES, SUBDIRS, randomName } = require('../utils/files');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function buildStorage(subdir) {
  const safeDir = SUBDIRS.includes(subdir) ? subdir : 'avatars';
  const destination = path.join(UPLOAD_DIR, safeDir);
  fs.mkdirSync(destination, { recursive: true });

  return multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destination);
    },
    filename(req, file, cb) {
      const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const ext = extMap[file.mimetype] || 'jpg';
      cb(null, randomName(ext));
    }
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  }
  return cb(null, true);
}

// Creates a single-image upload middleware writing into uploads/<subdir>.
function imageUpload(subdir, field = 'image') {
  const upload = multer({
    storage: buildStorage(subdir),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter
  }).single(field);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Файл больше 8 МБ' });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'Допустимы только JPG, PNG или WEBP' });
      }
      return res.status(400).json({ error: 'Не удалось загрузить файл' });
    });
  };
}

// Public URL for an uploaded file.
function publicPath(subdir, filename) {
  return `/uploads/${subdir}/${filename}`;
}

module.exports = { imageUpload, publicPath, ALLOWED_MIME };
