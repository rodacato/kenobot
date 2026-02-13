#!/usr/bin/env bash
# KenoBot VPS Installer
#
# Automated setup for a fresh Ubuntu/Debian VPS:
#   - Creates a 'kenobot' system user (non-root)
#   - Installs Node.js 22, kenobot, n8n, cloudflared
#   - Configures systemd user services for all three
#   - Sets up Cloudflare tunnel (optional)
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh | sudo bash
#
# Or download and run:
#   wget https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh
#   sudo bash install.sh
#
# Safe to re-run — all steps are idempotent.

set -euo pipefail

# ============================================================================
# Constants
# ============================================================================

KENOBOT_USER="kenobot"
NODE_MAJOR=22
KENOBOT_GIT_URL="git@github.com:rodacato/kenobot.git"
CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
SCRIPT_PATH="/tmp/kenobot-install.sh"
CURRENT_STEP=""

# ============================================================================
# Colors
# ============================================================================

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ============================================================================
# Utility functions
# ============================================================================

log_info()  { echo -e "${GREEN}[+]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[x]${NC} $1"; }
log_step()  { echo -e "\n${BOLD}==> $1${NC}"; }

prompt_value() {
  local prompt="$1" default="$2" varname="$3"
  local display=""
  [ -n "$default" ] && display=" [${default}]"
  read -rp "    ${prompt}${display}: " value </dev/tty
  eval "$varname=\"\${value:-$default}\""
}

prompt_secret() {
  local prompt="$1" varname="$2"
  read -rsp "    ${prompt}: " value </dev/tty
  echo "" # newline after hidden input
  eval "$varname=\"\$value\""
}

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ] && [ -n "$CURRENT_STEP" ]; then
    echo ""
    log_error "Installation failed at: ${CURRENT_STEP}"
    log_error "You can safely re-run this script to retry."
  fi
  rm -f "${CONFIG_TMPFILE:-}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Phase 2: App setup (runs as kenobot user)
# ============================================================================

phase2_main() {
  # Load config collected during Phase 1
  # shellcheck disable=SC1090
  source "$CONFIG_TMPFILE"

  # Configure npm global prefix for non-root user
  local npm_prefix="$HOME/.npm-global"
  mkdir -p "$npm_prefix"
  npm config set prefix "$npm_prefix"
  export PATH="$npm_prefix/bin:$PATH"

  # Persist PATH for future logins and systemd services
  if ! grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.bashrc"
  fi

  log_step "Installing KenoBot"
  local kenobot_dir="$HOME/.kenobot/engine"

  if [ -d "$kenobot_dir/.git" ]; then
    log_info "Existing install found, fetching updates..."
    git -C "$kenobot_dir" fetch --tags 2>&1 | tail -1
  else
    log_info "Cloning kenobot..."
    git clone "$KENOBOT_GIT_URL" "$kenobot_dir" 2>&1 | tail -1
  fi

  # Determine version: explicit override or latest tag
  local kenobot_tag="${KENOBOT_VERSION:-}"
  if [ -z "$kenobot_tag" ]; then
    kenobot_tag=$(git -C "$kenobot_dir" tag -l "v*" --sort=-v:refname | head -1)
  fi

  if [ "${KENOBOT_CHANNEL:-stable}" = "dev" ]; then
    log_info "Dev channel: staying on master"
  elif [ -z "$kenobot_tag" ]; then
    log_warn "No release tags found, using HEAD"
  else
    git -C "$kenobot_dir" checkout "$kenobot_tag" 2>&1 | tail -1
    log_info "Checked out $kenobot_tag"
  fi

  # Install dependencies
  (cd "$kenobot_dir" && npm install --omit=dev 2>&1 | tail -1)

  # Symlink binary into PATH
  chmod +x "$kenobot_dir/src/cli.js"
  ln -sf "$kenobot_dir/src/cli.js" "$HOME/.npm-global/bin/kenobot"
  log_info "kenobot $(kenobot version 2>/dev/null || echo 'installed')"

  # Build init command with appropriate flags
  log_step "Initializing KenoBot"
  INIT_FLAGS=""
  [ "${INSTALL_CLAUDE_CLI:-false}" = "true" ] && INIT_FLAGS="$INIT_FLAGS --install-claude"
  [ "${INSTALL_GEMINI_CLI:-false}" = "true" ] && INIT_FLAGS="$INIT_FLAGS --install-gemini"
  [ "${INSTALL_N8N:-true}" = "true" ] && INIT_FLAGS="$INIT_FLAGS --install-n8n"

  # shellcheck disable=SC2086
  kenobot setup $INIT_FLAGS 2>&1 || true
  log_info "KenoBot initialized"

  # Write .env with collected configuration
  phase2_write_env

  # Install kenobot systemd service
  log_step "Installing systemd services"
  kenobot install-service 2>&1 || true

  # Install n8n systemd service
  if [ "${INSTALL_N8N:-true}" = "true" ]; then
    phase2_write_n8n_service
  fi

  # Cloudflare tunnel setup (optional)
  if [ -n "${CF_DOMAIN:-}" ]; then
    phase2_setup_tunnel
    phase2_write_cloudflared_service
  else
    log_info "Cloudflare tunnel skipped (no domain specified)"
  fi

  # Reload and start all services
  log_step "Starting services"
  systemctl --user daemon-reload

  systemctl --user enable kenobot 2>/dev/null || true
  systemctl --user restart kenobot 2>/dev/null || true
  log_info "kenobot service started"

  if [ "${INSTALL_N8N:-true}" = "true" ]; then
    systemctl --user enable --now n8n 2>/dev/null || true
    log_info "n8n service started"
  fi

  if [ -n "${CF_DOMAIN:-}" ]; then
    systemctl --user enable --now cloudflared 2>/dev/null || true
    log_info "cloudflared service started"
  fi

  log_info "Phase 2 complete"
}

