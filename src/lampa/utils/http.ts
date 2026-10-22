declare const Lampa: any;

export function requestJson<T>(url: string, timeoutMs = 15000, headers?: Record<string, string>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Try Lampa.Reguest / Lampa.Request first if available
    try {
      const RequestClass = typeof Lampa !== 'undefined' ? (Lampa.Reguest || Lampa.Request) : null;
      if (RequestClass) {
        const net = new RequestClass();
        net.timeout(timeoutMs);
        net.silent(
          url,
          (res: any) => {
            if (typeof res === 'string') {
              try {
                resolve(JSON.parse(res));
              } catch (e) {
                reject(e);
              }
            } else {
              resolve(res as T);
            }
          },
          (err: any, code: any) => {
            const msg = net.errorDecode ? net.errorDecode(err, code) : `HTTP Error ${code || ''}`;
            reject(new Error(msg));
          },
          false,
          headers ? { headers } : undefined
        );
        return;
      }
    } catch {
      // Fallback to fetch / XHR
    }

    if (typeof fetch === 'function') {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), timeoutMs);
      fetch(url, { headers, signal: controller?.signal })
        .then((resp) => {
          clearTimeout(timer);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.json();
        })
        .then((data) => resolve(data as T))
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
      return;
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeoutMs;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          xhr.setRequestHeader(k, v);
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.ontimeout = () => reject(new Error('Request timed out'));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send();
      return;
    }

    reject(new Error('No HTTP transport available'));
  });
}
