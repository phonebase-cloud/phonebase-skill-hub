<div align="center">
  <h1>PhoneBase Skill Hub</h1>
  <p>App automation skills for <a href="https://github.com/phonebase-cloud/phonebase-cli">pb CLI</a></p>
  <p>
    <a href="https://github.com/phonebase-cloud/phonebase-cli"><img src="https://img.shields.io/badge/pb%20CLI-1.0.4+-2F81F7.svg" alt="pb CLI 1.0.4+" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
  </p>
  <p><a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a></p>
</div>

## Overview

Each skill in this repo turns a mobile app into a set of `pb` subcommands. Install a skill and you get purpose-built commands like `pb googleplay search "telegram"` or `pb gmail compose` — all backed by a real Android cloud phone.

## Quick Start

```bash
# Prerequisites: pb installed + logged in + device connected
curl -fsSL https://get.phonebase.cloud | sh
pb login
pb connect <device-id>

# Install a skill by name (auto-resolves dependencies)
pb skills install googleplay

# Use it
pb googleplay search "telegram"
pb googleplay install --package org.telegram.messenger
```

## Available Skills

| Skill | App | Commands | Depends on |
|---|---|---|---|
| [googleplay](skills/googleplay/) | Google Play Store | `open` `close` `search` `detail` `install` `uninstall` `update` `updates` `my-apps` | googleservices |
| [gmail](skills/gmail/) | Gmail | `open` `close` `inbox` `search` `read` `compose` | googleservices |
| [tiktok](skills/tiktok/) | TikTok | `open` `close` `search` | — |
| [googleservices](skills/googleservices/) | Google Play services | `accounts` `login` `logout` | — |

> **Google account login** is a device-level operation shared across all Google apps. Use `pb googleservices login` once, then Gmail and Play Store just work.

## Install a skill

```bash
# From this hub (recommended)
pb skills install googleplay

# From a local directory
pb skills install /path/to/my-skill

# From a URL
pb skills install https://example.com/skill.tar.gz
```

Dependencies listed in `requires:` are installed automatically.

## Create your own skill

```bash
# Interactive scaffolding (auto-extracts app icon and metadata)
pb skills new instagram --package com.instagram.android

# Or start from scratch
mkdir -p ~/.phonebase/skills/myskill/scripts
```

See [docs/SKILL_AUTHORING.md](docs/SKILL_AUTHORING.md) for the full authoring guide, and [docs/SDK_API.md](docs/SDK_API.md) for the SDK reference.

## Contributing

1. Test on a real device — no mocks
2. Include all required frontmatter fields: `name`, `display_name`, `description`, `package`
3. Include the app icon at `resources/ic_launcher.webp`
4. Provide at least `open` and `close` commands
5. List dependencies in `requires:` if your skill depends on others

## Related

- [phonebase-cli](https://github.com/phonebase-cloud/phonebase-cli) — The `pb` CLI tool
- [phonebase-skill-template](https://github.com/phonebase-cloud/phonebase-skill-template) — Scaffolding templates
- [phonebase-skills](https://github.com/phonebase-cloud/phonebase-skills) — Global AI agent skill

## License

MIT
