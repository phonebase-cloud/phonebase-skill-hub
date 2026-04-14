---
name: googleplay
display_name: Google Play Store
description: Google Play Store 自动化 — 启动、搜索、详情、安装/卸载/更新、应用管理
package: com.android.vending
category: tools
requires:
  - googleservices
---

# Google Play Store Skill

驱动真实云手机上的 Google Play Store（`com.android.vending`）。

## 命令

### 基础三件套（通用生命周期）

- `pb googleplay open` — 启动 Play Store
- `pb googleplay close` — 强制停止
- `pb googleplay clear` — 清数据

### 发现 / 导航

- `pb googleplay search --keyword <word>` — 搜索 App（`market://search` deeplink）
- `pb googleplay detail --package <pkg>` — 打开 App 详情页（`market://details` deeplink）
- `pb googleplay my-apps` — 打开「管理应用和设备」主页
- `pb googleplay updates` — 进更新页并启发式抽出待更新 App 名

### 安装 / 卸载 / 更新

- `pb googleplay install --package <pkg> [--wait <sec>]` — 走 Play Store UI 安装
- `pb googleplay uninstall --package <pkg> [--wait <sec>]` — 走 Play Store UI 卸载
- `pb googleplay update --package <pkg> [--wait <sec>]` — 仅当详情页有 Update 按钮时更新

## 登录在哪里？

Google Play 自己**没有**独立的账号系统，它共享设备级的 `com.google` 系统账号。
所以**这个 skill 不提供 login/logout/accounts** —— 全部归 `googleservices` skill 管：

```bash
pb googleservices login --email a@b.com --password ...   # 一次登录所有 google 系 app 都受益
pb googleplay install --package org.telegram.messenger    # 直接能用
```

`requires: [googleservices]` 在 frontmatter 里声明了这个依赖关系。

## 为什么大量用 deeplink

Google Play 的 UI 混淆严重、版本差异大，直接模拟点击搜索框/输入框容易失败。更稳的做法是走系统 Intent：

- 搜索：`market://search?q=<keyword>&c=apps`
- 详情：`market://details?id=<package_name>`
- 我的应用：`https://play.google.com/store/myapps`（intent 被 Play Store 劫持）

这些都是 Google Play 官方 API 级别的 deeplink，兼容所有版本。`install` / `uninstall` / `update` 走到详情页后再点按钮，按钮用文案匹配（`Install` / `Uninstall` / `Update` / `Open` / `Play`），不依赖混淆的 resource-id。

## 输出规范

每个命令的 stdout 是**业务数据本身**，pb 自动包成 `{code, data, msg}` 信封。**不要**在数据里加 `status` 字段。

样例：

```json
// pb googleplay install --package com.whatsapp  (没账号)
{"code":200,"data":{"package":"com.whatsapp","installed":false,"logged_in":false},"msg":"OK"}

// pb googleplay install --package com.whatsapp  (已登录，安装成功)
{"code":200,"data":{"package":"com.whatsapp","installed":true,"action_buttons":["Open"]},"msg":"OK"}

// pb googleplay update --package org.telegram.messenger  (没有可用更新)
{"code":200,"data":{"package":"org.telegram.messenger","up_to_date":true,"action_buttons":["Open"]},"msg":"OK"}
```
