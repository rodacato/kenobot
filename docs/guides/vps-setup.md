# VPS Setup

> From zero to a running KenoBot on a fresh VPS.

## Why a VPS?

KenoBot needs to run 24/7 to receive Telegram messages. A VPS (DigitalOcean, Hetzner, Linode) gives you a persistent server for ~$5/month. Any Linux distribution works — this guide uses Ubuntu/Debian.

## Requirements

- Ubuntu 22.04+ or Debian 12+ (other distros work, adjust package commands)
- 1 GB RAM minimum
- Node.js 22+

## Step 1: Create a dedicated user

KenoBot must not run as root. The `claude-cli` provider depends on Claude Code CLI, which refuses to run as root. Running services as root is also a security risk.

```bash
# SSH into your VPS as root, then:
sudo adduser kenobot
sudo usermod -aG sudo kenobot

# Switch to the new user
su - kenobot
```

All remaining steps run as the `kenobot` user.

## Step 2: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # Should show v22.x
```

## Step 3: Install KenoBot

```bash
npm install -g github:rodacato/kenobot
kenobot version
```

## Step 4: Initialize

```bash
kenobot init
```

This creates `~/.kenobot/` with config templates, identity files, skills, and an SSH key for Git operations.

## Step 5: Configure

```bash
kenobot config edit
```

Set at minimum:
- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather) on Telegram
- `TELEGRAM_ALLOWED_CHAT_IDS` — your Telegram user ID (send `/start` to [@userinfobot](https://t.me/userinfobot))
- `PROVIDER` — `claude-api` (recommended) or `claude-cli`
- `ANTHROPIC_API_KEY` — if using `claude-api`

## Step 6: Verify setup

```bash
kenobot doctor
```

Fix any issues it reports before starting.

## Step 7: Start

```bash
# Test in foreground first
kenobot start

# Once working, run as daemon
kenobot start -d
```

## Step 8: Install as system service (recommended)

So KenoBot starts automatically on boot and restarts on crash:

```bash
kenobot install-service
```

Manage with systemd:

```bash
systemctl --user start kenobot
systemctl --user status kenobot
systemctl --user stop kenobot
journalctl --user -u kenobot -f    # View logs
loginctl enable-linger $USER        # Auto-start on boot
```

## Firewall

Only open what you need:

```bash
sudo ufw allow ssh
sudo ufw enable
```

If you enable the HTTP channel for webhooks (n8n, Telegram webhook mode), **don't** open the port publicly. Use a [cloudflared tunnel](cloudflared.md) instead — it's more secure than exposing ports.

## Next steps

- [n8n guide](n8n.md) — Connect external services (calendar, email, automations)
- [cloudflared guide](cloudflared.md) — Expose KenoBot securely to the internet
- [Deployment docs](../deployment.md) — Backups, monitoring, updates
