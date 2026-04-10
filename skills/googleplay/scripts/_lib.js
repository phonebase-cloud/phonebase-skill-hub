/**
 * Google Play skill 内部共享工具。
 *
 * 输出规范：
 *   每个命令脚本的 stdout **直接**是业务 data，pb 的输出层会包成
 *   `{code, data, msg}` 信封。**不要**在 data 里加 `status` 字段。
 *   观测态用 boolean / 子对象表达。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');

// ─── 常量 ─────────────────────────────────────────────────────

const PACKAGE = 'com.android.vending';

/** Play Store 首页 / 搜索页 / 详情页常见的关键 UI 文案。 */
const PLAY_STORE_HINTS = [
  'Play Store', 'Google Play', 'Apps', 'Games', 'Movies', 'Books',
  'Install', 'Uninstall', 'Update', 'Open',
];

/** 需要登录 Google 账号的精准文案（不放 'Continue' 这种宽泛词）。 */
const NEEDS_LOGIN_HINTS = [
  'Sign in',
  'Sign in to your Google Account',
  'Add a Google Account',
  'Add account',
  'Choose an account',
  'Use another account',
  'Create account',
  'Needs an account',
  "You'll need a Google Account",
];

/** 安装 / 卸载 / 更新按钮文案。 */
const ACTION_BUTTON_WORDS = [
  'Install', 'Uninstall', 'Update', 'Open', 'Play',
  'Cancel download', 'Pause', 'Resume',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── dump 解析 ─────────────────────────────────────────────────

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

function parseScreenSize(dumpStr) {
  if (typeof dumpStr !== 'string') return null;
  const m = dumpStr.match(/Screen (\d+)x(\d+)/);
  return m ? { width: parseInt(m[1], 10), height: parseInt(m[2], 10) } : null;
}

// ─── 业务判断 ──────────────────────────────────────────────────

function isForeground(topActivity) {
  return ((topActivity && topActivity.package_name) || '') === PACKAGE;
}

/**
 * 当前页面是否在登录引导态。
 * 只要文案精确命中 NEEDS_LOGIN_HINTS 就判 true，宽泛词坚决不进白名单。
 */
function isNeedsLoginPage(nodes) {
  return nodes.some((n) => {
    const t = n.text || '';
    const d = n.content_desc || '';
    return NEEDS_LOGIN_HINTS.some(
      (h) => t === h || d === h || t.startsWith(h) || d.startsWith(h),
    );
  });
}

/**
 * 从 dumpc 节点判断 Play Store 当前是否「已登录」+ 提取邮箱。
 *
 * 判据（任一命中即认为已登录）：
 *   1. 顶部右上角头像按钮的 content-desc：
 *      "Account and settings for {email}" / "Signed in as {email}"
 *   2. 任意可见文本里出现形如 "xxx@yyy.zzz" 的邮箱
 */
function detectLoginStatus(nodes) {
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

  for (const n of nodes) {
    const s = `${n.content_desc || ''} ${n.text || ''}`;
    if (/signed in as|account and settings/i.test(s)) {
      const m = s.match(EMAIL_RE);
      return { logged_in: true, account: m ? m[0] : null };
    }
  }
  for (const n of nodes) {
    const m =
      (n.text || '').match(EMAIL_RE) || (n.content_desc || '').match(EMAIL_RE);
    if (m) {
      return { logged_in: true, account: m[0] };
    }
  }
  return { logged_in: false, account: null };
}

/**
 * 判断当前页面"是否可用"：
 *   - 不在前台 → false
 *   - 是登录引导页 → false
 *   - 看到了 Play Store 已知文案 → true
 *   - 都没匹配 → false（未知子页面，谨慎不给绿灯）
 */
function isReady(topActivity, nodes) {
  if (!isForeground(topActivity)) return false;
  if (isNeedsLoginPage(nodes)) return false;
  const texts = nodes.map((n) => n.text || n.content_desc).filter(Boolean);
  return PLAY_STORE_HINTS.some((h) => texts.some((t) => t.includes(h)));
}

// ─── deeplink ──────────────────────────────────────────────────

/**
 * 通过 Intent 打开一个 URI（market:// 或 https://play.google.com/...），
 * 强制由 Google Play Store 处理，避免被浏览器抢走。
 */
async function openInPlayStore(uri) {
  return pb.startActivity({
    action: 'android.intent.action.VIEW',
    data: uri,
    package_name: PACKAGE,
  });
}

// ─── UI helpers ────────────────────────────────────────────────

/**
 * 在节点集合里找第一个 clickable 且文本命中任一候选的节点。
 * 命中规则：完整等于 → startsWith → 包含（依次降级）。
 */
function findClickableByText(nodes, candidates) {
  const normalized = candidates.map((c) => c.toLowerCase());
  const clickable = nodes.filter((n) => n.clickable);
  for (const n of clickable) {
    const t = (n.text || '').toLowerCase();
    const d = (n.content_desc || '').toLowerCase();
    if (normalized.includes(t) || normalized.includes(d)) return n;
  }
  for (const n of clickable) {
    const t = (n.text || '').toLowerCase();
    const d = (n.content_desc || '').toLowerCase();
    if (normalized.some((c) => t.startsWith(c) || d.startsWith(c))) return n;
  }
  for (const n of clickable) {
    const t = (n.text || '').toLowerCase();
    const d = (n.content_desc || '').toLowerCase();
    if (normalized.some((c) => t.includes(c) || d.includes(c))) return n;
  }
  return null;
}

/**
 * 在详情页里抽出动作按钮（Install / Uninstall / Update / Open / Play / ...）。
 * 返回命中的文案数组。
 */
function extractActionButtons(nodes) {
  const seen = new Set();
  const out = [];
  for (const n of nodes) {
    const t = (n.text || '').trim();
    if (!t) continue;
    if (ACTION_BUTTON_WORDS.includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * 通过 pm 检查目标包是否已安装。
 */
async function isPackageInstalled(pkg) {
  const { stdout } = await pb.shell(`pm list packages ${pkg}`);
  if (!stdout) return false;
  return stdout.split('\n').some((l) => l.trim() === `package:${pkg}`);
}

// ─── IO helpers ───────────────────────────────────────────────

function finish(data, exitCode = 0) {
  console.log(JSON.stringify(data));
  process.exit(exitCode);
}

function fail(err, context) {
  const msg = err && err.message ? err.message : String(err);
  console.error(`googleplay/${context} failed: ${msg}`);
  process.exit(1);
}

module.exports = {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseScreenSize,
  isForeground,
  isNeedsLoginPage,
  isReady,
  detectLoginStatus,
  openInPlayStore,
  findClickableByText,
  extractActionButtons,
  isPackageInstalled,
  finish,
  fail,
};
