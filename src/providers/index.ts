export { UakinoProvider, uakinoProvider, uakino } from './uakino/main.js';
export { KinoUkrProvider, kinoukrProvider, kinoukr } from './kinoukr/main.js';
export { UaSerialsProvider, uaserialsProvider } from './uaserials/main.js';
export { UaSerialsMyProvider, uaserialsMyProvider } from './uaserials-my/main.js';
export { EneyidaProvider, eneyidaProvider } from './eneyida/main.js';
export { WormholeProvider, wormholeProvider } from './wormhole/main.js';
export { BambooUaProvider, bambooUaProvider } from './bambooua/main.js';
export { AnimeOnProvider, animeOnProvider } from './animeon/main.js';
export { AniHubProvider, anihubProvider, anihub } from './anihub/main.js';
export { FrankoProvider, frankoProvider } from './franko/main.js';
export { AniWorldProvider, aniWorldProvider } from './aniworld/main.js';
export { UaflixProvider, uaflixProvider } from './uaflix/main.js';
export { MikaiProvider, mikaiProvider } from './mikai/main.js';
export { UaKinoAXProvider, uakinoAxProvider, uakinoAx } from './uakino-ax/main.js';

import { uakinoProvider } from './uakino/main.js';
import { kinoukrProvider } from './kinoukr/main.js';
import { uaserialsProvider } from './uaserials/main.js';
import { uaserialsMyProvider } from './uaserials-my/main.js';
import { eneyidaProvider } from './eneyida/main.js';
import { wormholeProvider } from './wormhole/main.js';
import { bambooUaProvider } from './bambooua/main.js';
import { animeOnProvider } from './animeon/main.js';
import { anihubProvider } from './anihub/main.js';
import { aniWorldProvider } from './aniworld/main.js';
import { uaflixProvider } from './uaflix/main.js';
import { mikaiProvider } from './mikai/main.js';
import { uakinoAxProvider } from './uakino-ax/main.js';
import type { Provider } from '../types/provider.js';

export const providers: Provider[] = [
  uakinoProvider,
  kinoukrProvider,
  uaserialsProvider,
  uaserialsMyProvider,
  eneyidaProvider,
  wormholeProvider,
  bambooUaProvider,
  // AniHub (anihub.in.ua) стоїть попереду AnimeOn: він власник Fenix CDN,
  // тому його fenix-джерело (одне відео + audioTracks) виграє за бар'єром claimedCdns.
  anihubProvider,
  animeOnProvider,
  // Franko disabled: franko.uacdn.online gated POST /api/player/files behind Cloudflare
  // Turnstile and answers 403 "captcha failed" without a token. The provider is still
  // exported above; re-add `frankoProvider` here to re-enable it.
  aniWorldProvider,
  uaflixProvider,
  mikaiProvider,
  uakinoAxProvider,
];
