# Getting Started with KenoBot

A complete guide from zero to a running KenoBot instance -- locally and on a VPS.

**Time required**: ~15 minutes for local setup, ~30 minutes including VPS deployment.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Part 1: Local Setup](#part-1-local-setup)
3. [Part 2: Deploy to a VPS](#part-2-deploy-to-a-vps)
4. [Part 3: Cloudflare Tunnel (optional)](#part-3-cloudflare-tunnel-optional)
5. [Troubleshooting](#troubleshooting)
6. [FAQ](#faq)
7. [Resources](#resources)

---

## Prerequisites

- Node.js 22+ (pre-installed in devcontainer)
- A Telegram account
- ~10 minutes for local setup

---

## Part 1: Local Setup

### Step 1: Create your Telegram bot (get TOKEN)

> **Goal**: Get the bot **TOKEN** (authentication credential)

1. **Open Telegram** on your phone or desktop

2. **Search for @BotFather** (Telegram's official bot for creating bots)

3. **Send the command**:
   ```
   /newbot
   ```

4. **Follow the instructions**:
   - **Bot name**: Choose a name (e.g., "My KenoBot")
   - **Username**: Must end in "bot" (e.g., "my_kenobot_bot")

5. **Copy the TOKEN** that BotFather gives you. It looks like:
   ```
   7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
   ```

   **This is the bot TOKEN** (the bot's "password").
   Save it somewhere safe, you will need it in step 3.

### Step 2: Get YOUR Chat ID (your personal identifier)

> **Goal**: Get **YOUR CHAT ID** (your Telegram user identifier)

**IMPORTANT**: This is a **different** step from the previous one. Now you need **YOUR** ID, not the bot's.

1. **Search for @userinfobot** in Telegram (different bot from BotFather)

2. **Send the command**:
   ```
   /start
   ```

3. **Copy the "Id:" number**. It will reply with something like:
   ```
   @your_username
   Id: 123456789          <- COPY THIS NUMBER
   First: Your
   Last: Name
   Lang: en
   ```

   **This is YOUR CHAT ID** (your personal identifier).
   Save it, you will need it in step 3.

**Why do I need this?**
So the bot only responds to **you** and not to anyone who messages it.

### Step 3: Install KenoBot

#### Option A: Install via npm (recommended)

```bash
npm install -g github:rodacato/kenobot
kenobot setup       # Scaffold ~/.kenobot/ directories
```

#### Option B: Development install (git clone)

```bash
git clone git@github.com:rodacato/kenobot.git
cd kenobot
npm install
npm link           # Makes 'kenobot' command available globally
kenobot setup       # Scaffold ~/.kenobot/ directories
```

### Step 4: Configure KenoBot

#### If installed via npm (recommended):

```bash
kenobot config edit
```

This opens `~/.kenobot/config/.env` in your editor.

#### If running from a git clone (development):

```bash
cp .env.example .env
```

Then edit the `.env` file:

```bash
# Option 1: Use nano
nano .env

# Option 2: Use vim
vim .env

# Option 3: Use the VSCode editor
code .env
```

**Modify these lines**:

```bash
# Paste the token BotFather gave you
TELEGRAM_BOT_TOKEN=PASTE_YOUR_TOKEN_HERE

# Paste your user ID (the number from userinfobot)
TELEGRAM_ALLOWED_USERS=PASTE_YOUR_CHAT_ID_HERE

# For testing, use the mock provider
PROVIDER=mock

# Model (doesn't matter for mock, but leave it)
MODEL=sonnet
```

**Complete example**:
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_USERS=123456789
PROVIDER=mock
MODEL=sonnet
```

Save the file:
- In nano: `Ctrl+X`, then `Y`, then `Enter`
- In vim: `:wq`
- In VSCode: `Ctrl+S`

### Step 5: Verify the configuration

```bash
kenobot config
```

You should see something like (secrets are redacted automatically):
```
Config: /home/you/.kenobot/config/.env

TELEGRAM_BOT_TOKEN=********
TELEGRAM_ALLOWED_USERS=123456789
PROVIDER=mock
MODEL=sonnet
```

### Step 6: Start KenoBot

```bash
kenobot start       # If installed via npm or npm link
# or
npm start           # If running from git clone without npm link
```

**You should see**:
```
[info] system: startup provider=mock model=sonnet allowedChats=1
[info] telegram: starting
```

If you see this, KenoBot is running!

**If you see errors**:

- `Missing required config: TELEGRAM_BOT_TOKEN`
  -> Edit your `.env`, the token is missing

- `Error: 401 Unauthorized`
  -> Telegram token is incorrect, verify you copied it correctly

- `Cannot find module 'grammy'`
  -> Run `npm install` first

### Step 7: Test your bot

1. **Open Telegram**

2. **Search for your bot** by the username you gave it (e.g., `@my_kenobot_bot`)

3. **Start the conversation**:
   ```
   /start
   ```

4. **Send a message**:
   ```
   Hello there!
   ```

5. **The bot should respond**:
   ```
   Hello there! General Kenobi!

   I'm KenoBot, running in mock mode for testing. The Force is strong with this one!
   ```

### Step 8: Check the logs

In the terminal where KenoBot is running you should see:

```
[info] agent: message_received { sessionId: "telegram-123456789", length: 12 }
[info] agent: response_generated { sessionId: "telegram-123456789", durationMs: 5 }
```

If you see this, the full flow is working!

### Step 9: Stop the bot

In the terminal, press `Ctrl+C`, or if running as daemon:
```bash
kenobot stop
```

You should see:
```
[info] system: shutdown { signal: "SIGINT" }
```

Clean shutdown!

### Validation Checklist

- [ ] Bot starts without errors
- [ ] You can send a message and receive a response
- [ ] Logs show message_received and response_generated
- [ ] Long messages are split into chunks
- [ ] Ctrl+C stops the bot cleanly

**If all checks pass: the bot works!**

### Switch to a real Claude provider

Once mock works, switch to a real provider:

**Option A: Claude CLI** (default — uses your Claude Code subscription)
```bash
# .env
PROVIDER=claude-cli
MODEL=sonnet
```
Requires `claude` CLI installed and authenticated. ~20s latency per response.

**Option B: Claude API** (faster — requires Anthropic API key)
```bash
# .env
PROVIDER=claude-api
MODEL=sonnet
ANTHROPIC_API_KEY=your_api_key_here
```

**Option C: Gemini** (Google AI)
```bash
# .env
PROVIDER=gemini-api
MODEL=flash
GEMINI_API_KEY=your_gemini_key_here
```

**Option D: Cerebras** (fast inference)
```bash
# .env
PROVIDER=cerebras-api
MODEL=llama-4-scout-17b-16e-instruct
CEREBRAS_API_KEY=your_cerebras_key_here
```

See [configuration.md](configuration.md) for all environment variables and provider options.

---

## Part 2: Deploy to a VPS

> Running KenoBot on a VPS with systemd. Designed for a ~$4/month Hetzner server (2vCPU, 4GB RAM, 40GB disk).

### Why a VPS?

KenoBot needs to run 24/7 to receive Telegram messages. A VPS (Hetzner, DigitalOcean, Linode) gives you a persistent server for ~$5/month. Any Linux distribution works -- this guide uses Ubuntu/Debian.

### Requirements

- Ubuntu 22.04+ or Debian 12+ (other distros work, adjust package commands)
- 1 GB RAM minimum (~50MB idle, ~150MB under load)
- ~50MB disk for code + dependencies
- Network access to Telegram API and Anthropic API

### Step 1: Create a dedicated user

> **Important**: Do not run KenoBot as root. The `claude-cli` provider depends on Claude Code CLI, which refuses to run as root. Running services as root is also a security risk.

```bash
# SSH into your VPS as root, then:
sudo adduser kenobot
sudo usermod -aG sudo kenobot

# Switch to the new user
su - kenobot
```

All remaining steps run as the `kenobot` user.

### Step 2: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # Should show v22.x
```

### Step 3: Install KenoBot

KenoBot has two deployment channels:

| | Stable | Dev |
|---|---|---|
| **Audience** | End users, forks | Maintainer + bot on VPS |
| **Tracks** | Latest release tag | master branch |
| **Updates** | `kenobot update` (tag checkout + rollback) | `kenobot update` (git pull + rollback) |
| **Git remote** | HTTPS (read-only) or SSH | SSH (read+write for PRs) |

#### Stable (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh | sudo bash
# Choose "stable" when prompted for update channel
```

Or pin a specific version:
```bash
KENOBOT_VERSION=v0.3.0 sudo bash install.sh
```

#### Dev (contributors / self-hosted bot)

For development, or when the bot should track master and be able to push changes:

```bash
# 1. Set up SSH key for the kenobot user (required for push access)
sudo -iu kenobot
ssh-keygen -t ed25519 -C "kenobot@vps"
cat ~/.ssh/id_ed25519.pub
# Add to GitHub: Settings > SSH keys (or as deploy key with write access)
exit

# 2. Run installer, choose "dev" channel
sudo bash install.sh
```

The dev channel stays on master. The bot can create branches and PRs if the SSH key has write access.

### Step 4: Configure

```bash
kenobot setup          # Scaffold ~/.kenobot/ directories
kenobot config edit    # Opens ~/.kenobot/config/.env in $EDITOR
```

Set at minimum:
```bash
TELEGRAM_BOT_TOKEN=your_token_here         # From @BotFather on Telegram
TELEGRAM_ALLOWED_USERS=your_chat_id        # Your Telegram user ID (from @userinfobot)
PROVIDER=claude-cli                         # Default provider (uses Claude Code CLI)
MODEL=sonnet
```

Verify config (secrets redacted):
```bash
kenobot config
```

### Step 5: Verify setup

```bash
kenobot doctor
```

Fix any issues it reports before starting. The doctor checks: directory structure, config file, provider readiness, identity, stale PID, disk usage, and recent log errors.

### Step 6: Start KenoBot

```bash
# Test in foreground first
kenobot start

# Once working, run as daemon
kenobot start -d
kenobot status         # Check if running + uptime
```

### Step 7: Install as system service (recommended)

So KenoBot starts automatically on boot and restarts on crash:

```bash
kenobot install-service
```

Manage with systemd:

```bash
systemctl --user start kenobot     # Start
systemctl --user status kenobot    # Check status
systemctl --user stop kenobot      # Stop
journalctl --user -u kenobot -f   # View logs

# For auto-start on boot:
loginctl enable-linger $USER
```

### Firewall

Only open what you need:

```bash
sudo ufw allow ssh
sudo ufw enable
```

If you enable the HTTP channel for webhooks, **do not** open the port publicly. Use a Cloudflare tunnel instead (see Part 3) or a reverse proxy with TLS:

```bash
# If using UFW:
sudo ufw allow 22/tcp    # SSH
sudo ufw deny 3000/tcp   # Block direct HTTP access
sudo ufw enable
```

```
# Caddyfile example (reverse proxy)
kenobot.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Monitoring

#### Status check

```bash
kenobot status
# KenoBot is running (PID 12345)
# Uptime: 2d 5h 30m
# Config: ~/.kenobot/config/.env
# Data:   ~/.kenobot/data
```

#### Logs

```bash
kenobot logs              # Tail latest log
kenobot logs --today      # Today's full log
kenobot logs --date 2026-02-06   # Specific date
```

#### HTTP health endpoint

When `HTTP_ENABLED=true`:

```bash
curl http://localhost:3000/health
```

### Updating

```bash
kenobot update --check     # Check for new version without updating
kenobot update             # Update to latest version
```

The update command auto-detects the channel:

- **Stable** (on a tag): fetches tags, checks out the latest release, runs `npm install`, rolls back on failure.
- **Dev** (on a branch): pulls latest from origin, runs `npm install`, rolls back on failure.

After updating, restart the bot:
```bash
kenobot stop && kenobot start -d
```

### Backups

The following directories contain your bot's state and should be backed up:

```
~/.kenobot/config/        # .env
~/.kenobot/memory/        # All memory + identity files
~/.kenobot/data/
  sessions/               # Conversation history
  logs/                   # Structured JSONL logs
  scheduler/              # Scheduled task definitions
```

### File Layout

```
~/.kenobot/                   # KENOBOT_HOME (override with env var)
  config/
    .env                      # Bot configuration
  memory/
    identity/                 # Bot identity (core.md, rules.json, preferences.md)
    MEMORY.md                 # Long-term curated facts
    chats/                    # Per-chat episodic memory
    working/                  # Session scratchpad
    procedural/               # Learned patterns
  data/
    sessions/                 # Per-chat JSONL history
    logs/                     # Structured JSONL logs (daily rotation)
    nervous/                  # Audit trail
    scheduler/                # Cron task definitions
    kenobot.pid               # PID file (when running)
```

---

## Part 3: Cloudflare Tunnel (optional)

> Expose KenoBot's HTTP server to the internet securely, without opening ports.

### What is cloudflared?

[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) creates an encrypted tunnel from your machine to Cloudflare's network. External services reach your local server through Cloudflare, without you exposing any ports.

```
Internet                         Your machine
-------                         ------------
https://bot.example.com
     -> Cloudflare edge
        -> cloudflared tunnel
           -> http://localhost:3000 (KenoBot HTTP channel)
```

### Why does KenoBot need a tunnel?

KenoBot's HTTP channel listens on `localhost:3000` by default -- it is not reachable from the internet. A tunnel is needed when:

1. **Telegram webhook mode** -- instead of polling, Telegram pushes updates directly to your bot (lower latency, more efficient)
2. **Any external webhook** -- third-party services that need to notify KenoBot

### When you DON'T need it

- **Telegram long polling** (default) -- KenoBot pulls messages from Telegram, no inbound connection needed
- **No external integrations** -- if nothing outside your machine needs to reach KenoBot

### Requirements

- A Cloudflare account (free tier works)
- A domain managed by Cloudflare (you can transfer an existing domain or buy one)

### Setup

#### 1. Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

cloudflared version
```

#### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser to authorize cloudflared with your Cloudflare account. Select the domain you want to use.

#### 3. Generate config with KenoBot

```bash
kenobot setup-tunnel --domain bot.example.com
```

This creates `~/.kenobot/config/cloudflared.yml`. The command also checks if cloudflared is installed and gives you next steps.

#### 4. Create the tunnel

```bash
cloudflared tunnel create kenobot
# Created tunnel kenobot with id abc-123-def
```

Update the credentials file path in `~/.kenobot/config/cloudflared.yml`:

```yaml
credentials-file: ~/.cloudflared/abc-123-def.json  # Use your tunnel ID
```

#### 5. Route DNS

```bash
cloudflared tunnel route dns kenobot bot.example.com
```

#### 6. Enable KenoBot HTTP channel

```bash
kenobot config edit
```

```bash
HTTP_ENABLED=true
HTTP_PORT=3000
WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
```

#### 7. Start the tunnel

```bash
cloudflared tunnel --config ~/.kenobot/config/cloudflared.yml run
```

#### 8. Verify

```bash
curl https://bot.example.com/health
# Should return: {"status":"ok"}
```

### Run cloudflared as a system service

So the tunnel starts on boot and survives reboots:

```bash
cloudflared service install
sudo systemctl enable --now cloudflared
```

### How it fits together

```
You (Telegram) -> Telegram API -> (polling) -> KenoBot

External service -> https://bot.example.com -> cloudflared -> KenoBot HTTP channel
```

The tunnel is only for inbound traffic from the internet. KenoBot's outbound connections (to Telegram API, to Claude API) work directly without a tunnel.

---

## Troubleshooting

### General diagnostics

Run the doctor command to check for common problems:

```bash
kenobot doctor
```

Checks: directory structure, config file, provider readiness, identity, stale PID, disk usage, and recent log errors.

### Bot not responding

1. **Verify it is running**:
   - Run `kenobot status` to check if the process is alive
   - Should show `Bot started successfully` in logs

2. **Verify the chat ID**:
   - In logs, when you send a message, it should show your session ID
   - If it shows `Rejected message from unauthorized user`, your chat ID does not match

3. **Check config**: `kenobot config`

4. **Check logs**: `kenobot logs`

5. **Restart the bot**:
   ```bash
   kenobot restart     # If running as daemon
   # or Ctrl+C then kenobot start / npm start
   ```

### "Error: 401 Unauthorized"

- Telegram token is incorrect
- Verify in BotFather that the token is active
- Copy-paste the full token again

### "Missing required config" / "Config missing" error

- Your `.env` does not have all required values
- Check that it has:
  - `TELEGRAM_BOT_TOKEN=...`
  - `TELEGRAM_ALLOWED_USERS=...`
- Run `kenobot setup` to scaffold directories, then `kenobot config edit` to set required variables

### Bot responds to anyone

- This is a security issue
- Verify that `TELEGRAM_ALLOWED_USERS` has YOUR user ID
- Check logs: unauthorized users should be rejected

### Claude CLI hanging

The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to prevent stdin hanging. If it still hangs, switch to `claude-api`.

### High memory usage

Check with: `curl localhost:3000/health | jq .memory`

Normal idle: ~50MB RSS. If growing unbounded, check for:
- Large session files (`~/.kenobot/data/sessions/`) -- consider archiving old ones
- Many scheduled tasks -- list and remove unused ones

---

## FAQ

### What's the difference between Token and Chat ID?

They are **two completely different things**:

| Concept | What it is | Where to get it | What it's for |
|---------|------------|-----------------|---------------|
| **Bot Token** | Bot credential | @BotFather | Authenticate your bot with Telegram |
| **Chat ID** | YOUR user ID | @userinfobot | Identify you as an authorized user |

**Analogy**:
- **Token** = Bot's password (like a house key)
- **Chat ID** = Your personal ID (like a passport)

### Why do I need MY chat ID and not the bot's?

Because KenoBot uses your Chat ID for **security**. When you send a message to the bot, it checks your user ID against the `TELEGRAM_ALLOWED_USERS` list. If your ID is not on the list, the message is ignored. This prevents other people from using your bot.

### What does each Telegram bot do?

| Bot | Function | Commands |
|-----|----------|----------|
| **@BotFather** | Create and manage bots | `/newbot` - Create bot, `/mybots` - See your bots |
| **@userinfobot** | See your user info | `/start` - See your ID |
| **@your_bot** | YOUR bot (the one you created) | Whatever you program |

### Are these number formats correct?

Yes. Examples:

```bash
# Bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
#                  ^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                  Bot ID    Secret token (don't share)

# Your user ID (from @userinfobot)
TELEGRAM_ALLOWED_USERS=123456789
#                      ^^^^^^^^^
#                      Your user ID
```

### Can I use the same bot on multiple devices?

Yes. The **bot token** is the same, but each **person** has their own **Chat ID**.

If you want another person to use the bot:
```bash
# Multiple users (comma-separated)
TELEGRAM_ALLOWED_USERS=123456789,987654321,111222333
```

### What happens if someone else messages my bot?

KenoBot automatically rejects them (deny by default):

```
[warn] channel: auth_rejected { userId: 987654321 }
```

Only YOU (with your Chat ID) receive responses.

### Why use mock provider first?

Because it lets you verify the **entire flow works** before setting up API keys or CLI authentication.

Options:
1. **Mock** (current): Testing without a real LLM
2. **Claude CLI** (default): Uses Claude Code CLI subscription
3. **Claude API**: Requires an Anthropic API key
4. **Gemini API/CLI**, **Cerebras API**: Alternative providers

### When should I switch to real Claude?

After validating that mock works:

```bash
# Option 1: Claude CLI (default — uses your subscription)
PROVIDER=claude-cli

# Option 2: Claude API (faster, requires API key)
PROVIDER=claude-api
ANTHROPIC_API_KEY=your_api_key
```

---

## Tips

- **Keep your token safe**: Anyone with the token can control your bot
- **Don't commit `.env`**: It is already in `.gitignore`, but double-check
- **Logs are your friend**: If something fails, check the logs
- **Mock is temporary**: Once it works, switch to a real provider

---

## Resources

- [Telegram BotFather](https://t.me/botfather) -- Create bots
- [Telegram UserInfo Bot](https://t.me/userinfobot) -- Get your Chat ID
- [Configuration](configuration.md) -- All environment variables
- [Architecture](architecture.md) -- System design
- [Events](events.md) -- Bus events reference
- [Identity](identity.md) -- Bot identity system
- [Memory](memory.md) -- Memory system

---

**Having issues? Run `kenobot doctor` and check the logs -- they are your best friend for debugging.**
