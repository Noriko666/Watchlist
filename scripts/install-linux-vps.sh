#!/usr/bin/env bash
set -euo pipefail

APP_NAME="watchlist"
SERVICE_NAME="watchlist"
ENV_FILE="/etc/watchlist.env"
SERVICE_FILE="/etc/systemd/system/watchlist.service"

say() {
  printf "\n==> %s\n" "$*"
}

warn() {
  printf "Warning: %s\n" "$*" >&2
}

fail() {
  printf "Error: %s\n" "$*" >&2
  exit 1
}

is_yes() {
  case "${1:-}" in
    1|y|Y|yes|YES|true|TRUE) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_value() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local current_value="${!var_name:-}"
  local answer=""

  if [[ -n "$current_value" ]]; then
    return
  fi

  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    printf -v "$var_name" "%s" "$default_value"
    return
  fi

  read -r -p "$label [$default_value]: " answer
  printf -v "$var_name" "%s" "${answer:-$default_value}"
}

prompt_bool() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local current_value="${!var_name:-}"
  local answer=""

  if [[ -n "$current_value" ]]; then
    return
  fi

  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    printf -v "$var_name" "%s" "$default_value"
    return
  fi

  read -r -p "$label [$default_value]: " answer
  printf -v "$var_name" "%s" "${answer:-$default_value}"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Run this installer with sudo or as root."
  fi
}

normalize_public_path() {
  PUBLIC_PATH="/${PUBLIC_PATH#/}"
  if [[ "$PUBLIC_PATH" != */ ]]; then
    PUBLIC_PATH="${PUBLIC_PATH}/"
  fi
}

collect_settings() {
  prompt_value APP_DIR "Install directory" "/opt/watchlist"
  prompt_value APP_USER "Linux service user" "watchlist"
  prompt_value APP_HOST "Bind host" "127.0.0.1"
  prompt_value APP_PORT "Bind port" "4310"
  prompt_bool CONFIGURE_NGINX "Create a basic nginx site" "no"
  prompt_value PUBLIC_PATH "Public nginx path" "/watchlist/"
  prompt_value SERVER_NAME "nginx server_name" "_"

  if [[ -z "${WATCHLIST_PASSWORD:-}" && "${ASSUME_YES:-0}" != "1" ]]; then
    local enable_pin=""
    read -r -p "Enable 4-digit PIN login? [Y/n]: " enable_pin
    if [[ ! "$enable_pin" =~ ^[Nn] ]]; then
      while true; do
        read -r -s -p "Choose a 4-digit PIN: " WATCHLIST_PASSWORD
        printf "\n"
        if [[ "$WATCHLIST_PASSWORD" =~ ^[0-9]{4}$ ]]; then
          break
        fi
        warn "PIN must be exactly 4 digits."
      done
    fi
  fi

  WATCHLIST_PASSWORD="${WATCHLIST_PASSWORD:-}"
  WATCHLIST_SESSION_SECRET="${WATCHLIST_SESSION_SECRET:-}"
  normalize_public_path
}

validate_settings() {
  [[ "$APP_DIR" == /* ]] || fail "APP_DIR must be an absolute path."
  [[ "$APP_DIR" != *[[:space:]]* ]] || fail "APP_DIR must not contain whitespace."
  [[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]] || fail "APP_USER is not a valid Linux user name."
  [[ "$APP_HOST" =~ ^[A-Za-z0-9:._-]+$ ]] || fail "APP_HOST contains unsupported characters."
  [[ "$APP_PORT" =~ ^[0-9]+$ ]] || fail "APP_PORT must be numeric."
  [[ "$PUBLIC_PATH" =~ ^/[A-Za-z0-9._~/-]*/$ ]] || fail "PUBLIC_PATH must be a URL path like /watchlist/."
  [[ "$SERVER_NAME" == "_" || "$SERVER_NAME" =~ ^[A-Za-z0-9._*-]+$ ]] || fail "SERVER_NAME contains unsupported characters."

  if [[ -n "$WATCHLIST_PASSWORD" && ! "$WATCHLIST_PASSWORD" =~ ^[0-9]{4}$ ]]; then
    fail "WATCHLIST_PASSWORD must be exactly 4 digits when set."
  fi

  if [[ -n "$WATCHLIST_PASSWORD" && "$WATCHLIST_SESSION_SECRET" == "$WATCHLIST_PASSWORD" ]]; then
    fail "WATCHLIST_SESSION_SECRET must not equal WATCHLIST_PASSWORD."
  fi
}

