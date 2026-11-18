// Thin fetch wrapper with JSON handling and auth error broadcasting.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data || {};
  }
}

// The httpOnly cookie is the primary session. Browsers that block third-party
// cookies (for example an embedded preview iframe) cannot keep it, so every
// auth response also carries a token that we send as a Bearer header.
const TOKEN_KEY = 'uni_token';
let memoryToken = '';

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch (err) {
    return memoryToken;
  }
}

export function setToken(token) {
  memoryToken = token || '';
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    // Third-party iframes and private mode can block storage; memory keeps the session alive.
  }
}

export function clearToken() {
  setToken('');
}

function buildOptions(method, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  const token = getToken();
  if (token) options.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined && body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  return options;
}

// A stalled request must never leave a button spinning forever.
const REQUEST_TIMEOUT_MS = 60000;

async function request(path, method = 'GET', body) {
  let response;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const options = buildOptions(method, body);
    if (controller) options.signal = controller.signal;
    response = await fetch(`/api${path}`, options);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ApiError('Сервер долго не отвечает. Проверьте соединение и попробуйте снова.', 0, {});
    }
    throw new ApiError('Нет соединения с сервером', 0, {});
  } finally {
    if (timer) clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    if (response.status === 401) {
      if (!path.startsWith('/auth/login')) clearToken();
      window.dispatchEvent(new CustomEvent('uni:unauthorized', { detail: data }));
    }
    if (response.status === 403 && data.code === 'banned') {
      window.dispatchEvent(new CustomEvent('uni:banned', { detail: data }));
    }
    if (response.status === 503 && data.code === 'maintenance') {
      window.dispatchEvent(new CustomEvent('uni:maintenance', { detail: data }));
    }
    throw new ApiError(data.error || 'Ошибка запроса', response.status, data);
  }
  return data;
}

export const api = {
  get(path) {
    return request(path, 'GET');
  },
  post(path, body) {
    return request(path, 'POST', body);
  },
  put(path, body) {
    return request(path, 'PUT', body);
  },
  delete(path, body) {
    return request(path, 'DELETE', body);
  },
  upload(path, formData, method = 'POST') {
    return request(path, method, formData);
  }
};

// Resizes and compresses an image file on the client before upload.
export function compressImage(file, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Выберите изображение'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось открыть изображение'));
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, blob: dataUrlToBlob(dataUrl), width, height });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function toFormData(fields = {}, blob, filename = 'photo.jpg') {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }
  if (blob) form.append('image', blob, filename);
  return form;
}