phase2_write_env() {
  local env_file="$HOME/.kenobot/config/.env"

  # Don't overwrite a configured .env
  if [ -f "$env_file" ]; then
    if ! grep -q "your_bot_token_here" "$env_file" 2>/dev/null; then
      log_warn ".env already configured, skipping overwrite"
      log_warn "To reconfigure: kenobot config edit"
      return 0
    fi
  fi

  log_info "Writing configuration to $env_file"

  cat > "$env_file" <<EOF
# KenoBot Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Telegram
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_USERS=${TELEGRAM_ALLOWED_USERS}

# Provider
PROVIDER=${PROVIDER}
MODEL=sonnet
EOF

  if [ "$PROVIDER" = "claude-api" ] && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    cat >> "$env_file" <<EOF
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
EOF
  fi

  if [ "$PROVIDER" = "gemini-api" ] && [ -n "${GOOGLE_API_KEY:-}" ]; then
    cat >> "$env_file" <<EOF
GOOGLE_API_KEY=${GOOGLE_API_KEY}
EOF
  fi

  if [ "${INSTALL_N8N:-true}" = "true" ]; then
    cat >> "$env_file" <<EOF

# n8n Integration
N8N_WEBHOOK_BASE=http://localhost:5678/webhook
# N8N_API_URL=http://localhost:5678
# N8N_API_KEY=set-after-n8n-setup
EOF
  fi

  if [ -n "${CF_DOMAIN:-}" ]; then
    cat >> "$env_file" <<EOF

# HTTP Webhook Channel (Cloudflare tunnel)
HTTP_ENABLED=true
HTTP_PORT=3000
HTTP_HOST=127.0.0.1
WEBHOOK_SECRET=${WEBHOOK_SECRET}
EOF
  fi

  chmod 600 "$env_file"
  log_info "Configuration saved"
}

phase2_write_n8n_service() {
  local unit_dir="$HOME/.config/systemd/user"
  local unit_file="$unit_dir/n8n.service"

  mkdir -p "$unit_dir"

  local n8n_bin
  n8n_bin=$(which n8n 2>/dev/null || echo "/usr/local/bin/n8n")

  cat > "$unit_file" <<EOF
[Unit]
Description=n8n workflow automation
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${n8n_bin} start
Restart=on-failure
RestartSec=10
Environment=N8N_PORT=5678
Environment=N8N_PROTOCOL=http
Environment=N8N_HOST=localhost

[Install]
WantedBy=default.target
EOF

  log_info "n8n service written to $unit_file"
}

