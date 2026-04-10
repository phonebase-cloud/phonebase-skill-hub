# phonebase-skill-hub

第三方 App 自动化 skill 官方仓库，配合 [phonebase-cli (`pb`)](https://github.com/phonebase-cloud/phonebase-cli) 使用。

一个 skill = 一个 App 适配器。装到 `~/.phonebase/skills/` 就自动变成 `pb <skill>` 顶级子命令，底层走真实云手机。

---

## 一分钟快速开始

### 前提

- 装了 `pb`：`curl -fsSL https://get.phonebase.cloud | sh`
- 登录了：`pb login` 或 `pb apikey <your_key>`
- 连了一台云手机：`pb connect <device_id>`

### 跑一个现成 skill

```bash
# 1. 克隆本仓库
git clone git@github.com:phonebase-cloud/phonebase-skill-hub.git
cd phonebase-skill-hub

# 2. 装一个 skill（手动 cp 就行，pb 会自动扫描）
cp -r skills/tiktok ~/.phonebase/skills/

# 3. 立刻能用
pb tiktok --help
pb -s <device_id> tiktok open
```

返回类似：

```json
{
  "code": 200,
  "data": {
    "top_activity": {
      "package_name": "com.zhiliaoapp.musically",
      "class_name": "com.ss.android.ugc.aweme.main.MainActivity"
    },
    "foreground": true
  },
  "msg": "OK"
}
```

> **注意 shape**：脚本 stdout 直接是业务 data，pb 自动套 `{code, data, msg}` 信封。
> 你**不会**看到 `data.status` 字段 —— 元状态归 pb 的 `code`，观测态用布尔字段。
> 详见 [`docs/SKILL_AUTHORING.md`](docs/SKILL_AUTHORING.md) 的"输出规范"。

### 写一个新 skill

```bash
# 推荐：pb 内置脚手架（自动从设备拉 display_name + 应用图标）
pb skills new instagram --package com.instagram.android

# 或者手动 cp 模板（占位符自己替换）
cp -r _template ~/.phonebase/skills/instagram
```

`pb skills new` 会自动：
1. 调 `package/list` 拿到 `com.instagram.android` 对应的 `app_name` → 写到 frontmatter `display_name`
2. 调 `pb icon com.instagram.android` 抽 launcher 图标 → 存到 `resources/ic_launcher.webp`
3. 渲染 5 个模板文件（SKILL.md / _lib.js / open.js / state.js / close.js）

剩下的就是按需添加业务命令到 `scripts/`。

完整写作指南：[`docs/SKILL_AUTHORING.md`](docs/SKILL_AUTHORING.md)
SDK API 速查：[`docs/SDK_API.md`](docs/SDK_API.md)

---

## 已有 skill

| Skill | 显示名 | 分类 | 包名 | 命令 | 依赖 |
|---|---|---|---|---|---|
| [`skills/tiktok`](skills/tiktok/) | TikTok | `social` | `com.zhiliaoapp.musically` | `open` / `close` / `state` / `search` | — |
| [`skills/googleplay`](skills/googleplay/) | Google Play Store | `tools` | `com.android.vending` | `open` / `close` / `state` / `search` / `detail` / `install` / `uninstall` / `update` / `updates` / `my_apps` | `googleservices` |
| [`skills/gmail`](skills/gmail/) | Gmail | `email` | `com.google.android.gm` | `open` / `close` / `state` / `inbox` / `search` / `read` / `compose` | `googleservices` |
| [`skills/googleservices`](skills/googleservices/) | Google Play services | `system` | `com.google.android.gms` | `accounts` / `status` / `login` / `logout` | — |

`category` 只存稳定的英文 slug，label 的本地化由前端 / 文档站自己维护。全部合法 slug 见 [`docs/SKILL_AUTHORING.md` 的 category 章节](docs/SKILL_AUTHORING.md#category-字段)。

> **Google 系 skill 的登录**：登录 Google 账号是设备级操作（一个 `com.google` 系统账号让 Gmail / Play Store / YouTube 同时可用），所以 `googleplay` 和 `gmail` **本身不提供 login/logout** —— 全部归 `googleservices` skill 管：
> ```bash
> pb googleservices login --email a@b.com --password ...   # 一次登录
> pb gmail inbox                                            # 直接能用
> pb googleplay install --package org.telegram.messenger   # 直接能用
> ```

---

## 贡献新 skill

新 skill 的要求：

1. **真机跑通**。不接受带 mock 的 PR。
2. **frontmatter 完整**。必须有 `name` / `display_name` / `description` / `package` 四个字段；依赖其它 skill 时加 `requires:` 列表。
3. **`resources/ic_launcher.webp` 必须存在**。`pb skills new` 会自动抽取，手写也要补上。
4. **命名一致**。所有 skill 都应提供 `open` / `close` / `state` 三个基础命令，动作命令按 App 业务命名（`search` / `detail` / `post` / `follow` / ...）。
5. **输出规范**。脚本通过 `finish(data)` 直接打印业务数据 JSON，**不要套 `status` 信封**。元状态归 pb 的 `code`，观测态用 boolean / 子对象（`logged_in: true` / `installed: false`）。脚本失败用 `process.exit(1)` + stderr。
6. **`open` 是纯启动**。只 `launch + topActivity`，不带 dump / visible_texts。任何 introspection 都归 `state` 命令。
7. **不靠混淆 resource-id**。优先用 `text` / `content-desc` 匹配；必要时按几何位置定位。
8. **优先用 deeplink**。能走 `market://` / `https://` / `mailto:` / 自定义 scheme 的场景别模拟 UI 操作。

提 PR 前自检：

```bash
pb skills validate <your-skill-name>   # 静态检查 frontmatter + JSDoc + ic_launcher.webp
```

---

## 目录

```
phonebase-skill-hub/
├── _template/              # 参考实现，和 pb skills new 内嵌模板等价
│   ├── SKILL.md            # frontmatter + 占位符
│   ├── resources/
│   │   └── .gitkeep
│   └── scripts/
│       ├── _lib.js
│       ├── open.js
│       ├── state.js
│       └── close.js
├── skills/                 # 所有第三方 skill 集中存放
│   ├── tiktok/             # TikTok (com.zhiliaoapp.musically)
│   ├── googleplay/         # Google Play Store (com.android.vending)
│   └── gmail/              # Gmail (com.google.android.gm)
└── docs/
    ├── SKILL_AUTHORING.md  # 完整写作指南
    └── SDK_API.md          # @phonebase-cloud/pb SDK 速查
```

每个 skill 目录的标准结构：

```
skills/<name>/
├── SKILL.md                # frontmatter (name / display_name / description / package / requires?)
├── resources/
│   └── ic_launcher.webp    # 应用 launcher 图标，pb skills new 自动抽取
└── scripts/
    ├── _lib.js             # 共享工具 (PACKAGE 常量 + 解析函数 + finish/fail)
    ├── open.js             # 纯启动
    ├── state.js            # introspection
    ├── close.js            # 强制停止
    └── ...                 # 业务命令
```

---

## 相关项目

- [phonebase-cli](https://github.com/phonebase-cloud/phonebase-cli) — CLI 本体（`pb skills new` / `pb icon` / `pb skills install` 等）
- [@phonebase-cloud/pb](https://www.npmjs.com/package/@phonebase-cloud/pb) — Node.js SDK

## 许可

MIT
