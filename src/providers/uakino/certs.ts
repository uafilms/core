import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import axios from 'axios';

const APK_URL = 'https://uakino.app/installer/android/UAKino.apk';

export interface UakinoCerts {
  cert: Buffer;
  key: Buffer;
}

function getCacheCertDir(): string {
  const dir = path.resolve(process.cwd(), 'cache/uakino');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Parses zip archive buffer and extracts certificate files without external CLI dependencies.
 */
function extractCertsFromZip(buf: Buffer): { cert: Buffer | null; key: Buffer | null } {
  let cert: Buffer | null = null;
  let key: Buffer | null = null;

  let offset = 0;
  while (offset < buf.length - 30) {
    // Local file header magic 0x04034b50 ('PK\x03\x04')
    if (buf.readUInt32LE(offset) === 0x04034b50) {
      const method = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const uncompSize = buf.readUInt32LE(offset + 22);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const fileName = buf.toString('utf8', offset + 30, offset + 30 + nameLen);

      const dataOffset = offset + 30 + nameLen + extraLen;

      if (
        fileName.includes('client_certificate.pem') ||
        fileName.endsWith('cert.pem') ||
        (fileName.includes('cert') && fileName.endsWith('.pem'))
      ) {
        if (method === 0) {
          cert = buf.subarray(dataOffset, dataOffset + uncompSize);
        } else if (method === 8) {
          cert = zlib.inflateRawSync(buf.subarray(dataOffset, dataOffset + compSize));
        }
      }

      if (
        fileName.includes('client_key.pem') ||
        fileName.endsWith('cert.key') ||
        (fileName.includes('key') && (fileName.endsWith('.pem') || fileName.endsWith('.key')))
      ) {
        if (method === 0) {
          key = buf.subarray(dataOffset, dataOffset + uncompSize);
        } else if (method === 8) {
          key = zlib.inflateRawSync(buf.subarray(dataOffset, dataOffset + compSize));
        }
      }

      offset = dataOffset + compSize;
    } else {
      offset++;
    }
  }

  return { cert, key };
}

/**
 * Downloads the latest UAKino APK and extracts client certificates directly to cache/uakino/.
 */
export async function downloadAndExtractUakinoCerts(): Promise<UakinoCerts> {
  console.log(`[UAKino] Downloading latest APK from ${APK_URL}...`);
  const response = await axios.get(APK_URL, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const zipBuffer = Buffer.from(response.data);
  const { cert, key } = extractCertsFromZip(zipBuffer);

  if (!cert || !key) {
    throw new Error('[UAKino] Failed to find client certificates inside downloaded APK');
  }

  const certDir = getCacheCertDir();
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'cert.key');

  fs.writeFileSync(certPath, cert);
  fs.writeFileSync(keyPath, key);

  console.log(`[UAKino] Successfully saved fresh certificates to ${certDir}`);
  return { cert, key };
}

/**
 * Retrieves valid certificates.
 * If cache is missing or forceRefresh is true, downloads the latest APK from uakino.app.
 */
export async function getUakinoCertificates(forceRefresh = false): Promise<UakinoCerts> {
  const cacheDir = getCacheCertDir();
  const cachedCertPath = path.join(cacheDir, 'cert.pem');
  const cachedKeyPath = path.join(cacheDir, 'cert.key');

  if (!forceRefresh && fs.existsSync(cachedCertPath) && fs.existsSync(cachedKeyPath)) {
    try {
      const cert = fs.readFileSync(cachedCertPath);
      const key = fs.readFileSync(cachedKeyPath);
      if (cert.length > 0 && key.length > 0) {
        return { cert, key };
      }
    } catch {
      // Fall through to download
    }
  }

  try {
    return await downloadAndExtractUakinoCerts();
  } catch (err) {
    console.error(`[UAKino] Certificate extraction failed: ${(err as Error).message}`);

    // Fallback to legacy certs directory if present
    const legacyDirs = [
      path.resolve(process.cwd(), 'certs/uakino'),
      path.resolve(process.cwd(), 'core/certs/uakino'),
    ];
    for (const dir of legacyDirs) {
      const pCert = path.join(dir, 'cert.pem');
      const pKey = path.join(dir, 'cert.key');
      if (fs.existsSync(pCert) && fs.existsSync(pKey)) {
        console.warn(`[UAKino] Using legacy fallback certificates from ${dir}`);
        return {
          cert: fs.readFileSync(pCert),
          key: fs.readFileSync(pKey),
        };
      }
    }

    throw err;
  }
}
