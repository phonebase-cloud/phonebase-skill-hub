/**
 * @description 写邮件 —— 用 mailto deeplink 预填 to/subject/body，可选自动点发送
 * @arg to:string! 收件人邮箱
 * @arg subject:string 主题
 * @arg body:string 正文
 * @arg send:string 传 "true" 时自动点 Send；默认只打开草稿页
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  isForeground,
  findClickableByText,
  finish,
  fail,
} = require('./_lib.js');

function buildMailto({ to, subject, body }) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const qs = params.length > 0 ? `?${params.join('&')}` : '';
  return `mailto:${encodeURIComponent(to)}${qs}`;
}

/**
 * 判断当前页面是否是 Gmail 的 compose 页。
 * 特征：resource-id=":id/compose_area_layout" / ":id/subject_content" / ":id/wc_body_layout"。
 */
function isComposePage(dumpStr) {
  if (typeof dumpStr !== 'string') return false;
  return (
    dumpStr.includes(':id/compose_area_layout') ||
    dumpStr.includes(':id/subject_content') ||
    dumpStr.includes(':id/wc_body_layout')
  );
}

function findSendButton(nodes) {
  for (const n of nodes) {
    if (!n.clickable) continue;
    const rid = n.resource_id || '';
    if (rid.endsWith(':id/send')) return n;
  }
  return findClickableByText(nodes, ['Send', 'SEND', '发送']);
}

async function main() {
  const { values } = parseArgs({
    options: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      send: { type: 'string' },
    },
  });
  const to = values.to;
  const subject = values.subject || null;
  const body = values.body || null;
  const doSend = /^(1|true|yes|y)$/i.test(values.send || '');

  if (!to) {
    console.error('Error: --to required');
    process.exit(1);
  }

  // 1. 用 mailto deeplink 拉起 Gmail compose
  const uri = buildMailto({ to, subject, body });
  await pb.startActivity({
    action: 'android.intent.action.SENDTO',
    data: uri,
    package_name: PACKAGE,
  });
  await sleep(3500);

  // 2. 验证 compose 页已打开
  let top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`mailto 跳转后前台是 ${top.package_name}`),
      'compose',
    );
    return;
  }

  let dumpStr = await pb.dumpc();
  if (!isComposePage(dumpStr)) {
    fail(new Error('mailto 跳转后没进入 Gmail compose 页'), 'compose');
    return;
  }

  if (!doSend) {
    return finish({
      to,
      subject,
      body,
      sent: false,
      draft_opened: true,
    });
  }

  // 3. --send：点 Send 按钮
  const nodes = parseVisibleNodes(dumpStr);
  const sendBtn = findSendButton(nodes);
  if (!sendBtn) {
    fail(new Error('compose 页上没找到 Send 按钮'), 'compose');
    return;
  }
  await pb.tap(sendBtn.center[0], sendBtn.center[1]);
  await sleep(3000);

  // 4. 确认退出 compose 页（Gmail 发送后会返回原页面）
  dumpStr = await pb.dumpc();
  const stillComposing = isComposePage(dumpStr);
  if (stillComposing) {
    fail(
      new Error('点了 Send 之后仍在 compose 页，可能发送失败'),
      'compose',
    );
    return;
  }

  finish({
    to,
    subject,
    body,
    sent: true,
    draft_opened: false,
  });
}

main().catch((err) => fail(err, 'compose'));
