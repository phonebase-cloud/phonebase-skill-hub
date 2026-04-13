<div align="center">
  <h1>PhoneBase Skill Hub</h1>
  <p><a href="https://github.com/phonebase-cloud/phonebase-cli">pb CLI</a> 的应用自动化 skill 仓库</p>
  <p>
    <a href="https://github.com/phonebase-cloud/phonebase-cli"><img src="https://img.shields.io/badge/pb%20CLI-1.0.4+-2F81F7.svg" alt="pb CLI 1.0.4+" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
  </p>
  <p><a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a></p>
</div>

## 概述

每个 skill 把一个手机应用变成一组 `pb` 子命令。安装后就能用，比如 `pb googleplay search "telegram"` 或 `pb gmail compose` — 背后是真实的 Android 云手机。

## 快速开始

```bash
# 前提：已安装 pb + 已登录 + 已连接设备
curl -fsSL https://get.phonebase.cloud | sh
pb login
pb connect <device-id>

# 按名字安装 skill（自动解析依赖）
pb skills install googleplay

# 使用
pb googleplay search "telegram"
pb googleplay install --package org.telegram.messenger
```

## 已有 skill

| Skill | 应用 | 命令 | 依赖 |
|---|---|---|---|
| [googleplay](skills/googleplay/) | Google Play Store | `open` `close` `search` `detail` `install` `uninstall` `update` `updates` `my-apps` | googleservices |
| [gmail](skills/gmail/) | Gmail | `open` `close` `inbox` `search` `read` `compose` | googleservices |
| [tiktok](skills/tiktok/) | TikTok | `open` `close` `search` | — |
| [googleservices](skills/googleservices/) | Google Play services | `accounts` `login` `logout` | — |

> **Google 账号登录**是设备级操作，所有 Google 系应用共享。用 `pb googleservices login` 登录一次，Gmail 和 Play Store 就直接能用。

## 安装 skill

```bash
# 从本仓库安装（推荐）
pb skills install googleplay

# 从本地目录安装
pb skills install /path/to/my-skill

# 从 URL 安装
pb skills install https://example.com/skill.tar.gz
```

`requires:` 中声明的依赖会自动安装。

## 创建自己的 skill

```bash
# 交互式脚手架（自动提取应用图标和元信息）
pb skills new instagram --package com.instagram.android

# 或者手动创建
mkdir -p ~/.phonebase/skills/myskill/scripts
```

完整写作指南：[docs/SKILL_AUTHORING.md](docs/SKILL_AUTHORING.md)
SDK API 速查：[docs/SDK_API.md](docs/SDK_API.md)

## 贡献

1. 必须在真机上跑通
2. frontmatter 必须包含 `name`、`display_name`、`description`、`package`
3. 必须包含应用图标 `resources/ic_launcher.webp`
4. 至少提供 `open` 和 `close` 命令
5. 依赖其他 skill 时在 `requires:` 中声明

## 相关项目

- [phonebase-cli](https://github.com/phonebase-cloud/phonebase-cli) — pb CLI 工具
- [phonebase-skill-template](https://github.com/phonebase-cloud/phonebase-skill-template) — 脚手架模板
- [phonebase-skills](https://github.com/phonebase-cloud/phonebase-skills) — 全局 AI agent skill

## 许可

MIT