phase2_setup_tunnel() {
  log_step "Setting up Cloudflare tunnel"

  # Check if already authenticated
  if [ -f "$HOME/.cloudflared/cert.pem" ]; then
    log_info "Cloudflare already authenticated"
  else
    echo ""
    log_warn "Cloudflare authentication required."
    echo "    A URL will be displayed. Open it in your browser to authorize."
    echo "    Press Enter when ready..."
    read -r </dev/tty
    cloudflared tunnel login </dev/tty
  fi

  # Create tunnel (or detect existing one)
  local tunnel_id=""
  if cloudflared tunnel list 2>/dev/null | grep -q "kenobot"; then
    tunnel_id=$(cloudflared tunnel list 2>/dev/null | grep "kenobot" | awk '{print $1}')
    log_info "Tunnel 'kenobot' already exists: $tunnel_id"
  else
    log_info "Creating tunnel..."
    local tunnel_output
    tunnel_output=$(cloudflared tunnel create kenobot 2>&1)
    tunnel_id=$(echo "$tunnel_output" | grep -oP 'id \K[a-f0-9-]+' || true)

    if [ -z "$tunnel_id" ]; then
      # Fallback: try to extract from the created credentials file
      tunnel_id=$(cloudflared tunnel list 2>/dev/null | grep "kenobot" | awk '{print $1}' || true)
    fi

    if [ -z "$tunnel_id" ]; then
      log_error "Could not determine tunnel ID. You may need to configure cloudflared manually."
      log_error "Output was: $tunnel_output"
      return 1
    fi
    log_info "Tunnel created: $tunnel_id"
  fi

  # Route DNS
  log_info "Routing DNS: $CF_DOMAIN -> tunnel kenobot"
  cloudflared tunnel route dns kenobot "$CF_DOMAIN" 2>/dev/null || true

  if [ -n "${N8N_DOMAIN:-}" ]; then
    log_info "Routing DNS: $N8N_DOMAIN -> tunnel kenobot"
    cloudflared tunnel route dns kenobot "$N8N_DOMAIN" 2>/dev/null || true
  fi

  # Write cloudflared config
  local config_file="$HOME/.kenobot/config/cloudflared.yml"
  cat > "$config_file" <<EOF
# KenoBot Cloudflare Tunnel Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

tunnel: kenobot
credentials-file: ${HOME}/.cloudflared/${tunnel_id}.json

ingress:
  - hostname: ${CF_DOMAIN}
    service: http://localhost:3000
EOF

  if [ -n "${N8N_DOMAIN:-}" ]; then
    cat >> "$config_file" <<EOF
  - hostname: ${N8N_DOMAIN}
    service: http://localhost:5678
EOF
  fi

  cat >> "$config_file" <<EOF
  - service: http_status:404
EOF

  log_info "Tunnel config written to $config_file"
}

phase2_write_cloudflared_service() {
  local unit_dir="$HOME/.config/systemd/user"
  local unit_file="$unit_dir/cloudflared.service"

  mkdir -p "$unit_dir"

  cat > "$unit_file" <<EOF
[Unit]
Description=Cloudflare Tunnel for KenoBot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --config %h/.kenobot/config/cloudflared.yml run
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

  log_info "cloudflared service written to $unit_file"
}

# ============================================================================
# Phase 2 re-entry point
# ============================================================================

if [ "${1:-}" = "--phase2" ]; then
  phase2_main
  exit 0
fi

# ============================================================================
# Phase 1: System setup (runs as root)
# ============================================================================

# Ensure running as root
if [ "$(id -u)" -ne 0 ]; then
  log_error "This script must be run as root (or with sudo)."
  echo "  Usage: sudo bash install.sh"
  exit 1
