#!/bin/bash
# DevContainer post-create setup script
# Makes `kenobot start` work immediately after opening the container.

set -e

echo "=== KenoBot DevContainer Setup ==="
echo ""

# 1. Git hooks
echo "--- Git config ---"
git config core.hooksPath .githooks
git config pull.rebase true

# 2. Install dependencies + make CLI available
echo ""
echo "--- Dependencies ---"
npm install
npm link 2>/dev/null || true

# 3. Scaffold ~/.kenobot/ (skips existing files)
echo ""
echo "--- Init ~/.kenobot/ ---"
kenobot init

# 4. Patch ~/.kenobot/config/.env with forwarded host env vars
ENV_FILE="$HOME/.kenobot/config/.env"

if [ -f "$ENV_FILE" ]; then
  echo ""
  echo "--- Configuring from host env vars ---"

  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN|" "$ENV_FILE"
    echo "  [ok] TELEGRAM_BOT_TOKEN"
  fi

  if [ -n "$TELEGRAM_ALLOWED_USERS" ]; then
    sed -i "s|^TELEGRAM_ALLOWED_USERS=.*|TELEGRAM_ALLOWED_USERS=$TELEGRAM_ALLOWED_USERS|" "$ENV_FILE"
    echo "  [ok] TELEGRAM_ALLOWED_USERS"
  fi

  if [ -n "$ANTHROPIC_API_KEY" ]; then
    sed -i "s|^# ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" "$ENV_FILE"
    sed -i "s|^PROVIDER=mock|PROVIDER=claude-api|" "$ENV_FILE"
    echo "  [ok] ANTHROPIC_API_KEY (switched provider to claude-api)"
  fi

  if [ -n "$GEMINI_API_KEY" ]; then
    echo "  [ok] GEMINI_API_KEY (available in env)"
  fi
fi

# 5. Symlink project .env -> ~/.kenobot/config/.env (single source of truth)
PROJECT_ENV="$(pwd)/.env"
if [ -f "$ENV_FILE" ] && [ ! -L "$PROJECT_ENV" ]; then
  rm -f "$PROJECT_ENV"
  ln -s "$ENV_FILE" "$PROJECT_ENV"
  echo ""
  echo "  [ok] .env -> ~/.kenobot/config/.env (symlink)"
fi

echo ""
echo "=== Ready! ==="
echo ""
echo "  kenobot dev      # Start with auto-reload"
echo "  kenobot start    # Start (production-like)"
echo "  kenobot doctor   # Health check"
echo ""
