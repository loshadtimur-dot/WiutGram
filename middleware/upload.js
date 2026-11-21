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
      const extMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
      };
      const ext = extMap[baseMime(file.mimetype)] || 'jpg';
      cb(null, randomName(ext));
    }
  });
}

// Browsers append codecs ("audio/webm;codecs=opus"), so compare the base type.
function baseMime(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(baseMime(file.mimetype))) {
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

// Voice notes are stored as-is (no server-side transcoding).
function audioUpload(subdir = 'voice', field = 'audio') {
  const upload = multer({
    storage: buildStorage(subdir),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
      const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
      if (!allowed.includes(baseMime(file.mimetype))) {
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', field));
      }
      return cb(null, true);
    }
  }).single(field);
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Голосовое больше 10 МБ' });
      return res.status(400).json({ error: 'Допустимы WEBM, OGG, MP4 или MP3' });
    });
  };
}

// Short videos are stored as-is; the browser plays them with <video>.
function videoUpload(subdir = 'video', field = 'video') {
  const upload = multer({
    storage: buildStorage(subdir),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
      const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
      if (!allowed.includes(baseMime(file.mimetype))) {
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', field));
      }
      return cb(null, true);
    }
  }).single(field);
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Видео больше 50 МБ' });
      return res.status(400).json({ error: 'Допустимы MP4, WEBM или MOV' });
    });
  };
}

// Public URL for an uploaded file.
function publicPath(subdir, filename) {
  return `/uploads/${subdir}/${filename}`;
}

module.exports = { imageUpload, audioUpload, videoUpload, publicPath, ALLOWED_MIME };
