/**
 * WebSocket-канал синхронізації прогресу перегляду.
 *
 * REST-ендпоінт /auth/sync/progress більше не використовується для оновлень:
 * позиція йде кадром `progress`, видалення — кадром `progress-delete`.
 * Сервер розсилає ці ж кадри іншим сесіям користувача (телефон, ТБ, інша вкладка).
 *
 * Модуль тримає власну чергу (outbox): якщо сокет закритий, оновлення не губляться,
 * а надсилаються пачкою після перепідключення.
 *
 * Стан каналу живе на `window`, а не в модулі. Інакше будь-яка повторна ініціалізація
 * модуля (HMR у dev-режимі, дубльований бандл) втрачала б посилання на живий сокет
 * і відкривала друге з'єднання, лишаючи перше висіти.
 */

const TOKEN_KEY = 'uafilms_auth_token';
const STORE_KEY = 'uafilms_watch_progress';
const STATE_KEY = '__uafilmsProgressSocketState';

const HEARTBEAT_INTERVAL_MS = 25000;
const SERVER_SILENCE_TIMEOUT_MS = 70000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const OUTBOX_LIMIT = 2000;

function createState() {
  return {
    socket: null,
    /** Токен, з яким відкрито поточний сокет: зміна токена = новий канал. */
    token: null,
    started: false,
    authenticated: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    lastServerMessageAt: 0,
    listenersBound: false,
    /** mediaId → entry: останнє оновлення позиції, яке ще не підтверджене сервером. */
    progressOutbox: new Map(),
    /** mediaId, які треба видалити на сервері. */
    deleteOutbox: new Set(),
  };
}

function getState() {
  const holder = typeof window !== 'undefined' ? window : globalThis;
  if (!holder[STATE_KEY]) holder[STATE_KEY] = createState();
  return holder[STATE_KEY];
}

const state = getState();

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readProgressStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeProgressStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Приватний режим або переповнене сховище: дані просто не переживуть перезавантаження.
  }
}

