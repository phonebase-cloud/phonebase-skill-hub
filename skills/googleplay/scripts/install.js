/**
 * @description 通过 Play Store 安装一个 App：打开详情页 → 点 Install → 等待完成（需要登录）
 * @arg package:string! 目标 App 包名
 * @arg wait:int=60 最长等待多少秒直到安装完成（出现 Open 按钮或系统能解析出该包）
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
  const waitSec = parseInt(values.wait || '60', 10);

  // 1. 已安装直接返回
  if (await isPackageInstalled(targetPkg)) {
    return finish({
      package: targetPkg,
      installed: true,
      was_already_installed: true,
    });
  }

  // 2. 打开详情页
  await openInPlayStore(`market://details?id=${encodeURIComponent(targetPkg)}`);
  await sleep(2500);

  let top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`market:// 跳转后前台是 ${top.package_name}`),
      'install',
    );
    return;
  }

  let nodes = parseVisibleNodes(await pb.dumpc());
  if (isNeedsLoginPage(nodes)) {
    return finish({
      package: targetPkg,
      installed: false,
      logged_in: false,
      hint: '设备未登录 Google 账号，先跑 `pb googleservices login`',
    });
  }

  // 3. 找 Install 按钮
  const buttons = extractActionButtons(nodes);
  if (buttons.includes('Open') || buttons.includes('Play')) {
    return finish({
      package: targetPkg,
      installed: true,
      was_already_installed: true,
      action_buttons: buttons,
    });
  }
  const installBtn = findClickableByText(nodes, ['Install']);
  if (!installBtn) {
    fail(
      new Error(
        `详情页没找到 Install 按钮，action_buttons=${JSON.stringify(buttons)}`,
      ),
      'install',
    );
    return;
  }

  await pb.tap(installBtn.center[0], installBtn.center[1]);
  await sleep(2000);

  // 4. 偶尔弹的二次确认 / 年龄 / 订阅
  for (let i = 0; i < 3; i++) {
    nodes = parseVisibleNodes(await pb.dumpc());
    const dismiss = findClickableByText(nodes, [
      'Accept', 'Agree', 'Got it', 'OK', 'Continue', 'Install anyway',
    ]);
    if (!dismiss) break;
    await pb.tap(dismiss.center[0], dismiss.center[1]);
    await sleep(1500);
  }

  // 5. 轮询：直到 pm list 看到该包，或详情页出现 Open 按钮
  const deadline = Date.now() + waitSec * 1000;
  while (Date.now() < deadline) {
    if (await isPackageInstalled(targetPkg)) {
      return finish({
        package: targetPkg,
        installed: true,
      });
    }
    nodes = parseVisibleNodes(await pb.dumpc());
    const btns = extractActionButtons(nodes);
    if (btns.includes('Open') || btns.includes('Play')) {
      return finish({
        package: targetPkg,
        installed: true,
        action_buttons: btns,
      });
    }
    await sleep(2000);
  }

  finish({
    package: targetPkg,
    installed: false,
    timed_out: true,
    waited_sec: waitSec,
    action_buttons: extractActionButtons(parseVisibleNodes(await pb.dumpc())),
  });
}

main().catch((err) => fail(err, 'install'));
