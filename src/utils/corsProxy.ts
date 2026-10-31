import axios from 'axios';
import { DEFAULT_USER_AGENT } from './http.js';
import { log, logWarn } from './logger.js';

/**
 * CORS-проксі, через які браузер тягне HLS-сегменти CDN без
 * `Access-Control-Allow-Origin`. Список і порядок задаються у `CORS_PROXIES`
 * (через кому), перший живий проксі має найвищий пріоритет.
 */

const HEALTH_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const PROBE_URL = 'https://www.google.com/robots.txt';
const PROBE_TIMEOUT_MS = 10000;

interface CorsProxyEntry {
  base: string;
  healthy: boolean | null;
  checkedAt?: number;
}

let entries: CorsProxyEntry[] | null = null;
let interval: ReturnType<typeof setInterval> | undefined;
let checking = false;

function normalizeBase(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return '';
  }
}

function parseEntries(): CorsProxyEntry[] {
  const raw = process.env.CORS_PROXIES ?? '';
  const seen = new Set<string>();
  const parsed: CorsProxyEntry[] = [];

  for (const item of raw.split(',')) {
    const base = normalizeBase(item);
    if (!base || seen.has(base)) continue;
    seen.add(base);
    parsed.push({ base, healthy: null });
  }

  return parsed;
}

function getEntries(): CorsProxyEntry[] {
  if (!entries) entries = parseEntries();
  return entries;
}

/** Усі налаштовані проксі у вихідному порядку з .env. */
export function getCorsProxies(): string[] {
  return getEntries().map((entry) => entry.base);
}

/** Проксі з найвищим пріоритетом серед живих (або перший, якщо живість невідома). */
export function getActiveCorsProxy(): string {
  return getOrderedEntries()[0]?.base ?? '';
}

/** Статус останньої перевірки: true/false, або null якщо ще не перевіряли. */
export function isCorsProxyHealthy(base: string): boolean | null {
  return getEntries().find((entry) => entry.base === base)?.healthy ?? null;
}

/**
 * Прибирає з URL префікс будь-якого налаштованого CORS-проксі.
 * Потрібно для посилань, які вже переписані у плейлисті або прийшли від клієнта.
 */
export function stripCorsProxy(url: string): string {
  let current = url.trim();
  for (const entry of getEntries()) {
    while (current.startsWith(entry.base)) {
      current = current.slice(entry.base.length);
    }
  }
  return current;
}

function getOrderedEntries(): CorsProxyEntry[] {
  // Живі проксі зберігають порядок .env, мертві йдуть у кінець.
  return [...getEntries()].sort(
    (a, b) => Number(a.healthy === false) - Number(b.healthy === false)
  );
}

async function probe(entry: CorsProxyEntry): Promise<void> {
  try {
    const res = await axios.get<string>(`${entry.base}${PROBE_URL}`, {
      responseType: 'text',
      timeout: PROBE_TIMEOUT_MS,
      maxRedirects: 3,
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    entry.healthy = typeof res.data === 'string' && res.data.length > 100;
    if (!entry.healthy) {
      logWarn('cors', `proxy ${entry.base} returned an unexpected response`);
    }
  } catch (err: unknown) {
    entry.healthy = false;
    logWarn('cors', `proxy ${entry.base} unavailable: ${(err as Error).message}`);
  } finally {
    entry.checkedAt = Date.now();
  }
}

/** Перевіряє всі проксі паралельно й оновлює їхній пріоритет. */
export async function checkCorsProxies(): Promise<void> {
  const list = getEntries();
  if (list.length === 0 || checking) return;

  checking = true;
  try {
    await Promise.all(list.map((entry) => probe(entry)));
    const alive = list.filter((entry) => entry.healthy !== false).length;
    log(
      'cors',
      `health check: ${alive}/${list.length} alive, active ${getActiveCorsProxy() || 'none'}`
    );
  } finally {
    checking = false;
  }
}

/** Запускає першу перевірку одразу й повторює її кожні 30 хвилин. */
export function startCorsProxyHealthChecks(): void {
  if (getEntries().length === 0) {
    logWarn('cors', 'CORS_PROXIES is empty, segment CORS proxy is disabled');
    return;
  }
  if (interval) return;

  void checkCorsProxies();
  interval = setInterval(() => {
    void checkCorsProxies();
  }, HEALTH_CHECK_INTERVAL_MS);
  interval.unref?.();
}
