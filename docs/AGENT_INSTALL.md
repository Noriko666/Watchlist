# Agent Installation Guide

Use this file when a user asks an automation agent to install Watchlist from GitHub.

## Repository

```text
https://github.com/Noriko666/Watchlist
```

## Safety Rules

- Do not upload or commit `.env`, `.env.*`, `data/`, SQLite files, logs, private keys, or deployment credentials.
- Use Node.js 20 or newer.
- Keep the SQLite database outside Git tracking.
- Verify the app with `/api/health` before reporting success.
- If a PIN is enabled, generate a random `WATCHLIST_SESSION_SECRET`.

## Linux VPS Recommended Flow

For Debian or Ubuntu:

```bash
git clone https://github.com/Noriko666/Watchlist.git
cd Watchlist
sudo bash scripts/install-linux-vps.sh
```

For unattended installs, pass environment variables:

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

Do not use `1234` or another obvious demo PIN on a public server.

Verify:

```bash
systemctl status watchlist --no-pager
curl http://127.0.0.1:4310/api/health
```

If nginx was configured for `/watchlist/`, also test the public URL.

## Windows Local Flow

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

## Manual Linux Service Checklist

1. Clone to `/opt/watchlist`.
2. Run `npm ci`.
3. Run `npm run build`.
4. Run `npm prune --omit=dev`.
5. Create a `watchlist` system user.
6. Run `chown -R watchlist:watchlist /opt/watchlist`.
7. Create `/etc/watchlist.env`.
8. Install `deploy/watchlist.service` as `/etc/systemd/system/watchlist.service`.
9. Run `systemctl daemon-reload`.
10. Run `systemctl enable --now watchlist`.
11. Verify `curl http://127.0.0.1:4310/api/health`.

## Minimum `.env`

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4310
DATABASE_FILE=/opt/watchlist/data/watchlist.sqlite
TRUST_PROXY=true
WATCHLIST_PASSWORD=<choose-a-4-digit-pin>
WATCHLIST_SESSION_SECRET=<random-32-plus-character-secret>
```

For local-only use, `WATCHLIST_PASSWORD` may be left empty.
