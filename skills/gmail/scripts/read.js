/**
 * @description 打开指定邮件：按 index（从 0 开始）或按 subject 关键词匹配
 * @arg index:int 列表中第几条邮件（从 0 开始）
 * @arg subject:string 按主题关键词（不区分大小写）匹配第一封
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseInboxItems,
  parseConversationHeader,
  isForeground,
  isNeedsLoginPage,
  detectLoginStatus,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const { values } = parseArgs({
    options: { index: { type: 'string' }, subject: { type: 'string' } },
  });
  const index = values.index != null ? parseInt(values.index, 10) : null;
  const subjectKw = values.subject || null;
  if (index == null && !subjectKw) {
    console.error('Error: --index 或 --subject 至少要指定一个');
    process.exit(1);
  }

  // 1. 确保 Gmail 在前台
  let top = await pb.topActivity();
  if (!isForeground(top)) {
    await pb.launch(PACKAGE);
    await sleep(3000);
    top = await pb.topActivity();
    if (!isForeground(top)) {
      fail(new Error(`Gmail 启动后前台是 ${top.package_name}`), 'read');
      return;
    }
  }

  // 2. 登录拦截检查
  let dumpStr = await pb.dumpc();
  let nodes = parseVisibleNodes(dumpStr);
  if (isNeedsLoginPage(nodes)) {
    return finish({
      logged_in: false,
      target: null,
      header: null,
    });
  }

  // 3. 解析当前列表
  const items = parseInboxItems(dumpStr);
  if (items.length === 0) {
    fail(new Error('当前页面没抽到任何会话条目'), 'read');
    return;
  }

  // 4. 选目标
  let target = null;
  if (index != null) {
    if (index < 0 || index >= items.length) {
      fail(
        new Error(`index=${index} 超出范围，当前只有 ${items.length} 条`),
        'read',
      );
      return;
    }
    target = items[index];
  } else {
    const kw = subjectKw.toLowerCase();
    target = items.find((it) => (it.subject || '').toLowerCase().includes(kw));
    if (!target) {
      fail(
        new Error(`没有主题包含 "${subjectKw}" 的邮件（共 ${items.length} 条）`),
        'read',
      );
      return;
    }
  }

  // 5. tap + 等待 conversation_header 出现
  if (!target.center) {
    fail(new Error('目标条目没有有效坐标'), 'read');
    return;
  }
  await pb.tap(target.center[0], target.center[1]);
  await sleep(2500);

  // 轮询最多 6 秒等待详情页渲染
  let header = null;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    dumpStr = await pb.dumpc();
    header = parseConversationHeader(dumpStr);
    if (header && header.subject) break;
    await sleep(600);
  }

  if (!header || !header.subject) {
    fail(
      new Error('点击后详情页没出现，可能列表 tap 没命中'),
      'read',
    );
    return;
  }

  const login = detectLoginStatus(parseVisibleNodes(dumpStr));

  finish({
    logged_in: login.logged_in,
    account: login.account,
    target: {
      index: target.index,
      sender: target.sender,
      subject: target.subject,
      snippet: target.snippet,
      date: target.date,
    },
    header,
  });
}

main().catch((err) => fail(err, 'read'));
