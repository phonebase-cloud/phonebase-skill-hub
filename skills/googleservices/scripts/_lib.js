/**
 * Google services skill 内部共享工具。
 *
 * 这个 skill 不驱动具体应用，操作的是系统层 com.google 账号体系。
 * 工具函数主要围绕：dumpsys account 解析、ADD_ACCOUNT_SETTINGS intent、
 * Google 登录页 WebView 探查（MinuteMaidActivity）。
 *
 * 输出规范：
 *   每个命令脚本的 stdout 直接是业务 data，pb 自动套 `{code, data, msg}`。
 *   **不要**在 data 里加 `status` 字段。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');

// ─── 常量 ─────────────────────────────────────────────────────

const PACKAGE = 'com.google.android.gms';
const ACCOUNT_TYPE = 'com.google';
const MINUTE_MAID_CLASS_HINT = 'MinuteMaid';

/** 风控 / 二次验证类页面的标志文案。 */
const BLOCKING_PATTERNS = [
  { kind: 'recaptcha', re: /I'?m not a robot|reCAPTCHA|verify that you'?re not a robot/i },
  { kind: 'device_verification', re: /verify it'?s you|verify your device|unusual activity|couldn'?t sign you in/i },
  { kind: '2fa', re: /2-step verification|two[- ]?factor|enter the code|security code/i },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── dumpsys account 解析 ──────────────────────────────────────

/**
 * 读取设备上所有 com.google 类型的账号。
 *
 * dumpsys account 输出里的关键行形如：
 *   Account {name=foo@gmail.com, type=com.google}
 */
async function listGoogleAccounts() {
  const { stdout } = await pb.shell('dumpsys account');
  if (!stdout) return [];
  const out = [];
  const seen = new Set();
  const re = /name=([^,}\s]+),\s*type=com\.google\b/g;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, type: ACCOUNT_TYPE });
  }
  return out;
}

// ─── intent 触发 ──────────────────────────────────────────────

/**
 * 触发系统 ADD_ACCOUNT_SETTINGS 流程，限定 com.google 类型。
 *
 * 这是 Google 登录的官方入口，会拉起 com.google.android.gms 的
 * MinuteMaidActivity（基于 WebView 的 Sign in 页）。
 */
async function openAddGoogleAccount() {
  return pb.startActivity({
    action: 'android.settings.ADD_ACCOUNT_SETTINGS',
    extras: { account_types: ACCOUNT_TYPE },
  });
}

/** 打开系统 Settings → Accounts 页面。 */
async function openAccountSettings() {
  return pb.startActivity({
    action: 'android.settings.SYNC_SETTINGS',
  });
}

// ─── 登录页 WebView 探查 ──────────────────────────────────────

/** 当前是不是 MinuteMaid 登录 WebView？ */
function isOnMinuteMaid(topActivity) {
  const cls = (topActivity && topActivity.class_name) || '';
  return cls.includes(MINUTE_MAID_CLASS_HINT);
}

/**
 * 用 `pb.dump`（**完整 XML**）解析登录页里的 EditText 和按钮。
 *
 * 关键：MinuteMaid 是 WebView，`pb.dumpc`（compact）会把无 text 的 View 节点
 * 过滤掉，看不到 EditText / Button。必须用完整 dump。
 *
 * 返回 [{class_name, text, password, clickable, focused, bounds, center, ...}]
 */
async function dumpMinuteMaid() {
  const xmlStr = await pb.dump();
  if (typeof xmlStr !== 'string') return [];

  const out = [];
  // uiautomator 输出每个 <node ... /> 通常单行
  const nodeRe = /<node\b[^>]*?\/?>/g;
  let m;
  while ((m = nodeRe.exec(xmlStr)) !== null) {
    const seg = m[0];
    const attr = (k) => {
      const am = seg.match(new RegExp(`\\b${k}="([^"]*)"`));
      return am ? am[1] : '';
    };
    const cls = attr('class');
    const bounds = attr('bounds');
    const bm = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bm) continue;
    const [x1, y1, x2, y2] = bm.slice(1, 5).map((v) => parseInt(v, 10));
    out.push({
      class_name: cls,
      text: attr('text'),
      content_desc: attr('content-desc'),
      password: attr('password') === 'true',
      clickable: attr('clickable') === 'true',
      focused: attr('focused') === 'true',
      bounds: [x1, y1, x2, y2],
      center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
      width: x2 - x1,
      height: y2 - y1,
    });
  }
  return out;
}

/** 在 MinuteMaid dump 里找邮箱输入框（第一个非密码 EditText）。 */
function findEmailField(nodes) {
  for (const n of nodes) {
    if (!n.class_name.includes('EditText')) continue;
    if (n.password) continue;
    return n;
  }
  return null;
}

/** 在 MinuteMaid dump 里找密码输入框（第一个 password=true 的 EditText）。 */
function findPasswordField(nodes) {
  for (const n of nodes) {
    if (!n.class_name.includes('EditText')) continue;
    if (n.password) return n;
  }
  return null;
}

/** 在 MinuteMaid dump 里找下一步按钮（NEXT / Next / 下一步）。 */
function findNextButton(nodes) {
  for (const n of nodes) {
    if (!n.clickable) continue;
    if (/^(NEXT|Next|下一步)$/i.test(n.text || '')) return n;
  }
  return null;
}

/**
 * 检测当前 dump 里有没有 Google 风控/验证页面的标志文案。
 * 命中返回 {kind, snippet}，否则 null。
 */
async function detectVerificationChallenge() {
  const xmlStr = await pb.dump();
  if (typeof xmlStr !== 'string') return null;
  for (const b of BLOCKING_PATTERNS) {
    const m = xmlStr.match(b.re);
    if (m) return { kind: b.kind, snippet: m[0] };
  }
  return null;
}

/** 把当前页面所有 text 收集起来用于错误诊断。 */
function collectVisibleTexts(nodes, max = 30) {
  return nodes
    .map((n) => n.text || n.content_desc)
    .filter(Boolean)
    .slice(0, max);
}

/**
 * 清空当前焦点输入框（input 是 append 不是 replace）。
 */
async function clearFocusedField(maxChars = 200) {
  await pb.shell('input keyevent KEYCODE_MOVE_END');
  await sleep(150);
  await pb.shell(
    `for i in $(seq 1 ${maxChars}); do input keyevent KEYCODE_DEL; done`,
  );
  await sleep(300);
}

// ─── IO helpers ───────────────────────────────────────────────

function finish(data, exitCode = 0) {
  console.log(JSON.stringify(data));
  process.exit(exitCode);
}

function fail(err, context) {
  const msg = err && err.message ? err.message : String(err);
  console.error(`googleservices/${context} failed: ${msg}`);
  process.exit(1);
}

module.exports = {
  PACKAGE,
  ACCOUNT_TYPE,
  sleep,
  listGoogleAccounts,
  openAddGoogleAccount,
  openAccountSettings,
  isOnMinuteMaid,
  dumpMinuteMaid,
  findEmailField,
  findPasswordField,
  findNextButton,
  detectVerificationChallenge,
  collectVisibleTexts,
  clearFocusedField,
  finish,
  fail,
};