ensure_session_secret() {
  if [[ -n "$WATCHLIST_PASSWORD" && -z "$WATCHLIST_SESSION_SECRET" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      WATCHLIST_SESSION_SECRET="$(openssl rand -hex 32)"
    elif command -v node >/dev/null 2>&1; then
      WATCHLIST_SESSION_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
    else
      fail "Cannot generate WATCHLIST_SESSION_SECRET before Node.js or OpenSSL is available."
    fi
  fi

  if [[ -n "$WATCHLIST_PASSWORD" && "$WATCHLIST_SESSION_SECRET" == "$WATCHLIST_PASSWORD" ]]; then
    fail "WATCHLIST_SESSION_SECRET must not equal WATCHLIST_PASSWORD."
  fi
}

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    say "Installing Linux build packages"
    apt-get update
    apt-get install -y build-essential python3 ca-certificates curl rsync
  else
    warn "apt-get was not found. Install build tools, python3, curl, and rsync manually if needed."
  fi
}

install_node_with_nodesource() {
  command -v apt-get >/dev/null 2>&1 || fail "Automatic Node.js install currently supports Debian/Ubuntu with apt-get."
  say "Installing Node.js 20 with NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

ensure_node() {
  local major="0"
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf "0")"

  if [[ "$major" =~ ^[0-9]+$ && "$major" -ge 20 ]]; then
    say "Node.js $(node --version) detected"
    return
  fi

  if is_yes "${INSTALL_NODE:-0}"; then
    install_node_with_nodesource
  elif [[ "${ASSUME_YES:-0}" == "1" ]]; then
    fail "Node.js 20+ is missing. Re-run with INSTALL_NODE=1 or install Node.js manually."
  else
    local answer=""
    read -r -p "Node.js 20+ is missing. Install it with NodeSource now? [Y/n]: " answer
    if [[ "$answer" =~ ^[Nn] ]]; then
      fail "Install Node.js 20+ and run this script again."
    fi
    install_node_with_nodesource
  fi

  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf "0")"
  [[ "$major" -ge 20 ]] || fail "Node.js 20+ is still not available."
}

ensure_systemd() {
  command -v systemctl >/dev/null 2>&1 || fail "systemctl was not found. This installer expects systemd."
}

create_service_user() {
  if id -u "$APP_USER" >/dev/null 2>&1; then
    say "Using existing service user $APP_USER"
    return
  fi

  say "Creating service user $APP_USER"
  useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
}

copy_project() {
  local source_dir
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

  say "Preparing application directory $APP_DIR"
  mkdir -p "$APP_DIR"

  if [[ "$source_dir" != "$APP_DIR" ]]; then
    rsync -a \
      --exclude ".git" \
      --exclude "node_modules" \
      --exclude "dist" \
      --exclude "data" \
      --exclude ".env" \
      "$source_dir"/ "$APP_DIR"/
  fi

  mkdir -p "$APP_DIR/data"
}

build_app() {
  say "Installing Node dependencies and building frontend"
  cd "$APP_DIR"
  npm ci
  npm run build
  npm prune --omit=dev
}

write_env_file() {
  say "Writing $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=$APP_PORT
HOST=$APP_HOST
DATABASE_FILE=$APP_DIR/data/watchlist.sqlite
CACHE_TTL_HOURS=24
REQUEST_TIMEOUT_MS=12000
NEXT_AIRING_REFRESH_TTL_MS=900000
TRUST_PROXY=true
WATCHLIST_PASSWORD=$WATCHLIST_PASSWORD
WATCHLIST_SESSION_SECRET=$WATCHLIST_SESSION_SECRET
SESSION_COOKIE_NAME=watchlist_session
SESSION_COOKIE_PATH=/
AUTH_RATE_WINDOW_MS=60000
AUTH_RATE_MAX_REQUESTS=20
AUTH_FAILURE_LOCKOUT_WINDOW_MS=300000
AUTH_FAILURE_MAX_ATTEMPTS=6
AUTH_LOCKOUT_DURATION_MS=900000
AUTH_FAILURE_DELAY_MS=250
AUTH_FAILURE_MAX_DELAY_MS=1200
ENV
  chmod 640 "$ENV_FILE"
  chown "root:$APP_USER" "$ENV_FILE" || true
}

write_systemd_service() {
  local node_bin
  node_bin="$(command -v node)"

  say "Writing systemd service"
  cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Watchlist
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=$ENV_FILE
ExecStart=$node_bin $APP_DIR/backend/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
SERVICE
}

set_permissions() {
  say "Setting file ownership"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

start_service() {
  say "Starting Watchlist service"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

configure_nginx() {
  if ! is_yes "$CONFIGURE_NGINX"; then
    return
  fi

  command -v apt-get >/dev/null 2>&1 || fail "Automatic nginx setup requires apt-get."

  say "Installing and configuring nginx"
  apt-get install -y nginx

  cat > /etc/nginx/sites-available/watchlist <<NGINX
server {
    listen 80;
    server_name $SERVER_NAME;

    location = ${PUBLIC_PATH%/} {
        return 301 $PUBLIC_PATH;
    }

    location ^~ ${PUBLIC_PATH}.env {
        return 404;
    }

    location ^~ ${PUBLIC_PATH}.git/ {
        return 404;
    }

    location ^~ ${PUBLIC_PATH}data/ {
        return 404;
    }

    location ^~ $PUBLIC_PATH {
        proxy_pass http://127.0.0.1:$APP_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
NGINX

  ln -sfn /etc/nginx/sites-available/watchlist /etc/nginx/sites-enabled/watchlist
  nginx -t
  systemctl reload nginx
}

verify_service() {
  say "Verifying health endpoint"
  sleep 2
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null; then
    printf "Watchlist is running at http://127.0.0.1:%s\n" "$APP_PORT"
    if is_yes "$CONFIGURE_NGINX"; then
      printf "nginx path configured: %s\n" "$PUBLIC_PATH"
    fi
  else
    warn "Health check failed. Service status follows."
    systemctl status "$SERVICE_NAME" --no-pager || true
    exit 1
  fi
}

main() {
  require_root
  collect_settings
  validate_settings
  install_base_packages
  ensure_node
  ensure_session_secret
  ensure_systemd
  create_service_user
  copy_project
  build_app
  write_env_file
  write_systemd_service
  set_permissions
  start_service
  configure_nginx
  verify_service
}

main "$@"
