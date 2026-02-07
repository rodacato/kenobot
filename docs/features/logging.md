# Logging

> Structured JSONL logging with daily rotation and condensed console output.

## Overview

KenoBot uses a structured logging system that writes to both console and JSONL files. Each log entry is a JSON object with timestamp, level, subsystem, and message.

## Log Format

### Console Output

Condensed, human-readable format:

```
[info] system: startup { provider: "claude-api", model: "sonnet", allowedChats: 1 }
[info] agent: started { provider: "claude-api" }
[info] agent: message_received { sessionId: "telegram-123456789", length: 12 }
[info] agent: response_generated { sessionId: "telegram-123456789", durationMs: 2841, contentLength: 156 }
```

### JSONL Files

One JSON object per line, daily rotation:

```
~/.kenobot/data/logs/kenobot-2026-02-07.log
```

```json
{"ts":"2026-02-07T10:30:00.123Z","level":"info","subsystem":"agent","message":"message_received","sessionId":"telegram-123456789","length":12}
{"ts":"2026-02-07T10:30:02.964Z","level":"info","subsystem":"agent","message":"response_generated","sessionId":"telegram-123456789","durationMs":2841}
```

## Log Levels

| Level | When |
|-------|------|
| `info` | Normal operations: startup, messages, responses, tool calls |
| `warn` | Recoverable issues: auth rejections, skill load failures, missing optional config |
| `error` | Failures: provider errors, uncaught exceptions, startup failures |

## Subsystems

Logs are tagged with the originating subsystem:

| Subsystem | Source |
|-----------|--------|
| `system` | Startup, shutdown, config, error boundaries |
| `agent` | Message handling, tool calls, memory extraction |
| `channel` | Auth rejections, message sending |
| `http` | Webhook requests, HMAC validation |
| `scheduler` | Task fires, additions, removals |
| `skills` | Skill loading, prompt loading |
| `context` | Identity loading |

## Querying Logs

Use `kenobot logs` for quick access, or query JSONL files directly:

```bash
# Tail logs via CLI
kenobot logs              # Tail latest log
kenobot logs --today      # Today's full log
kenobot logs --date 2026-02-06   # Specific date

# Query with standard tools
grep '"level":"error"' ~/.kenobot/data/logs/kenobot-2026-02-07.log

# All agent messages with duration > 5s
cat ~/.kenobot/data/logs/kenobot-2026-02-07.log | \
  jq -c 'select(.subsystem=="agent" and .durationMs > 5000)'

# Count messages per session
cat ~/.kenobot/data/logs/kenobot-2026-02-07.log | \
  jq -c 'select(.message=="message_received")' | \
  jq -r '.sessionId' | sort | uniq -c
```

## Configuration

Logs are written to `DATA_DIR/logs/`. No additional configuration needed.

```bash
# Default: ~/.kenobot/data/logs/
# Override with DATA_DIR environment variable
```

## Source

- [src/logger.js](../src/logger.js) — Logger implementation
- [test/core/logger.test.js](../test/core/logger.test.js) — Tests
