<img src="images/logo.png" width="150" align="left"/>

## uafilms
*[Licensed under the GNU General Public License v3.0](LICENSE)*

Media stream aggregator and [OMSS API](https://github.com/omss-spec/omss-spec) server for Ukrainian online cinemas, with a built-in web player.

[![Channel](https://img.shields.io/badge/Channel-Telegram-blue.svg)](https://t.me/uafilms_official)
![Docker Build Status](https://img.shields.io/github/actions/workflow/status/uafilms/core/docker-publish.yml?branch=main&label=docker%20build&logo=docker)

<br clear="left"/>

### features

- **OMSS API**: standard streaming endpoints (`/v1/movies/:id`, `/v1/tv/:id/seasons/:s/episodes/:e`, `/v1/refresh/:id`) with query filtering (`quality`, `provider`, `type`).
- **User Accounts & Cloud Sync**: multi-device favorites, playback progress, and auto-synced stop timestamps.
- **Developer API Keys & Dashboard**: self-service API keys, real-time request analytics, latency logs, and code examples.
- **VOD extractors**: decoders and scrapers for Ashdi, Tortuga, HDVB, etc.
- **HLS proxy router**: lazy stream resolution through `/master.m3u8` with CORS header handling and playlist rewriting.
- **Integrated web app**: single-page frontend (`web/`) on React and HLS.js with no third-party embed iframes.

### getting started

#### prerequisites
- Node.js 20+
- npm

#### installation

```bash
git clone https://github.com/uafilms/core.git
cd core

npm install
cp .env.example .env
```

#### development

```bash
npm run dev
```

app and API run at `http://localhost:3000`.

#### docker

##### using docker compose (recommended)

1. Ensure the host storage directory exists with proper permissions:

```bash
mkdir -p cache && chmod 777 cache
```

2. Configure environment variables in `.env` (or pass directly in `docker-compose.yml`):

```env
PORT=3000
JWT_SECRET=your_jwt_secret_key_here
# TMDB_TOKEN=your_tmdb_token_here
```

3. Start container:

```bash
docker compose up -d
```

##### using docker run

Run directly from GitHub Container Registry with persistent storage:

```bash
mkdir -p cache && chmod 777 cache

docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="your_jwt_secret_key_here" \
  -v $(pwd)/cache:/app/cache \
  --name uafilms-core \
  ghcr.io/uafilms/core:latest
```

> **Important notes on data persistence:**
> - The `-v $(pwd)/cache:/app/cache` volume mount is **required** to persist user accounts, API keys, favorites, and watch progress (`auth.db`). Without it, data is lost when the container is recreated or updated.
> - Always set a consistent `JWT_SECRET` so existing user login sessions remain valid across container restarts.
> - If you need to clear scraper/provider caches, do **not** run `rm -rf cache/*`. Only delete provider databases:
>   ```bash
>   rm -f cache/kinoukr.db* cache/uakino.db*
>   ```
>   Keep `cache/auth.db*` intact.

### build

```bash
# build web+backend
npm run build:all

# run production server
npm start
```

### credits

- [OMSS Specification](https://github.com/omss-spec/omss-spec) for open media streaming spec
- [Hono](https://hono.dev/) for web framework
- [HLS.js](https://github.com/video-dev/hls.js/) for browser HLS playback
- [BeerCSS](https://www.beercss.com/) for Material Design 3 UI and themes
