# Scheduler

> Cron-based task scheduling with persistence. Tasks survive restarts and fire as synthetic messages through the agent loop.

## Overview

The scheduler lets the bot (or user) create recurring tasks using cron expressions. When a task fires, it emits a `message:in` event on the bus — reusing the entire agent pipeline (context, provider, response, channel).

Tasks are persisted to `~/.kenobot/data/scheduler/tasks.json` and restored on startup.

## Usage

### Via Slash Commands (any provider)

```
/schedule add "0 9 * * *" Check your calendar for today
/schedule add "30 17 * * 5" Weekly review: what did I accomplish this week?
/schedule list
/schedule remove a1b2c3d4
```

### Via LLM Tool Use (claude-api)

The agent can decide to schedule tasks autonomously:

```
User: Remind me every morning at 9am to check my calendar
Bot: I've scheduled that for you.
     (internally calls schedule tool with cron "0 9 * * *")
```

## Configuration

Tasks are stored in `DATA_DIR/scheduler/tasks.json`. No additional env vars are needed beyond `DATA_DIR`.

```bash
# tasks.json stored in DATA_DIR/scheduler/ (default: ~/.kenobot/data/scheduler/)
```

## Cron Expressions

Standard 5-field cron format:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|-----------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `*/30 * * * *` | Every 30 minutes |
| `0 */2 * * *` | Every 2 hours |
| `30 17 * * 5` | Friday at 5:30 PM |
| `0 8 * * 1-5` | Weekdays at 8:00 AM |
| `0 0 1 * *` | First day of every month at midnight |

## How It Works

1. **Task creation**: User or agent creates a task via the schedule tool
2. **Persistence**: Task definition is saved to `~/.kenobot/data/scheduler/tasks.json`
3. **Cron job**: `node-cron` schedules the job in-process
4. **Task fires**: Emits `message:in` on the bus with the task's message text
5. **Agent processes**: The message flows through the full pipeline (context, provider, response)
6. **Response sent**: Response goes back to the original chat via the channel

Tasks include the `chatId`, `userId`, and `channel` from when they were created, so responses go to the right place.

## Task Persistence

```json
// ~/.kenobot/data/scheduler/tasks.json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "cronExpr": "0 9 * * *",
    "message": "Check your calendar for today",
    "description": "Daily calendar check",
    "chatId": "123456789",
    "userId": "123456789",
    "channel": "telegram",
    "createdAt": 1707307200000
  }
]
```

On startup, all tasks are loaded and their cron jobs resumed.

## Examples

### Daily Morning Reminder

```
/schedule add "0 9 * * *" Good morning! Here's what you should focus on today.
```

The bot will send this message every day at 9 AM, and the agent will generate a contextual response using memory and conversation history.

### Weekly Review

```
/schedule add "0 17 * * 5" It's Friday! Summarize what I worked on this week.
```

### List and Remove

```
/schedule list
> - a1b2c3d4: "Daily calendar check" (0 9 * * *)
> - e5f6a7b8: "Weekly review" (0 17 * * 5)

/schedule remove a1b2c3d4
> Task a1b2c3d4 removed.
```

Short IDs (first 8 characters) are supported for convenience.

## Source

- [src/scheduler/scheduler.js](../src/scheduler/scheduler.js) — Core scheduler
- [src/tools/schedule.js](../src/tools/schedule.js) — Schedule tool (add/list/remove)
- [test/scheduler/](../test/scheduler/) — Tests
