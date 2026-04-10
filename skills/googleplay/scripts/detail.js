/**
 * @description 直接打开指定 App 的 Google Play 详情页（market://details deeplink）
 * @arg package:string! App 包名，例如 com.zhiliaoapp.musically
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  sleep,
  parseVisibleNodes,
  isForeground,
  isNeedsLoginPage,
  extractActionButtons,
  openInPlayStore,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const { values } = parseArgs({
    options: { package: { type: 'string' } },
  });
  const targetPkg = values.package;
  if (!targetPkg) {
    console.error('Error: --package required');
    process.exit(1);
  }

  const uri = `market://details?id=${encodeURIComponent(targetPkg)}`;
  await openInPlayStore(uri);
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`market:// 跳转后前台是 ${top.package_name}`),
      'detail',
    );
    return;
  }

  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);

  if (isNeedsLoginPage(nodes)) {
    return finish({
      package: targetPkg,
      logged_in: false,
      title: null,
      action_buttons: [],
    });
  }

  // App 标题：最靠顶部的非按钮文本
  const sortedByY = nodes
    .filter((n) => n.text && n.text.length > 1 && n.text.length < 60)
    .sort((a, b) => a.bounds[1] - b.bounds[1]);
  const title = sortedByY.length > 0 ? sortedByY[0].text : null;

  finish({
    package: targetPkg,
    logged_in: true,
    title,
    action_buttons: extractActionButtons(nodes),
    top_activity: top,
  });
}

main().catch((err) => fail(err, 'detail'));
