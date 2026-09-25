import { log, logWarn } from '../../utils/logger.js';

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SECRET_KEY.trim());
}

export function getTurnstileSiteKey(): string {
  return (process.env.TURNSTILE_SITE_KEY || '').trim();
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  if (!isTurnstileEnabled()) {
    return { success: true };
  }

  const cleanToken = (token || '').trim();
  if (!cleanToken || cleanToken === 'disabled') {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  try {
    const secret = process.env.TURNSTILE_SECRET_KEY!.trim();
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', cleanToken);
    if (remoteIp && remoteIp !== 'unknown') {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      logWarn('turnstile', `siteverify HTTP error: ${res.status}`);
      return { success: false, errorCodes: [`http-status-${res.status}`] };
    }

    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      logWarn('turnstile', `verification failed: ${JSON.stringify(data['error-codes'] || [])}`);
      return { success: false, errorCodes: data['error-codes'] };
    }

    return { success: true };
  } catch (err: any) {
    logWarn('turnstile', `verification exception: ${err.message}`);
    return { success: false, errorCodes: ['internal-verification-error'] };
  }
}
