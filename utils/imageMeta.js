'use strict';

// Detects real image types from file signatures and reads dimensions without
// native image libraries. Only JPEG, PNG and WEBP are accepted for banners.

function detectType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function pngSize(buffer) {
  if (buffer.length < 24) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

// Walks JPEG segments until the first start-of-frame marker.
function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (!length || length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (offset + 9 > buffer.length) return null;
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    // Lossy: frame header contains 14-bit dimensions after the 3-byte code.
    const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (start === -1 || start + 7 > buffer.length) return null;
    const width = buffer.readUInt16LE(start + 3) & 0x3fff;
    const height = buffer.readUInt16LE(start + 5) & 0x3fff;
    return { width, height };
  }
  if (chunk === 'VP8L') {
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return null;
}

// Returns { type, ext, width, height } or null when the file is not a real image.
function inspectImage(buffer) {
  const type = detectType(buffer);
  if (!type) return null;
  let size = null;
  if (type === 'png') size = pngSize(buffer);
  else if (type === 'jpeg') size = jpegSize(buffer);
  else size = webpSize(buffer);
  if (!size || !size.width || !size.height) return null;
  const ext = type === 'jpeg' ? 'jpg' : type;
  return { type, ext, width: size.width, height: size.height };
}

module.exports = { detectType, inspectImage };