export function resolveProgressSocketUrl() {
  const base = import.meta.env?.VITE_API_BASE_URL || '';
  if (/^https?:\/\//i.test(base)) {
    try {
      const url = new URL(base);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/ws';
      url.search = '';
      return url.toString();
    } catch {
      // Некоректний base — падаємо на same-origin.
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function isLiveSocket(ws) {
  return !!ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
}

export function isProgressSocketReady() {
  return !!state.socket && state.socket.readyState === WebSocket.OPEN && state.authenticated;
}

export function getProgressSocketState() {
  return {
    started: state.started,
    authenticated: state.authenticated,
    readyState: state.socket ? state.socket.readyState : WebSocket.CLOSED,
    queued: state.progressOutbox.size,
    queuedDeletes: state.deleteOutbox.size,
    reconnectAttempts: state.reconnectAttempts,
  };
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function clearSocketTimers(ws) {
  if (ws?.heartbeatTimer) {
    clearInterval(ws.heartbeatTimer);
    ws.heartbeatTimer = null;
  }
  if (ws?.silenceTimer) {
    clearInterval(ws.silenceTimer);
    ws.silenceTimer = null;
  }
}

/** Закриває сокет і знімає з нього обробники, щоб його onclose не чіпав актуальний стан. */
function closeSocket(ws, code, reason) {
  if (!ws) return;
  if (state.socket === ws) {
    state.socket = null;
    state.token = null;
    state.authenticated = false;
  }
  clearSocketTimers(ws);
  ws.onopen = null;
  ws.onmessage = null;
  ws.onerror = null;
  ws.onclose = null;
  try {
    ws.close(code, reason);
  } catch {
    // ignore
  }
}

function scheduleReconnect() {
  if (!state.started || state.reconnectTimer || !readToken()) return;

  const capped = Math.min(RECONNECT_BASE_MS * 2 ** state.reconnectAttempts, RECONNECT_MAX_MS);
  const delay = Math.round(capped / 2 + Math.random() * (capped / 2)); // jitter, щоб усі вкладки не били одночасно
  state.reconnectAttempts++;

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    openSocket();
  }, delay);
}

function sendFrame(payload) {
  const ws = state.socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function mergeRemoteItems(items) {
  const store = readProgressStore();
  let changed = false;

  for (const item of items) {
    if (!item || !item.mediaId) continue;
    const { mediaId, ...entry } = item;
    const existing = store[mediaId];
    if (existing && (existing.updated || 0) > (entry.updated || 0)) continue;
    store[mediaId] = { ...existing, ...entry };
    changed = true;
  }

  if (changed) {
    writeProgressStore(store);
    window.dispatchEvent(new CustomEvent('uafilms_progress_updated'));
  }
  return changed;
}

function removeRemoteItems(ids) {
  const store = readProgressStore();
  let changed = false;

  for (const id of ids) {
    if (store[id] === undefined) continue;
    delete store[id];
    changed = true;
  }

  if (changed) {
    writeProgressStore(store);
    window.dispatchEvent(new CustomEvent('uafilms_progress_updated'));
  }
  return changed;
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'hello':
      state.authenticated = true;
      state.reconnectAttempts = 0;
      if (msg.snapshot && typeof msg.snapshot === 'object') {
        mergeRemoteItems(
          Object.entries(msg.snapshot).map(([mediaId, entry]) => ({ mediaId, ...entry })),
        );
      }
      flushProgressQueue();
      window.dispatchEvent(new CustomEvent('uafilms_progress_socket_ready'));
      break;
    case 'progress':
      if (mergeRemoteItems(Array.isArray(msg.items) ? msg.items : [])) {
        window.dispatchEvent(new CustomEvent('uafilms_progress_remote', { detail: { items: msg.items } }));
      }
      break;
    case 'progress-delete':
      if (removeRemoteItems(Array.isArray(msg.ids) ? msg.ids : [])) {
        window.dispatchEvent(new CustomEvent('uafilms_progress_remote', { detail: { ids: msg.ids } }));
      }
      break;
    case 'pong':
      break;
    case 'ack':
      break;
    case 'error':
      console.warn('Progress socket error:', msg.code, msg.message);
      break;
    default:
      break;
  }
}

function openSocket() {
  if (!state.started) return;
  if (isLiveSocket(state.socket)) return;
  if (state.socket) closeSocket(state.socket, 1000, 'stale socket'); // залишок у стані CLOSING/CLOSED

  const token = readToken();
  if (!token) {
    disconnectProgressSocket();
    return;
  }

  let ws;
  try {
    ws = new WebSocket(resolveProgressSocketUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  state.socket = ws;
  state.token = token;
  state.authenticated = false;

  ws.onopen = () => {
    if (state.socket !== ws) return;
    state.lastServerMessageAt = Date.now();
    // Порожнє локальне сховище (нова вкладка/пристрій) — просимо повний знімок прогресу.
    const wantsSnapshot = Object.keys(readProgressStore()).length === 0;
    sendFrame({ type: 'auth', token: readToken() || '', ...(wantsSnapshot ? { snapshot: true } : {}) });
  };

  ws.onmessage = (event) => {
    if (state.socket !== ws) return;
    state.lastServerMessageAt = Date.now();
    if (typeof event.data === 'string') handleMessage(event.data);
  };

  ws.onclose = () => {
    clearSocketTimers(ws);
    if (state.socket !== ws) return; // закрився попередній сокет — актуальний канал не чіпаємо
    state.socket = null;
    state.token = null;
    state.authenticated = false;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose прийде слідом і запустить перепідключення.
  };

  ws.heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    sendFrame({ type: 'ping', t: Date.now() });
  }, HEARTBEAT_INTERVAL_MS);

  // Якщо сервер мовчить довше за таймаут — вважаємо канал мертвим і перепідключаємось.
  ws.silenceTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - state.lastServerMessageAt > SERVER_SILENCE_TIMEOUT_MS) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/** Ідемпотентний вхід: повторний виклик для того самого токена нічого не робить. */
export function connectProgressSocket() {
  const token = readToken();
  if (!token) {
    disconnectProgressSocket();
    return;
  }

  state.started = true;

  if (isLiveSocket(state.socket)) {
    if (state.token === token) return; // канал цього користувача вже живий
    closeSocket(state.socket, 1000, 'token changed');
  }

  state.reconnectAttempts = 0;
  clearReconnectTimer();
  openSocket();
}

export function disconnectProgressSocket() {
  state.started = false;
  state.authenticated = false;
  state.reconnectAttempts = 0;
  clearReconnectTimer();
  state.progressOutbox.clear();
  state.deleteOutbox.clear();
  if (state.socket) closeSocket(state.socket, 1000, 'client logout');
  state.token = null;
}

/** Ставить оновлення в чергу і, якщо канал живий, одразу його надсилає. */
export function queueProgressUpdate(mediaId, entry) {
  if (!mediaId || !entry) return;

  const outbox = state.progressOutbox;
  if (outbox.size >= OUTBOX_LIMIT && !outbox.has(mediaId)) {
    const oldestKey = outbox.keys().next().value;
    if (oldestKey !== undefined) outbox.delete(oldestKey);
  }
  outbox.set(mediaId, { mediaId, ...entry });
  state.deleteOutbox.delete(mediaId);

  if (isProgressSocketReady()) flushProgressQueue();
  else if (state.started) connectProgressSocket();
}

export function queueProgressDelete(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
  if (list.length === 0) return;

  for (const id of list) {
    state.progressOutbox.delete(id);
    state.deleteOutbox.add(id);
  }

  if (isProgressSocketReady()) flushProgressQueue();
  else if (state.started) connectProgressSocket();
}

/** Надсилає чергу одним-двома кадрами. Викликається після hello, а також на pagehide. */
export function flushProgressQueue() {
  if (!isProgressSocketReady()) return false;

  const items = Array.from(state.progressOutbox.values());
  if (items.length > 0) {
    state.progressOutbox.clear();
    if (!sendFrame({ type: 'progress', items })) items.forEach((item) => state.progressOutbox.set(item.mediaId, item));
  }

  const ids = Array.from(state.deleteOutbox);
  if (ids.length > 0) {
    state.deleteOutbox.clear();
    if (!sendFrame({ type: 'progress-delete', ids })) ids.forEach((id) => state.deleteOutbox.add(id));
  }

  return true;
}

/** Слухачі вішаємо один раз на сторінку: повторні ініціалізації модуля їх не дублюють. */
function bindWindowListeners() {
  if (state.listenersBound || typeof window === 'undefined') return;
  state.listenersBound = true;

  window.addEventListener('online', () => {
    if (!state.started) return;
    if (!isProgressSocketReady()) {
      state.reconnectAttempts = 0;
      openSocket();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!state.started || document.visibilityState !== 'visible') return;
    if (!isProgressSocketReady()) {
      state.reconnectAttempts = 0;
      openSocket();
    }
  });

  // Останній шанс долетіти до сервера при закритті вкладки.
  window.addEventListener('pagehide', () => {
    if (isProgressSocketReady()) flushProgressQueue();
  });
}

bindWindowListeners();
