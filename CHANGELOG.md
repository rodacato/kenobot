# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-02-15

### Added

**Motor System (Agentic Capabilities)**
- ReAct tool loop — bot can now Think → Act → Observe → Repeat with real tools
- ToolRegistry for registering and executing tool definitions
- 7 action tools — github_setup_workspace, read_file, write_file, list_files, run_command, search_web, fetch_url
- Background task system for long-running operations (TaskRunner, Task entity, TaskStore)
- Cancel commands for active background tasks (para/stop/cancel/cancelar)
- Self-improver creates improvement PRs via Motor System during sleep cycle
- MOTOR_SELF_REPO config for bot's own repository
- Motor System design document with agentic loop and self-improvement architecture

**Immune System (Safety & Integrity)**
- Immune system bounded context with secret scanner and integrity checker
- Shell command audit trail with full execution context (exec, completed, blocked, timeout, error)
- Approval workflow notifies owner via Telegram when self-improvement PRs are created

**Architecture & Documentation**
- ESLint boundary rules to enforce hexagonal architecture layer separation
- Motor System and Immune System documentation in architecture docs
- Project roadmap with phased implementation plan
- Expert personas for sandboxing, tool use, self-modification, automation, and agent ops
- Conversation scenario tests for Motor System (ReAct loop, tool registration, background tasks)

### Changed
- Reorganize src/ directory by architectural role (domain, application, adapters, infrastructure)
- All documentation paths aligned with hexagonal architecture
- Simplify motor git tools from 5 to 1 (github_setup_workspace) with SSH auth
- Secret scanning moved from runtime JS to pre-commit hook generated from centralized patterns
- Approval workflow signals documented as implemented (was reserved)
- MAX_TOOL_ITERATIONS default from 5 to 15

### Removed
- git_diff, git_commit, git_push, create_pr tools (LLM uses run_command instead)
- GITHUB_TOKEN config (replaced by SSH key authentication)
- Dead config variables (SKILLS_DIR, TOOLS_DIR, MAX_TOOL_ITERATIONS, SELF_IMPROVEMENT_ENABLED, APPROVAL_REQUIRED, FALLBACK_PROVIDER)
- Obsolete implementation plan from design docs

### Fixed
- CircuitBreakerProvider now delegates supportsTools to inner provider
- Pre-commit secret scanner now works in devcontainer (removed file command dependency)
- Release script now adds blank line between changelog sections

## [0.5.0] - 2026-02-15

### Added
- Integration tests for full message flow
- Provider contract tests for Claude and Gemini APIs
- Two-track documentation structure (quickstart/ and reference/)
- Event bus schema documentation with all 13 events
- Rollback procedure guide
- Contribution zones in README (low/medium/high risk areas)
- Nervous System module (src/nervous/) with Signal, middleware pipeline, and JSONL audit trail
- Design knowledge system in docs/design/ with research diary, expert catalog, and 7 consolidated research documents
- ProceduralMemory disk persistence and keyword-based pattern matching
- MemoryStore APIs for listing and managing memory sessions
- Consolidation algorithms extract facts and patterns from episodes
- Error analysis identifies recurring errors and generates lessons
- Memory pruning removes stale working memory and low-confidence patterns
- SelfImprover generates improvement proposals during sleep cycle
- Sleep cycle now runs 4 phases (consolidation, error analysis, pruning, self-improvement)
- Sleep cycle runs automatically at 4am daily via scheduler
- Memory health checks detect stale working memory and oversized stores
- Metacognition system with response quality monitoring
- Confidence estimation for memory retrieval results
- Reflection engine analyzes patterns during sleep cycle
- CLI command 'kenobot sleep' for manual sleep cycle execution and status
- CLI command 'kenobot memory' for memory stats, health checks, and pruning
- Automatic daily log cleanup after 30 days (already consolidated)
- MEMORY.md deduplication removes near-duplicate facts during sleep cycle
- Active bootstrap orchestration with profile inference, checkpoints, and boundaries questions during first conversation
- ENABLE_SCHEDULER config to disable cron task scheduler
- TIMEZONE config for timezone-aware cron job scheduling
- Conversation scenario test framework (runner, inspector, docs)
- 19 conversation scenario tests (memory, identity, bootstrap, multi-turn, working-memory)
- Focused HTTP-layer e2e tests (auth, validation, routing)

