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
  private targetAgents = new Map<string, any[]>();
  private proxyAll = false;
  private enabledSet = new Set<string>();
  private counter = 0;

  constructor() {
    this.reload();
  }

  private createAgent(rawUrl: string): any | null {
    let url = rawUrl;
    if (url.includes('gw.dataimpulse.com') && !url.includes('__sessid')) {
      url = url.replace(/(__cr\.[a-z]{2})/i, (m) => `${m}__sessid.uafilms`);
    }
    try {
      if (url.startsWith('socks')) {
        return new SocksProxyAgent(url);
      }
      return new HttpsProxyAgent(url);
    } catch (e: any) {
      logWarn('proxy', `Invalid proxy URL: ${rawUrl} (${e.message})`);
      return null;
    }
  }

  public reload() {
    this.agents = [];
    this.targetAgents.clear();

    const rawEntries = process.env.PROXIES
      ? process.env.PROXIES.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    for (const rawEntry of rawEntries) {
      // Optional per-provider prefix: "ashdi:socks5://user:pass@host:port".
      // Plain URLs keep the old global-pool behaviour.
      const match = rawEntry.match(/^([a-z0-9][a-z0-9_-]*):((?:socks5h?|socks4a?|https?):\/\/.+)$/i);
      const target = match ? match[1].toLowerCase() : '';
      const rawUrl = match ? match[2] : rawEntry;
      const agent = this.createAgent(rawUrl);
      if (!agent) continue;

      if (target) {
        const list = this.targetAgents.get(target) ?? [];
        list.push(agent);
        this.targetAgents.set(target, list);
      } else {
        this.agents.push(agent);
      }
    }

    const rawList = (process.env.PROXIED_PROVIDERS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    this.proxyAll = rawList.includes('*');
    this.enabledSet = new Set(rawList);
    this.counter = 0;

    const targetSummary = Array.from(this.targetAgents.entries())
      .map(([name, list]) => `${name}=${list.length}`)
      .join(', ');

    if (this.agents.length > 0 || this.targetAgents.size > 0) {
      log(
        'proxy',
        `Initialized ${this.agents.length} global agents` +
          (targetSummary ? `; per-target: ${targetSummary}` : '') +
          `. Proxied targets: ${this.proxyAll ? '*' : Array.from(this.enabledSet).join(', ') || 'none'}`
      );
    }
  }

  public isProxied(target?: string, url?: string): boolean {
    const active = (target || getActiveProvider() || '').toLowerCase().trim();
    if (active && (this.targetAgents.get(active)?.length ?? 0) > 0) {
      return true;
    }
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
    const active = (target || getActiveProvider() || '').toLowerCase().trim();
    const targetPool = active ? this.targetAgents.get(active) : undefined;
    const pool = targetPool && targetPool.length > 0 ? targetPool : this.agents;

    if (pool.length === 0) {
      return {};
    }
    // A per-target pool always applies; the global pool still obeys
    // PROXIED_PROVIDERS so unrelated providers stay direct.
    if (!(targetPool && targetPool.length > 0) && !this.isProxied(active, url)) {
      return {};
    }

    const agent = pool[this.counter % pool.length];
    this.counter++;
    return {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    };
  }
}

export const proxyManager = new ProxyManager();
