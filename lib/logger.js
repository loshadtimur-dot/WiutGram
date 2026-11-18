'use strict';

const fs = require('fs');
const path = require('path');

// Minimal rotating error log. Production deployments usually add a process
// manager on top, but the app still keeps its own file for diagnostics.

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_BYTES = 5 * 1024 * 1024;

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    // Logging must never crash the server.
  }
}

function rotateIfNeeded(file) {
  try {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).size < MAX_BYTES) return;
    const backup = `${file}.1`;
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(file, backup);
  } catch (err) {
    // Ignore rotation errors.
  }
}

function writeLine(level, message, extra) {
  const stamp = new Date().toISOString();
  const details = extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '';
  const line = `${stamp} [${level}] ${message}${details}\n`;
  try {
    ensureLogDir();
    const file = path.join(LOG_DIR, 'error.log');
    rotateIfNeeded(file);
    fs.appendFileSync(file, line);
  } catch (err) {
    // Ignore file errors.
  }
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
}

module.exports = {
  LOG_DIR,
  error(message, extra) {
    writeLine('error', message, extra);
  },
  warn(message, extra) {
    writeLine('warn', message, extra);
  },
  info(message, extra) {
    writeLine('info', message, extra);
  }
};