### Changed
- Config backups now manual via git or kenobot backup command
- Restored detailed contributing guidelines for AI assistants
- Bot now conversation-only until tools are redesigned
- IdentityLoader now only supports directory mode
- Consistent naming for Cognitive System sub-systems
- Event bus replaced by Nervous System with middleware, tracing, and audit trail
- Cleaned deployment, architecture, configuration, events, and guide docs
- Simplified docs/ from 5 folders + 11 files to 7 flat files
- Identity templates now at templates/identity/ with core.md, rules.json, BOOTSTRAP.md
- Reset command always requires confirmation (removed --yes flag)

### Removed
- Self-improvement feature (security risk - auto-proposed rule changes)
- Automatic config sync (surprising behavior - auto-commits/pushes)
- n8n integration tools (niche use case - can be restored via RESTORE.md)
- n8n installation and configuration from setup scripts
- Complete tools and skills systems for future redesign
- Multi-instance workspace support
- KENOBOT_HOME environment variable (home is now always ~/.kenobot)
- skills syncing from setup command
- skills checking from doctor command
- SKILLS_DIR environment variable
- skills/ directory and obsolete migration scripts
- tool-orchestrator and all tool execution logic from AgentLoop
- obsolete environment variables from templates
- Legacy single-file identity mode (kenobot.md)
- Dead IdentityLoader import and outdated phase comments
- Outdated planning docs (IMPLEMENTATION_PLAN, PLANNING_OVERVIEW, DX_PLAN, DX_REFERENCES)
- Archived feature docs (tools, skills, n8n, self-improvement, multi-instance)
- Integration guide, n8n guide, and rollback procedure docs
- Stale CLAUDE.md.bk backup file
- References to n8n, tools, skills, approval system, and multi-instance from docs
- Legacy identity system (SOUL.md, IDENTITY.md, IDENTITY_FILE config, init-cognitive command)
- Legacy test scripts (test:smoke, test:features, test:ui, test:cognitive)
- Dead config vars and unused SSH/template checks from doctor
- Orphan purge tags from directory structure definition
- n8n integration (config, watchdog check, doctor check, templates)
- Redundant e2e smoke/memory/session tests (superseded by conversation scenarios)

### Fixed
- Test suite stabilized to 100% pass rate
- Memory saving from <memory>, <chat-memory>, and <working-memory> tags was silently failing
- Bot now saves memories from the first conversation (tag instructions always visible)
- Sleep cycle now consolidates user preferences and knowledge statements
- Sleep consolidation writes to long-term memory with deduplication
- Working memory corruption during bootstrap (recursive JSON nesting)
- ProfileInferrer provider method mismatch (complete to chat)
- Bootstrap completion not saving preferences.md
- Reset command now properly cleans working memory and MEMORY.md
- Memory consolidation now works with any language (removed English-only keyword filter)
- HTTP channel graceful shutdown now destroys active connections

## [0.4.0] - 2026-02-13

### Added

**Cognitive Architecture (Complete Implementation)**
- Cognitive architecture module with 6-phase implementation (backward compatible)
- MemoryStore persistence layer for all memory operations
- MemorySystem facade supporting 4 memory types (episodic, semantic, procedural, contextual)
- CognitiveSystem orchestrator for unified memory management
- RetrievalEngine with keyword matching and confidence scoring
- KeywordMatcher for selective memory search
- ConfidenceScorer for retrieval quality assessment
- Sleep cycle consolidation system for nightly memory processing
- Error classification and salience scoring for consolidation
- Memory health checker for system observability
- 197 new tests for cognitive system components (MemoryStore: 11, CognitiveSystem: 9, memory types: 50, consolidation: 46, identity: 43, optimization: 58)
- COGNITIVE_ARCHITECTURE_PLAN.md with complete implementation roadmap

**Identity & Bootstrap System**
- Identity management system for bot personality and behavioral rules
- Conversational bootstrap with natural conversation flow (replaces questionnaire)
- BootstrapOrchestrator for managing conversational onboarding phases
- ProfileInferrer for automatic preference detection from conversation
- Rules engine with forbidden pattern validation
- Memory structure initialization command (kenobot init-cognitive)
- CLI reset command for cognitive system (--memory, --identity, --all)
- Comprehensive identity and memory system documentation with theoretical foundations

**Developer Experience**
- Zero-config devcontainer setup with automatic kenobot init
- kenobot dev command with auto-reload and isolated ~/.kenobot/ paths
- Granular install flags (--install-claude, --install-gemini, --install-n8n)
- init-cognitive command now visible in help

