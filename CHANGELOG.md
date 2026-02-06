# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [CalVer](https://calver.org/) versioning: `YYYY.MM.patch`.

## [Unreleased]

### Added
- Memory system: MemoryManager with daily markdown logs and curated MEMORY.md
- Memory extractor: auto-extracts `<memory>` tags from assistant responses
- Memory injection into system prompt via ContextBuilder
- Agent loop with per-chat session routing
- Context builder with identity injection and session history (last 20 messages)
- Filesystem storage with append-only JSONL sessions (`data/sessions/`)
- Markdown-to-HTML formatter for Telegram with 4000 char chunking
- Structured JSONL logger with daily rotation and condensed console output
- Thinking indicator via bus events
- Claude API provider (Anthropic SDK direct integration)
- Claude CLI provider with spawn fix for stdin hanging
- Mock provider for deterministic testing
- Telegram channel with deny-by-default authentication
- Event-driven message bus (EventEmitter singleton)
- Core interfaces: BaseProvider, BaseChannel, BaseStorage
- Vitest test suite with 54% coverage (11 test files)
- Multi-instance support via `--config` flag
- Research documents analyzing OpenClaw, Claudio, and Nanobot architectures
- Full implementation plan with 7-phase roadmap (`docs/PLAN.md`)
- Project infrastructure: .editorconfig, git hooks, .env.example
- Contributing guidelines with conventional commits and CalVer versioning
- Getting started guide with step-by-step Telegram setup

### Fixed
- Claude CLI hanging when stdin is a pipe (use spawn with `stdio: ['ignore', 'pipe', 'pipe']`)
