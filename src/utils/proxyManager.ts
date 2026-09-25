import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { AsyncLocalStorage } from 'node:async_hooks';
import { log, logWarn } from './logger.js';

const providerContext = new AsyncLocalStorage<string>();

/**
 * Runs a function within the context of a given provider/vod name
 */
export function runWithProvider<T>(providerName: string, fn: () => T): T {
  return providerContext.run(providerName.toLowerCase().trim(), fn);
}

/**
 * Returns the currently active provider name if executing within runWithProvider
 */
export function getActiveProvider(): string | undefined {
  return providerContext.getStore();
}

export interface ProxyConfigResult {
  httpAgent?: any;
  httpsAgent?: any;
  proxy?: false;
}

export class ProxyManager {
  private agents: any[] = [];
  private proxyAll = false;
  private enabledSet = new Set<string>();
  private counter = 0;

  constructor() {
    this.reload();
  }

  public reload() {
    const proxyUrls = process.env.PROXIES
      ? process.env.PROXIES.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    this.agents = proxyUrls
      .map((url) => {
        try {
          if (url.startsWith('socks')) {
            return new SocksProxyAgent(url);
          }
          return new HttpsProxyAgent(url);
        } catch (e: any) {
          logWarn('proxy', `Invalid proxy URL: ${url} (${e.message})`);
          return null;
        }
      })
      .filter((a): a is any => a !== null);

    const rawList = (process.env.PROXIED_PROVIDERS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    this.proxyAll = rawList.includes('*');
    this.enabledSet = new Set(rawList);
    this.counter = 0;

    if (this.agents.length > 0) {
      log('proxy', `Initialized ${this.agents.length} proxy agents. Proxied targets: ${this.proxyAll ? '*' : Array.from(this.enabledSet).join(', ') || 'none'}`);
    }
  }

  public isProxied(target?: string, url?: string): boolean {
    if (this.agents.length === 0) return false;
    if (this.proxyAll) return true;

    const lowerTarget = (target || '').toLowerCase().trim();
    if (lowerTarget && this.enabledSet.has(lowerTarget)) {
      return true;
    }

    if (url) {
      const lowerUrl = url.toLowerCase();
      for (const item of this.enabledSet) {
        if (lowerUrl.includes(item)) {
          return true;
        }
      }
    }

    return false;
  }

  public getConfig(target?: string, url?: string): ProxyConfigResult {
    const active = target || getActiveProvider();
    if (!this.isProxied(active, url)) {
      return {};
    }

    const agent = this.agents[this.counter % this.agents.length];
    this.counter++;
    return {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    };
  }
}

export const proxyManager = new ProxyManager();
