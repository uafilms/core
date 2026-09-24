export { UakinoProvider, uakinoProvider, uakino } from './uakino/main.js';
export { KinoUkrProvider, kinoukrProvider, kinoukr } from './kinoukr/main.js';
export { UaSerialsProvider, uaserialsProvider } from './uaserials/main.js';
export { UaSerialsMyProvider, uaserialsMyProvider } from './uaserials-my/main.js';
export { EneyidaProvider, eneyidaProvider } from './eneyida/main.js';
export { WormholeProvider, wormholeProvider } from './wormhole/main.js';
export { BambooUaProvider, bambooUaProvider } from './bambooua/main.js';
export { AnimeOnProvider, animeOnProvider } from './animeon/main.js';
export { FrankoProvider, frankoProvider } from './franko/main.js';
export { AniWorldProvider, aniWorldProvider } from './aniworld/main.js';
export { UaflixProvider, uaflixProvider } from './uaflix/main.js';
export { MikaiProvider, mikaiProvider } from './mikai/main.js';

import { uakinoProvider } from './uakino/main.js';
import { kinoukrProvider } from './kinoukr/main.js';
import { uaserialsProvider } from './uaserials/main.js';
import { uaserialsMyProvider } from './uaserials-my/main.js';
import { eneyidaProvider } from './eneyida/main.js';
import { wormholeProvider } from './wormhole/main.js';
import { bambooUaProvider } from './bambooua/main.js';
import { animeOnProvider } from './animeon/main.js';
import { frankoProvider } from './franko/main.js';
import { aniWorldProvider } from './aniworld/main.js';
import { uaflixProvider } from './uaflix/main.js';
import { mikaiProvider } from './mikai/main.js';
import type { Provider } from '../types/provider.js';

export const providers: Provider[] = [
  uakinoProvider,
  kinoukrProvider,
  uaserialsProvider,
  uaserialsMyProvider,
  eneyidaProvider,
  wormholeProvider,
  bambooUaProvider,
  animeOnProvider,
  frankoProvider,
  aniWorldProvider,
  uaflixProvider,
  mikaiProvider,
];
