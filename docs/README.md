# Documentation

KenoBot documentation is organized in **two tracks** to serve different audiences:

## 🚀 Quickstart (For Beginners)

**Start here if you're new to KenoBot or want step-by-step guides.**

| Document | Description |
|----------|-------------|
| [Getting Started](quickstart/getting-started.md) | First-time setup and basic usage |
| [Deployment Guide](deployment.md) | VPS setup, systemd, auto-recovery, backups |
| [Integrations](integrations-guide.md) | Connect KenoBot with external services |

**Tutorials & How-Tos:**
- [VPS Setup](guides/vps-setup.md) - Deploy to a production server
- [Cloudflared Tunnel](guides/cloudflared.md) - Expose your bot securely

## 📚 Reference (For Experienced Developers)

**Technical documentation for understanding internals and extending the system.**

| Document | Description |
|----------|-------------|
| [Architecture](reference/architecture.md) | System components, message flow, design patterns |
| [Configuration](reference/configuration.md) | Complete environment variable reference |

**Feature Documentation:**
- [Identity System](features/identity.md) - Modular identity files, bootstrap onboarding, user preferences
- [Memory System](features/memory.md) - Four-tier memory architecture (working, episodic, semantic, procedural)

## 📦 Planning & Decisions

| Document | Description |
|----------|-------------|
| [Planning Overview](planning/README.md) | Implementation plan and design decisions |
| [Implementation Plan](../IMPLEMENTATION_PLAN.md) | Detailed simplification roadmap |

## 🔒 Security & Contributing

- [Security Policy](../SECURITY.md) - Vulnerability reporting and security practices
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute to KenoBot
- [Code of Conduct](../CODE_OF_CONDUCT.md) - Community guidelines

---

## Archive

Archived documentation for deprecated features can be found in [features/archive/](features/archive/).
