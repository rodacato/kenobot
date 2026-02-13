# Rollback Procedure

This document describes how to safely rollback KenoBot to a previous version in case of issues during or after the simplification refactor.

## Quick Rollback

If you encounter issues after updating, immediately rollback to the last known good version:

```bash
# 1. Stop the bot
kenobot stop

# 2. Rollback to pre-refactor version
git checkout v0.3.0-pre-refactor

# 3. Reinstall dependencies (in case they changed)
npm ci

# 4. Start the bot
kenobot start

# 5. Verify it's working
kenobot status
```

**Recovery time:** ~2 minutes

---

## Pre-Refactor Snapshot

### Tag: `v0.3.0-pre-refactor`

**Created:** 2026-02-13
**Commit:** See `git show v0.3.0-pre-refactor`
**Purpose:** Safe rollback point before Phase 1 simplification

**What's included:**
- ✅ All features working
- ✅ Cognitive System intact
- ✅ All 15 CLI commands
- ✅ Skills + Tools separated
- ✅ Test suite (with some failing tests)
- ✅ 85% test coverage

**Line count:** 7,707 LOC

---

## Rollback Scenarios

### Scenario 1: Tests Failing After Update

**Symptoms:**
- `npm test` has new failures
- Integration tests broken

**Solution:**
```bash
# Check what's failing
npm test 2>&1 | grep "FAIL"

# If critical failures, rollback
git checkout v0.3.0-pre-refactor
npm ci
kenobot restart
```

---

### Scenario 2: Bot Not Responding

**Symptoms:**
- Bot doesn't respond to messages
- `kenobot status` shows "stopped" or errors

**Solution:**
```bash
# 1. Check logs
kenobot logs

# 2. If errors are from recent changes, rollback
git checkout v0.3.0-pre-refactor
npm ci

# 3. Restart
kenobot start

# 4. Verify
kenobot status
```

---

### Scenario 3: Missing Feature

**Symptoms:**
- A tool/skill you were using is gone
- CLI command doesn't exist

**Solution:**
```bash
# Check which phase removed the feature (see IMPLEMENTATION_PLAN.md)

# If feature is critical to your workflow, rollback
git checkout v0.3.0-pre-refactor
npm ci
kenobot restart
```

---

### Scenario 4: Data Corruption/Loss

**Symptoms:**
- Memory files corrupted
- Session history lost
- Identity files damaged

**Solution:**
```bash
# 1. IMMEDIATELY stop the bot to prevent further damage
kenobot stop

# 2. Check if backups exist
ls ~/.kenobot/backups/

# 3. Restore from backup (if available)
cp -r ~/.kenobot/backups/YYYY-MM-DD/* ~/.kenobot/

# 4. Rollback code
git checkout v0.3.0-pre-refactor
npm ci

# 5. Restart
kenobot start
```

**Note:** Data migrations are planned for Phase 1b to prevent this scenario.

---

## Rollback with Data Migration

Starting in Phase 1b, data migrations will be reversible:

```bash
# Rollback code + data together
kenobot migrate rollback --to=v0.3.0-pre-refactor

# This will:
# - Checkout the tag
# - Reverse data migrations
# - Reinstall dependencies
# - Restart the bot
```

**Status:** Not implemented yet (planned for Phase 1b)

---

## Preventing Data Loss

### Automatic Backups

KenoBot automatically backs up config changes via ConfigSync:

```bash
# Check backup history
ls ~/.kenobot/backups/

# Restore specific backup
kenobot restore --backup=YYYY-MM-DD
```

**What's backed up:**
- Identity files (SOUL.md, IDENTITY.md, USER.md, etc.)
- Memory files (daily logs, working memory)
- Behavioral rules (rules.json)
- Skill configurations

**NOT backed up:**
- Session history (JSONL files)
- Logs
- Temporary data

### Manual Backup Before Major Updates

```bash
# Before pulling major updates, backup everything
tar -czf kenobot-backup-$(date +%Y%m%d).tar.gz ~/.kenobot/

# Store backup safely
mv kenobot-backup-*.tar.gz ~/backups/
```

---

## Testing Before Deployment

**Always test in a separate environment first:**

```bash
# 1. Clone to test directory
git clone https://github.com/yourusername/kenobot.git ~/kenobot-test
cd ~/kenobot-test

# 2. Checkout new version
git checkout main  # or specific tag

# 3. Copy production data (read-only test)
cp -r ~/.kenobot ~/kenobot-test-data

# 4. Test with test data
DATA_DIR=~/kenobot-test-data npm test
DATA_DIR=~/kenobot-test-data npm start

# 5. If OK, update production
```

---

## Reporting Rollback Issues

If you had to rollback, please report the issue:

1. **Capture diagnostic info:**
   ```bash
   kenobot doctor > rollback-issue.txt
   git log -5 --oneline >> rollback-issue.txt
   ```

2. **Create GitHub issue:**
   - Tag: `rollback`
   - Include `rollback-issue.txt`
   - Describe what happened
   - Include error logs

3. **Help improve the process:**
   - What worked?
   - What was confusing?
   - How can we make rollback easier?

---

## Rollback Checklist

Before starting a major update:

- [ ] Read IMPLEMENTATION_PLAN.md to understand changes
- [ ] Backup data: `tar -czf ~/kenobot-backup.tar.gz ~/.kenobot/`
- [ ] Note current version: `git describe --tags`
- [ ] Test in separate environment first
- [ ] Know rollback tag: `v0.3.0-pre-refactor`
- [ ] Have this document open

After rollback:

- [ ] Verify bot responds to messages
- [ ] Check memory files intact
- [ ] Verify tools/skills work
- [ ] Run `kenobot doctor`
- [ ] Report issue (if appropriate)

---

## Version History

| Tag | Date | Description | Rollback-Safe? |
|-----|------|-------------|----------------|
| `v0.3.0-pre-refactor` | 2026-02-13 | Pre-Phase 1 snapshot | ✅ Yes |
| `v0.2.0` | Earlier | Previous stable version | ✅ Yes |

---

## Future Improvements (Roadmap)

- **Phase 1b:** Reversible data migrations
- **Phase 2:** Automated rollback testing
- **Phase 2:** Blue-green deployment support
- **Phase 3:** Canary rollout strategy

---

## Emergency Contacts

- **GitHub Issues:** https://github.com/yourusername/kenobot/issues
- **Maintainer:** See CONTRIBUTING.md
- **Community:** Discord/Telegram (if available)

---

## Related Documents

- [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) - What changes in each phase
- [Architecture](architecture.md) - How the system works
- [Contributing](../../CONTRIBUTING.md) - How to report issues