fi

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  KenoBot VPS Installer${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""
echo -e "  This script will install and configure:"
echo -e "    - Node.js ${NODE_MAJOR}"
echo -e "    - KenoBot (Telegram AI assistant)"
echo -e "    - n8n (workflow automation, optional)"
echo -e "    - Cloudflare tunnel (optional)"
echo ""
echo -e "  Everything runs as a dedicated '${KENOBOT_USER}' user."
echo ""

# --- Detect OS ---
CURRENT_STEP="detecting OS"
log_step "Detecting OS"

if [ ! -f /etc/os-release ]; then
  log_error "Cannot detect OS. This script supports Ubuntu 22.04+ and Debian 12+ only."
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release

case "$ID" in
  ubuntu)
    if [ "${VERSION_ID%%.*}" -lt 22 ]; then
      log_error "Ubuntu 22.04+ required. Found: $VERSION_ID"
      exit 1
    fi
    ;;
  debian)
    if [ "${VERSION_ID:-0}" -lt 12 ]; then
      log_error "Debian 12+ required. Found: ${VERSION_ID:-unknown}"
      exit 1
    fi
    ;;
  *)
    log_error "Unsupported OS: ${PRETTY_NAME:-$ID}"
    log_error "This script supports Ubuntu 22.04+ and Debian 12+ only."
    exit 1
    ;;
esac

log_info "Detected $PRETTY_NAME"

# --- Update system ---
CURRENT_STEP="updating system packages"
log_step "Updating system packages"
apt-get update -qq
apt-get upgrade -y -qq
log_info "System updated"

# --- Install Node.js ---
CURRENT_STEP="installing Node.js"
log_step "Installing Node.js ${NODE_MAJOR}"

install_node=true
if command -v node &>/dev/null; then
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_ver" -ge "$NODE_MAJOR" ]; then
    log_info "Node.js $(node -v) already installed"
    install_node=false
  fi
fi

if [ "$install_node" = true ]; then
  apt-get install -y -qq ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
  log_info "Node.js $(node -v) installed"
fi

# --- Create user ---
CURRENT_STEP="creating kenobot user"
log_step "Creating '${KENOBOT_USER}' user"

if id "$KENOBOT_USER" &>/dev/null; then
  log_info "User '${KENOBOT_USER}' already exists"
else
  useradd -r -m -s /bin/bash "$KENOBOT_USER"
  log_info "User '${KENOBOT_USER}' created"
fi

# --- Install cloudflared ---
CURRENT_STEP="installing cloudflared"
log_step "Installing cloudflared"

if command -v cloudflared &>/dev/null; then
  log_info "cloudflared already installed ($(cloudflared version 2>&1 | head -1))"
else
  curl -fsSL "$CLOUDFLARED_URL" -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
  log_info "cloudflared installed"
fi

# --- Configure UFW ---
CURRENT_STEP="configuring firewall"
log_step "Configuring firewall (UFW)"

if command -v ufw &>/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  log_info "UFW enabled (SSH allowed, all other incoming denied)"
else
  apt-get install -y -qq ufw
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  log_info "UFW installed and enabled"
fi

# ============================================================================
# Interactive configuration
# ============================================================================

CURRENT_STEP="collecting configuration"
log_step "Configuration"
echo ""
echo -e "  ${DIM}Enter your KenoBot configuration. Leave blank for defaults.${NC}"
echo ""

# Telegram bot token (required)
TELEGRAM_BOT_TOKEN=""
while [ -z "$TELEGRAM_BOT_TOKEN" ]; do
  prompt_value "Telegram Bot Token (from @BotFather)" "" TELEGRAM_BOT_TOKEN
  [ -z "$TELEGRAM_BOT_TOKEN" ] && log_warn "Telegram Bot Token is required."
done

# Allowed users (required)
TELEGRAM_ALLOWED_USERS=""
while [ -z "$TELEGRAM_ALLOWED_USERS" ]; do
  prompt_value "Telegram User ID (from @userinfobot)" "" TELEGRAM_ALLOWED_USERS
  [ -z "$TELEGRAM_ALLOWED_USERS" ] && log_warn "At least one user ID is required."
done

