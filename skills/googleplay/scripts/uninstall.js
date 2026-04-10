/**
 * @description 通过 Play Store 卸载一个 App：打开详情页 → 点 Uninstall → 确认
 * @arg package:string! 目标 App 包名
 * @arg wait:int=30 最长等待多少秒直到系统识别该包已卸载
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  sleep,
  parseVisibleNodes,
  isForeground,
  extractActionButtons,
  findClickableByText,
  openInPlayStore,
  isPackageInstalled,
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
  const waitSec = parseInt(values.wait || '30', 10);

  if (!(await isPackageInstalled(targetPkg))) {
    return finish({
      package: targetPkg,
      installed: false,
      was_not_installed: true,
    });
  }

  await openInPlayStore(`market://details?id=${encodeURIComponent(targetPkg)}`);
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`market:// 跳转后前台是 ${top.package_name}`),
      'uninstall',
    );
    return;
  }

  let nodes = parseVisibleNodes(await pb.dumpc());
  const uninstallBtn = findClickableByText(nodes, ['Uninstall']);
  if (!uninstallBtn) {
    fail(
      new Error(
        `详情页没找到 Uninstall 按钮，action_buttons=${JSON.stringify(
          extractActionButtons(nodes),
        )}`,
      ),
      'uninstall',
    );
    return;
  }
  await pb.tap(uninstallBtn.center[0], uninstallBtn.center[1]);
  await sleep(1500);

  // 确认对话框
  nodes = parseVisibleNodes(await pb.dumpc());
  const confirmBtn = findClickableByText(nodes, [
    'Uninstall', 'UNINSTALL', 'OK', '卸载', '确定',
  ]);
  if (confirmBtn) {
    await pb.tap(confirmBtn.center[0], confirmBtn.center[1]);
    await sleep(1500);
  }

  // 轮询：直到 pm list 看不到该包
  const deadline = Date.now() + waitSec * 1000;
  while (Date.now() < deadline) {
    if (!(await isPackageInstalled(targetPkg))) {
      return finish({
        package: targetPkg,
        installed: false,
      });
    }
    await sleep(1500);
  }

  finish({
    package: targetPkg,
    installed: true,
    timed_out: true,
    waited_sec: waitSec,
  });
}

main().catch((err) => fail(err, 'uninstall'));
