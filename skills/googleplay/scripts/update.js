/**
 * @description 更新指定 App：打开详情页，如果有 Update 按钮就点，否则返回 up_to_date: true
 * @arg package:string! 目标 App 包名
 * @arg wait:int=90 最长等待多少秒直到更新完成
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
  findClickableByText,
  openInPlayStore,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  const { values } = parseArgs({
    options: {
      package: { type: 'string' },
      wait: { type: 'string' },
    },
  });
  const targetPkg = values.package;
  if (!targetPkg) {
    console.error('Error: --package required');
    process.exit(1);
  }
  const waitSec = parseInt(values.wait || '90', 10);

  await openInPlayStore(`market://details?id=${encodeURIComponent(targetPkg)}`);
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(new Error(`market:// 跳转后前台是 ${top.package_name}`), 'update');
    return;
  }

  let nodes = parseVisibleNodes(await pb.dumpc());
  if (isNeedsLoginPage(nodes)) {
    return finish({
      package: targetPkg,
      logged_in: false,
      up_to_date: false,
    });
  }

  const buttons = extractActionButtons(nodes);
  if (!buttons.includes('Update')) {
    return finish({
      package: targetPkg,
      up_to_date: true,
      action_buttons: buttons,
    });
  }

  const updateBtn = findClickableByText(nodes, ['Update']);
  if (!updateBtn) {
    fail(
      new Error(
        `按钮文本里有 Update 但 findClickable 找不到节点：${JSON.stringify(buttons)}`,
      ),
      'update',
    );
    return;
  }
  await pb.tap(updateBtn.center[0], updateBtn.center[1]);
  await sleep(2000);

  // 轮询：详情页 Update 变成 Open
  const deadline = Date.now() + waitSec * 1000;
  while (Date.now() < deadline) {
    nodes = parseVisibleNodes(await pb.dumpc());
    const btns = extractActionButtons(nodes);
    if (btns.includes('Open') && !btns.includes('Update')) {
      return finish({
        package: targetPkg,
        up_to_date: true,
        action_buttons: btns,
      });
    }
    await sleep(2000);
  }

  finish({
    package: targetPkg,
    up_to_date: false,
    timed_out: true,
    waited_sec: waitSec,
  });
}

main().catch((err) => fail(err, 'update'));
