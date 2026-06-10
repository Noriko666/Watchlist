# Watchlist

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![React](https://img.shields.io/badge/React-18-61dafb)](frontend/src)

*Live Demo:* https://noriko-watchlist-demo.onrender.com/

**Watchlist** is a small self-hosted anime watchlist powered by MyAnimeList and AniList data. Add titles, track episodes, sort them into Watching, Plan to Watch, Finished, or Paused, and keep the data on your own machine.

No account is required. Your library is stored locally.

![Watchlist grid view](docs/screenshots/hero-grid.png)

## Install on Windows

Use this if you just want Watchlist on your own PC.

Before you start, install:

- [Node.js 20 or newer](https://nodejs.org/)
- [Git for Windows](https://git-scm.com/download/win)

Then open PowerShell and run:

```powershell
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
npm start
```

Open:

```text
http://127.0.0.1:4310
```

To start the app immediately after setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Start
```

### Optional PIN on Windows

By default, the local Windows install has no login screen.

If you want a 4-digit PIN, open the `.env` file and set:

```env
WATCHLIST_PASSWORD=1234
WATCHLIST_SESSION_SECRET=replace-this-with-any-long-random-text
```

Use your own PIN instead of `1234`. The secret should be long and private.

## Install on Ubuntu or Debian Server

Use this for a VPS, home server, or small Linux box.

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
sudo bash scripts/install-linux-vps.sh
```

The installer will ask where to install the app, whether to create a service, whether to add nginx, and whether to enable a 4-digit PIN.

After installation, check:

```bash
systemctl status watchlist --no-pager
curl http://127.0.0.1:4310/api/health
```

If you enabled nginx, open the public URL you configured during setup.

## Ask an Agent to Install It

If you want another coding agent to install Watchlist for you, give it this prompt and replace `[4-Digit-PIN]` first:

```text
Install https://github.com/Noriko666/Watchlist on this machine.
Use Node.js 20 or newer.
Use this private 4-digit Watchlist PIN: [4-Digit-PIN]
Do not commit or upload .env, data/, SQLite files, private keys, or logs.
For a Linux VPS, prefer scripts/install-linux-vps.sh and configure a systemd service.
For Windows local use, run scripts/install-windows.ps1 and start the app with npm start.
Generate a private WATCHLIST_SESSION_SECRET if the PIN is enabled.
Verify the app with /api/health and tell me the final URL.
```

More detailed automation notes are in [docs/AGENT_INSTALL.md](docs/AGENT_INSTALL.md).

## What You Can Do

| Feature | Description |
| --- | --- |
| Watchlist categories | Organize anime as Watching, Plan to Watch, Finished, or Paused. |
| Episode tracking | Increase or decrease watched episodes and see progress at a glance. |
| List and poster views | Switch between a compact list and a poster grid. |
| Drag and drop | Reorder entries or move them between categories. |
| Fast add | Search AniList while adding a title. |
| Daily discovery | Get an anime recommendation based on your own library. |
| Top airing lists | Browse currently airing and trending titles. |
| Details view | See covers, synopsis, characters, voice actors, and related roles. |
| Import and export | Back up your library as JSON and import it again later. |
| Optional PIN lock | Add a simple 4-digit login screen. |

## Screenshots

### Watching List

![Watching list view](docs/screenshots/watching-list.png)

### Daily Discovery

![Daily AniList recommendation](docs/screenshots/discover.png)

### Add Anime

![AniList search while adding an anime](docs/screenshots/add-anime.png)

## Back Up Your Watchlist

The easiest backup is the export button in the web app.

If you want to copy the database directly, back up the SQLite file configured by `DATABASE_FILE`. For the default local install, it lives under `data/`.

Private runtime files are ignored by Git:

- `.env` and `.env.*`
- `data/`
- SQLite database files
- private key-like files such as `.ppk`, `.pem`, and `.key`
- `node_modules/` and `dist/`

## Updating an Existing VPS Install

If you installed with the Linux wizard and used `/opt/watchlist`:

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

### The app does not start on Windows

Make sure Node.js 20 or newer is installed, then open a new PowerShell window and try the install command again.

### `better-sqlite3` fails to install

Install the build tools for your platform, then run:

```bash
npm rebuild better-sqlite3
```

### The page loads but data does not appear

Check that the backend is running:

```bash
curl http://127.0.0.1:4310/api/health
```

If you use nginx, confirm that nginx forwards to the same host and port used by Watchlist.

### The login cookie does not stick behind a subpath

Keep `SESSION_COOKIE_PATH=/` for the simplest setup. If you change it to a subpath, make sure it exactly matches your public path, for example `/watchlist/`.

## Technical Reference

The sections below are for people who want to deploy, customize, or develop the app.

### Requirements

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

### Manual Quick Start

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

### Linux Unattended Install

For agents or repeatable server installs:

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

### Docker

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
cp .env.example .env
# Edit .env before exposing the app publicly.
docker compose up -d --build
```

The container listens on port `4310`. The SQLite database is stored in `./data`.

### Manual Production Install

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

### nginx Reverse Proxy

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

### Configuration

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
| `AUTH_FAILURE_LOCKOUT_WINDOW_MS` | `300000` | Failed-login tracking window. |
| `AUTH_FAILURE_MAX_ATTEMPTS` | `6` | Failed PIN attempts before lockout. |
| `AUTH_LOCKOUT_DURATION_MS` | `900000` | Lockout duration after too many failures. |
| `AUTH_FAILURE_DELAY_MS` | `250` | Delay after failed PIN attempts. |
| `AUTH_FAILURE_MAX_DELAY_MS` | `1200` | Maximum failed-login delay. |

### Development

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

### API Summary

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

### Project Structure

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

## License

MIT - see [LICENSE](LICENSE).
