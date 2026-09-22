import http2 from 'node:http2';
import zlib from 'node:zlib';

export interface Http2RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  data?: string | Buffer;
  timeout?: number;
  signal?: AbortSignal;
}

export interface Http2Response<T = any> {
  status: number;
  headers: http2.IncomingHttpHeaders;
  data: T;
}

export async function http2Request<T = string>(
  urlStr: string,
  options: Http2RequestOptions = {}
): Promise<Http2Response<T>> {
  const url = new URL(urlStr);
  const origin = url.origin;
  const path = url.pathname + url.search;

  return new Promise((resolve, reject) => {
    let client: http2.ClientHttp2Session | null = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (client && !client.destroyed) {
        client.close();
      }
    };

    try {
      client = http2.connect(origin);
    } catch (err) {
      return reject(err);
    }

    client.on('error', (err) => {
      if (!finished) {
        cleanup();
        reject(err);
      }
    });

    const timeout = options.timeout || 15000;
    client.setTimeout(timeout, () => {
      if (!finished) {
        cleanup();
        reject(new Error(`HTTP/2 request timeout after ${timeout}ms`));
      }
    });

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        if (!finished) {
          cleanup();
          reject(new Error('HTTP/2 request aborted'));
        }
      });
    }

    const method = options.method || 'GET';
    const requestHeaders: http2.OutgoingHttpHeaders = {
      ':path': path,
      ':method': method,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'accept': '*/*',
      'accept-encoding': 'gzip, deflate, br',
      ...options.headers,
    };

    if (options.data && method === 'POST') {
      const byteLen = Buffer.isBuffer(options.data)
        ? options.data.length
        : Buffer.byteLength(options.data);
      requestHeaders['content-length'] = byteLen;
    }

    const req = client.request(requestHeaders);

    req.on('error', (err) => {
      if (!finished) {
        cleanup();
        reject(err);
      }
    });

    let resHeaders: http2.IncomingHttpHeaders = {};
    req.on('response', (h) => {
      resHeaders = h;
    });

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      cleanup();
      const status = Number(resHeaders[':status']) || 200;
      const rawBuffer = Buffer.concat(chunks);
      let decompressed = rawBuffer;

      const encoding = (resHeaders['content-encoding'] as string) || '';
      try {
        if (encoding.includes('br')) {
          decompressed = zlib.brotliDecompressSync(rawBuffer);
        } else if (encoding.includes('gzip')) {
          decompressed = zlib.gunzipSync(rawBuffer);
        } else if (encoding.includes('deflate')) {
          decompressed = zlib.inflateSync(rawBuffer);
        }
      } catch (decompressErr) {
        return reject(decompressErr);
      }

      const text = decompressed.toString('utf-8');
      let resultData: any = text;

      const contentType = (resHeaders['content-type'] as string) || '';
      if (contentType.includes('application/json')) {
        try {
          resultData = JSON.parse(text);
        } catch {}
      }

      resolve({
        status,
        headers: resHeaders,
        data: resultData as T,
      });
    });

    if (options.data && method === 'POST') {
      req.write(options.data);
    }
    req.end();
  });
}
