/**
 * Gmail skill 内部共享工具。
 *
 * 输出规范：
 *   每个命令脚本的 stdout **直接**是业务 data，pb 的输出层会包成
 *   `{code, data, msg}` 信封。**不要**在 data 里加 `status` 字段。
 *   观测态用 boolean / 子对象表达。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');

// ─── 常量 ─────────────────────────────────────────────────────

const PACKAGE = 'com.google.android.gm';

/** Gmail 首页 / 搜索页 / 详情页常见关键文案。 */
const GMAIL_HINTS = [
  'Search in mail',
  'Primary',
  'Inbox',
  'Compose',
  'Snoozed',
  'Sent',
  'Drafts',
  'All mail',
  'Starred',
  'Important',
];

/** 精准的"需要登录"文案（不放宽泛词）。 */
const NEEDS_LOGIN_HINTS = [
  'Add an email address',
  'Add another email address',
  "You'll need a Google Account",
  'Sign in to your Google Account',
  'Choose an account',
  'Use another account',
  'Add a Google Account',
  'Add account',
  'Sign in',
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
    const ridMatch = line.match(/resource-id="([^"]*)"/);

    nodes.push({
      text,
      content_desc: desc,
      resource_id: ridMatch ? ridMatch[1] : '',
      bounds: [x1, y1, x2, y2],
      center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
      width: x2 - x1,
      height: y2 - y1,
      clickable: /\bclickable=true\b/.test(line),
    });
  }
  return nodes;
}

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

function parseScreenSize(dumpStr) {
  if (typeof dumpStr !== 'string') return null;
  const m = dumpStr.match(/Screen (\d+)x(\d+)/);
  return m ? { width: parseInt(m[1], 10), height: parseInt(m[2], 10) } : null;
}

// ─── 业务判断 ──────────────────────────────────────────────────

function isForeground(topActivity) {
  return ((topActivity && topActivity.package_name) || '') === PACKAGE;
}

function isNeedsLoginPage(nodes) {
  return nodes.some((n) => {
    const t = n.text || '';
    const d = n.content_desc || '';
    return NEEDS_LOGIN_HINTS.some(
      (h) => t === h || d === h || t.startsWith(h) || d.startsWith(h),
    );
  });
}

function isReady(topActivity, nodes) {
  if (!isForeground(topActivity)) return false;
  if (isNeedsLoginPage(nodes)) return false;
  const texts = nodes.map((n) => n.text || n.content_desc).filter(Boolean);
  return GMAIL_HINTS.some((h) => texts.some((t) => t.includes(h)));
}

/**
 * 从 dumpc 节点抽出 Gmail 当前登录账号（看右上角头像 content-desc）。
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
    if (m) return { logged_in: true, account: m[0] };
  }
  return { logged_in: false, account: null };
}

// ─── 收件箱 / 会话解析 ─────────────────────────────────────────

/**
 * 在收件箱列表里解析所有可见的会话条目。
 *
 * 每条 item 的核心节点是 `resource-id=":id/viewified_conversation_item_view"`。
 * 之后出现的 senders/subject/snippet/date 子节点归属到最后一个 item，
 * 直到遇到下一个 item view。
 *
 * 返回 [{index, sender, subject, snippet, date, unread, bounds, center}]
 */
