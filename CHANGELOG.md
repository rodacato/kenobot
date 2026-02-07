# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-02-07

### Added
- Git hooks for conventional commit validation and secret detection
- Release script (bin/release) for automated changelog generation
- Contributing guidelines with commit, versioning, and security conventions
- EditorConfig, .gitignore, and .env.example
- DevContainer configuration with Node.js 22, git features, and automated setup
- Core interfaces for provider, channel, and message bus
- Telegram channel adapter with grammy
- Claude CLI provider with subprocess wrapping
- Phase 0 prototype with end-to-end message flow
- Mock provider for testing without real LLM
- GETTING_STARTED.md with setup instructions
- FAQ section in GETTING_STARTED.md covering Token vs Chat ID confusion
- Vitest testing framework with 25 tests and 54% coverage
- Testing guidelines in CONTRIBUTING.md
- Coverage thresholds for Phase 0 baseline
- Claude API provider using @anthropic-ai/sdk
- Model mapping for opus, sonnet, and haiku
- Documentation for non-root deployment (NON_ROOT_SETUP.md)
- Structured JSONL logger with daily file rotation and condensed console output
- Thinking indicator via bus event while bot processes messages
- Session persistence with JSONL file storage
- Context builder with identity injection from IDENTITY.md
- System prompt support in CLI and API providers
- Agent loop with per-chat session routing and persistence
- Markdown-to-HTML formatter for Telegram messages
- Memory tag extractor for parsing <memory> tags from LLM responses
- MemoryManager for daily notes and long-term memory persistence
- Memory injection in system prompt with <memory> tag instructions
- Automatic memory extraction from LLM responses in agent loop
- MEMORY_DAYS environment variable for configuring memory window
- HTTP webhook channel with HMAC-SHA256 authentication
- Health endpoint (GET /health) for monitoring
- HTTP channel configuration (HTTP_ENABLED, WEBHOOK_SECRET, HTTP_PORT)
- BaseTool interface and ToolRegistry for agent tool system
- web_fetch tool for fetching URLs and extracting text content
- n8n_trigger tool for triggering n8n workflows via webhook
- Tool execution loop in AgentLoop with parallel tool calling
- Tool list injection in ContextBuilder system prompt
- Max iterations safety valve (default 20) for tool loops
- ToolRegistry wired into startup with web_fetch and optional n8n_trigger
- MAX_TOOL_ITERATIONS and N8N_WEBHOOK_BASE config vars
- Slash command triggers (/fetch, /n8n) work with all providers including claude-cli
- Tool trigger logging at startup with command patterns
- Skill loader with auto-discovery and keyword trigger matching
- On-demand skill prompt injection in system prompt
- SKILLS_DIR config and skill loader wiring at startup
- Weather and daily-summary example skills
- Phase 5 implementation plan and OpenClaw skills research
- Cron-based task scheduler for recurring and one-time tasks
- Schedule tool for managing recurring tasks via cron expressions
- Wire scheduler and schedule tool into application startup
- Health check module with PID file management and bin/health CLI
- Error boundaries and PID file management in startup/shutdown
- Backup script and auto-recovery for production operation
- MIT LICENSE and SECURITY.md with deployment checklist
- Architecture guide with component diagrams and design patterns
- Configuration reference for all environment variables
- Deployment guide with systemd, auto-recovery, and backups
- 10 feature guides covering providers, channels, memory, tools, skills, scheduler, n8n, multi-instance, logging, and health
- Documentation index in docs/README.md

### Changed
- Steps 1-2 in GETTING_STARTED.md with clearer objectives and examples
- All console.log/error/warn replaced with logger.info/warn/error across codebase
- Replace inline message handler with agent loop architecture
- Switch from legacy Markdown to HTML parse mode
- README updated to reflect Phase 2 completion with full architecture docs
- CHANGELOG populated with all features implemented since project start
- .gitignore simplified and consolidated
- Channel startup/shutdown uses array for multi-channel support
- claude-api provider now returns toolCalls, stopReason, rawContent
- claude-cli and mock providers return compatible response shape
- HTTP /health endpoint returns memory and timestamp via shared health module
- README.md rewritten with full feature list and documentation links
- AGENTS.md updated to reflect all 7 completed phases
- Switch versioning from CalVer to semver
- Release script uses existing [Unreleased] content as release notes

### Fixed
- dotenv not loading in containers by adding override true to config
- Claude CLI provider hanging when called from Node.js
