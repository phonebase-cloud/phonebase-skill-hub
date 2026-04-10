/**
 * @description 列出收件箱当前可见的邮件（发件人、主题、预览、时间）
 * @arg limit:int=20 最多返回几条
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseInboxItems,
  isForeground,
  isNeedsLoginPage,
  detectLoginStatus,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const { values } = parseArgs({ options: { limit: { type: 'string' } } });
  const limit = parseInt(values.limit || '20', 10);

  // 1. 确保 Gmail 在前台
  let top = await pb.topActivity();
  if (!isForeground(top)) {
    await pb.launch(PACKAGE);
    await sleep(3000);
    top = await pb.topActivity();
    if (!isForeground(top)) {
      fail(new Error(`Gmail 启动后前台是 ${top.package_name}`), 'inbox');
      return;
    }
  }

  // 2. 抓一页 dump
  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);

  if (isNeedsLoginPage(nodes)) {
    return finish({
      logged_in: false,
      items: [],
      count: 0,
      hint: 'Gmail 当前是登录引导页，先跑 `pb googleservices login`',
    });
  }

  // 3. 抽会话列表
  const items = parseInboxItems(dumpStr);
  const sliced = items.slice(0, limit);
  const login = detectLoginStatus(nodes);

  finish({
    logged_in: login.logged_in,
    account: login.account,
    count: sliced.length,
    items: sliced.map((it) => ({
      index: it.index,
      sender: it.sender,
      subject: it.subject,
      snippet: it.snippet,
      date: it.date,
      unread: it.unread,
    })),
  });
}

main().catch((err) => fail(err, 'inbox'));
