# @phonebase-cloud/pb SDK API 速查

Node.js SDK，给 skill 脚本用。所有方法返回 `Promise`，失败 throw `Error`。

```javascript
const pb = require('@phonebase-cloud/pb');
```

内部实现是 subprocess 模式：每次调用 spawn 一次 `pb` 子进程，由 `PHONEBASE_BIN` 环境变量指定路径，`PHONEBASE_DEVICE_ID` 自动带上 `--device` 参数。所以 skill 脚本里**不需要**也**不应该**关心设备 ID。

---

## 通用入口

### `pb.run(path, args?)` → `Promise<any>`

调用任意 Capability path，其它方法都是它的语法糖。

```javascript
await pb.run('input/click', { x: 500, y: 800 });
await pb.run('accessibility/dump_compact');
await pb.run('system/shell', { command: 'pm list packages' });
```

完整 path 列表：`pb list`。

---

## 设备控制

### `pb.tap(x, y)` → `Promise<any>`
在屏幕坐标 `(x, y)` 点击。

```javascript
await pb.tap(540, 1200);
```

### `pb.swipe(x1, y1, x2, y2)` → `Promise<any>`
从 `(x1, y1)` 滑到 `(x2, y2)`，贝塞尔曲线拟人轨迹。

```javascript
await pb.swipe(540, 1500, 540, 500);   // 向上滑
```

### `pb.input(text)` → `Promise<any>`
往当前焦点输入框打字。

```javascript
await pb.input('hello world');
```

### `pb.keyevent(key)` → `Promise<any>`
发送按键。**必须用字符串名**，不要传数字。

```javascript
await pb.keyevent('BACK');        // 返回键
await pb.keyevent('HOME');        // 主页
await pb.keyevent('ENTER');       // 回车（触发搜索）
await pb.keyevent('DEL');         // 删除
```

支持的名字（大小写不敏感，可带 `KEYCODE_` 前缀）：

```
HOME BACK MENU ENTER DEL TAB SPACE
UP DOWN LEFT RIGHT CENTER
POWER CAMERA SEARCH
VOLUME_UP VOLUME_DOWN MUTE
MEDIA_PLAY MEDIA_PAUSE MEDIA_PLAY_PAUSE
MEDIA_NEXT MEDIA_PREVIOUS MEDIA_STOP
PAGE_UP PAGE_DOWN
ESCAPE INSERT CAPS_LOCK
0 1 2 3 4 5 6 7 8 9
```

也接受 `KEYCODE_BACK`、`keycode_back`。

---

## App 管理

### `pb.launch(packageName)` → `Promise<any>`
启动 App 默认 Activity。

```javascript
await pb.launch('com.zhiliaoapp.musically');
```

### `pb.startActivity(opts)` → `Promise<any>`
发送自定义 Intent。参数：

```typescript
{
  action?: string,          // 例如 'android.intent.action.VIEW'
  data?: string,            // URI，例如 'market://details?id=com.whatsapp'
  package_name?: string,    // 限定由哪个 App 处理
  component?: string,       // 可选：显式 Activity class
  extras?: Record<string, any>,
}
```

最常用的场景是 **deeplink**：

```javascript
// Google Play 搜索
await pb.startActivity({
  action: 'android.intent.action.VIEW',
  data: 'market://search?q=WhatsApp&c=apps',
  package_name: 'com.android.vending',
});

// WhatsApp 发消息给指定号码
await pb.startActivity({
  action: 'android.intent.action.VIEW',
  data: 'https://wa.me/1234567890?text=hello',
  package_name: 'com.whatsapp',
});
```

### `pb.forceStop(packageName)` → `Promise<any>`
强制停止 App（等价于 `am force-stop`）。

```javascript
await pb.forceStop('com.zhiliaoapp.musically');
```

### `pb.topActivity()` → `Promise<{package_name, class_name}>`
获取当前前台 Activity。

```javascript
const top = await pb.topActivity();
// { package_name: 'com.android.launcher3', class_name: 'com.android.launcher3.Launcher' }
```

