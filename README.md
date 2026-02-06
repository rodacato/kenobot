# KenoBot

Personal AI assistant with Star Wars personality.

## Phase 0: Prototype

Current status: **Proving the core loop works**

- ✅ Message Bus architecture
- ✅ Telegram channel
- ✅ Claude CLI provider
- ✅ Basic message flow

## Quick Start

### Prerequisites

- Node.js 22+
- [Claude Code CLI](https://claude.ai/download) installed and authenticated
- Telegram bot token from [@BotFather](https://t.me/botfather)

### Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your credentials
```

Get your Telegram chat ID from [@userinfobot](https://t.me/userinfobot).

3. **Start the bot**:
```bash
npm start
# or
./bin/start
```

### Testing

Send a message to your Telegram bot. It should respond using Claude!

## Architecture

```
Telegram User
    ↓ (message)
TelegramChannel
    ↓ (publish to bus)
MessageBus
    ↓ (message:in event)
Inline Handler
    ↓ (call provider)
ClaudeCLIProvider
    ↓ (wrap CLI)
claude CLI
    ↓ (response)
Inline Handler
    ↓ (publish to bus)
MessageBus
    ↓ (message:out event)
TelegramChannel
    ↓ (send)
Telegram User
```

## What's Next

Phase 1 will add:
- Agent loop
- Context building
- Identity injection
- Session persistence
- Multi-context support

## License

MIT
