---
name: googleservices
display_name: Google Play services
description: Google 账号管理 — 登录 / 登出 / 账号查询；所有 Google 系应用共享
package: com.google.android.gms
category: system
---

# Google Services Skill

**这个 skill 不驱动任何"应用"** —— 它操作的是 Android 系统层的 `com.google` 账号体系。
所有 Google 系应用（Gmail / Google Play / YouTube / Drive / Maps ...）共享同一份系统账号，所以 Google 登录在这里一次完成、所有 App 同时受益。

```bash
pb googleservices login --email a@b.com --password ...   # 一次登录
pb gmail inbox                                            # 直接能用
pb googleplay install --package org.telegram.messenger   # 直接能用
```

## 命令

### 账号查询

- `pb googleservices accounts` — 列出设备上所有 `com.google` 账号（含登录态、默认账号）

### 账号管理

- `pb googleservices login [--email <e>] [--password <p>] [--wait <sec>]`
  触发系统 `ADD_ACCOUNT_SETTINGS` intent，限定 `com.google` 账号类型。
  - 不带 `--email`：只把 Google 登录页打开，等用户人工完成
  - 带 `--email` + `--password`：尝试自动填写凭证（best-effort，详见下方注意事项）
  - `--wait`：登录页打开后多少秒内轮询 `dumpsys account` 直到检测到新账号
- `pb googleservices logout [--email <e>]`
  - 不带 `--email`：打开系统账号设置页（Settings → Accounts）
  - 带 `--email`：自动点进该账号 → "Remove account" → 确认对话框

## ⚠️ 关于 Google 登录自动化的现实约束

Google 的登录页是 `MinuteMaidActivity` 里的 WebView，**不是原生 Android 视图**。Google 对脚本化登录有重度风控（reCAPTCHA / 设备指纹 / "verify it's you" 设备验证），常见行为：

- **新设备首次登录**：触发 "Verify it's you" 设备验证，要求用另一台已登录的物理设备生成安全码 — 脚本无法自动通过
- **真实凭证 + 没风控的账号**：可能成功，特别是测试用账号、有 backup phone 的账号
- **测试账号在新云手机**：通常被风控拦截

**实务方案**：
1. 第一次在某台云手机上**人工完成**一次 Google 登录（接受设备验证），让 Google 把这台云手机标记为可信设备
2. 之后该设备上跑 `pb googleservices login --email X --password Y` 通常就能自动通过
3. 用户脚本应该把 login 当成"可能成功也可能卡"的操作，看 `dumpsys account` 的最终结果判断成功与否

`login` 命令遇到风控时返回的 data 里会带 `verification_required: true` + 当前页面文本，调用方据此判断是否需要人工介入。

## 输出规范

每个命令的 stdout 是**业务数据本身**，pb 自动包成 `{code, data, msg}` 信封。**不要**在数据里加 `status` 字段。详见仓库的 `docs/SKILL_AUTHORING.md`。

样例：

```json
// pb googleservices accounts  (空)
{"code":200,"data":{"accounts":[],"count":0},"msg":"OK"}

// pb googleservices accounts  (有账号)
{"code":200,"data":{"logged_in":true,"count":1,"default_account":"a74636sty@gmail.com","accounts":[{"name":"a74636sty@gmail.com","type":"com.google"}]},"msg":"OK"}

// pb googleservices login --email X --password Y  (成功)
{"code":200,"data":{"email":"X","logged_in":true,"verification_required":false},"msg":"OK"}

// pb googleservices login --email X --password Y  (被风控)
{"code":200,"data":{"email":"X","logged_in":false,"verification_required":true,"current_page":"Verify it's you","hint":"需要人工在云手机上完成设备验证"},"msg":"OK"}
```
