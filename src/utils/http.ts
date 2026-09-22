import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': DEFAULT_USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
};

export interface HttpRequestOptions extends AxiosRequestConfig {
  timeout?: number;
  retries?: number;
}

export async function request<T = any>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<AxiosResponse<T>> {
  const { retries = 1, timeout = 12000, headers, ...rest } = options;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await axios({
        url,
        timeout,
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
        },
        ...rest,
      });
    } catch (err: any) {
      if (attempt >= retries || err.name === 'CanceledError' || options.signal?.aborted) {
        throw err;
      }
      attempt++;
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(`Request failed after ${retries} retries: ${url}`);
}

export async function httpRequest<T = any>(
  urlOrOptions: string | (HttpRequestOptions & { url: string }),
  options?: HttpRequestOptions
): Promise<AxiosResponse<T>> {
  if (typeof urlOrOptions === 'string') {
    return request<T>(urlOrOptions, options || {});
  }
  const { url, ...rest } = urlOrOptions;
  return request<T>(url, rest);
}

export async function getHtml(url: string, options: HttpRequestOptions = {}): Promise<string> {
  const res = await request<string>(url, {
    responseType: 'text',
    ...options,
  });
  return res.data;
}
