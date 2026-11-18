'use strict';

// Small in-process cache: one banner payload per placement and hour.
const activeCache = new Map();

function read(key) {
  return activeCache.get(key);
}

function write(key, value) {
  activeCache.set(key, value);
}

function has(key) {
  return activeCache.has(key);
}

function bustCache() {
  activeCache.clear();
}

module.exports = { read, write, has, bustCache };