# Provider choice
echo ""
echo -e "    ${BOLD}AI Provider:${NC}"
echo "      1) claude-api  (recommended, requires Anthropic API key)"
echo "      2) claude-cli  (uses Claude Code CLI subscription)"
echo "      3) gemini-api  (requires Google AI API key)"
echo "      4) gemini-cli  (uses Gemini CLI)"
echo "      5) mock        (testing only, no AI)"
echo ""
PROVIDER_CHOICE=""
prompt_value "Choose provider" "1" PROVIDER_CHOICE
case "$PROVIDER_CHOICE" in
  1|claude-api) PROVIDER="claude-api" ;;
  2|claude-cli) PROVIDER="claude-cli" ;;
  3|gemini-api) PROVIDER="gemini-api" ;;
  4|gemini-cli) PROVIDER="gemini-cli" ;;
  5|mock)       PROVIDER="mock" ;;
  *)            PROVIDER="claude-api" ;;
esac

# API key if needed
ANTHROPIC_API_KEY=""
if [ "$PROVIDER" = "claude-api" ]; then
  while [ -z "$ANTHROPIC_API_KEY" ]; do
    prompt_secret "Anthropic API Key (sk-ant-...)" ANTHROPIC_API_KEY
    [ -z "$ANTHROPIC_API_KEY" ] && log_warn "API key is required for claude-api provider."
  done
fi

GOOGLE_API_KEY=""
if [ "$PROVIDER" = "gemini-api" ]; then
  while [ -z "$GOOGLE_API_KEY" ]; do
    prompt_secret "Google AI API Key" GOOGLE_API_KEY
    [ -z "$GOOGLE_API_KEY" ] && log_warn "API key is required for gemini-api provider."
  done
fi

# CLI tools (optional, smart defaults based on provider)
echo ""
echo -e "    ${BOLD}CLI Tools${NC} ${DIM}(install now so you can switch providers later)${NC}"

# Default: Y if provider uses that CLI, N otherwise
claude_default="N"; gemini_default="N"
[ "$PROVIDER" = "claude-cli" ] && claude_default="Y"
[ "$PROVIDER" = "gemini-cli" ] && gemini_default="Y"

INSTALL_CLAUDE_CLI=""
prompt_value "Install Claude Code CLI? (y/N)" "$claude_default" INSTALL_CLAUDE_CLI
case "$INSTALL_CLAUDE_CLI" in
  [Yy]*) INSTALL_CLAUDE_CLI="true" ;;
  *)     INSTALL_CLAUDE_CLI="false" ;;
esac

INSTALL_GEMINI_CLI=""
prompt_value "Install Gemini CLI? (y/N)" "$gemini_default" INSTALL_GEMINI_CLI
case "$INSTALL_GEMINI_CLI" in
  [Yy]*) INSTALL_GEMINI_CLI="true" ;;
  *)     INSTALL_GEMINI_CLI="false" ;;
esac

# n8n (optional, recommended)
echo ""
echo -e "    ${BOLD}n8n Workflow Automation${NC} ${DIM}(recommended — gives KenoBot tool/workflow abilities)${NC}"
INSTALL_N8N=""
prompt_value "Install n8n? (Y/n)" "Y" INSTALL_N8N
case "$INSTALL_N8N" in
  [Nn]*) INSTALL_N8N="false" ;;
  *)     INSTALL_N8N="true" ;;
esac

# Update channel
echo ""
echo -e "    ${BOLD}Update Channel${NC}"
echo "      1) stable  (recommended — follows release tags)"
echo "      2) dev     (follows master branch, for contributors)"
echo ""
CHANNEL_CHOICE=""
prompt_value "Choose channel" "1" CHANNEL_CHOICE
case "$CHANNEL_CHOICE" in
  2|dev) KENOBOT_CHANNEL="dev" ;;
  *)     KENOBOT_CHANNEL="stable" ;;
esac

# Cloudflare domain (optional)
echo ""
echo -e "    ${BOLD}Cloudflare Tunnel${NC} ${DIM}(optional, for webhooks and external access)${NC}"
CF_DOMAIN=""
prompt_value "KenoBot domain (e.g., bot.example.com, blank to skip)" "" CF_DOMAIN

