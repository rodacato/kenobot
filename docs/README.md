# Documentation

KenoBot documentation is organized in **two tracks** to serve different audiences:

## Quickstart (For Beginners)

**Start here if you're new to KenoBot or want step-by-step guides.**

| Document | Description |
|----------|-------------|
| [Getting Started](quickstart/getting-started.md) | First-time setup and basic usage |
| [Deployment Guide](deployment.md) | VPS setup, systemd, auto-recovery, backups |

**Tutorials & How-Tos:**
- [VPS Setup](guides/vps-setup.md) - Deploy to a production server
- [Cloudflared Tunnel](guides/cloudflared.md) - Expose your bot securely

## Reference (For Experienced Developers)

**Technical documentation for understanding internals and extending the system.**

| Document | Description |
|----------|-------------|
| [Architecture](reference/architecture.md) | System components, message flow, design patterns |
| [Configuration](reference/configuration.md) | Complete environment variable reference |
| [Events](reference/events.md) | Signal schema and contracts |

**Feature Documentation:**
- [Nervous System](features/nervous-system/) - Signal-aware event bus with middleware, tracing, and audit trail
- [Cognitive System](features/cognitive-system/) - Memory, identity, retrieval, and consolidation
  - [Memory System](features/cognitive-system/memory.md) - Four-tier memory architecture (working, episodic, semantic, procedural)
  - [Identity System](features/cognitive-system/identity.md) - Modular identity files, bootstrap onboarding, user preferences

## Design & Research

**Design rationale, research notes, and expert consultations behind KenoBot's architecture.**

| Document | Description |
|----------|-------------|
| [Design Guide](design/README.md) | Conventions, research diary, and how to add new research |
| [Expert Catalog](design/experts.md) | All expert personas used across research sessions |

Research topics: [Cognitive Architecture](design/cognitive-architecture.md), [Nervous System](design/nervous-system.md), [Metacognition](design/metacognition.md), [Body Systems](design/body-systems.md), [Implementation Plan](design/implementation-plan.md), [Developer Experience](design/developer-experience.md), [Documentation](design/documentation.md)

## Security & Contributing

- [Security Policy](../SECURITY.md) - Vulnerability reporting and security practices
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute to KenoBot
