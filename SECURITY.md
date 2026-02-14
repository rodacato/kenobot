# Security Policy

## Reporting a Vulnerability

**Do NOT open a public issue.** Instead:

1. Use [GitHub Security Advisories](https://github.com/rodacato/kenobot/security/advisories/new) to report privately
2. Include: description, reproduction steps, impact assessment
3. You'll receive an initial response within 72 hours

This is a personal project with no bug bounty program. Responsible disclosure is appreciated.

## Security Model

KenoBot is designed as a **single-user personal assistant**. Its security model reflects this:

- **Deny by default**: All channels reject messages unless the sender is explicitly allowlisted
- **No multi-tenant isolation**: There is one bot instance per user, not shared infrastructure
- **Trust boundary**: The bot trusts its configuration and identity files; it validates all external input

### What's in scope

- Authentication bypass (receiving messages from unauthorized users)
- Command injection via message content or tool inputs
- Secret leakage (API keys, tokens in logs or responses)
- Path traversal in file operations
- HMAC bypass on webhook endpoints

### What's out of scope

- Prompt injection (inherent LLM limitation, not a KenoBot-specific vulnerability)
- Attacks requiring physical access to the server
- Denial of service against the Telegram API

## Best Practices

### API Key Management

- Store all credentials in `.env` files (gitignored)
- Set restrictive permissions: `chmod 600 .env`
- Rotate keys if you suspect compromise
- Use separate API keys for development and production
- The `pre-commit` hook blocks accidental secret commits (`.env`, `.pem`, `.key` files)

### Channel Access Control

**Telegram** uses an explicit allowlist with two layers:

```bash
# .env — user-based (responds to you in any chat)
TELEGRAM_ALLOWED_USERS=123456789
# Optional: chat-based (allows all users in specific groups)
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
```

If neither `TELEGRAM_ALLOWED_USERS` nor `TELEGRAM_ALLOWED_CHAT_IDS` is set, the bot rejects **all** messages. This is intentional — failing closed is safer than failing open. In groups, the bot only responds when @mentioned or replied to.

**HTTP webhooks** use HMAC-SHA256 signature validation:

```bash
# .env — required when HTTP_ENABLED=true
WEBHOOK_SECRET=your-secret-here  # Generate with: openssl rand -hex 32
```

Every POST to `/webhook` must include an `X-Webhook-Signature` header with a valid HMAC. Invalid or missing signatures are rejected with 401.

### Provider Security

- **claude-api**: API key stored in `.env`, sent directly to Anthropic's API over HTTPS
- **claude-cli**: Uses the locally-installed Claude CLI with `--dangerously-skip-permissions`. The CLI uses its own authentication — KenoBot does not handle Claude credentials
- **mock**: No external calls, safe for testing

### Tool Execution

- **web_fetch**: 15-second timeout, 10KB response limit, follows redirects
- **schedule**: Creates cron jobs that emit bus events, no shell execution
- **Tool loop safety**: Maximum 20 tool iterations per message (configurable via `MAX_TOOL_ITERATIONS`)

### File System

- Session data stored under `DATA_DIR` (default: `~/.kenobot/data/`)
- No user-controlled file paths — session IDs are derived from `{channel}-{chatId}`
- Memory files are append-only markdown
- Log files are append-only JSONL with daily rotation

## Production Deployment

### Run as non-root

Create a dedicated user and install under their home:

```bash
sudo useradd -r -m -s /bin/bash kenobot
sudo -u kenobot bash
npm install -g github:rodacato/kenobot
kenobot setup
chmod 600 ~/.kenobot/config/.env
```

### Bind HTTP to localhost

The HTTP channel binds to `127.0.0.1` by default. If you need external access, put it behind a reverse proxy (Caddy, nginx) with TLS.

```bash
# .env — defaults are secure
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
```

### PID file management

The bot writes its PID to `~/.kenobot/data/kenobot.pid` on startup and removes it on graceful shutdown. `kenobot status` checks this file.

### Auto-recovery

Use `kenobot install-service` to set up a systemd user service with automatic restart on failure (`RestartSec=10`).

## Known Limitations

- **No rate limiting**: A compromised allowlisted account could flood the bot. Mitigation: Telegram's own rate limits provide some protection.
- **Plain text config**: `.env` files are unencrypted. Mitigation: Restrict file permissions (`chmod 600`).
- **No audit trail**: Actions are logged but there's no tamper-proof audit log. Mitigation: Send logs to a separate system if needed.
- **No session encryption**: JSONL session files are stored as plain text. Mitigation: Use full-disk encryption on the server.
- **Single-process**: No cluster mode or horizontal scaling. Mitigation: Use separate instances for isolation.

## Security Checklist

Before deploying to production:

- [ ] `~/.kenobot/config/.env` has `chmod 600` permissions
- [ ] `TELEGRAM_ALLOWED_USERS` is set to your specific user ID(s)
- [ ] `WEBHOOK_SECRET` is set (if using HTTP channel)
- [ ] Bot process runs as non-root user
- [ ] HTTP channel bound to `127.0.0.1` (not `0.0.0.0`)
- [ ] No secrets in git history (`git log --diff-filter=A -- '*.env' '*.key' '*.pem'`)
- [ ] `kenobot audit` shows no issues
- [ ] Firewall blocks direct access to HTTP port from internet
- [ ] Backup configured (`kenobot backup` via cron)
- [ ] Systemd service enabled (`kenobot install-service`)

## Dependency Security

KenoBot maintains a minimal dependency footprint (4 runtime deps). Run regular audits:

```bash
npm audit
```

| Dependency | Purpose | Risk Surface |
|-----------|---------|-------------|
| grammy | Telegram Bot API | Network (Telegram servers) |
| dotenv | .env file loading | File system (startup only) |
| @anthropic-ai/sdk | Claude API client | Network (Anthropic API) |
| node-cron | Cron expression parsing | None (pure computation) |

Everything else uses Node.js built-ins (`node:http`, `node:fs`, `node:events`, `node:crypto`, `node:child_process`).
