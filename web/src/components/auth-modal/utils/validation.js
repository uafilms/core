export const TRUSTED_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'ukr.net',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'ymail.com',
  'zoho.com',
]);

export function isTrustedEmailDomain(email) {
  const parts = (email || '').trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (TRUSTED_DOMAINS.has(domain)) return true;
  if (/^(outlook|hotmail|live|msn)\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;
  if (/^yahoo\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;
  return false;
}
