import crypto from 'crypto';
import axios from 'axios';
import { getAuthDb } from '../auth/db.js';

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 mins

export function isTelegramVerificationEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim());
}

export function getBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || 'uafilms_verif_bot';
}

export function createTelegramVerificationSession(): {
  token: string;
  botUsername: string;
  link: string;
  expiresAt: number;
} {
  const db = getAuthDb();
  const token = `uaf_${crypto.randomBytes(6).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const botUsername = getBotUsername();

  db.prepare(`
    INSERT INTO telegram_verifications (token, verified, created_at, expires_at)
    VALUES (?, 0, ?, ?)
  `).run(token, now, expiresAt);

  return {
    token,
    botUsername,
    link: `https://t.me/${botUsername}?start=${token}`,
    expiresAt,
  };
}

export function checkTelegramVerificationStatus(token: string): {
  verified: boolean;
  username?: string;
  error?: string;
  expired: boolean;
} {
  if (!token) {
    return { verified: false, expired: true };
  }

  const db = getAuthDb();
  const row = db.prepare(`
    SELECT telegram_id, telegram_username, verified, expires_at
    FROM telegram_verifications
    WHERE token = ?
  `).get(token) as { telegram_id: string; telegram_username: string; verified: number; expires_at: number } | undefined;

  if (!row) {
    return { verified: false, expired: true };
  }

  const now = Date.now();
  if (now > row.expires_at) {
    return { verified: false, expired: true };
  }

  if (row.verified === 1) {
    return {
      verified: true,
      username: row.telegram_username,
      expired: false,
    };
  }

  if (row.verified === -1) {
    return {
      verified: false,
      error: 'Цей Telegram-акаунт вже прив’язано до іншого користувача',
      expired: false,
    };
  }

  return {
    verified: false,
    expired: false,
  };
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${token.trim()}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      },
      { timeout: 8000 }
    );
    return res.status === 200;
  } catch (err: any) {
    console.error('[TelegramBot Error]', err.response?.data || err.message);
    return false;
  }
}

let isBotPolling = false;
let pollingAbortController: AbortController | null = null;

export async function startTelegramBot(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    console.log('[TelegramBot] TELEGRAM_BOT_TOKEN not configured, skipping bot initialization.');
    return;
  }

  if (isBotPolling) return;
  isBotPolling = true;
  pollingAbortController = new AbortController();

  // 1. Fetch bot details to ensure valid username
  try {
    const meRes = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 10000 });
    if (meRes.data?.ok && meRes.data?.result?.username) {
      process.env.TELEGRAM_BOT_USERNAME = meRes.data.result.username;
    }
  } catch (err: any) {
    console.warn('[TelegramBot] Could not fetch getMe:', err.message);
  }

  // 2. Clear webhook if any
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {}, { timeout: 10000 });
  } catch {
    // Ignore
  }

  console.log(`[TelegramBot] Bot @${getBotUsername()} started long-polling for verification updates.`);

  // 3. Polling loop
  let offset = 0;

  (async () => {
    while (isBotPolling && !pollingAbortController?.signal.aborted) {
      try {
        const res = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
          params: {
            offset,
            timeout: 25,
            allowed_updates: JSON.stringify(['message']),
          },
          timeout: 35000,
          signal: pollingAbortController?.signal,
        });

        if (res.data?.ok && Array.isArray(res.data.result)) {
          for (const update of res.data.result) {
            offset = update.update_id + 1;
            const msg = update.message;
            if (!msg || !msg.text) continue;

            const text = msg.text.trim();
            const chatId = msg.chat.id;
            const fromId = String(msg.from?.id || chatId);
            const username = msg.from?.username || msg.from?.first_name || '';

            // Handle /start <token> or /code <token>
            const tokenMatch = text.match(/^\/(?:start|code)\s+([a-zA-Z0-9_-]+)/i);

            if (tokenMatch) {
              const token = tokenMatch[1].trim();
              const db = getAuthDb();

              // Check if telegram_id is already bound to another user (1 account per telegram user)
              const existingUser = db.prepare('SELECT id, email FROM users WHERE telegram_id = ?').get(fromId) as
                | { id: string; email: string }
                | undefined;

              if (existingUser) {
                db.prepare('UPDATE telegram_verifications SET verified = -1 WHERE token = ?').run(token);
                await sendTelegramMessage(
                  chatId,
                  `❌ <b>Помилка:</b> Ваш Telegram-акаунт вже прив'язаний до користувача (<code>${existingUser.email}</code>).\n\nПравило сервісу: <b>лише 1 акаунт UAFilms на користувача Telegram</b>.`
                );
                continue;
              }

              // Check verification token in db
              const now = Date.now();
              const verifRow = db.prepare('SELECT token, expires_at FROM telegram_verifications WHERE token = ?').get(token) as
                | { token: string; expires_at: number }
                | undefined;

              if (!verifRow || now > verifRow.expires_at) {
                await sendTelegramMessage(
                  chatId,
                  '⚠️ <b>Код верифікації застарів або недійсний.</b>\n\nБудь ласка, отримайте нове посилання для реєстрації на сайті UAFilms.'
                );
                continue;
              }

              // Mark token verified!
              db.prepare(`
                UPDATE telegram_verifications 
                SET verified = 1, telegram_id = ?, telegram_username = ? 
                WHERE token = ?
              `).run(fromId, username, token);

              await sendTelegramMessage(
                chatId,
                `✅ <b>Верифікацію успішно пройдено!</b>\n\nВаш акаунт Telegram підтверджено. Тепер поверніться на сайт UAFilms та натисніть «Зареєструватися».`
              );
            } else if (text.startsWith('/start')) {
              await sendTelegramMessage(
                chatId,
                '👋 <b>Вітаємо у UAFilms!</b>\n\nЦей бот слугує для підтвердження акаунта під час реєстрації на сайті.\n\nНатисніть кнопку <b>«Підтвердити через Telegram»</b> на сайті для переходу з кодом.'
              );
            }
          }
        }
      } catch (err: any) {
        if (pollingAbortController?.signal.aborted) break;
        // Backoff slightly on network error
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
}

export function stopTelegramBot(): void {
  isBotPolling = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
}
