# Getting Started with KenoBot

A step-by-step guide from zero to a running KenoBot instance.

## Prerequisites

- Node.js 22+ (pre-installed in devcontainer)
- A Telegram account
- ~10 minutes

## Steps

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
   Save it somewhere safe, you'll need it in step 3.

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
   Save it, you'll need it in step 3.

**Why do I need this?**
So the bot only responds to **you** and not to anyone who messages it.

### Step 3: Configure KenoBot

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

# Paste your chat ID (the number from userinfobot)
TELEGRAM_ALLOWED_CHAT_IDS=PASTE_YOUR_CHAT_ID_HERE

# For testing, use the mock provider
PROVIDER=mock

# Model (doesn't matter for mock, but leave it)
MODEL=sonnet
```

**Complete example**:
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_CHAT_IDS=123456789
PROVIDER=mock
MODEL=sonnet
```

Save the file:
- In nano: `Ctrl+X`, then `Y`, then `Enter`
- In vim: `:wq`
- In VSCode: `Ctrl+S`

### Step 4: Verify the configuration

```bash
kenobot config
```

You should see something like (secrets are redacted automatically):
```
Config: /home/you/.kenobot/config/.env

TELEGRAM_BOT_TOKEN=********
TELEGRAM_ALLOWED_CHAT_IDS=123456789
PROVIDER=mock
MODEL=sonnet
```

### Step 5: Start KenoBot

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

### Step 6: Test your bot

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

### Step 7: Check the logs

In the terminal where KenoBot is running you should see:

```
[info] agent: message_received { sessionId: "telegram-123456789", length: 12 }
[info] agent: response_generated { sessionId: "telegram-123456789", durationMs: 5 }
```

If you see this, the full flow is working!

### Step 8: Test more functionality

**Send different messages**:

```
help
```
```
testing 123
```
```
any message works!
```

**Long message** (copy and send this lorem ipsum):
```
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. [... repeat 20 times to exceed 4000 chars ...]
```

It should split into multiple messages (chunking).

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

---

## Validation Checklist

- [ ] Bot starts without errors
- [ ] You can send a message and receive a response
- [ ] Logs show message_received and response_generated
- [ ] Long messages are split into chunks
- [ ] Ctrl+C stops the bot cleanly

**If all checks pass: the bot works!**

---

## Next Steps

### Switch to a real Claude provider (optional)

Once mock works, you can switch to a real provider:

**Option A: Claude API** (requires Anthropic API key)
```bash
# .env
PROVIDER=claude-api
MODEL=sonnet
ANTHROPIC_API_KEY=your_api_key_here
```

**Option B: Claude CLI** (requires non-root user)
```bash
# .env
PROVIDER=claude-cli
MODEL=sonnet
```

See [providers.md](features/providers.md) for details on each provider.

---

## Troubleshooting

### Bot not responding

1. **Verify it's running**:
   - Should show `Bot started successfully` in logs

2. **Verify the chat ID**:
   - In logs, when you send a message, it should show your session ID
   - If it shows `Rejected message from unauthorized user`, your chat ID doesn't match

3. **Restart the bot**:
   ```bash
   kenobot restart     # If running as daemon
   # or Ctrl+C then kenobot start / npm start
   ```

### "Error: 401 Unauthorized"

- Telegram token is incorrect
- Verify in BotFather that the token is active
- Copy-paste the full token again

### "Missing required config"

- Your `.env` doesn't have all values
- Check that it has:
  - `TELEGRAM_BOT_TOKEN=...`
  - `TELEGRAM_ALLOWED_CHAT_IDS=...`

### Bot responds to anyone

- This is a security issue
- Verify that `TELEGRAM_ALLOWED_CHAT_IDS` has YOUR chat ID
- Check logs: unauthorized users should be rejected

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

Because KenoBot uses your Chat ID for **security**:

```javascript
// When YOU send a message to the bot:
{
  userId: 123456789,        // YOUR Chat ID (from @userinfobot)
  text: "Hello there!"
}

// The bot verifies:
if (userId === TELEGRAM_ALLOWED_CHAT_IDS) {
  // Authorized, respond
} else {
  // Unauthorized, ignore
}
```

This prevents **other people** from using your bot.

### What does each bot do?

| Bot | Function | Commands |
|-----|----------|----------|
| **@BotFather** | Create and manage bots | `/newbot` - Create bot<br>`/mybots` - See your bots |
| **@userinfobot** | See your user info | `/start` - See your ID |
| **@your_bot** | YOUR bot (the one you created) | Whatever you program |

### Are these number formats correct?

Yes. Examples:

```bash
# Bot token (from @BotFather)
TELEGRAM_BOT_TOKEN=7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
#                  ^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                  Bot ID    Secret token (don't share)

# Your Chat ID (from @userinfobot)
TELEGRAM_ALLOWED_CHAT_IDS=123456789
#                         ^^^^^^^^^
#                         Your user ID
```

### Can I use the same bot on multiple devices?

Yes. The **bot token** is the same, but each **person** has their own **Chat ID**.

If you want another person to use the bot:
```bash
# Multiple users (comma-separated)
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321,111222333
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
2. **Claude API**: Requires an Anthropic API key
3. **Claude CLI**: Requires a non-root user

### When should I switch to real Claude?

After validating that mock works:

```bash
# Option 1: Claude API (recommended)
PROVIDER=claude-api
ANTHROPIC_API_KEY=your_api_key

# Option 2: Claude CLI (requires non-root user setup)
PROVIDER=claude-cli
```

---

## Resources

- [Telegram BotFather](https://t.me/botfather) - Create bots
- [Telegram UserInfo Bot](https://t.me/userinfobot) - Get your Chat ID
- [Architecture](architecture.md) - System design
- [Configuration](configuration.md) - All environment variables
- [Providers](features/providers.md) - Provider comparison

---

## Tips

- **Keep your token safe**: Anyone with the token can control your bot
- **Don't commit `.env`**: It's already in `.gitignore`, but double-check
- **Logs are your friend**: If something fails, check the logs
- **Mock is temporary**: Once it works, switch to a real provider

---

**Having issues? Check the logs — they're your best friend for debugging.**
