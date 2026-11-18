'use strict';

// Small CLI used by deploy/backup.sh and scripts/restore.sh so they work on
// hosts without the sqlite3 binary. It never writes to the source database.
//
//   node scripts/sqlite-tool.js backup <source.db> <target.db>
//   node scripts/sqlite-tool.js check  <file.db>

const fs = require('fs');
const path = require('path');

function loadDriver() {
  const local = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
  try {
    return require(local);
  } catch (err) {
    return require('better-sqlite3');
  }
}

function backup(source, target) {
  if (!fs.existsSync(source)) {
    console.error(`database not found: ${source}`);
    process.exit(1);
  }
  const Database = loadDriver();
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  console.log(`backup written: ${target}`);
}

function check(file) {
  if (!fs.existsSync(file)) {
    console.error(`file not found: ${file}`);
    process.exit(1);
  }
  const Database = loadDriver();
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = db.pragma('integrity_check');
    const result = Array.isArray(row) ? row.map((item) => item.integrity_check).join(',') : String(row);
    if (result !== 'ok') {
      console.error(`integrity_check: ${result}`);
      process.exit(2);
    }
    console.log('integrity_check: ok');
  } finally {
    db.close();
  }
}

const [command, first, second] = process.argv.slice(2);

if (command === 'backup' && first && second) {
  backup(first, second);
} else if (command === 'check' && first) {
  check(first);
} else {
  console.error('usage: sqlite-tool.js backup <source> <target> | check <file>');
  process.exit(64);
}
