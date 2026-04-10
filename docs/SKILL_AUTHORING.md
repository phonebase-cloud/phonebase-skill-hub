# 写 pb skill 完整指南

这份文档面向两类读者：**AI agent**（Claude Code / Cursor / ChatGPT）和**人类开发者**。
目标：读完能立刻写出一个跑通真机的 skill。

---

## 目录

1. [Skill 是什么](#skill-是什么)
2. [一分钟脚手架（pb skills new）](#一分钟脚手架-pb-skills-new)
3. [目录结构](#目录结构)
4. [SKILL.md frontmatter](#skillmd-frontmatter)
5. [脚本头部 JSDoc 注释协议](#脚本头部-jsdoc-注释协议)
6. [输出规范](#输出规范) ★
7. [SDK API](#sdk-api)
8. [环境变量](#环境变量)
9. [常见模式](#常见模式)
10. [反模式](#反模式) ★
11. [真机测试](#真机测试)
12. [发布到 skill-hub](#发布到-skill-hub)
13. [常见坑](#常见坑)

---

## Skill 是什么

Skill 是一个 App 特化的自动化包。装到 `~/.phonebase/skills/` 就自动变成 `pb <skill-name>` 顶级子命令。

架构：

```
pb tiktok search --keyword iPhone
  │
  ▼ clap 动态子命令注入（tiktok 是 skill，不是硬编码命令）
  │
  ▼ SkillScriptCapability::execute → spawn node scripts/search.js
  │
  ▼ 脚本里 const pb = require('@phonebase-cloud/pb')
  │  SDK 通过 PHONEBASE_BIN + PHONEBASE_DEVICE_ID env 调 pb 子进程
  │
  ▼ pb → daemon → 真云手机
  │
  ▼ 脚本 stdout 一行 JSON → pb 输出层包成 {code, data, msg} → 用户
```

关键设计：
- **一个 skill = 一个目录**：`~/.phonebase/skills/<name>/`
- **一个命令 = 一个脚本文件**：`scripts/<command>.js`
- **静态注册**：scanner 扫目录解析 SKILL.md + JSDoc，缓存到 `~/.phonebase/skills/_manifest.json`
- **动态派发**：clap 把每个 skill 注入成子命令，匹配时 spawn node 子进程
- **输出层包装**：脚本只输出业务 data，pb 自动套 `{code, data, msg}` 信封

---

## 一分钟脚手架（pb skills new）

**强制要求**：必须先 `pb connect <device-id>` 连一台设备，否则脚手架无法完成（应用图标和显示名都从设备读）。

```bash
# 全自动（一行搞定）
pb skills new instagram --package com.instagram.android

# 半交互（少了哪个问哪个）
pb skills new instagram
# → ? 选择目标 App  ←  从 pb packages 拉的列表里挑
# → ? 一句话描述 ›  Instagram 自动化

# 全参数（CI 友好）
pb skills new instagram \
  --package com.instagram.android \
  --description "Instagram 自动化" \
  --requires googleservices
```

`pb skills new` 自动做的事：
1. 调 `pb -j '{...}' package/list` 拿到目标包的 `app_name` → 写到 frontmatter `display_name`
2. 调 `pb icon <package>` 抽 launcher 图标 → 解码 base64 WebP → 写到 `resources/ic_launcher.webp`
3. 把内嵌模板（5 个文件）渲染到 `~/.phonebase/skills/<name>/`，占位符全部替换
4. 写入 `~/.phonebase/skills.json` 注册表

生成的 skill 立即可用：

```bash
pb instagram open
pb instagram state
pb instagram close
```

剩下要做的就是按 [JSDoc 注释协议](#脚本头部-jsdoc-注释协议) 添加业务命令脚本。

---

## 目录结构

```
~/.phonebase/skills/<name>/
├── SKILL.md                    ← 必须，frontmatter
├── resources/                  ← 必须
│   └── ic_launcher.webp        ← 必须，应用图标（pb skills new 自动抽取）
└── scripts/                    ← 必须，每个 .js 文件 = 一个命令
    ├── _lib.js                 ← `_` 开头会被 scanner 跳过，可放共享工具
    ├── open.js                 ← 文件名 `open` 就是命令名（除非 JSDoc @command 覆盖）
    ├── close.js
    ├── state.js
    └── search.js               ← 业务命令按需添加
```

约定：
- **scripts/ 下 `_` / `.` 开头的文件跳过**：用来放共享模块，不会被注册为命令
- **skill 目录本身 `_` / `.` 开头跳过**：`_template/` 这种目录不会被当成 skill
- **resources/ 必须存在**：至少要有 `ic_launcher.webp`，文档工程会用它渲染列表

---

## SKILL.md frontmatter

```markdown
---
name: instagram                                 # 必填，目录名 + pb 子命令名
display_name: Instagram                         # 必填，应用显示名（pb skills new 自动从设备拉）
description: Instagram 自动化 — 启动、搜索、关闭   # 必填，一句话描述，不要写包名
package: com.instagram.android                  # 必填，目标 Android 包名
category: social                                # 必填，应用分类 slug，见 categories.yml
requires:                                       # 可选，依赖的其它 skill（声明性，pb skills install 会校验）
  - googleservices
---

# 这下面随便写 markdown，给人读用
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✓ | skill 标识，必须和目录名一致；只能 `[a-z0-9_-]` |
| `display_name` | ✓ | 应用显示名，文档工程渲染卡片用 |
| `description` | ✓ | 一句话描述，`pb <skill> --help` 会显示。**不要**在里面写包名——`package` 字段已经有了 |
| `package` | ✓ | Android 包名 |
| `category` | ✓ | 应用分类 slug；合法值见下方「category 字段」章节 |
| `requires` | ✗ | 依赖的其它 skill 名列表 |

### category 字段

category 用稳定的英文 slug，**只存 key**，label 的本地化映射由文档站 / 前端 / pb UI 自己维护（skill 层只关心稳定标识）。

合法 slug 列表（字母序，白名单定义在 `phonebase-cli/src/skills.rs` 的 `CATEGORY_SLUGS` 常量）。

**单一真源在 [`phonebase-docs/data/categories.json`](../../phonebase-docs/data/categories.json)**，含 zh/en label、apps/games 两层分组。新增 slug 必须三处同步：
1. `phonebase-docs/data/categories.json` （加 label + group）
2. `phonebase-cli/crates/phonebase-cli/src/skills.rs` `CATEGORY_SLUGS`
3. 本文件下方的 slug 列表

基线对齐 Google Play / APKMirror / APKPure 的标准分类，并补了云手机场景特有的 `auth / voip / network_tools / system / local_life / crypto / ai / streaming / content_tools / marketplace` 这些 Play Store 没有但运营常用的桶。游戏子类对齐 Play Store 的 17 个 `game_*`，`games` 留作兜底。

```
# 通用应用类（45）
ai               art_design       auth
auto_vehicles    beauty           books
browser          business         comics
content_tools    crypto           dating
education        email            entertainment
events           fintech          fitness
food             games            health
house_home       lifestyle        local_life
marketplace      medical          messaging
music            navigation       network_tools
news             other            parenting
personalization  photography      productivity
shopping         social           sports
streaming        system           tools
travel           video            voip
weather

# 游戏子类（17，parent = games）
game_action      game_adventure   game_arcade
game_board       game_card        game_casino
game_casual      game_educational game_music
game_puzzle      game_racing      game_role_playing
game_simulation  game_sports      game_strategy
game_trivia      game_word
```

选 slug 的时候对照下"应用主营业务"：

**社媒 / 通讯 / 账号配套**
- 社媒矩阵号 → `social`（TikTok / Instagram / Facebook / X / Snapchat）
- 私域聊天 / IM → `messaging`（WhatsApp / Telegram / LINE / Discord / Signal）
- 邮箱 → `email`（Gmail / Outlook / ProtonMail）
- 二步验证 → `auth`（Google Authenticator / Authy）
- 浏览器 → `browser`（Chrome / Firefox / Brave）
- 网络电话 / 第二号码（语音 + SMS via VoIP） → `voip`（TextNow / Hushed / Google Voice / Skype）
- 网络工具（隧道 / 代理 / 测速 / 流量统计） → `network_tools`

**电商 / 金融**
- B2C 购物 → `shopping`（Amazon / Temu / Shein / AliExpress / Walmart / Etsy）
- C2C 二手 / 拍卖 → `marketplace`（Mercari / Vinted / Depop / Poshmark / StockX / Whatnot）
- 卖家工具 / 协作 SaaS → `business`（Amazon Seller / Shopee Seller / Slack / Notion / Zoom / Teams）
- 银行 / 支付 / 数字银行 → `fintech`（PayPal / Revolut / Wise / Cash App）
- 加密货币 / Web3 钱包 → `crypto`（Binance / MetaMask / Trust Wallet / Coinbase）

**内容 / 媒体**
- AI 助手 / 大模型 App → `ai`（ChatGPT / Claude / Gemini / Perplexity）
- 内容创作工具 → `content_tools`（剪辑 / 多账号管理 / 一键发布类）
- 流媒体订阅（音乐/视频付费会员） → `streaming`（Spotify / Apple Music / Netflix / Disney+）
- 视频播放 / 编辑（非订阅） → `video`（YouTube / CapCut / VLC）
- 音乐 App（非订阅） → `music`
- 摄影 / 修图 → `photography`
- 艺术设计 → `art_design`（Canva / Adobe Express / Procreate）
- 漫画 → `comics`（Webtoon / MangaPlus）
- 图书阅读 → `books`

**生活 / 出行 / 本地**
- 本地生活 / O2O → `local_life`（Meituan / Uber Eats / DoorDash / 美团类）
- 出行 / 地图 / 导航 → `navigation`（Google Maps / Waze）
- 旅游 / 订房 → `travel`（Booking / Airbnb / Trip）
- 餐饮 / 食谱 → `food`
- 汽车 / 交通工具 → `auto_vehicles`（Tesla / Uber Driver / EV 充电）
- 智能家居 / 房产 → `house_home`（Home Assistant / Zillow / IKEA）
- 个性化 → `personalization`（启动器 / 壁纸 / 输入法）
- 生活方式 → `lifestyle`（Pinterest 类）
- 美妆 → `beauty`
- 天气 → `weather`
- 活动票务 → `events`（Eventbrite / Ticketmaster）

**身心 / 学习 / 资讯**
- 健康 → `health`
- 健身运动 → `fitness`（Nike Run / Strava）
- 医疗 → `medical`（Teladoc / MyChart）
- 育儿 → `parenting`（BabyCenter）
- 教育 / 学习 → `education`（Duolingo / Coursera）
- 体育 → `sports`（ESPN / FIFA）
- 新闻杂志 → `news`

**约会 / 娱乐 / 系统**
- 约会 → `dating`（Tinder / Bumble / Hinge）
- 娱乐综合 → `entertainment`
- 提效工具（笔记/日程/扫描/文件） → `productivity`
- 商店 / ADB / 文件 / 通用工具 → `tools`（Google Play / 文件管理）
- 系统服务（OEM / framework 级） → `system`（Google Play services / 输入法服务）
- 不知道放哪 → `other`

**游戏（games + 17 子类）**

游戏一般以"游戏名"为单位写 skill，分类只是为了 hub 浏览。优先选 Play Store 标准子类，分不清就用 `games` 兜底：
- 角色扮演 / 抽卡养成 → `game_role_playing`（原神 / 崩坏：星穹铁道 / 阴阳师）
- SLG / 策略出海大头 → `game_strategy`（Clash of Clans / 万国觉醒 / 三国志战略版）
- 模拟经营 → `game_simulation`（梦幻花园 / The Sims）
- 卡牌 → `game_card`（Hearthstone / Marvel Snap）
- 体育竞技 → `game_sports`（EA SPORTS FC / NBA 2K）
- 休闲 → `game_casual`（Candy Crush / Royal Match）
- 益智 → `game_puzzle`、街机 → `game_arcade`、竞速 → `game_racing`
- 博彩 / 老虎机 → `game_casino`
- 棋盘 → `game_board`、文字 → `game_word`、问答 → `game_trivia`
- 动作 → `game_action`、冒险 → `game_adventure`
- 音乐节奏 → `game_music`、教育游戏 → `game_educational`
- 不知道哪种游戏 → `games`

要新增 slug 必须同时改 `phonebase-cli/src/skills.rs` 的 `CATEGORY_SLUGS`。`pb skills validate` 会拒绝不在白名单里的 slug。`pb skills new` 在 TTY 模式会交互式让你选；非 TTY 模式可用 `--category <slug>` flag，省略则默认 `other` 并 warn。

---

## 脚本头部 JSDoc 注释协议

每个命令脚本的**第一个** `/** ... */` 块是命令声明：

```javascript
/**
 * @description 在 App 内搜索
 * @description:en Search within the app
 * @description:ja アプリ内で検索
 * @arg keyword:string! 搜索关键词
 * @arg:en keyword Search keyword
 * @arg:ja keyword 検索キーワード
 * @arg limit:int=20 最多返回几条
 * @arg sort:string=hot 排序方式
 * @arg tags:string* 过滤标签（可多个）
 */
```

### 命令名 = 文件名，不要写 @command

命令名**完全由文件名决定**（去掉 `.js` 后缀）。`scripts/search.js` → 命令 `search`。

`@command` 标签**可选且冗余**：推荐**直接省略**。如果你写了，scanner 会校验它必须和文件名一致，不一致会跳过该脚本并打 warn 到 stderr。这样避免"改了文件名忘了改 @command"的 drift bug。

想重命名命令？`mv scripts/old.js scripts/new.js` 就完事，不需要改脚本里的任何内容。

### @description

命令说明。**只取这一行**，不做多行续写（过去版本会贪心收集后续非 `@` 行，新版本删了）。如果你要给人读的多段文档，照常写在 JSDoc 注释里，scanner 不会收。

样例：

```javascript
/**
 * @description 启动 App（纯启动）
 *
 * 单一职责：仅启动 App，返回最小验证信息（top_activity + foreground）。  ← 这段 scanner 不收
 * 任何页面 introspection（dump / visible_texts / 登录态）都归 state 命令。
 */
```

`pb <skill> --help` 里只会显示"启动 App（纯启动）"这一行。

### 多语言 @description:<locale>

`@description` 支持可选的 locale 后缀，scanner 会把所有版本存进 manifest，pb CLI 按 `PHONEBASE_LOCALE` 挑对应文案渲染（未命中时降级到默认 → 前缀匹配 → 第一个可用）：

```javascript
/**
 * @description 搜索笔记
 * @description:en Search posts
 * @description:ja 投稿を検索
 */
```

不写 `:<locale>` 的 `@description` 就是默认 locale。`@arg` 同理：

```javascript
/**
 * @arg keyword:string! 搜索关键词        ← 默认 locale 的完整参数定义
 * @arg:en keyword Search keyword           ← 仅 en 描述覆盖，不重复 type/modifier
 * @arg:ja keyword 検索キーワード           ← 仅 ja 描述
 */
```

`@arg:<locale>` 格式是 `@arg:<locale> <name> <text>`，不需要 `name:type` 规格——类型定义在默认 `@arg` 里。

### ~~@command~~ （废弃）

不要再写 `@command`。文件名是唯一源。写了也会被校验必须和文件名一致，不如直接删掉。

### @arg

参数声明。语法：

```
@arg <name>:<type>[modifier] [description]
```

- **name**：参数名。CLI 用 `--<name> value` 传，脚本里用 `parseArgs` 读。
- **type**：`string` / `int` / `float` / `bool` / `path`
- **modifier**（三选一）：
  - `!` — 必填
  - `=<default>` — 默认值（类型必须匹配）
  - `*` — 允许重复（多个 `--tags a --tags b --tags c`）
- **description**：可选，说明文字

### 在脚本里读参数

用 Node 内置 `parseArgs`：

```javascript
const { parseArgs } = require('node:util');

const { values } = parseArgs({
  options: {
    keyword: { type: 'string' },
    limit:   { type: 'string' },           // parseArgs 只认 string/boolean，int 自己转
    verbose: { type: 'boolean' },
    tags:    { type: 'string', multiple: true },
  },
});

const keyword = values.keyword;
const limit   = parseInt(values.limit || '20', 10);
const tags    = values.tags || [];
```

---

## 输出规范

★ **核心规则**：脚本的 stdout 一行 JSON 是**业务数据本身**，pb 的输出层会自动套 `{code, data, msg}` 信封：

```
   你脚本写的:    pb 实际返回:
   {x: 1, y: 2}   {"code":200,"data":{"x":1,"y":2},"msg":"OK"}
```

### 三条铁律

1. **数据里不要加 `status` 字段** —— 元状态归 pb 的 `code`，不要在 data 里复制
2. **观测态用 boolean / 子对象表达** —— 不要用字符串状态码
3. **脚本失败用 `process.exit(1)` + stderr** —— pb 会反映成 `code != 200`

### 旧 → 新对照

| 想表达的 | ❌ 旧 | ✅ 新 |
|---|---|---|
| 操作成功 | `{status: 'ok', x: 1}` | `{x: 1}` |
| 已登录 | `{status: 'ok', logged_in: true}` | `{logged_in: true}` |
| 未登录 | `{status: 'needs_login', ...}` | `{logged_in: false, ...}` |
| App 在前台 | `{status: 'foreground'}` | `{foreground: true, top_activity: {...}}` |
| App 不在前台 | `{status: 'not_foreground'}` | `{foreground: false}` |
| 已安装 | `{status: 'already_installed'}` | `{installed: true, was_already_installed: true}` |
| 安装超时 | `{status: 'install_timeout'}` | `{installed: false, timed_out: true}` |
| 启动失败（不可恢复） | `{status: 'launch_failed', ...}` | `process.exit(1)` + stderr 描述 |
| 找不到按钮（不可恢复） | `{status: 'install_button_not_found'}` | `process.exit(1)` + stderr 描述 |

### 三件套命令的标准 shape

| 命令 | 职责 | 允许返回 | 禁止返回 |
|---|---|---|---|
| `open` | **仅启动** | `top_activity`, `foreground` | `visible_texts`, `node_count`, `logged_in`, 任何 dump 数据 |
| `state` | **仅 introspection** | `top_activity`, `foreground`, `logged_in`, `account?`, `visible_texts` | — |
| `close` | **仅强制停止** | `top_activity` | 任何额外数据 |

调用方需要"打开就完事" → 用 `open`，秒回；需要观测页面 → 用 `state`，自己跑一次。**不要让 `open` 隐式带 dump**。

### 业务命令的"自然产出"

业务命令只返回该命令本身需要的数据：

```javascript
// pb googleplay accounts → 镜像 pb account/list 的形状
{accounts: [{name, type}], count}

// pb googleplay install
{package, installed: true, action_buttons: ["Open"]}

// pb googleplay update
{package, up_to_date: true, action_buttons: ["Open"]}

// pb gmail inbox
{logged_in, account, items: [{index, sender, subject, snippet, date, unread}], count}
```

不要把 `visible_texts` 当通用 debug 字段塞进所有命令 —— 那是 `state` 命令专属的。

### finish / fail helpers

```javascript
function finish(data, exitCode = 0) {
  console.log(JSON.stringify(data));   // ← 直接 stringify 业务 data
  process.exit(exitCode);
}

function fail(err, context) {
  console.error(`${context}: ${err.message}`);   // ← stderr，不污染 data
  process.exit(1);                                 // ← 非零退出 → pb 信封 code != 200
}

main().catch(err => fail(err, 'search'));
```

---

## SDK API

完整 API 见 [`SDK_API.md`](SDK_API.md)。速查：

```javascript
const pb = require('@phonebase-cloud/pb');

// 万能入口
await pb.run('input/click', { x: 500, y: 800 });

// 设备控制
await pb.tap(x, y);
await pb.swipe(x1, y1, x2, y2);
await pb.input('hello');
await pb.keyevent('BACK');                    // 字符串名，不是数字
await pb.keyevent('ENTER');

// App 管理
await pb.launch('com.x');
await pb.forceStop('com.x');
await pb.topActivity();                        // { package_name, class_name }
await pb.startActivity({ action, data, package_name });   // Intent / deeplink

// UI 抓取
const dumpStr = await pb.dumpc();              // 返回字符串，自己解析
const node = pb.findTextInDump(dumpStr, 'Login');   // {bounds, center}
await pb.tapText('Login');                     // dump + 找 + tap，一步到位

// 高层等待
await pb.waitText('Home', { timeout: 10 });

// Shell / 文件
await pb.shell('pm list packages');
await pb.pushFile('/local/a.txt', '/sdcard/a.txt');
await pb.pullFile('/sdcard/log.txt');
```

**所有方法返回 Promise，失败 throw Error。** 脚本用标准 try/catch 捕获。

---

## 环境变量

pb 启动脚本子进程时会自动注入：

| 变量 | 说明 |
|---|---|
| `PHONEBASE_BIN` | pb 二进制绝对路径（SDK 用它避免 PATH 冲突） |
| `PHONEBASE_DEVICE_ID` | 当前目标设备 ID（SDK 自动追加 `--device`） |
| `PHONEBASE_SKILL_NAME` | 当前 skill 名 |
| `PHONEBASE_SKILL_DIR` | 当前 skill 目录绝对路径（读 references/ 用） |
| `PHONEBASE_TRACE_ID` | 本次调用的 trace id（日志串联） |
| `PHONEBASE_LOCALE` | 当前语言环境（zh-CN / en） |
| `PHONEBASE_OUTPUT` | 强制 `json`（SDK 必须靠它解析） |
| `NODE_PATH` | `~/.phonebase`，让 `require('@phonebase-cloud/pb')` 能找到 |

---

## 常见模式

### 模式 1：launch → topActivity（纯 open）

```javascript
const pb = require('@phonebase-cloud/pb');
const { PACKAGE, sleep, isForeground, finish, fail } = require('./_lib.js');

async function main() {
  await pb.launch(PACKAGE);
  await sleep(2500);
  const top = await pb.topActivity();
  finish({ top_activity: top, foreground: isForeground(top) });
}

main().catch(err => fail(err, 'open'));
```

### 模式 2：dump → 解析 → state

```javascript
async function main() {
  const top = await pb.topActivity();
  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);
  const login = detectLoginStatus(nodes);

  finish({
    top_activity: top,
    foreground: isForeground(top),
    logged_in: login.logged_in,
    account: login.account,
    visible_texts: nodes.map(n => n.text || n.content_desc).filter(Boolean).slice(0, 30),
  });
}
```

### 模式 3：deeplink 绕 UI

能用 deeplink 的场景**千万别**模拟点击 + 输入 + 回车。更稳、更快、不依赖 UI 版本。

```javascript
// Google Play 搜索
await pb.startActivity({
  action: 'android.intent.action.VIEW',
  data: 'market://search?q=WhatsApp&c=apps',
  package_name: 'com.android.vending',
});

// Gmail 写邮件 — mailto 直接预填 to/subject/body
await pb.startActivity({
  action: 'android.intent.action.SENDTO',
  data: 'mailto:test@example.com?subject=hi&body=hello',
  package_name: 'com.google.android.gm',
});
```

### 模式 4：找 NAF（Not Accessibility Friendly）图标按钮

TikTok 首页的搜索按钮是 `ImageView NAF=true`，**没有 text 也没有 content-desc**。按几何位置找：

```javascript
const dumpStr = await pb.dumpc();
const clickables = parseClickableNodes(dumpStr);
const screen = parseScreenSize(dumpStr);

const topRight = clickables
  .filter(n =>
    n.center[1] < screen.height * 0.15 &&
    n.center[0] > screen.width * 0.8 &&
    n.width < screen.width * 0.3
  )
  .sort((a, b) => b.center[0] - a.center[0])[0];

if (topRight) {
  await pb.tap(topRight.center[0], topRight.center[1]);
}
```

### 模式 5：清空再输入（搜索类命令必备）

`pb.input` 不会清空目标输入框，第二次调用会把新文本**追加**到旧的后面。每次输入前先清场：

```javascript
async function clearFocusedField(maxChars = 200) {
  await pb.shell('input keyevent KEYCODE_MOVE_END');
  await pb.shell(
    `for i in $(seq 1 ${maxChars}); do input keyevent KEYCODE_DEL; done`,
  );
}

// 使用
await pb.tap(searchBar.center[0], searchBar.center[1]);
await sleep(1500);
await clearFocusedField();           // ← 清场
await pb.input(keyword);
await pb.keyevent('ENTER');
```

---

## 反模式

### ❌ 别 mock

> "我先 mock 一下等有设备再换真的"

**不要**。从第一行代码开始就在真设备上跑。pb 的架构整个就是为真机设计的，mock 出来的东西进真机必然翻车。

### ❌ 别在 data 里加 `status` 字段

`status` 是 transport 层语义，归 pb 的 `code` 字段管。data 里再加一遍 = 责任错位。
观测态用 boolean / 子对象（`logged_in: true` / `installed: false`），失败用 `process.exit(1)`。

### ❌ 别让 `open` 命令带 dump / introspection

`open` 是**纯启动**：launch + topActivity，秒回。任何 dump / visible_texts / logged_in 检测都归 `state` 命令。
`open.js` 里出现 `dumpc` / `parseVisibleNodes` / `visible_texts` → 直接打回。

### ❌ 别把 `visible_texts` 当通用 debug 字段塞所有命令

只有 `state` 命令应该返回 `visible_texts`。业务命令（search / detail / install / inbox ...）只返回该命令的"自然产出"，调试信息走 stderr。

### ❌ 别按混淆的 resource-id 定位

大部分主流 App (TikTok / 小红书 / 抖音 / 微信 ...) 的 resource-id 都是混淆字符串，每次发版都会变：

```
resource-id="com.zhiliaoapp.musically:id/irz"   ← 混淆，别用
resource-id="0_resource_name_obfuscated"        ← 更混淆
```

用 `text` / `content-desc`，或者几何位置。

### ❌ 别硬编码坐标

除非是最后兜底。首选顺序：
1. `pb.tapText('Login')` — 文本匹配
2. `parseClickableNodes` + 几何筛选
3. 硬编码坐标（注释写清楚为什么）

### ❌ 别一个脚本塞 100 个命令

一个脚本 = 一个命令。不要在一个 `main.js` 里判断 `action === 'search'` / `action === 'post'` 然后走不同分支。违反 scanner 约定，也没法被 clap 正确派发。

### ❌ 别在脚本里 `console.log` 调试信息

stdout 只放最终结果 JSON。调试信息全部走 `console.error`，pb 把 stderr 作为日志转发给用户但不会污染 `data` 字段。

### ❌ 别用 `pb.keyevent(4)`

虽然能跑，但可读性差。用 `pb.keyevent('BACK')`。支持的名字见 SDK_API.md。

### ❌ 别在 `pb.input(keyword)` 之前不清空目标字段

`pb.input` 是 append 不是 replace。第二次调用 search 时，新关键词会被拼到旧的后面（实际生产 bug 出过）。先 [模式 5](#模式-5清空再输入搜索类命令必备)。

---

## 真机测试

开发循环：

```bash
# 1. 改脚本
vim ~/.phonebase/skills/mybank/scripts/search.js

# 2. 强制重扫（删 manifest 缓存）
rm ~/.phonebase/skills/_manifest.json

# 3. 真机跑
pb -s <device_id> mybank search --keyword "test"

# 4. 看 stdout JSON + stderr 日志
```

不要用 `--skip-build`、`--mock` 之类的 flag，**根本没有**。pb 的 skill 架构就是 subprocess spawn node + 直连 daemon，不存在 mock 通道。

### 静态检查

```bash
pb skills validate mybank
```

会检查：
- SKILL.md frontmatter 完整性（name / display_name / description / package 四个必填字段）
- `resources/ic_launcher.webp` 存在
- scripts/*.js 的 JSDoc 解析
- @arg 类型 / default 匹配
- require 的模块是否存在

### 输出 shape 自检

调用方期望的 shape 跑一遍，验证脚本 stdout 没漏掉 / 多出字段：

```bash
pb -s <dev> mybank state | python3 -c "
import sys, json
o = json.load(sys.stdin)
assert o['code'] == 200
assert 'status' not in o['data'], 'data 不应该有 status 字段'
assert 'top_activity' in o['data']
print('shape OK')
"
```

---

## 发布到 skill-hub

1. Fork [phonebase-skill-hub](https://github.com/phonebase-cloud/phonebase-skill-hub)
2. 把 `~/.phonebase/skills/<name>/` 整个目录拷贝到 fork 的 `skills/<name>/`（包括 `resources/ic_launcher.webp`）
3. 本地 `pb skills validate <name>` 通过
4. 提 PR，描述里放：
   - 目标 App 包名 + 版本（`pb shell "dumpsys package <pkg> | grep versionName"`）
   - 每个命令的一个真实输出 JSON 样例
   - 截图（设备截图，不是代码截图）
5. 等 review

---

## 常见坑

### 坑 1：keyevent 必须用字符串名

```javascript
await pb.keyevent(4);           // ❌ 400 Invalid 'key_code'
await pb.keyevent('BACK');      // ✓
await pb.keyevent('ENTER');     // ✓
await pb.keyevent('KEYCODE_BACK');  // ✓ 有前缀也 OK
```

支持 HOME / BACK / MENU / ENTER / DEL / TAB / SPACE / UP / DOWN / LEFT / RIGHT / POWER / VOLUME_UP / VOLUME_DOWN / MEDIA_PLAY_PAUSE 等常见名称。

### 坑 2：dumpc 返回是字符串不是对象

```javascript
const dump = await pb.dumpc();
console.log(typeof dump);       // "string"
dump.nodes;                     // undefined ❌
dump.split('\n');               // ✓
```

自己用正则解析，或者用 `pb.findTextInDump()` helper。

### 坑 3：activity/top_activity 返回的 package 可能不是你启动的那个

```javascript
await pb.launch('com.zhiliaoapp.musically');
await sleep(2500);
const top = await pb.topActivity();
// top.package_name 可能是:
//   - com.zhiliaoapp.musically  ✓
//   - com.google.android.gms    ← Google Sign-In 弹窗
//   - com.android.permissioncontroller  ← 权限请求
```

每次 launch 后都要检查 top_activity，被劫持就按 BACK 关弹窗。参考 tiktok 的 `_lib.js` 里的 `dismissGoogleSignIn`。

### 坑 4：SDK 的 shortcut 都是 `pb.run` 的语法糖

```javascript
await pb.launch(PACKAGE);
// ↕ 等价
await pb.run('activity/launch_app', { package_name: PACKAGE });
```

任何 pb builtin 能力都能通过 `pb.run(<path>, <args>)` 调用。完整 path 列表：`pb list`。

### 坑 5：首次跑新 skill 时 manifest 没更新

pb 的 skill scanner 会把结果缓存在 `~/.phonebase/skills/_manifest.json`。改了 JSDoc 没生效时：

```bash
rm ~/.phonebase/skills/_manifest.json
```

下次 pb 启动自动重扫。

### 坑 6：脚本里 require('./_lib.js') 路径必须加 `./`

```javascript
require('_lib.js')      // ❌ 找不到
require('./_lib.js')    // ✓
```

### 坑 7：`pb.input` 是 append 不是 replace

二次调用同一个搜索/输入命令时，新文本会被拼到旧的后面。每次输入前先用 [模式 5](#模式-5清空再输入搜索类命令必备) 清空。

---

## 参考

- tiktok skill：`skills/tiktok/`，含 `_lib.js` 完整实现 + NAF 图标定位 + clearFocusedField
- googleplay skill：`skills/googleplay/`，含 deeplink 搜索 / 详情页抽取 / install / uninstall / update
- gmail skill：`skills/gmail/`，含 inbox 解析 / search / read / mailto compose
- 模板：`_template/`，和 `pb skills new` 内嵌模板完全等价
- SDK API：[`SDK_API.md`](SDK_API.md)
- pb 源码：https://github.com/phonebase-cloud/phonebase-cli
