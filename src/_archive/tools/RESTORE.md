# Archived Tools: n8n Integration

These tools were archived in Phase 1a (Simplification) as they serve a niche use case.

## Contents

- **n8n.js** - Trigger n8n workflows via webhook (`/n8n <workflow>`)
- **n8n-manage.js** - Manage n8n workflows and connections

## Why Archived?

The n8n integration is powerful but serves a very specific use case (automation workflows). Most users don't need it, and maintaining it adds complexity to the core codebase.

## How to Restore

If you use n8n and want to restore these tools:

### 1. Move tools back to active directory

```bash
cp src/_archive/tools/n8n.js src/tools/
cp src/_archive/tools/n8n-manage.js src/tools/
```

### 2. Update tool loader

The tool loader already auto-discovers tools in `src/tools/`, so they'll be automatically registered.

### 3. Configure n8n connection

Add to your `.env`:

```bash
N8N_WEBHOOK_BASE=https://your-n8n-instance.com/webhook
N8N_API_URL=https://your-n8n-instance.com/api/v1  # For n8n-manage
N8N_API_KEY=your-api-key                          # For n8n-manage
```

### 4. Verify it works

```bash
kenobot start

# In Telegram:
/n8n test
```

## Testing

Both tools have comprehensive test coverage:

- `test/tools/n8n.test.js` (still in repo)
- `test/tools/n8n-manage.test.js` (still in repo)

Run tests after restoring:

```bash
npm test -- test/tools/n8n.test.js
npm test -- test/tools/n8n-manage.test.js
```

## Alternative: External n8n Tool

If n8n becomes popular again, consider creating it as an external package:

```bash
npm install kenobot-tool-n8n
```

This keeps the core lightweight while allowing advanced users to opt-in.

## Documentation

Original n8n integration docs are archived at:
- [docs/guides/n8n.md](../../../docs/guides/n8n.md)

## Support

If you restore these tools and encounter issues:
1. Check that n8n is running and accessible
2. Verify webhook URLs are correct
3. Test with `curl` before using from bot
4. Open an issue if needed: https://github.com/yourusername/kenobot/issues

---

**Archived:** Phase 1a (Week 1)
**Reason:** Niche use case, adds complexity
**Status:** Fully functional, tested, ready to restore
