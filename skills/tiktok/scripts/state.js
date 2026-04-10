/**
 * @description 查询 TikTok 当前页面状态（不启动，只 dump + 解析）
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const {
  parseVisibleNodes,
  isForeground,
  detectLoginPage,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const top = await pb.topActivity();
  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);
  const visible_texts = nodes
    .map((n) => n.text || n.content_desc)
    .filter(Boolean)
    .slice(0, 30);

  finish({
    top_activity: top,
    foreground: isForeground(top),
    logged_in: !detectLoginPage(top, nodes),
    visible_texts,
  });
}

main().catch((err) => fail(err, 'state'));