**Deployment & Installation**
- One-liner VPS install script (kenobot + n8n + cloudflared)
- Dev/stable deployment channels with auto-detection in kenobot update
- Gemini API/CLI provider options in install.sh interactive menu
- Optional Claude Code CLI and Gemini CLI installation independent of provider choice
- GOOGLE_API_KEY prompt and .env writing for gemini-api provider
- gemini-api and gemini-cli health checks in kenobot doctor

**Features & Tools**
- External tools directory support via TOOLS_DIR for plugin tools
- PR tool for creating GitHub Pull Requests (/pr create|list|view|merge)
- Public welcome page at root URL showing bot status and version
- Budget protection with --max-budget-usd (configurable)
- Cost tracking with budget alerts and daily/monthly limits
- Debug mode support for claude-cli provider
- Message batching utility with adaptive debouncing
- Transparency manager for learning feedback and explanations

**Documentation**
- Self-improvement documentation guide
- AGENTS.md workspace template for session consistency
- Extensibility guide documenting when and how to create tools vs skills

**Telegram**
- Telegram groups now respond to all messages from authorized users without requiring mentions

### Changed

**Memory & Identity**
- ContextBuilder supports both CognitiveSystem and legacy FileMemory (backward compatible)
- app.js uses CognitiveSystem by default with legacy fallback
- Simplified codebase by removing legacy memory system (FileMemory and CompactingMemory)
- Memory system now uses dedicated classes for each memory type
- Working memory now detects stale sessions (>7 days)
- CognitiveSystem supports selective retrieval (useRetrieval config)
- Identity verification happens before memory loading
- Streamline memory/user instructions in system prompt (compact table format)

**Bootstrap & Onboarding**
- Bootstrap process now uses natural conversation instead of questionnaire
- IdentityManager now supports conversational bootstrap with LLM inference
- BOOTSTRAP.md with improved conversational onboarding flow
- BOOTSTRAP.md now asks detailed style preferences (length, formality, personality, filler)
- USER.md template with boundary checklist
- SOUL.md Response Style is now minimal defaults, defers to USER.md preferences

**CLI & Configuration**
- Renamed kenobot init to kenobot setup
- install.sh and .devcontainer/setup.sh now use kenobot setup command
- All documentation updated to reference kenobot setup command
- Simplified CONTRIBUTING.md with clear development workflow

**Deployment**
- Switch VPS installer from npm to git clone with tag-based versioning
- README and deployment docs updated with one-liner quick start

**Providers**
- claude-cli provider now uses --system-prompt flag

**Documentation**
- AGENTS.md to document cognitive system and backward compatibility

### Removed
- Unused CLI commands (purge, migrate, backup, audit, install-service, setup-tunnel)
- FileMemory and CompactingMemory classes (use CognitiveSystem)
- useCognitive configuration option (always enabled)
- --install-deps flag (replaced by --install-claude)

### Fixed

**Cognitive System**
- Bootstrap completion now properly deletes BOOTSTRAP.md via cognitive system
- Bootstrap post-processor now properly deletes BOOTSTRAP.md after completion
- User preferences post-processor now uses cognitive system
- ContextBuilder now handles null cognitive system gracefully
- Bootstrap now skips memory loading to avoid contamination
- ContextBuilder now properly skips memory during bootstrap
- Bootstrap process now correctly detects first-run state from disk
- Bootstrap state now syncs with disk on every message
- Bootstrap now starts with clean conversation (no history)
- Identity reset now clears session history for clean bootstrap
- Incorrect test assertions in context.test.js

**Deployment & Installation**
- CLI providers (claude-cli, gemini-cli) failing with ENOENT on VPS daemon mode
- Claude Code CLI installation PATH in devcontainer

**Telegram**
- Telegram bot startup now fails gracefully with clear error messages for invalid tokens
- Resolved "deleteWebhook failed (404)" error during bot initialization
- Telegram bot startup errors (webhook 404, token validation)

**Development**
- /dev now lists symlinked project directories correctly

## [0.3.0] - 2026-02-09

