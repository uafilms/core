import crypto from 'crypto';
import axios from 'axios';
import { webcrack } from 'webcrack';

let cachedKey: string = '297796CCB81D255125'; // Fallback default

/**
 * Extract encryption key from uaserials bundle using webcrack
 */
export async function extractKeyFromJs(jsUrl: string): Promise<string | null> {
  try {
    const { data: jsCode } = await axios.get(jsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000,
    });

    const cracked = await webcrack(jsCode, { mangle: false, unminify: true });
    const match = cracked.code.match(/var\s+dd\s*=\s*["']([^"']+)["']/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err: any) {
    console.error('[UASerials] Failed to extract key via webcrack:', err.message);
  }
  return null;
}

/**
 * AES-256-CBC Decryptor with PBKDF2 SHA-512 (CryptoJS AES format)
 */
function decryptWithKey(passphrase: string, jsonStr: string): any[] {
  const parsed = JSON.parse(jsonStr);
  const salt = Buffer.from(parsed.salt, 'hex');
  const iv = Buffer.from(parsed.iv, 'hex');
  const key = crypto.pbkdf2Sync(passphrase, salt, 999, 32, 'sha512');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(parsed.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  const cleanJson = decrypted.replace(/\\/g, '');
  return JSON.parse(cleanJson);
}

/**
 * Decrypts player-control data tag with automatic cache and re-decryption on failure
 */
export async function decryptDataTag(
  dataTag: string,
  jsBundleUrl: string = 'https://uaserials.com/templates/uaserials2020/js/fe68ee32.min.js'
): Promise<any[]> {
  if (!dataTag) return [];

  // Try cached key first
  try {
    return decryptWithKey(cachedKey, dataTag);
  } catch (e) {
    console.warn('[UASerials] Decryption failed with cached key. Re-extracting with webcrack...');
  }

  // Key outdated or failed -> re-extract using webcrack
  const freshKey = await extractKeyFromJs(jsBundleUrl);
  if (freshKey) {
    cachedKey = freshKey;
    console.log(`[UASerials] Updated cached key: ${cachedKey}`);
    return decryptWithKey(cachedKey, dataTag);
  }

  throw new Error('Could not decrypt UASerials player data: invalid key');
}