N8N_DOMAIN=""
if [ -n "$CF_DOMAIN" ] && [ "$INSTALL_N8N" = "true" ]; then
  prompt_value "n8n domain (e.g., n8n.example.com, blank to skip)" "" N8N_DOMAIN
fi

# Auto-generate webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

# Summary
echo ""
log_step "Configuration summary"
echo ""
echo -e "    Telegram token:  ${DIM}${TELEGRAM_BOT_TOKEN:0:10}...${NC}"
echo -e "    Allowed users:   ${TELEGRAM_ALLOWED_USERS}"
echo -e "    Provider:        ${PROVIDER}"
echo -e "    Claude CLI:      ${INSTALL_CLAUDE_CLI}"
echo -e "    Gemini CLI:      ${INSTALL_GEMINI_CLI}"
echo -e "    Channel:         ${KENOBOT_CHANNEL}"
echo -e "    n8n:             ${INSTALL_N8N}"
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo -e "    API key:         ${DIM}${ANTHROPIC_API_KEY:0:12}...${NC}"
fi
if [ -n "$GOOGLE_API_KEY" ]; then
  echo -e "    API key:         ${DIM}${GOOGLE_API_KEY:0:12}...${NC}"
fi
if [ -n "$CF_DOMAIN" ]; then
  echo -e "    KenoBot domain:  ${CF_DOMAIN}"
fi
if [ -n "$N8N_DOMAIN" ]; then
  echo -e "    n8n domain:      ${N8N_DOMAIN}"
fi
echo ""

# Write config to secure temp file for Phase 2
CONFIG_TMPFILE=$(mktemp /tmp/kenobot-config.XXXXXX)
chmod 600 "$CONFIG_TMPFILE"
cat > "$CONFIG_TMPFILE" <<EOF
TELEGRAM_BOT_TOKEN='${TELEGRAM_BOT_TOKEN}'
TELEGRAM_ALLOWED_USERS='${TELEGRAM_ALLOWED_USERS}'
PROVIDER='${PROVIDER}'
ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY}'
GOOGLE_API_KEY='${GOOGLE_API_KEY}'
INSTALL_CLAUDE_CLI='${INSTALL_CLAUDE_CLI}'
INSTALL_GEMINI_CLI='${INSTALL_GEMINI_CLI}'
INSTALL_N8N='${INSTALL_N8N}'
CF_DOMAIN='${CF_DOMAIN}'
N8N_DOMAIN='${N8N_DOMAIN}'
WEBHOOK_SECRET='${WEBHOOK_SECRET}'
KENOBOT_GIT_URL='${KENOBOT_GIT_URL}'
KENOBOT_VERSION='${KENOBOT_VERSION:-}'
KENOBOT_CHANNEL='${KENOBOT_CHANNEL}'
EOF
chown "${KENOBOT_USER}:${KENOBOT_USER}" "$CONFIG_TMPFILE"

# ============================================================================
# Enable linger (needs root, allows user services to run without login)
# ============================================================================

CURRENT_STEP="enabling linger"
loginctl enable-linger "$KENOBOT_USER" 2>/dev/null || true
log_info "Linger enabled for ${KENOBOT_USER}"

# ============================================================================
# Phase 2: Run as kenobot user
# ============================================================================

CURRENT_STEP="running Phase 2 as ${KENOBOT_USER}"
log_step "Installing applications as '${KENOBOT_USER}' user"

# Save script to a known path for curl-pipe compatibility
if [ -f "$0" ] && [ "$(basename "$0")" != "bash" ]; then
  cp "$0" "$SCRIPT_PATH"
else
  # Running from pipe — download the script
  curl -fsSL "https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh" \
    -o "$SCRIPT_PATH" 2>/dev/null || true

  # If download fails (e.g. not yet published), the script is already in memory
  # and we're past the phase2 check, so this is fine — we just need the file
  # for the sudo re-entry. Copy from /proc if available.
  if [ ! -s "$SCRIPT_PATH" ] && [ -f "/proc/$$/fd/0" ]; then
    cp "/proc/$$/fd/255" "$SCRIPT_PATH" 2>/dev/null || true
  fi