### `pb.packagesList()` → `Promise<any>`
列出已安装包。

### `pb.installPackage(opts)` → `Promise<any>`
通过 URI / 文件路径安装 APK。

```javascript
await pb.installPackage({ uri: 'https://example.com/app.apk' });
await pb.installPackage({ uri: '/sdcard/Download/app.apk' });
```

### `pb.uninstallPackage(packageName)` → `Promise<any>`
卸载 App。

---

## UI 抓取

### `pb.dump()` → `Promise<string>`
抓取完整 UI hierarchy，返回 XML 字符串。适合需要父子关系的场景。

### `pb.dumpc()` → `Promise<string>`
**推荐首选。** 抓取压缩格式的 UI hierarchy。去掉了无 text 且无 resource-id 的节点，返回文本：

```
Screen 1080x2374 rotation=0
[0] android.widget.FrameLayout resource-id="..." package="..." bounds=[0,0][1080,2374]
  [0] android.widget.TextView text="Home" bounds=[0,2220][216,2374]
  [1] android.widget.ImageView clickable=true bounds=[912,75][1080,243]
  ...
```

**返回的是字符串，不是对象**，自己解析。或者用 `findTextInDump` helper。

```javascript
const dumpStr = await pb.dumpc();
for (const line of dumpStr.split('\n')) {
  const m = line.match(/text="([^"]+)"/);
  if (m) console.log(m[1]);
}
```

### `pb.findTextInDump(dumpStr, text)` → `{bounds, center, line} | null`
在 dumpc 文本里找包含指定文本的节点，返回 bounds + center。

```javascript
const dumpStr = await pb.dumpc();
const node = pb.findTextInDump(dumpStr, 'Login');
if (node) {
  await pb.tap(node.center[0], node.center[1]);
}
```

### `pb.waitText(text, opts?)` → `Promise<void>`
轮询 dumpc 直到看到指定文本，超时 throw。

```javascript
await pb.waitText('Home', { timeout: 10, interval: 0.5 });
// timeout 单位秒，默认 10
// interval 单位秒，默认 0.5
```

### `pb.tapText(text)` → `Promise<any>`
dump + find + tap 一步到位。

```javascript
await pb.tapText('Continue');
```

找不到会 throw。

---

## 截图

### `pb.screencap(opts?)` → `Promise<any>`
截图。

```javascript
await pb.screencap();                            // 默认格式保存到项目 .phonebase/screencap/
await pb.screencap({ format: 'png' });
```

---

## 剪贴板

### `pb.clipboardGet()` → `Promise<string>`
### `pb.clipboardSet(text)` → `Promise<any>`

```javascript
const old = await pb.clipboardGet();
await pb.clipboardSet('new text');
```

---

## 显示

### `pb.displayInfo()` → `Promise<{width, height, density, rotation, ...}>`
屏幕信息。

```javascript
const info = await pb.displayInfo();
console.log(info.width, info.height);
```

---

## Shell / 文件

### `pb.shell(command)` → `Promise<{stdout, stderr, code}>`
在设备上跑 shell 命令。

```javascript
const { stdout } = await pb.shell('pm list packages -3');
```

### `pb.pushFile(localPath, devicePath?)` → `Promise<any>`
把本地文件推到设备。`devicePath` 可选，默认 `/sdcard/Download/`。

```javascript
await pb.pushFile('./config.json', '/sdcard/Download/config.json');
```

### `pb.pullFile(devicePath)` → `Promise<any>`
从设备拉文件到本地 `.phonebase/pull/<device_id>/<path>`。

```javascript
await pb.pullFile('/sdcard/Download/log.txt');
```

### `pb.listFiles(path)` → `Promise<Array>`
列设备上某目录的文件。

```javascript
await pb.listFiles('/sdcard/Download');
```

---

## 浏览器

### `pb.browse(url, packageName?)` → `Promise<any>`
用浏览器打开 URL，可指定用哪个浏览器。

