# Agent Installation Guide

Use this file when a user asks an automation agent to install Watchlist from GitHub.

If the user provides a 4-digit PIN, enable the login screen with that PIN and generate a private session secret. If the user does not provide a PIN, ask once whether they want one before installing on a public or shared machine.

## Repository

```text
https://github.com/Noriko666/Watchlist
```

## Safety Rules

- Keep `.env`, `.env.*`, `data/`, SQLite files, logs, private keys, and deployment credentials local and private.
- Use Node.js 20 or newer.
- Keep the SQLite database outside Git tracking.
- Verify the app with `/api/health` before reporting success.
- If a PIN is enabled, use the user's chosen 4-digit PIN and generate a random `WATCHLIST_SESSION_SECRET`.

## Prompt to Give an Agent

Replace `[4-Digit-PIN]` before using this prompt:

```text
Install https://github.com/Noriko666/Watchlist on this machine.
Use Node.js 20 or newer.
Use this private 4-digit Watchlist PIN: [4-Digit-PIN]
Keep .env, data/, SQLite files, private keys, and logs local and private.
For a Linux VPS, prefer scripts/install-linux-vps.sh and configure a systemd service.
For Windows local use, run scripts/install-windows.ps1 and start the app with npm start.
Generate a private WATCHLIST_SESSION_SECRET if the PIN is enabled.
Verify the app with /api/health and tell me the final URL.
```

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
