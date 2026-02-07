# Integrations Guide

> Step-by-step setup for KenoBot's optional integrations: GitHub workspace, n8n automation, Cloudflare tunnels, and Gmail.

Each section is independent — enable only what you need. The recommended order is:

1. **GitHub** — gives the bot a workspace to persist files
2. **n8n** — gives the bot hands to interact with external services
3. **Cloudflare Tunnel** — exposes webhooks securely (needed for n8n callbacks)
4. **Gmail** — email access via n8n workflows

## Prerequisites

KenoBot installed and running with basic config:

```bash
kenobot init
kenobot config edit   # Set TELEGRAM_BOT_TOKEN, PROVIDER, etc.
kenobot start         # Verify it responds on Telegram
```

---

## 1. GitHub Workspace

Give KenoBot its own GitHub identity and a private repo to store skills, workflows, notes, and identity proposals.

### 1.1 Create a GitHub account for the bot

1. Go to https://github.com/signup
2. Create an account (e.g., `kenobot-agent`)
3. Verify the email

### 1.2 Create a private repo

1. Sign in as `kenobot-agent`
2. Create a new repo: https://github.com/new
   - Name: `brain`
   - Visibility: **Private**
   - Initialize with README: Yes
3. Note the SSH URL: `git@github.com:kenobot-agent/brain.git`

### 1.3 Set up SSH keys

`kenobot init` generates an SSH keypair automatically:

```bash
kenobot init
# [✓] SSH key ~/.ssh/kenobot_ed25519
#
#   Public key (add to GitHub):
#   ssh-ed25519 AAAAC3NzaC1... kenobot
```

If you already ran init, the key is at `~/.ssh/kenobot_ed25519.pub`:

```bash
cat ~/.ssh/kenobot_ed25519.pub
```

### 1.4 Add the key to GitHub

1. Sign in as `kenobot-agent`
2. Go to Settings > SSH and GPG keys > New SSH key
3. Title: `kenobot-server` (or any label)
4. Paste the public key
5. Click "Add SSH key"

### 1.5 Clone the repo

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/kenobot_ed25519 -o IdentitiesOnly=yes" \
  git clone git@github.com:kenobot-agent/brain.git ~/.kenobot/workspace
```

### 1.6 Configure KenoBot

```bash
kenobot config edit
```

Add:

```bash
WORKSPACE_DIR=~/.kenobot/workspace
```

### 1.7 Enable self-improvement (optional)

To let the bot create its own skills, workflows, and propose identity changes:

```bash
SELF_IMPROVEMENT_ENABLED=true
APPROVAL_REQUIRED=true          # Owner approves via /approve, /reject
```

### 1.8 Verify

```bash
kenobot restart
```

In Telegram, try:
- `/git status` — should show `(clean)`
- `/workspace list .` — should show the workspace directory structure

### Available commands

| Command | Description |
|---------|-------------|
| `/git status` | Show workspace git status |
| `/git commit <message>` | Commit changes |
| `/git push` | Push to GitHub |
| `/git pull` | Pull latest |
| `/git log` | Show recent commits |
| `/workspace list <path>` | List files in workspace |
| `/workspace read <path>` | Read a file |
| `/workspace write <path>` | Write a file (via tool_use) |
| `/pending` | List pending approval proposals |
| `/approve <id>` | Approve a proposal |
| `/reject <id>` | Reject a proposal |

---

## 2. n8n Automation

n8n gives KenoBot access to 400+ services: Gmail, Google Calendar, Slack, HTTP APIs, databases, and more.

### 2.1 Install n8n

**Option A: npm (recommended for VPS)**

```bash
npm install -g n8n

# Start n8n (first time will create config)
n8n start
```

n8n will be available at `http://localhost:5678`.

**Option B: Docker**

```bash
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### 2.2 Initial n8n setup

1. Open `http://localhost:5678` in your browser
2. Create an owner account (first-time only)
3. Complete the setup wizard

### 2.3 Generate an API key