```javascript
await pb.browse('https://example.com');
await pb.browse('https://example.com', 'com.android.chrome');
```

不指定时按优先级尝试 `mark.via` / `chrome` / `android.browser`。

---

## 环境变量

SDK 从这些环境变量读取上下文（pb spawn 脚本时自动注入，正常情况下不需要手动设）：

| 变量 | 说明 |
|---|---|
| `PHONEBASE_BIN` | pb 二进制路径 |
| `PHONEBASE_DEVICE_ID` | 当前设备 ID |
| `PHONEBASE_OUTPUT` | 强制设成 `json`，不要改 |
| `NODE_PATH` | `~/.phonebase`，让 `require` 能找到 SDK |

---

## 错误处理

所有方法失败时 throw `Error`，message 形如：

```
pb input/click failed: code=400, msg=Invalid 'x' parameter
```

标准捕获方式：

```javascript
try {
  await pb.tap(1000, 2000);
} catch (err) {
  console.error('tap failed:', err.message);
  process.exit(1);
}
```

或者更简洁用 `main().catch()`：

```javascript
async function main() {
  // ...
}

main().catch(err => {
  console.error('mycommand failed:', err.message);
  process.exit(1);
});
```

---

## 输出包装链路

脚本的 stdout 第一行 JSON 直接是**业务 data**，pb 的输出层会自动套 `{code, data, msg}` 信封：

```
脚本写: console.log(JSON.stringify({x: 1, y: 2}))
                  ↓
pb 输出层（CmdResult::from_api）
                  ↓
用户拿到: {"code": 200, "data": {"x": 1, "y": 2}, "msg": "OK"}
```

**核心规则**：
- 退出码 0 + stdout 一行 JSON → pb 包成 `{code:200, data:<这里>, msg:"OK"}`
- 退出码非 0 + stderr 描述 → pb 包成 `{code:!=200, data:null, msg:<stderr 摘要>}`
- 数据里**不要加 `status` 字段**，元状态归 pb 的 `code`，观测态用 boolean / 子对象

详见 [`SKILL_AUTHORING.md` 输出规范一节](SKILL_AUTHORING.md#输出规范)。

---

## 完整例子

```javascript
/**
 * @command search
 * @description 在某 App 搜索
 * @arg keyword:string! 关键词
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');

const PACKAGE = 'com.example.app';

async function main() {
  const { values } = parseArgs({ options: { keyword: { type: 'string' } } });
  if (!values.keyword) {
    console.error('Error: --keyword required');
    process.exit(1);
  }

  // 1. 确保 App 在前台
  let top = await pb.topActivity();
  if (top.package_name !== PACKAGE) {
    await pb.launch(PACKAGE);
    await new Promise(r => setTimeout(r, 2500));
    top = await pb.topActivity();
  }

  // 2. 找搜索入口
  const dumpStr = await pb.dumpc();
  const searchNode = pb.findTextInDump(dumpStr, 'Search');
  if (!searchNode) {
    // 不可恢复 → 退出码非 0 + stderr 描述
    console.error('search: 当前页面没找到搜索入口');
    process.exit(1);
  }

  // 3. 点击 + 输入 + 提交
  await pb.tap(searchNode.center[0], searchNode.center[1]);
  await new Promise(r => setTimeout(r, 1500));
  await pb.input(values.keyword);
  await pb.keyevent('ENTER');
  await new Promise(r => setTimeout(r, 2500));

  // 4. 抓结果
  const resultDump = await pb.dumpc();
  const resultTop = await pb.topActivity();

  // 5. 直接打印业务 data，不要套 status 信封！
  console.log(JSON.stringify({
    keyword: values.keyword,
    top_activity: resultTop,
    dump_lines: resultDump.split('\n').length,
  }));
  // pb 实际返回:
  // {"code":200,"data":{"keyword":"...","top_activity":{...},"dump_lines":120},"msg":"OK"}
}

main().catch(err => {
  console.error('search failed:', err.message);
  process.exit(1);
});
```
