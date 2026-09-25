import { Hono } from 'hono';
import {
  registerUser,
  loginUser,
  getUserById,
  createApiKey,
  listUserApiKeys,
  revokeApiKey,
  getUserStats,
  verifyAuthToken,
  changePassword,
  deleteAccount,
  getUserFavorites,
  saveUserFavorite,
  removeUserFavorite,
  getUserWatchProgress,
  saveUserWatchProgress,
  deleteUserWatchProgress,
  getUserSyncSettings,
  syncUserData,
} from './service.js';
import { isTurnstileEnabled, verifyTurnstileToken } from '../services/turnstile.js';
import { extractTurnstileToken, getClientIp } from '../services/security.js';

export const authRouter = new Hono();

// Auth token middleware
authRouter.use('*', async (c, next) => {
  const p = c.req.path;
  if (p.endsWith('/register') || p.endsWith('/login')) {
    return next();
  }

  const authHeader = c.req.header('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Необхідна авторизація' } }, 401);
  }

  const token = authHeader.slice(7).trim();
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Недійсний або прострочений токен' } }, 401);
  }

  c.set('userId' as any, payload.sub);
  c.set('userEmail' as any, payload.email);
  return next();
});

// Register
authRouter.post('/register', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));

    if (isTurnstileEnabled()) {
      const turnstileToken = extractTurnstileToken(c, body.turnstileToken || body.cf_turnstile_response);
      const ip = getClientIp(c);
      const check = await verifyTurnstileToken(turnstileToken, ip);
      if (!check.success) {
        return c.json(
          {
            error: {
              code: 'TURNSTILE_VERIFICATION_FAILED',
              message: 'Помилка перевірки Cloudflare Turnstile. Оновіть сторінку або повторіть спробу.',
              details: { errorCodes: check.errorCodes },
            },
          },
          403
        );
      }
    }

    const { email, password } = body;
    const result = await registerUser(email, password);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: { code: 'REGISTER_FAILED', message: err.message || 'Помилка реєстрації' } }, 400);
  }
});

// Login
authRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));

    if (isTurnstileEnabled()) {
      const turnstileToken = extractTurnstileToken(c, body.turnstileToken || body.cf_turnstile_response);
      const ip = getClientIp(c);
      const check = await verifyTurnstileToken(turnstileToken, ip);
      if (!check.success) {
        return c.json(
          {
            error: {
              code: 'TURNSTILE_VERIFICATION_FAILED',
              message: 'Помилка перевірки Cloudflare Turnstile. Оновіть сторінку або повторіть спробу.',
              details: { errorCodes: check.errorCodes },
            },
          },
          403
        );
      }
    }

    const { email, password } = body;
    const result = await loginUser(email, password);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: { code: 'LOGIN_FAILED', message: err.message || 'Помилка авторизації' } }, 401);
  }
});

// Current User Profile
authRouter.get('/me', async (c) => {
  const userId = c.get('userId' as any) as string;
  const user = getUserById(userId);
  if (!user) {
    return c.json({ error: { code: 'USER_NOT_FOUND', message: 'Користувача не знайдено' } }, 404);
  }
  return c.json({ user });
});

// List API Keys
authRouter.get('/keys', async (c) => {
  const userId = c.get('userId' as any) as string;
  const keys = listUserApiKeys(userId);
  return c.json({ keys });
});

// Create API Key
authRouter.post('/keys', async (c) => {
  const userId = c.get('userId' as any) as string;
  const body = await c.req.json().catch(() => ({}));
  const name = body.name || 'Default Key';
  const result = createApiKey(userId, name);
  return c.json(result, 201);
});

// Revoke/Delete API Key
authRouter.delete('/keys/:id', async (c) => {
  const userId = c.get('userId' as any) as string;
  const keyId = c.req.param('id');
  const success = revokeApiKey(userId, keyId);
  if (!success) {
    return c.json({ error: { code: 'KEY_NOT_FOUND', message: 'Ключ не знайдено' } }, 404);
  }
  return c.json({ success: true, message: 'Ключ успішно відкликано' });
});

// Get User Statistics
authRouter.get('/stats', async (c) => {
  const userId = c.get('userId' as any) as string;
  const stats = getUserStats(userId);
  return c.json({ stats });
});

// Change Password
authRouter.post('/change-password', async (c) => {
  const userId = c.get('userId' as any) as string;
  try {
    const body = await c.req.json().catch(() => ({}));
    const { currentPassword, newPassword } = body;
    changePassword(userId, currentPassword, newPassword);
    return c.json({ success: true, message: 'Пароль успішно змінено' });
  } catch (err: any) {
    return c.json({ error: { code: 'CHANGE_PASSWORD_FAILED', message: err.message || 'Помилка зміни паролю' } }, 400);
  }
});

// Delete Account
authRouter.delete('/account', async (c) => {
  const userId = c.get('userId' as any) as string;
  try {
    const body = await c.req.json().catch(() => ({}));
    const { password } = body;
    deleteAccount(userId, password);
    return c.json({ success: true, message: 'Акаунт успішно видалено' });
  } catch (err: any) {
    return c.json({ error: { code: 'DELETE_ACCOUNT_FAILED', message: err.message || 'Помилка видалення акаунту' } }, 400);
  }
});

// Full Cloud Sync (Fetch)
authRouter.get('/sync', async (c) => {
  const userId = c.get('userId' as any) as string;
  const favorites = getUserFavorites(userId);
  const watchProgress = getUserWatchProgress(userId);
  const settings = getUserSyncSettings(userId);
  return c.json({ favorites, watchProgress, settings });
});

// Full Cloud Sync (Merge)
authRouter.post('/sync', async (c) => {
  const userId = c.get('userId' as any) as string;
  try {
    const payload = await c.req.json().catch(() => ({}));
    const merged = syncUserData(userId, payload);
    return c.json(merged);
  } catch (err: any) {
    return c.json({ error: { code: 'SYNC_FAILED', message: err.message || 'Помилка синхронізації' } }, 400);
  }
});

// Single Favorite Toggle Sync
authRouter.post('/sync/favorite', async (c) => {
  const userId = c.get('userId' as any) as string;
  try {
    const body = await c.req.json().catch(() => ({}));
    const { item, isFav } = body;
    if (!item || !item.id) {
      return c.json({ error: { code: 'INVALID_ITEM', message: 'Відсутній id об’єкта' } }, 400);
    }
    if (isFav) {
      saveUserFavorite(userId, item);
    } else {
      removeUserFavorite(userId, item.id);
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: { code: 'FAVORITE_SYNC_FAILED', message: err.message } }, 400);
  }
});

// Single Watch Progress Sync
authRouter.post('/sync/progress', async (c) => {
  const userId = c.get('userId' as any) as string;
  try {
    const body = await c.req.json().catch(() => ({}));
    const { mediaId, deleted, ...progressData } = body;
    if (!mediaId) {
      return c.json({ error: { code: 'INVALID_MEDIA_ID', message: 'Відсутній mediaId' } }, 400);
    }
    if (deleted) {
      deleteUserWatchProgress(userId, mediaId);
    } else {
      saveUserWatchProgress(userId, mediaId, {
        time: Number(progressData.time || 0),
        duration: Number(progressData.duration || 0),
        updated: progressData.updated || Date.now(),
        title: progressData.title,
        poster: progressData.poster,
        mediaType: progressData.mediaType,
        tmdbId: progressData.tmdbId,
        season: progressData.season,
        episode: progressData.episode,
      });
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: { code: 'PROGRESS_SYNC_FAILED', message: err.message } }, 400);
  }
});
