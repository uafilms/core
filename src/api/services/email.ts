import crypto from 'crypto';
import axios from 'axios';
import { getAuthDb } from '../auth/db.js';
import { isTrustedEmailDomain } from '../auth/service.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const CODE_TTL_MS = 15 * 60 * 1000; // 15 mins
const COOLDOWN_MS = 60 * 1000; // 60s cooldown

export function isEmailVerificationEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

export async function sendEmailViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return false;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'UAFilms <onboarding@resend.dev>';

  const res = await axios.post(
    RESEND_API_URL,
    {
      from: fromEmail,
      to: [to],
      subject,
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return res.status >= 200 && res.status < 300;
}

export async function requestEmailVerificationCode(email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Некоректний формат email');
  }

  if (!isTrustedEmailDomain(cleanEmail)) {
    throw new Error('Дозволені лише надійні поштові сервіси: Gmail, Outlook/Hotmail, Proton, Yahoo, iCloud, Ukr.net');
  }

  const db = getAuthDb();

  // Check if user already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existingUser) {
    throw new Error('Користувач із таким email вже зареєстрований');
  }

  const now = Date.now();

  // Check cooldown
  const row = db.prepare('SELECT last_sent_at FROM email_verifications WHERE email = ?').get(cleanEmail) as
    | { last_sent_at: number }
    | undefined;

  if (row && now - row.last_sent_at < COOLDOWN_MS) {
    const remainingSec = Math.ceil((COOLDOWN_MS - (now - row.last_sent_at)) / 1000);
    throw new Error(`Будь ласка, зачекайте ${remainingSec} сек. перед повторною відправкою коду`);
  }

  // Generate 6 digit code
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashCode(code);
  const expiresAt = now + CODE_TTL_MS;

  // Save to DB (100% backward compatible upsert)
  db.prepare(`
    INSERT INTO email_verifications (email, code_hash, attempts, last_sent_at, expires_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      code_hash = excluded.code_hash,
      attempts = 0,
      last_sent_at = excluded.last_sent_at,
      expires_at = excluded.expires_at
  `).run(cleanEmail, codeHash, now, expiresAt);

  // Send via Resend or log in DEV
  if (isEmailVerificationEnabled()) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; text-align: center;">Підтвердження реєстрації UAFilms</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">Вітаємо! Ваш код для підтвердження електронної пошти:</p>
          <div style="background: #f1f5f9; padding: 18px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0284c7; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.4;">Код дійсний протягом 15 хвилин. Якщо ви не реєструвалися на сайті UAFilms, просто проігноруйте цей лист.</p>
        </div>
      `;
      await sendEmailViaResend(cleanEmail, `${code} — Код підтвердження UAFilms`, html);
    } catch (err: any) {
      console.error('[Resend Error]', err.response?.data || err.message);
      throw new Error(`Не вдалося надіслати лист: ${err.response?.data?.message || err.message}`);
    }
  } else {
    console.log(`[Email Verification DEV] Code for ${cleanEmail}: ${code}`);
  }

  return { success: true, message: 'Код надіслано на вашу електронну пошту' };
}

export function verifyEmailCode(email: string, code: string): void {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanCode = (code || '').trim();

  if (!cleanCode) {
    throw new Error('Введіть 6-значний код підтвердження');
  }

  const db = getAuthDb();
  const row = db.prepare('SELECT code_hash, attempts, expires_at FROM email_verifications WHERE email = ?').get(cleanEmail) as
    | { code_hash: string; attempts: number; expires_at: number }
    | undefined;

  if (!row) {
    throw new Error('Код підтвердження не знайдено або термін його дії минув');
  }

  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM email_verifications WHERE email = ?').run(cleanEmail);
    throw new Error('Термін дії коду минув. Будь ласка, отримайте новий код');
  }

  if (row.attempts >= 5) {
    db.prepare('DELETE FROM email_verifications WHERE email = ?').run(cleanEmail);
    throw new Error('Забагато невірних спроб. Будь ласка, отримайте новий код');
  }

  const expectedHash = hashCode(cleanCode);
  if (expectedHash !== row.code_hash) {
    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?').run(cleanEmail);
    const left = 4 - row.attempts;
    throw new Error(`Невірний код підтвердження. Залишилось спроб: ${Math.max(0, left)}`);
  }

  // Code verified! Delete record to prevent reuse
  db.prepare('DELETE FROM email_verifications WHERE email = ?').run(cleanEmail);
}