### Added
- Root user detection in kenobot setup (hard fail) and kenobot doctor (warning)
- n8n reachability check in kenobot doctor when N8N_API_URL or N8N_WEBHOOK_BASE configured
- Quick-start guides in docs/guides/ for VPS setup, n8n integration, and cloudflared tunnels
- TELEGRAM_ALLOWED_USERS env var for user-based authorization
- Group mention filter — bot only responds to @mentions and replies in groups
- Per-chat memory via <chat-memory> tag for chat-specific facts
- Chat-scoped daily logs in data/memory/chats/{sessionId}/
- Chat MEMORY.md support for long-term per-chat knowledge
- Provider-side tool definition adaptation via adaptToolDefinitions()
- BaseMemory interface class for memory subsystem consistency
- Central bus event constants in src/events.js
- createApp() factory in src/app.js for programmatic boot
- Provider interface validation warns on missing methods at startup
- supportsTools getter for providers (claude-api and mock return true)
- Per-user rate limiting in BaseChannel (configurable maxPerMinute/maxPerHour)
- E2E test harness and 9 smoke tests for full pipeline verification
- Memory compaction merges old daily logs (>30 days) into MEMORY.md at startup
- MEMORY_RETENTION_DAYS config variable (default 30, range 1-365)
- Working memory (<working-memory> tag) for per-session context
- Working memory test coverage (34 new tests)
- Scriptable MockProvider with setNextResponse() and lastCall for E2E tests
- E2E feature verification tests for memory, chat-memory, user prefs, bootstrap, skills, sessions, health
- Deep E2E tests for memory, identity, skills, sessions, tools, health
- npm run test:e2e, test:smoke, test:features scripts
- Gemini CLI provider (PROVIDER=gemini-cli) for using Google Gemini models
- Gemini API provider (PROVIDER=gemini-api) with native tool use support

### Changed
- TELEGRAM_ALLOWED_CHAT_IDS now authorizes by chat ID (was user ID)
- Config module now exports createConfig() factory and validateConfig() for testability
- Providers now use a registry pattern with self-registration
- Notifications are now channel-agnostic via dedicated bus event
- MessageBus class now available as named export from bus.js
- ContextBuilder now uses pluggable prompt sections from tools, skills, and memory
- Agent response post-processing extracted into pluggable pipeline
- index.js slimmed to thin entry point with side effects only
- Extracted tool execution loop into ToolOrchestrator for better separation of concerns
- Typing indicator extracted to reusable middleware with guaranteed cleanup
- Logger is now per-instance, each createApp() gets its own Logger for multi-instance isolation
- Memory system now uses expanded BaseMemory interface with per-chat and compaction-support methods
- ContextBuilder owns memory prompt formatting via _buildMemorySection
- Updated documentation to reflect memory compaction feature
- Memory docs updated to cover working memory tier
- E2E harness accepts setup callback for pre-start file creation

### Removed
- Shallow single-file feature tests replaced by structured suite

### Fixed
- Telegram channel bus listener leak on stop/start cycles
- Context builder no longer crashes when a single prompt source fails
- Post-processor pipeline continues when individual processors fail
- HTTP_PORT=0 now accepted for ephemeral port binding in tests

### Security
- Dual-layer auth supports both private and group chat scenarios
- Block SSRF attacks in web_fetch tool (private IPs, cloud metadata, redirect validation)
- Prevent symlink escape in dev tool project resolution
- Validate sessionId format in filesystem storage to prevent path traversal
- Validate skill manifest schema to prevent resource abuse (ReDoS, memory)
- Add task limit to scheduler to prevent resource exhaustion

## [0.2.0] - 2026-02-08

