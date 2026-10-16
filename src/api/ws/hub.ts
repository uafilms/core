import type { WSContext } from 'hono/ws';

/**
 * Реєстр активних WebSocket-сесій, згрупований за id користувача.
 *
 * Потрібен для живої синхронізації: коли один пристрій (вкладка, ТБ, телефон)
 * надсилає позицію перегляду, інші сесії того самого акаунта отримують її одразу.
 */
const userSessions = new Map<string, Set<WSContext>>();

export function addSession(userId: string, socket: WSContext): void {
  let sessions = userSessions.get(userId);
  if (!sessions) {
    sessions = new Set();
    userSessions.set(userId, sessions);
  }
  sessions.add(socket);
}

export function removeSession(userId: string, socket: WSContext): void {
  const sessions = userSessions.get(userId);
  if (!sessions) return;
  sessions.delete(socket);
  if (sessions.size === 0) userSessions.delete(userId);
}

/** Надсилає payload усім сесіям користувача. `except` — сокет-відправник, який свої ж оновлення не отримує. */
export function broadcastToUser(userId: string, payload: unknown, except?: WSContext): number {
  const sessions = userSessions.get(userId);
  if (!sessions || sessions.size === 0) return 0;

  const data = JSON.stringify(payload);
  let delivered = 0;
  for (const socket of sessions) {
    if (socket === except) continue;
    if (socket.readyState !== 1) continue;
    try {
      socket.send(data);
      delivered++;
    } catch {
      // Мертвий сокет прибере onClose; тут просто не даємо циклу впасти.
    }
  }
  return delivered;
}

export function countUserSessions(userId: string): number {
  return userSessions.get(userId)?.size ?? 0;
}
