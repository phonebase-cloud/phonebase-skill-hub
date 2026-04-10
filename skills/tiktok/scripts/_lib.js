/**
 * TikTok skill 内部共享工具。
 *
 * 约定：scripts/ 下以 `_` 开头的文件会被 scanner 跳过，不会被注册成命令。
 *
 * 输出规范：
 *   每个命令脚本的 stdout **直接**是业务 data，pb 的输出层会包成
 *   `{code, data, msg}` 信封。**不要**在 data 里加 `status` 字段。
 *   观测态用 boolean / 子对象表达（如 `logged_in: true` / `foreground: false`）。
 *   脚本失败 → `process.exit(1)` + stderr 描述。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');

// ─── 常量 ─────────────────────────────────────────────────────

const PACKAGE = 'com.zhiliaoapp.musically';

const LOGIN_ACTIVITY_HINTS = ['I18nSignUp', 'Welcome', 'Login', 'SignUp', 'Auth'];
const LOGIN_TEXT_HINTS = [
  'Log in',
  'Log In',
  'Sign up',
  'Sign Up',
  'Continue with Facebook',
  'Continue with Google',
  'Use phone / email / username',
];

// ─── 基础工具 ──────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 从 `pb.dumpc()` 返回的压缩文本里抽出所有带 text / content-desc 的节点。
 */
function parseVisibleNodes(dumpStr) {
  if (typeof dumpStr !== 'string') return [];
  const nodes = [];
  for (const line of dumpStr.split('\n')) {
    const textMatch = line.match(/\btext="([^"]*)"/);
    const descMatch = line.match(/content-desc="([^"]*)"/);
    const text = textMatch ? textMatch[1] : '';
    const desc = descMatch ? descMatch[1] : '';
    if (!text && !desc) continue;

    const boundsMatch = line.match(/bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsMatch) continue;
    const [x1, y1, x2, y2] = boundsMatch.slice(1, 5).map((v) => parseInt(v, 10));
    nodes.push({
      text,
      content_desc: desc,
      bounds: [x1, y1, x2, y2],
      center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
      width: x2 - x1,
      height: y2 - y1,
      clickable: /\bclickable=true\b/.test(line),
    });
  }
  return nodes;
}

/**
 * 从 dumpc 抽出所有 clickable 节点（不限是否有 text / content-desc）。
 * 用于找 NAF 图标按钮（如 TikTok 搜索按钮 = 纯 ImageView）。
 */
function parseClickableNodes(dumpStr) {
  if (typeof dumpStr !== 'string') return [];
  const nodes = [];
  for (const line of dumpStr.split('\n')) {
    if (!/\bclickable=true\b/.test(line)) continue;
    const boundsMatch = line.match(/bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!boundsMatch) continue;
    const [x1, y1, x2, y2] = boundsMatch.slice(1, 5).map((v) => parseInt(v, 10));
    nodes.push({
      text: (line.match(/\btext="([^"]*)"/) || [, ''])[1],
      content_desc: (line.match(/content-desc="([^"]*)"/) || [, ''])[1],
      resource_id: (line.match(/resource-id="([^"]*)"/) || [, ''])[1],
      bounds: [x1, y1, x2, y2],
      center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
      width: x2 - x1,
      height: y2 - y1,
    });
  }
  return nodes;
}

/** 从 dumpc 头部 "Screen 1080x2374 rotation=0" 抽屏幕尺寸。 */
function parseScreenSize(dumpStr) {
  if (typeof dumpStr !== 'string') return null;
  const m = dumpStr.match(/Screen (\d+)x(\d+)/);
  return m ? { width: parseInt(m[1], 10), height: parseInt(m[2], 10) } : null;
}

// ─── 业务判断 ──────────────────────────────────────────────────

/** TikTok 是否在前台。 */
function isForeground(topActivity) {
  return ((topActivity && topActivity.package_name) || '') === PACKAGE;
}

/**
 * 判断当前页面是不是 TikTok 的登录/注册页。
 * 双判：Activity class name 关键词 + 页面文本关键词。
 */
function detectLoginPage(topActivity, nodes) {
  const className = (topActivity && topActivity.class_name) || '';
  const byActivity = LOGIN_ACTIVITY_HINTS.some((h) =>
    className.toLowerCase().includes(h.toLowerCase()),
  );
  const byText = nodes.some((n) =>
    LOGIN_TEXT_HINTS.some(
      (h) => n.text === h || n.content_desc === h || n.text.startsWith(h),
    ),
  );
  return byActivity || byText;
}

/**
 * TikTok 启动后可能弹出 Google Sign-In 面板（package=com.google.android.gms）。
 * 连续按 BACK 最多 maxAttempts 次把它关掉。返回最终的 top_activity。
 */
async function dismissGoogleSignIn(maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const top = await pb.topActivity();
    if (top.package_name === PACKAGE) return top;
    if (top.package_name !== 'com.google.android.gms') return top;
    await pb.keyevent('BACK');
    await sleep(800);
  }
  return pb.topActivity();
}

/**
 * 找右上角可点击图标（典型用途：TikTok 搜索按钮）。
 *
 * 规则：
 *   - clickable=true
 *   - 中心点在顶部 15% 高度以内
 *   - 中心点在右侧 20% 宽度以内
 *   - 尺寸不是整屏（排除整页 clickable 容器）
 */
function findTopRightIcon(clickableNodes, screenSize) {
  if (!screenSize) return null;
  const candidates = clickableNodes.filter((n) => {
    const [cx, cy] = n.center;
    if (cy > screenSize.height * 0.15) return false;
    if (cx < screenSize.width * 0.8) return false;
    if (n.width > screenSize.width * 0.9) return false;
    if (n.height > screenSize.height * 0.9) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.center[0] - a.center[0] + (a.center[1] - b.center[1]));
  return candidates[0];
}

/**
 * 清空当前焦点输入框：先 MOVE_END 把光标移到末尾，再连续 DEL 直到空。
 *
 * 用于"二次调用同一个搜索/输入命令"场景：之前的输入还残留在框里，
 * 新文本会被追加而不是替换。`pb.input` 不会自动清空，必须显式做。
 *
 * 注意：调用前必须先 tap focus 到目标输入框。maxChars 是保险上限，
 * 避免某些 IME 不响应 DEL 时无限循环。
 */
async function clearFocusedField(maxChars = 200) {
  await pb.shell('input keyevent KEYCODE_MOVE_END');
  await sleep(150);
  // 一次性发多个 DEL 比逐个 keyevent 快
  await pb.shell(
    `for i in $(seq 1 ${maxChars}); do input keyevent KEYCODE_DEL; done`,
  );
  await sleep(300);
}

// ─── IO helpers ───────────────────────────────────────────────

/**
 * 统一输出：把业务 data 打印为 JSON 到 stdout，然后退出。
 *
 * 关键：**不要在 data 里加 status 字段**。pb 的输出层会自动套
 * `{code: 200, data: <这里>, msg: "OK"}` 信封。
 */
function finish(data, exitCode = 0) {
  console.log(JSON.stringify(data));
  process.exit(exitCode);
}

/** 失败包装：错误消息打 stderr，退出码 1。 */
function fail(err, context) {
  const msg = err && err.message ? err.message : String(err);
  console.error(`tiktok/${context} failed: ${msg}`);
  process.exit(1);
}

module.exports = {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseClickableNodes,
  parseScreenSize,
  isForeground,
  detectLoginPage,
  dismissGoogleSignIn,
  findTopRightIcon,
  clearFocusedField,
  finish,
  fail,
};