function parseInboxItems(dumpStr) {
  if (typeof dumpStr !== 'string') return [];
  const items = [];
  const lines = dumpStr.split('\n');

  let currentItem = null;
  let lastParentText = '';
  let linesSinceParent = 0;

  for (const line of lines) {
    const textMatch = line.match(/\btext="([^"]*)"/);
    if (textMatch && !line.includes('resource-id=')) {
      lastParentText = textMatch[1];
      linesSinceParent = 0;
    } else {
      linesSinceParent++;
    }

    if (line.includes('resource-id="com.google.android.gm:id/viewified_conversation_item_view"')) {
      if (currentItem && currentItem.sender && currentItem.subject) {
        items.push(currentItem);
      }
      const boundsMatch = line.match(/bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      let bounds = null, center = null;
      if (boundsMatch) {
        const [x1, y1, x2, y2] = boundsMatch.slice(1, 5).map((v) => parseInt(v, 10));
        bounds = [x1, y1, x2, y2];
        center = [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)];
      }
      const unread = linesSinceParent < 5 && /(^|,|\s)Unread\b/.test(lastParentText);
      currentItem = {
        index: items.length,
        sender: '',
        subject: '',
        snippet: '',
        date: '',
        unread,
        bounds,
        center,
      };
      continue;
    }

    if (!currentItem) continue;

    const ridMatch = line.match(/resource-id="([^"]*)"/);
    if (!ridMatch) continue;
    const rid = ridMatch[1];
    const fieldTextMatch = line.match(/\btext="([^"]*)"/);
    if (!fieldTextMatch) continue;
    const text = fieldTextMatch[1];

    if (rid.endsWith(':id/senders')) currentItem.sender = text;
    else if (rid.endsWith(':id/subject') && !rid.includes('subject_and_folder_view')) currentItem.subject = text;
    else if (rid.endsWith(':id/snippet')) currentItem.snippet = text;
    else if (rid.endsWith(':id/date')) currentItem.date = text;
  }
  if (currentItem && currentItem.sender && currentItem.subject) items.push(currentItem);
  items.forEach((it, i) => { it.index = i; });
  return items;
}

/**
 * 从 dumpc 抽出会话详情页的 header 信息。
 * 详情页特征：出现 `resource-id=".../subject_and_folder_view"`。
 */
function parseConversationHeader(dumpStr) {
  if (typeof dumpStr !== 'string') return null;
  const out = { subject: '', sender: '', date: '', recipient_summary: '' };
  let seen = false;
  for (const line of dumpStr.split('\n')) {
    const ridMatch = line.match(/resource-id="([^"]*)"/);
    const textMatch = line.match(/\btext="([^"]*)"/);
    if (!ridMatch || !textMatch) continue;
    const rid = ridMatch[1];
    const text = textMatch[1];
    if (rid.endsWith(':id/subject_and_folder_view')) { out.subject = text; seen = true; }
    else if (rid.endsWith(':id/sender_name')) { out.sender = text; seen = true; }
    else if (rid.endsWith(':id/upper_date')) { out.date = text; seen = true; }
    else if (rid.endsWith(':id/recipient_summary')) { out.recipient_summary = text; seen = true; }
  }
  return seen ? out : null;
}

// ─── UI helpers ────────────────────────────────────────────────

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
 * 清空当前焦点输入框：MOVE_END 把光标移到末尾，再连续 DEL 直到空。
 *
 * 用于"二次调用同一个搜索/输入命令"场景：之前的输入还残留在框里，
 * 新文本会被追加而不是替换。`pb.input` 不会自动清空，必须显式做。
 */
async function clearFocusedField(maxChars = 200) {
  await pb.shell('input keyevent KEYCODE_MOVE_END');
  await sleep(150);
  await pb.shell(
    `for i in $(seq 1 ${maxChars}); do input keyevent KEYCODE_DEL; done`,
  );
  await sleep(300);
}

/**
 * 通过 Intent 打开一个 URI，强制由 Gmail 处理。
 */
async function openInGmail(uri, action = 'android.intent.action.VIEW') {
  return pb.startActivity({
    action,
    data: uri,
    package_name: PACKAGE,
  });
}

// ─── IO helpers ───────────────────────────────────────────────

function finish(data, exitCode = 0) {
  console.log(JSON.stringify(data));
  process.exit(exitCode);
}

function fail(err, context) {
  const msg = err && err.message ? err.message : String(err);
  console.error(`gmail/${context} failed: ${msg}`);
  process.exit(1);
}

module.exports = {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseClickableNodes,
  parseScreenSize,
  isForeground,
  isNeedsLoginPage,
  isReady,
  detectLoginStatus,
  parseInboxItems,
  parseConversationHeader,
  findClickableByText,
  clearFocusedField,
  openInGmail,
  finish,
  fail,
};