### Added
- `release` commit type and changelog category for version boundaries
- Security audit script (bin/audit) for scanning secrets and PII
- Telegram bot token pattern detection in pre-commit hook
- IDENTITY.md for development agent role and working style
- Limits & constraints reference, cost estimates, and daily log maintenance docs
- Configurable session history limit via SESSION_HISTORY_LIMIT env var
- Provider retry with exponential backoff on transient HTTP errors
- Memory size warning when MEMORY.md exceeds 10KB
- Unified `kenobot` CLI with subcommand routing (version, help)
- Path resolution module for ~/.kenobot/ user directory
- `kenobot setup` command to scaffold ~/.kenobot/ user directory
- `kenobot migrate` command to copy files from old-style layout
- Templates directory for init scaffolding
- `kenobot start [-d]` command with foreground and daemon modes
- `kenobot stop` command with graceful shutdown
- `kenobot restart` command
- `kenobot status` command showing PID, uptime, and paths
- `kenobot logs` command with tail and date filtering
- `kenobot backup` command with rotation (30 max)
- `kenobot config [edit]` command with secret redaction
- `kenobot update [--check]` command with tag-based releases and rollback
- `kenobot audit` command wrapping existing security audit script
- `kenobot install-service` command for systemd user service setup
- npm-based distribution (npm install -g github:rodacato/kenobot)
- Unit tests for config-cmd and install-service
- Circuit breaker provider decorator for cascading failure protection
- Watchdog health monitor with pluggable checks and bus events
- Diagnostics tool for system health reporting
- Safe-path utility for sandboxed file operations
- workspace tool for sandboxed file operations (read/write/list/delete)
- github tool for git operations (status/commit/push/pull/log)
- workspace initialization with directory structure at startup
- path traversal protection via shared safePath utility
- WORKSPACE_DIR, GITHUB_TOKEN, GITHUB_REPO config vars
- approval tool with propose/approve/reject/review/pending actions
- n8n_manage tool for workflow CRUD via n8n REST API
- self-improvement skill with instructions for creating skills and workflows
- skill hot-reload (loadOne) for activating skills after approval
- approval bus events with Telegram owner notifications
- SELF_IMPROVEMENT_ENABLED, N8N_API_URL, N8N_API_KEY config vars
- gmail skill with inbox, send, read, and search capabilities via n8n workflows
- SSH keypair generation (ed25519) during kenobot setup
- GIT_SSH_COMMAND integration in github tool and workspace sync
- n8n watchdog health check when N8N_API_URL configured
- kenobot setup-tunnel CLI command for cloudflared config generation
- workspace, n8n, and self-improvement sections to deployment docs
- comprehensive step-by-step integrations guide (docs/integrations-guide.md)
- complete environment variables reference with all phases
- Modular identity system with SOUL.md, IDENTITY.md, USER.md
- Bot-writable user preferences via <user> tags (no approval needed)
- Soul proposal type in approval system with hot-reload
- CONFIG_REPO env var for automatic config backup to a private git repo
- Integration tests for ContextBuilder and AgentLoop with real collaborators
- First-conversation bootstrap onboarding via BOOTSTRAP.md
- Identity system feature guide (docs/features/identity.md)
- kenobot purge command with three reset levels (base, --memory, --all)
- kenobot doctor command for diagnosing installation problems
- shared CLI utils (exists, dirSize, formatBytes, colors)
- Diagnostic logging for identity loading (bootstrap_pending, empty_identity)
- /dev tool for running development tasks in workspace projects
- Dynamic CWD support in claude-cli provider (defaults to $HOME)
- HEARTBEAT.md template for dev session continuity

### Changed
- Release script uses commit-based boundaries instead of tags
- Getting started guide translated to English
- AGENTS.md slimmed down with references to docs/ instead of duplicated content
- config.js respects KENOBOT_CONFIG env var for .env path
- health.js respects KENOBOT_PID_FILE env var for PID location
- install-service uses dynamic path resolution instead of hardcoded path
- init output uses colored [✓]/[–] formatting
- All documentation updated for npm install flow
- templates/env.example with all new env vars from phases 1-4
- deployment.md links to integrations guide instead of inline sections
- Config now validates numeric env vars at startup with bounds checking
- Notification routing extracted from index.js to notifications.js
- Channel send errors now handled consistently via BaseChannel._safeSend()
- Tool result message format is now provider-overridable via buildToolResultMessages()
- ApprovalTool uses callbacks instead of direct bus/skillLoader coupling
- Watchdog health checks now run in parallel for faster completion
- Tool registration uses auto-discovery via ToolLoader instead of manual wiring in index.js
- Tools and skills documentation updated with architecture, all built-in tools, lifecycle hooks, and self-improvement flow
- Test suite uses real filesystem I/O instead of mocks for memory and storage tests
- Testing guidelines in AGENTS.md now document when to use real implementations vs mocks
- Default identity path from identities/kenobot.md to identities/kenobot (directory mode)
- Documentation updated for directory-mode identity default
- init now restores missing template files without overwriting existing ones
- init, doctor, and purge share a single directory structure definition
- BOOTSTRAP.md adapts to user language and asks one question at a time
- Documentation updated for all v0.2.0 features

### Removed
- Duplicate GETTING_STARTED.md from root (use docs/getting-started.md)
- install.sh and uninstall.sh (replaced by npm)
- Legacy single-file identity template (kenobot.md)

### Fixed
- Personal identifiers (chat ID, username) replaced with generic examples in docs
- MODEL value inconsistency and Gemini status in documentation
- HTTP status code preserved in claude-api error wrapping
- config edit shows helpful error when editor is not found
- Logger no longer silently swallows directory creation errors
- N8nManageTool config mapping (apiUrl was undefined)
- Bootstrap onboarding not triggering on first conversation

### Security
- PID file default moved from world-writable /tmp to ~/.kenobot/data/

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