fi
chmod +x "$SCRIPT_PATH"

# Run Phase 2 as kenobot user
export CONFIG_TMPFILE
sudo -iu "$KENOBOT_USER" \
  CONFIG_TMPFILE="$CONFIG_TMPFILE" \
  XDG_RUNTIME_DIR="/run/user/$(id -u "$KENOBOT_USER")" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$KENOBOT_USER")/bus" \
  bash "$SCRIPT_PATH" --phase2

# Cleanup temp files
rm -f "$CONFIG_TMPFILE" "$SCRIPT_PATH" 2>/dev/null || true
# Clear trap since we cleaned up manually
CONFIG_TMPFILE=""

# ============================================================================
# Phase 3: Post-install checklist
# ============================================================================

CURRENT_STEP=""

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  Installation Complete${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# Service statuses
log_step "Service status"
echo ""
for svc in kenobot n8n cloudflared; do
  # Skip services that were not installed
  if [ "$svc" = "n8n" ] && [ "${INSTALL_N8N:-true}" != "true" ]; then
    echo -e "  ${DIM}[-] $svc: skipped${NC}"
    continue
  fi
  if [ "$svc" = "cloudflared" ] && [ -z "${CF_DOMAIN:-}" ]; then
    echo -e "  ${DIM}[-] $svc: skipped (no domain)${NC}"
    continue
  fi

  status=$(sudo -u "$KENOBOT_USER" \
    XDG_RUNTIME_DIR="/run/user/$(id -u "$KENOBOT_USER")" \
    systemctl --user is-active "$svc" 2>/dev/null || echo "inactive")
  if [ "$status" = "active" ]; then
    log_info "$svc: running"
  else
    log_warn "$svc: $status"
  fi
done

echo ""
log_step "Manual steps remaining"
echo ""
step=1

if [ "${INSTALL_N8N:-true}" = "true" ]; then
  echo "  ${step}. n8n Admin Setup:"
  if [ -n "${N8N_DOMAIN:-}" ]; then
    echo "     Open https://${N8N_DOMAIN} in your browser"
  elif [ -n "${CF_DOMAIN:-}" ]; then
    echo "     SSH tunnel: ssh -L 5678:localhost:5678 <your-server>"
    echo "     Then open http://localhost:5678 in your browser"
  else
    echo "     Open http://<your-server-ip>:5678 in your browser"
    echo "     (or use SSH tunnel: ssh -L 5678:localhost:5678 <your-server>)"
  fi
  echo "     Create your admin account (first visit only)"
  echo ""
  step=$((step + 1))

  echo "  ${step}. Connect n8n to KenoBot:"
  echo "     In n8n: Settings > API > Create API Key"
  echo "     Then run:"
  echo "       sudo -iu ${KENOBOT_USER} kenobot config edit"
  echo "     Uncomment and set:"
  echo "       N8N_API_URL=http://localhost:5678"
  echo "       N8N_API_KEY=<your-api-key>"
  echo ""
  step=$((step + 1))
fi

echo "  ${step}. Verify the bot:"
echo "     Send a message to your bot on Telegram"
echo ""
step=$((step + 1))

if [ -n "${CF_DOMAIN:-}" ]; then
  echo "  ${step}. Verify tunnel:"
  echo "     curl https://${CF_DOMAIN}/health"
  echo ""
fi

log_step "Useful commands"
echo ""
echo "  sudo -iu ${KENOBOT_USER}                    # Switch to kenobot user"
echo "  kenobot doctor                               # Run health checks"
echo "  kenobot status                               # Bot status"
echo "  kenobot logs                                 # Tail logs"
echo "  kenobot config edit                          # Edit configuration"
echo "  systemctl --user status kenobot              # Service status"
if [ "${INSTALL_N8N:-true}" = "true" ]; then
  echo "  systemctl --user status n8n"
fi
if [ -n "${CF_DOMAIN:-}" ]; then
  echo "  systemctl --user status cloudflared"
fi
echo "  journalctl --user -u kenobot -f              # Live logs"
echo ""
echo -e "${BOLD}============================================================${NC}"
echo ""
