---
name: gmail
display_name: Gmail
description: Gmail 自动化 — 启动、收件箱、写邮件、搜索、阅读
package: com.google.android.gm
category: email
version: 3
requires:
  - googleservices
---

# Gmail Skill

驱动真实云手机上的 Gmail (`com.google.android.gm`)。

## 命令

### 基础三件套

- `pb gmail open` — 启动 Gmail（纯启动）
- `pb gmail state` — 查询当前页面状态（dump + 解析 + 登录账号）
- `pb gmail close` — 强制停止 Gmail

### 邮件操作

- `pb gmail inbox [--limit <n>]` — 列出收件箱可见邮件（默认最多 20 条）
- `pb gmail search --keyword <word>` — 搜索邮件（UI 操作：点搜索框 → 清空 → 输入 → Enter）
- `pb gmail read [--index <i>] [--subject <word>]` — 打开第 i 封 / 主题匹配的第一封
- `pb gmail compose --to <email> [--subject <s>] [--body <b>] [--send]` — 写邮件（走 mailto deeplink）

## 登录在哪里？

Gmail 共享设备级 `com.google` 系统账号，**不提供 login/logout** —— 全部归 `googleservices` skill 管：

```bash
pb googleservices login --email a@b.com --password ...   # 一次登录
pb gmail inbox                                            # 直接能用
```

`requires: [googleservices]` 在 frontmatter 里声明了依赖。

## 为什么 compose 用 deeplink

Gmail 完美实现了 `android.intent.action.SENDTO` + `mailto:` URI。`mailto:x@y?subject=...&body=...` 会直接跳到 Gmail 的 `ComposeActivityGmailExternal`，并把 `to` / `subject` / `body` 三个字段全部预填。这比在 UI 上模拟"点 Compose → 点 To → 输入 → 点 Subject → 输入 → 点 Body → 输入"稳定得多，也不依赖具体版本。

## 登录状态检测

Gmail 首页右上角的 `selected_account_disc_gmail` 头像按钮的 `content-desc` 一般是：

```
Signed in as Biu Boom biuboomxx@gmail.com
Account and settings.
```

脚本从里面抽邮箱。

## 输出规范

每个命令的 stdout 是**业务数据本身**，pb 自动包成 `{code, data, msg}` 信封。**不要**在数据里加 `status` 字段。详见仓库的 `docs/SKILL_AUTHORING.md`。

样例：

```json
// pb gmail state  (已登录)
{"code":200,"data":{"top_activity":{...},"foreground":true,"logged_in":true,"account":"biuboomxx@gmail.com"},"msg":"OK"}

// pb gmail inbox --limit 5
{"code":200,"data":{"logged_in":true,"account":"...","items":[{"index":0,"sender":"...","subject":"...","snippet":"...","date":"...","unread":true}],"count":5},"msg":"OK"}

// pb gmail compose --to test@x.com --subject hi --body world --send
{"code":200,"data":{"to":"test@x.com","subject":"hi","body":"world","sent":true},"msg":"OK"}
```
