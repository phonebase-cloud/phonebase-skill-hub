/**
 * @description 查询 Play Store 当前页面状态（不启动，只 dump + 解析）
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const {
  parseVisibleNodes,
  isForeground,
  isReady,
  detectLoginStatus,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const top = await pb.topActivity();
  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);
  const login = detectLoginStatus(nodes);

  finish({
    top_activity: top,
    foreground: isForeground(top),
    ready: isReady(top, nodes),
    logged_in: login.logged_in,
    account: login.account,
    visible_texts: nodes
      .map((n) => n.text || n.content_desc)
      .filter(Boolean)
      .slice(0, 30),
  });
}

main().catch((err) => fail(err, 'state'));
