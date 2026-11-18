// Socket.IO wrapper with a tiny local event bus and connection fallbacks.
import { getToken } from './api.js?v=19';

const handlers = new Map();

let socket = null;
let connected = false;

export const socketEvents = [
  'message:new',
  'message:read',
  'message:deleted',
  'message:reaction',
  'typing:start',
  'typing:stop',
  'match:new',
  'match:removed',
  'notification:new',
  'notification:count',
  'presence:update',
  'likes:count',
  'comment:new',
  'story:views',
  'account:banned',
  'account:verified',
  'account:role'
];

export function onSocket(event, handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(handler);
  return () => {
    const set = handlers.get(event);
    if (set) set.delete(handler);
  };
}

function fire(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`socket handler failed: ${event}`, err);
    }
  }
}

export function initSocket() {
  if (socket) return socket;
  if (!window.io) {
    // Socket.IO client was not served (offline or blocked). The app keeps working via REST.
    console.warn('Socket.IO недоступен, работаем в режиме запросов');
    return null;
  }
  socket = window.io({
    withCredentials: true,
    auth: { token: getToken() },
    reconnection: true,
    reconnectionDelay: 1200,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    connected = true;
    document.dispatchEvent(new CustomEvent('uni:socket', { detail: { connected: true } }));
    fire('socket:connect', {});
  });

  socket.on('disconnect', () => {
    connected = false;
    document.dispatchEvent(new CustomEvent('uni:socket', { detail: { connected: false } }));
    fire('socket:disconnect', {});
  });

  socket.on('connect_error', () => {
    connected = false;
  });

  for (const event of socketEvents) {
    socket.on(event, (payload) => fire(event, payload));
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
  }
}

export function isConnected() {
  return connected;
}

export function startTyping(matchId) {
  if (socket && connected) socket.emit('typing:start', { match_id: Number(matchId) });
}

export function stopTyping(matchId) {
  if (socket && connected) socket.emit('typing:stop', { match_id: Number(matchId) });
}