1. In n8n, go to **Settings > API**
2. Click **Create API Key**
3. Copy the key (you won't see it again)

### 2.4 Configure KenoBot

```bash
kenobot config edit
```

Add:

```bash
# Trigger workflows via webhook
N8N_WEBHOOK_BASE=http://localhost:5678/webhook

# Manage workflows via API (optional, for n8n_manage tool)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your-api-key-here
```

### 2.5 Run n8n as a service (recommended)

Create a systemd service so n8n starts on boot:

```bash
sudo tee /etc/systemd/system/n8n.service > /dev/null <<'EOF'
[Unit]
Description=n8n workflow automation
After=network.target

[Service]
Type=simple
User=kenobot
Environment=N8N_PORT=5678
ExecStart=/usr/local/bin/n8n start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now n8n
```

### 2.6 Verify

```bash
kenobot restart
```

In Telegram, try:
- `/n8n-manage list` — should list workflows (empty at first)
- `/diagnostics` — should show n8n health check as `ok`

### Available commands

| Command | Description |
|---------|-------------|
| `/n8n <workflow> [json]` | Trigger a workflow by name |
| `/n8n-manage list` | List all workflows |
| `/n8n-manage get <id>` | Get workflow details |
| `/n8n-manage activate <id>` | Activate a workflow |
| `/n8n-manage deactivate <id>` | Deactivate a workflow |

### Health monitoring

When `N8N_API_URL` is configured, KenoBot's watchdog automatically monitors n8n. If n8n goes down, you'll get a Telegram alert. Check health anytime with `/diagnostics`.

---

## 3. Cloudflare Tunnel

Expose KenoBot's HTTP webhook to the internet securely — no open ports, no reverse proxy needed. Required if external services (n8n callbacks, third-party webhooks) need to reach KenoBot.

### 3.1 Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Verify
cloudflared version
```

### 3.2 Authenticate

```bash
cloudflared tunnel login
```

This opens a browser to authorize cloudflared with your Cloudflare account. Select the domain you want to use.

### 3.3 Generate config with KenoBot CLI

```bash
kenobot setup-tunnel --domain bot.example.com
```

This creates `~/.kenobot/config/cloudflared.yml`. Edit it to update the credentials file path.

### 3.4 Create the tunnel

```bash
cloudflared tunnel create kenobot
# Created tunnel kenobot with id <tunnel-id>
```

Update `~/.kenobot/config/cloudflared.yml`:

```yaml
credentials-file: ~/.cloudflared/<tunnel-id>.json  # Replace <tunnel-id>
```

### 3.5 Route DNS

```bash
cloudflared tunnel route dns kenobot bot.example.com
```

### 3.6 Enable KenoBot HTTP channel

```bash
kenobot config edit
```

Add:

```bash
HTTP_ENABLED=true
HTTP_PORT=3000
WEBHOOK_SECRET=$(openssl rand -hex 32)    # Generate and paste the output
```

### 3.7 Start the tunnel

```bash
cloudflared tunnel --config ~/.kenobot/config/cloudflared.yml run
```

### 3.8 Run as systemd service (recommended)

```bash
cloudflared service install
sudo systemctl enable --now cloudflared
```

### 3.9 Verify

```bash
curl https://bot.example.com/health
# Should return health status JSON
```

---

## 4. Gmail

KenoBot manages email through n8n workflows — no direct Gmail OAuth or SMTP in KenoBot. All credentials stay in n8n.

**Prerequisite**: n8n must be set up and running (see section 2).

### 4.1 Connect Gmail to n8n

1. In n8n, go to **Credentials > Add Credential**
2. Search for **Gmail OAuth2**
3. Follow the OAuth flow:
   - You'll need a Google Cloud project with Gmail API enabled
   - Create OAuth 2.0 credentials (Desktop app type)
   - Copy Client ID and Client Secret to n8n
   - Authorize the Gmail account

### 4.2 Create the Gmail workflows

You need 3 webhook workflows in n8n. For each one:

**Workflow: `gmail-inbox`**

1. Create new workflow named `gmail-inbox`
2. Add nodes:
   - **Webhook** (POST) — path: `gmail-inbox`
   - **Gmail** > Get Many Messages
     - Operation: Get Many
     - Credential: your Gmail credential
     - Query: `{{ $json.query || "is:unread" }}`
     - Limit: `{{ $json.limit || 10 }}`
   - **Respond to Webhook** — return the messages
3. Activate the workflow

**Workflow: `gmail-send`**

1. Create new workflow named `gmail-send`
2. Add nodes:
   - **Webhook** (POST) — path: `gmail-send`
   - **Gmail** > Send Message
     - To: `{{ $json.to }}`
     - Subject: `{{ $json.subject }}`
     - Message: `{{ $json.body }}`
   - **Respond to Webhook** — return `{ "status": "sent" }`
3. Activate the workflow

**Workflow: `gmail-read`**

1. Create new workflow named `gmail-read`
2. Add nodes:
   - **Webhook** (POST) — path: `gmail-read`
   - **Gmail** > Get Message
     - Message ID: `{{ $json.id }}`
   - **Respond to Webhook** — return the full message
3. Activate the workflow

### 4.3 Verify

No config changes needed — KenoBot uses the `gmail` skill with the existing `n8n_trigger` tool.

In Telegram, try:
- "check my email" — triggers the gmail skill, reads inbox
- "revisa mi correo" — same in Spanish

### How it works

```
User: "check my email"
  → Skill "gmail" activates (trigger: "email", "inbox", "correo")
  → Bot uses n8n_trigger tool: { workflow: "gmail-inbox", data: { query: "is:unread" } }
  → n8n calls Gmail API, returns messages
  → Bot summarizes and responds
```

### Security

- Gmail credentials live in n8n only — KenoBot never sees them
- The bot confirms with the owner before sending emails
- New recipients require explicit approval

---

## Environment Variables Reference

All variables are set in `~/.kenobot/config/.env`.

### Core (required)

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated allowed chat IDs |

### Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER` | `claude-cli` | `mock`, `claude-cli`, or `claude-api` |
| `MODEL` | `sonnet` | Claude model to use |
| `ANTHROPIC_API_KEY` | (empty) | Required for `claude-api` provider |

### Workspace & GitHub

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_DIR` | (empty) | Path to bot's workspace |
| `KENOBOT_SSH_KEY` | `~/.ssh/kenobot_ed25519` | SSH key for git |
| `GITHUB_TOKEN` | (empty) | PAT (alternative to SSH) |
| `GITHUB_REPO` | (empty) | GitHub repo name |
| `SELF_IMPROVEMENT_ENABLED` | `false` | Enable skill/workflow creation |
| `APPROVAL_REQUIRED` | `true` | Require owner approval |

### n8n

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_WEBHOOK_BASE` | (empty) | n8n webhook URL base |
| `N8N_API_URL` | (empty) | n8n REST API URL |
| `N8N_API_KEY` | (empty) | n8n API key |

### HTTP Channel

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_ENABLED` | `false` | Enable HTTP webhook server |
| `HTTP_PORT` | `3000` | HTTP port |
| `HTTP_HOST` | `127.0.0.1` | HTTP bind address |
| `WEBHOOK_SECRET` | (empty) | HMAC secret for webhooks |
| `HTTP_TIMEOUT` | `60000` | Response timeout (ms) |

### Resilience

| Variable | Default | Description |
|----------|---------|-------------|
| `WATCHDOG_INTERVAL` | `60000` | Health check interval (ms) |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before circuit opens |
| `CIRCUIT_BREAKER_COOLDOWN` | `60000` | Cooldown before retry (ms) |

### Other

| Variable | Default | Description |
|----------|---------|-------------|
| `IDENTITY_FILE` | `identities/kenobot.md` | Bot personality file |
| `DATA_DIR` | `./data` | Data directory |
| `SKILLS_DIR` | `./skills` | Skills directory |
| `MEMORY_DAYS` | `3` | Days of memory to include |
| `SESSION_HISTORY_LIMIT` | `20` | Messages per session |
| `MAX_TOOL_ITERATIONS` | `20` | Max tool calls per message |
| `KENOBOT_HOME` | `~/.kenobot` | Override home directory |
