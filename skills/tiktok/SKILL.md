---
name: tiktok
display_name: TikTok
description: TikTok 自动化 — 启动、状态检测、搜索、关闭
package: com.zhiliaoapp.musically
category: social
---

# TikTok Skill

在真实云手机上驱动 TikTok 国际版 App（`com.zhiliaoapp.musically`）。

## 命令

### 基础三件套

- `pb tiktok open` — 启动 TikTok（纯启动，秒回，不带 introspection）
- `pb tiktok state` — 查询当前页面状态（dump + 解析 + 登录态判断）
- `pb tiktok close` — 强制停止 TikTok

### 业务命令

- `pb tiktok search --keyword <word>` — 在 TikTok 内搜索关键词（未登录返回 `logged_in: false`）

## 输出规范

每个命令的 stdout 是**业务数据本身**，pb 自动包成 `{code, data, msg}` 信封。
**不要**在数据里加 `status` 字段。详见仓库的 `docs/SKILL_AUTHORING.md`。

样例：

```json
// pb tiktok open
{"code":200,"data":{"top_activity":{"package_name":"com.zhiliaoapp.musically","class_name":"..."},"foreground":true},"msg":"OK"}

// pb tiktok state  (未登录)
{"code":200,"data":{"top_activity":{...},"foreground":true,"logged_in":false,"visible_texts":["Log in","Sign up","Continue with Google",...]},"msg":"OK"}

// pb tiktok search --keyword apple  (未登录)
{"code":200,"data":{"keyword":"apple","logged_in":false,"candidates":[]},"msg":"OK"}
```

## 实现说明

- 启动后会自动连续 BACK 关掉 Google Sign-In 弹窗（com.google.android.gms 抢前台）
- 登录页检测依赖 Activity class name（`I18nSignUpActivity` / `Welcome`）+ 可见文本（`Log in` / `Sign up` / `Continue with`）双重判断
- 搜索按钮是 NAF（Not Accessibility Friendly）的纯图标 ImageView，没有 text 也没有 content-desc，靠几何位置（右上角 clickable）+ clickable=true 定位
- TikTok 的 resource-id 不混淆，但 skill 只用 `text` / `content-desc` / 几何位置匹配，对未来混淆也稳

