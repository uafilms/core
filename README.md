<img src="images/logo.png" width="150" align="left"/>

## uafilms
*[Licensed under the GNU General Public License v3.0](LICENSE)*

Media stream aggregator and OMSS v1.1.0 API server for Ukrainian online cinemas, with a built-in web player.

[![Channel](https://img.shields.io/badge/Channel-Telegram-blue.svg)](https://t.me/uafilms_official)

<br clear="left"/>

### features

- **OMSS v1.1.0 API**: standard streaming endpoints (`/v1/movies/:id`, `/v1/tv/:id/seasons/:s/episodes/:e`, `/v1/refresh/:id`) with query filtering (`quality`, `provider`, `type`).
- **10 catalog providers**: UAKino, KinoUkr, UASerials, UASerials.my, Eneyida, Wormhole, BambooUA, AnimeON, Franko, and AniWorld.
- **VOD extractors**: decoders and scrapers for Ashdi, Tortuga, HDVB, Franko, MoonAnime, Bamboo, and BunnyCDN.
- **HLS proxy router**: lazy stream resolution through `/master.m3u8` with CORS header handling and playlist rewriting.
- **Offline catalog search**: local SQLite index of 32,000+ items for sub-millisecond lookup by IMDb ID or Ukrainian title.
- **Integrated web app**: single-page frontend (`web/`) on React and HLS.js with no third-party embed iframes.

### getting started

#### Prerequisites
- Node.js 20+
- npm

#### Installation

```bash
# Clone repository
git clone ssh://git@ssh.github.com:443/uafilms/core.git
cd core

# Install dependencies
npm install
cd web && npm install && cd ..

# Configure environment
cp .env.example .env
```

#### Development

```bash
# Run server with live reload
npm run dev
```

App and API run at `http://localhost:3000`.

### build

```bash
# Build TypeScript core and web frontend
npm run build:all

# Start production server
npm start
```

### credits

- [OMSS Specification](https://github.com/omss-spec/omss-spec) for open media streaming spec
- [Hono](https://hono.dev/) for web framework
- [HLS.js](https://github.com/video-dev/hls.js/) for browser HLS playback
- [mdui](https://mdui.org/) for Material Design 3 components
