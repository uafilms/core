<img src="images/logo.png" width="150" align="left"/>

## uafilms
*[Licensed under the GNU General Public License v3.0](LICENSE)*

Media stream aggregator and [OMSS API](https://github.com/omss-spec/omss-spec) server for Ukrainian online cinemas, with a built-in web player.

[![Channel](https://img.shields.io/badge/Channel-Telegram-blue.svg)](https://t.me/uafilms_official)

<br clear="left"/>

### features

- **OMSS API**: standard streaming endpoints (`/v1/movies/:id`, `/v1/tv/:id/seasons/:s/episodes/:e`, `/v1/refresh/:id`) with query filtering (`quality`, `provider`, `type`).
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
- [mdui](https://mdui.org/) for Material Design 3 components
