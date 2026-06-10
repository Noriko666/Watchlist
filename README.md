# Watchlist

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![React](https://img.shields.io/badge/React-18-61dafb)](frontend/src)

**Watchlist** is a self-hosted anime library with a React frontend, an Express API, SQLite storage, AniList-powered discovery, and optional PIN protection. It is designed for private local use, a small home server, or a Linux VPS behind nginx.

No hosted tracking account is required. Your library lives in your own SQLite database.

![Watchlist grid view](docs/screenshots/hero-grid.png)

## Screenshots

### Watching List

![Watching list view](docs/screenshots/watching-list.png)

### Daily Discovery

![Daily AniList recommendation](docs/screenshots/discover.png)

### Add Anime

![AniList search while adding an anime](docs/screenshots/add-anime.png)

## Features

| Area | What it does |
| --- | --- |
| Library categories | Organize titles as Watching, Plan to Watch, Finished, or Paused. |
| List and grid views | Switch between compact list mode and poster grid mode. The choice is saved in the browser. |
| Episode progress | Increase or decrease watched episodes per title, with progress bars and recent-airing badges. |
| Drag and drop | Reorder entries inside a category or move titles between categories. |
| Context menu | Right-click anywhere in the app to add titles, change status, edit progress, or delete entries. |
| AniList search | Add anime through live AniList search with a Jikan/MAL fallback. |
| Daily recommendation | Get an "anime of the day" based on the genres and tags in your own library. |
| Top airing lists | Fetch top currently airing titles from MyAnimeList or AniList trending data. |
| Details modal | View covers, synopsis, characters, Japanese voice actors, and related voice actor roles. |
| Import and export | Export your library as JSON and import it again on another install. |
| Optional PIN lock | Protect the web UI with a 4-digit PIN, signed session cookies, rate limiting, and lockouts. |
| SQLite persistence | Uses a local SQLite database with WAL mode. No external database server is needed. |

## Requirements

Minimum runtime:

- Node.js 20 or newer
- npm 10 or newer
- A system that can build `better-sqlite3`

Build tools for `better-sqlite3`:

| Platform | Required tools |
| --- | --- |
| Windows | Visual Studio Build Tools with "Desktop development with C++" |
| Debian/Ubuntu VPS | `build-essential` and `python3` |
| macOS | Xcode Command Line Tools with `xcode-select --install` |

Optional production tools:

- Docker and Docker Compose
- systemd for Linux service management
- nginx for a public reverse proxy

## Quick Start

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
npm install
cp .env.example .env
npm run build
npm start
```

Open [http://127.0.0.1:4310](http://127.0.0.1:4310).

On Windows PowerShell, use this instead of `cp`:

```powershell
Copy-Item .env.example .env
```

## Windows Local Setup

The Windows helper checks Node.js, creates `.env` if missing, installs dependencies, and builds the frontend:

```powershell
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
npm start
```

To start the app automatically after setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Start
```

For development mode with Vite hot reload:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Dev
```

## Linux VPS Install Wizard

For a Debian or Ubuntu VPS, clone the repo and run the interactive installer:

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
sudo bash scripts/install-linux-vps.sh
```

The wizard can:

- install required Linux build packages
- optionally install Node.js 20 with NodeSource if Node is missing
- copy the app to `/opt/watchlist` by default
- create a dedicated `watchlist` system user
- generate `/etc/watchlist.env`
- install a systemd service
- build the frontend
- start and verify the service
- optionally create a basic nginx site for `/watchlist/`

Non-interactive example for agents or repeatable installs:

```bash
sudo env \
  ASSUME_YES=1 \
  INSTALL_NODE=1 \
  APP_DIR=/opt/watchlist \
  APP_PORT=4310 \
  APP_HOST=127.0.0.1 \
  WATCHLIST_PASSWORD='<choose-a-4-digit-pin>' \
  CONFIGURE_NGINX=1 \
  PUBLIC_PATH=/watchlist/ \
  bash scripts/install-linux-vps.sh
```

Do not use a demo PIN on a public server. Choose a private 4-digit PIN and let the installer generate `WATCHLIST_SESSION_SECRET`.

After installation:

```bash
systemctl status watchlist --no-pager
curl http://127.0.0.1:4310/api/health
```

## Docker

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
cp .env.example .env
# Edit .env before exposing the app publicly.
docker compose up -d --build
```

The container listens on port `4310`. The SQLite database is stored in `./data`.

## Manual Production Install

```bash
git clone https://github.com/Noriko666/Watchlist.git /opt/watchlist
cd /opt/watchlist
npm ci
npm run build
npm prune --omit=dev
sudo useradd --system --user-group --home-dir /opt/watchlist --shell /usr/sbin/nologin watchlist
sudo chown -R watchlist:watchlist /opt/watchlist
sudo cp deploy/watchlist.service /etc/systemd/system/watchlist.service
sudo cp .env.example /etc/watchlist.env
sudo systemctl daemon-reload
sudo systemctl enable --now watchlist
```

Edit `/etc/watchlist.env` before public use.

Example production environment:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4310
DATABASE_FILE=/opt/watchlist/data/watchlist.sqlite
CACHE_TTL_HOURS=24
TRUST_PROXY=true
WATCHLIST_PASSWORD=<choose-a-4-digit-pin>
WATCHLIST_SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters
SESSION_COOKIE_NAME=watchlist_session
SESSION_COOKIE_PATH=/
```

Replace the example PIN and secret. The server refuses to start if the PIN is set but the session secret is missing, equal to the PIN, or still set to the placeholder value.

## nginx Reverse Proxy

The example in [deploy/nginx.watchlist.conf](deploy/nginx.watchlist.conf) exposes the app under `/watchlist/`:

```nginx
location = /watchlist {
    return 301 /watchlist/;
}

location ^~ /watchlist/ {
    proxy_pass http://127.0.0.1:4310/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Use `TRUST_PROXY=true` when the app is behind nginx.

## Configuration

Copy `.env.example` to `.env` for local use, or copy it to `/etc/watchlist.env` for the systemd service.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` or `development`. |
| `PORT` | `4310` | HTTP port used by the Express server. |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` only if you understand the exposure. |
| `DATABASE_FILE` | `./data/watchlist.sqlite` | SQLite database path. |
| `CACHE_TTL_HOURS` | `24` | AniList search cache lifetime. |
| `REQUEST_TIMEOUT_MS` | `12000` | Timeout for external API calls. |
| `NEXT_AIRING_REFRESH_TTL_MS` | `900000` | Minimum time between next-airing refreshes. |
| `TRUST_PROXY` | `loopback` | Express trust-proxy setting. Use `true` behind nginx. |
| `WATCHLIST_PASSWORD` | empty | Optional 4-digit PIN. Empty means no login screen. |
| `WATCHLIST_SESSION_SECRET` | empty | Required when `WATCHLIST_PASSWORD` is set. Use a random 32+ character value. |
| `SESSION_COOKIE_NAME` | `watchlist_session` | Session cookie name. |
| `SESSION_COOKIE_PATH` | `/` | Cookie path. Use `/watchlist/` if you want a narrower subpath cookie. |
| `AUTH_RATE_WINDOW_MS` | `60000` | Login rate-limit window. |
| `AUTH_RATE_MAX_REQUESTS` | `20` | Max login attempts per rate-limit window. |
| `AUTH_FAILURE_MAX_ATTEMPTS` | `6` | Failed PIN attempts before lockout. |
| `AUTH_LOCKOUT_DURATION_MS` | `900000` | Lockout duration after too many failures. |

## Data, Privacy, and Safety

The repository is prepared so personal runtime data is not committed:

- `.env` and `.env.*` are ignored, except `.env.example`
- `data/` is ignored
- SQLite files are ignored
- private key-like files such as `.ppk`, `.pem`, and `.key` are ignored
- `node_modules/` and `dist/` are ignored

The app stores your anime library in SQLite. If you want to move or back up an install, copy the configured database file or use the JSON export in the web UI.

## Agent Install Instructions

If you want another coding agent to install this for you, give it this prompt:

```text
Install https://github.com/Noriko666/Watchlist on this machine.
Use Node.js 20 or newer.
Do not commit or upload .env, data/, SQLite files, private keys, or logs.
For a Linux VPS, prefer scripts/install-linux-vps.sh and configure a systemd service.
For Windows local use, run scripts/install-windows.ps1 and start the app with npm start.
Verify the app with /api/health and tell me the final URL.
```

More detailed automation notes are in [docs/AGENT_INSTALL.md](docs/AGENT_INSTALL.md).

## Development

```bash
npm run dev
```

This starts:

- Express API on port `4310`
- Vite dev server on port `5173`

Open [http://localhost:5173](http://localhost:5173). API requests are proxied to the backend.

Useful scripts:

| Command | Description |
| --- | --- |
| `npm run dev` | Start backend and frontend dev server together. |
| `npm run dev:server` | Start only the Express backend with nodemon. |
| `npm run dev:client` | Start only the Vite frontend. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm run assets` | Generate placeholder UI assets. |
| `npm start` | Start the production Express server. |

## API Summary

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `GET` | `/api/auth/session` | Current auth state. |
| `POST` | `/api/auth/login` | PIN login. |
| `POST` | `/api/auth/logout` | Log out and clear the session cookie. |
| `GET` | `/api/anime` | List all entries. |
| `GET` | `/api/anime/:id` | Get one entry. |
| `POST` | `/api/anime` | Create an entry. |
| `PATCH` | `/api/anime/:id` | Update an entry. |
| `DELETE` | `/api/anime/:id` | Delete an entry. |
| `POST` | `/api/anime/reorder` | Save category order. |
| `GET` | `/api/search?query=` | Search AniList/Jikan. |
| `GET` | `/api/anime-of-the-day` | Daily recommendation. |
| `GET` | `/api/anime/:id/characters` | Character and voice actor data. |
| `GET` | `/api/staff/:id/top-roles` | Voice actor role data. |
| `GET` | `/api/season-top-airing` | MyAnimeList top airing list. |
| `GET` | `/api/season-top-airing/24h` | AniList trending airing list. |
| `GET` | `/api/export` | Export JSON backup. |
| `POST` | `/api/import` | Import JSON backup. |

## Project Structure

```text
Watchlist/
|-- backend/                 Express API, SQLite, AniList/MAL clients
|-- frontend/                React app, styles, UI assets
|-- deploy/                  Example systemd and nginx files
|-- docs/screenshots/        README screenshots
|-- scripts/                 Setup helpers and asset scripts
|-- docker-compose.yml       Docker Compose service
|-- Dockerfile               Production image
|-- package.json             Node scripts and dependencies
`-- README.md
```

## Updating an Existing VPS Install

If you installed with the wizard and used `/opt/watchlist`:

```bash
cd /opt/watchlist
sudo git pull
sudo npm ci
sudo npm run build
sudo npm prune --omit=dev
sudo chown -R watchlist:watchlist /opt/watchlist
sudo systemctl restart watchlist
curl http://127.0.0.1:4310/api/health
```

Back up your database first if the server holds important data.

## Troubleshooting

### `better-sqlite3` fails to install

Install the platform build tools from the requirements section, then run:

```bash
npm rebuild better-sqlite3
```

### The page loads but API calls fail

Check that the backend is running:

```bash
curl http://127.0.0.1:4310/api/health
```

If you use nginx, confirm `proxy_pass` points to the same `HOST` and `PORT` configured for the app.

### The login cookie does not stick behind a subpath

Keep `SESSION_COOKIE_PATH=/` for the simplest setup. If you change it to a subpath, make sure it exactly matches your public path, for example `/watchlist/`.

## License

MIT - see [LICENSE](LICENSE).
