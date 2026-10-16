import { upgradeWebSocket } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import {
  verifyAuthToken,
  saveUserWatchProgress,
  deleteUserWatchProgress,
  getUserWatchProgress,
} from '../auth/service.js';
import { addSession, removeSession, broadcastToUser, countUserSessions } from './hub.js';
import { log } from '../../utils/logger.js';

/** Шлях сокета прогресу (дублюється під /api для симетрії з рештою роутів). */
export const WS_PATH = '/ws';

/** Скільки чекати на кадр авторизації після відкриття з'єднання. */
const AUTH_TIMEOUT_MS = 10_000;

/** Запобіжники від зловживань: розмір батчу та частота кадрів. */
const MAX_ITEMS_PER_MESSAGE = 100;
const MAX_MESSAGE_WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 300;

/** Той самий формат, що приймає REST /auth/sync/progress, лише батчем. */
const PROGRESS_FIELDS = ['time', 'duration', 'updated', 'title', 'poster', 'mediaType', 'tmdbId', 'season', 'episode'] as const;

export const wsServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function send(socket: WSContext, payload: unknown): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // Сокет закривається сам; окремо логувати немає сенсу.
  }
}

function sendError(socket: WSContext, code: string, message: string): void {
  send(socket, { type: 'error', code, message });
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProgressItem(raw: any): Record<string, any> | null {
  const mediaId = typeof raw?.mediaId === 'string' && raw.mediaId.trim() ? raw.mediaId.trim() : null;
  if (!mediaId) return null;

  const item: Record<string, any> = {
    mediaId,
    time: toNumber(raw.time, 0),
    duration: toNumber(raw.duration, 0),
    updated: toNumber(raw.updated, Date.now()),
  };

  if (typeof raw.title === 'string' && raw.title) item.title = raw.title;
  if (typeof raw.poster === 'string' && raw.poster) item.poster = raw.poster;
  if (raw.mediaType === 'tv' || raw.mediaType === 'movie') item.mediaType = raw.mediaType;
  if (raw.tmdbId !== undefined && raw.tmdbId !== null && String(raw.tmdbId)) item.tmdbId = String(raw.tmdbId);
  if (raw.season !== undefined && raw.season !== null) item.season = toNumber(raw.season, 0);
  if (raw.episode !== undefined && raw.episode !== null) item.episode = toNumber(raw.episode, 0);

  return item;
}

export function registerWsRoutes(app: Hono): void {
  const handler = upgradeWebSocket((c) => {
    let userId: string | null = null;
    let authTimer: ReturnType<typeof setTimeout> | null = null;
    let messageWindowStart = Date.now();
    let messageCount = 0;

    const clearAuthTimer = () => {
      if (authTimer) {
        clearTimeout(authTimer);
        authTimer = null;
      }
    };

    const handleAuth = async (ctx: WSContext, msg: any) => {
      const token = typeof msg?.token === 'string' ? msg.token.trim() : '';
      if (!token) {
        sendError(ctx, 'AUTH_REQUIRED', 'Потрібен токен у кадрі auth');
        ctx.close(4401, 'auth required');
        return;
      }

      const user = await verifyAuthToken(token);
      if (!user) {
        sendError(ctx, 'INVALID_TOKEN', 'Токен недійсний або прострочений');
        ctx.close(4401, 'invalid token');
        return;
      }

      const uid = user.sub;
      if (userId && userId !== uid) removeSession(userId, ctx);
      userId = uid;
      clearAuthTimer();
      addSession(uid, ctx);

      log('ws', `session authorized (user=${uid.slice(0, 8)}…, sessions=${countUserSessions(uid)})`);

      send(ctx, {
        type: 'hello',
        userId: uid,
        serverTime: Date.now(),
        sessions: countUserSessions(uid),
        ...(msg?.snapshot ? { snapshot: getUserWatchProgress(uid) } : {}),
      });
    };

    const handleProgress = (ctx: WSContext, msg: any) => {
      const uid = userId;
      if (!uid) return;
      const rawItems = Array.isArray(msg?.items) ? msg.items.slice(0, MAX_ITEMS_PER_MESSAGE) : [];
      const applied: Record<string, any>[] = [];

      for (const raw of rawItems) {
        const item = normalizeProgressItem(raw);
        if (!item) continue;
        const { mediaId, ...progress } = item;

        const entry: Record<string, any> = {};
        for (const field of PROGRESS_FIELDS) {
          if (progress[field] !== undefined) (entry as any)[field] = progress[field];
        }

        saveUserWatchProgress(uid, mediaId, entry as any);
        applied.push(item);
      }

      if (applied.length > 0) {
        broadcastToUser(uid, { type: 'progress', items: applied, from: 'peer' }, ctx);
      }
      send(ctx, { type: 'ack', kind: 'progress', applied: applied.length });
    };

    const handleProgressDelete = (ctx: WSContext, msg: any) => {
      const uid = userId;
      if (!uid) return;
      const ids: string[] = Array.isArray(msg?.ids)
        ? [...new Set<string>(msg.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0).map((id: string) => id.trim()))]
        : [];
      if (ids.length === 0) {
        sendError(ctx, 'INVALID_IDS', 'Порожній список ids');
        return;
      }

      for (const mediaId of ids) deleteUserWatchProgress(uid, mediaId);
      broadcastToUser(uid, { type: 'progress-delete', ids, from: 'peer' }, ctx);
      send(ctx, { type: 'ack', kind: 'progress-delete', applied: ids.length });
    };

    return {
      onOpen(_event, ctx) {
        authTimer = setTimeout(() => {
          sendError(ctx, 'AUTH_TIMEOUT', 'Авторизація не отримана вчасно');
          ctx.close(4408, 'auth timeout');
        }, AUTH_TIMEOUT_MS);
        authTimer.unref?.();
      },

      onMessage(event, ctx) {
        const now = Date.now();
        if (now - messageWindowStart > MAX_MESSAGE_WINDOW_MS) {
          messageWindowStart = now;
          messageCount = 0;
        }
        messageCount++;
        if (messageCount > MAX_MESSAGES_PER_WINDOW) {
          sendError(ctx, 'RATE_LIMITED', 'Забагато кадрів за хвилину');
          ctx.close(4429, 'rate limited');
          return;
        }

        if (typeof event.data !== 'string') {
          sendError(ctx, 'BAD_PAYLOAD', 'Очікується текстовий JSON-кадр');
          return;
        }

        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          sendError(ctx, 'BAD_JSON', 'Кадр не є валідним JSON');
          return;
        }
        if (!msg || typeof msg.type !== 'string') {
          sendError(ctx, 'BAD_MESSAGE', 'Відсутнє поле type');
          return;
        }

        if (msg.type === 'auth') {
          handleAuth(ctx, msg).catch((err: unknown) => {
            log('ws', `auth failed: ${err instanceof Error ? err.message : String(err)}`);
            sendError(ctx, 'AUTH_FAILED', 'Не вдалося перевірити токен');
            ctx.close(4500, 'auth failed');
          });
          return;
        }

        if (!userId) {
          sendError(ctx, 'UNAUTHORIZED', 'Спершу надішли кадр auth');
          ctx.close(4401, 'unauthorized');
          return;
        }

        switch (msg.type) {
          case 'progress':
            handleProgress(ctx, msg);
            break;
          case 'progress-delete':
            handleProgressDelete(ctx, msg);
            break;
          case 'ping':
            // Ехо клієнтського t дає змогу міряти RTT, serverTime — звіряти годинники.
            send(ctx, { type: 'pong', t: msg.t ?? now, serverTime: now });
            break;
          default:
            sendError(ctx, 'UNKNOWN_TYPE', `Невідомий тип кадру: ${msg.type}`);
        }
      },

      onClose(_event, ctx) {
        clearAuthTimer();
        if (userId) {
          removeSession(userId, ctx);
          log('ws', `session closed (user=${userId.slice(0, 8)}…, sessions=${countUserSessions(userId)})`);
        }
      },

      onError(event) {
        const raw = (event as any)?.error ?? event;
        log('ws', `connection error: ${raw instanceof Error ? raw.message : String(raw)}`);
      },
    };
  });

  // Hono реєструє роути лінійно, тому /ws живе поруч з /master.m3u8 і не потрапляє під SPA-fallback.
  app.get(WS_PATH, handler);
  app.get(`/api${WS_PATH}`, handler);
  log('ws', `websocket endpoint ready at ${WS_PATH}`);
}
