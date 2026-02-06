# Running KenoBot as Non-Root User

For better security, you can run KenoBot as a non-root user instead of root.

## Why Non-Root?

- **Security**: Limits damage if bot is compromised
- **Claude CLI**: Required for `claude` CLI (blocks root + --dangerously-skip-permissions)
- **Best practice**: Principle of least privilege

## Option A: Claude API (Recommended - No User Change Needed)

Use `claude-api` provider instead of `claude-cli`. Works as root with no changes.

```bash
# .env
PROVIDER=claude-api
ANTHROPIC_API_KEY=sk-ant-api03-...
```

See main README for setup.

## Option B: Configure Non-Root User in Devcontainer

If you need `claude-cli` or want to run as non-root for security:

### 1. Update `.devcontainer/devcontainer.json`

```jsonc
{
  "name": "KenoBot",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22-bookworm",

  // Add this to create and use non-root user
  "remoteUser": "node",

  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  "postCreateCommand": "npm install",

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint"
      ]
    }
  }
}
```

### 2. Rebuild Devcontainer

```bash
# From VS Code Command Palette (Cmd/Ctrl+Shift+P):
> Dev Containers: Rebuild Container
```

### 3. Verify Non-Root

```bash
whoami
# Should output: node (not root)

id
# Should show: uid=1000(node) gid=1000(node)
```

### 4. Fix File Permissions (if needed)

If files were created as root before:

```bash
# From inside container as root (if needed)
sudo chown -R node:node /workspaces/kenobot
```

### 5. Install Claude CLI (Optional)

If using `claude-cli` provider:

```bash
# As non-root user
npm install -g @anthropic-ai/claude-cli

# Login
claude login

# Now you can use PROVIDER=claude-cli
```

## Testing

After switching to non-root:

```bash
# Should work now
npm start

# With claude-cli provider
PROVIDER=claude-cli npm start
```

## Troubleshooting

### Permission Denied on npm install

```bash
# Make sure node_modules is owned by current user
sudo chown -R $(whoami):$(whoami) node_modules/
```

### Claude CLI still fails

```bash
# Verify you're not root
whoami  # Should NOT be root

# Verify Claude CLI is installed for current user
which claude
claude --version
```

### File permissions issues

```bash
# Fix ownership of entire project
sudo chown -R $(whoami):$(whoami) /workspaces/kenobot
```

## Recommendation

**For KenoBot:** Use `claude-api` provider (Option A) unless you specifically need `claude-cli`.

- Simpler setup
- Works as root or non-root
- More control and debugging
- No subprocess overhead
