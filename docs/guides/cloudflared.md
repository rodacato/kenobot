# Cloudflare Tunnel

> Expose KenoBot's HTTP server to the internet securely, without opening ports.

## What is cloudflared?

[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) creates an encrypted tunnel from your machine to Cloudflare's network. External services reach your local server through Cloudflare, without you exposing any ports.

```
Internet                         Your machine
-------                         ------------
https://bot.example.com
     → Cloudflare edge
        → cloudflared tunnel
           → http://localhost:3000 (KenoBot HTTP channel)
```

## Why does KenoBot need a tunnel?

KenoBot's HTTP channel listens on `localhost:3000` by default — it's not reachable from the internet. A tunnel is needed when:

1. **n8n runs on a different machine** — n8n needs to send results back to KenoBot, but can't reach localhost
2. **Telegram webhook mode** — instead of polling, Telegram pushes updates directly to your bot (lower latency, more efficient)
3. **Any external webhook** — third-party services that need to notify KenoBot

## When you DON'T need it

- **n8n and KenoBot on the same machine** — localhost works, no tunnel needed
- **Telegram long polling** (default) — KenoBot pulls messages from Telegram, no inbound connection needed
- **No external integrations** — if nothing outside your machine needs to reach KenoBot

## Requirements

- A Cloudflare account (free tier works)
- A domain managed by Cloudflare (you can transfer an existing domain or buy one)

## Setup

### 1. Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

cloudflared version
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser to authorize cloudflared with your Cloudflare account. Select the domain you want to use.

### 3. Generate config with KenoBot

```bash
kenobot setup-tunnel --domain bot.example.com
```

This creates `~/.kenobot/config/cloudflared.yml`. The command also checks if cloudflared is installed and gives you next steps.

### 4. Create the tunnel

```bash
cloudflared tunnel create kenobot
# Created tunnel kenobot with id abc-123-def
```

Update the credentials file path in `~/.kenobot/config/cloudflared.yml`:

```yaml
credentials-file: ~/.cloudflared/abc-123-def.json  # Use your tunnel ID
```

### 5. Route DNS

```bash
cloudflared tunnel route dns kenobot bot.example.com
```

### 6. Enable KenoBot HTTP channel

```bash
kenobot config edit
```

```bash
HTTP_ENABLED=true
HTTP_PORT=3000
WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
```

### 7. Start the tunnel

```bash
cloudflared tunnel --config ~/.kenobot/config/cloudflared.yml run
```

### 8. Verify

```bash
curl https://bot.example.com/health
# Should return: {"status":"ok"}
```

## Run as system service (recommended)

So the tunnel starts on boot and survives reboots:

```bash
cloudflared service install
sudo systemctl enable --now cloudflared
```

## How it fits together

```
You (Telegram) → Telegram API → (polling) → KenoBot
                                                ↕ localhost
                                              n8n (same machine)

External service → https://bot.example.com → cloudflared → KenoBot HTTP channel
```

The tunnel is only for inbound traffic from the internet. KenoBot's outbound connections (to Telegram API, to n8n, to Claude API) work directly without a tunnel.

## Further reading

- [Integrations guide](../integrations-guide.md) — Full cloudflared setup with env var reference
- [VPS setup](vps-setup.md) — Firewall considerations
