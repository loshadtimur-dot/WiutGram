'use strict';

// Tracks how many live sockets each user has open.
const socketsByUser = new Map();

function addSocket(userId, socketId) {
  const id = Number(userId);
  if (!socketsByUser.has(id)) socketsByUser.set(id, new Set());
  socketsByUser.get(id).add(socketId);
  return socketsByUser.get(id).size === 1;
}

function removeSocket(userId, socketId) {
  const id = Number(userId);
  const set = socketsByUser.get(id);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(id);
    return true;
  }
  return false;
}

function isOnline(userId) {
  return socketsByUser.has(Number(userId));
}

function onlineIds() {
  return [...socketsByUser.keys()];
}

function onlineCount() {
  return socketsByUser.size;
}

module.exports = { addSocket, removeSocket, isOnline, onlineIds, onlineCount };
