/**
 * @description 打开 Play Store 的「管理应用和设备」主页
 *
 * 这个命令本身只负责导航，不做 introspection。要看页面内容请用 state；
 * 要解析待更新列表请用 updates。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { sleep, isForeground, openInPlayStore, finish, fail } = require('./_lib.js');

async function main() {
  await openInPlayStore('https://play.google.com/store/myapps');
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(new Error(`跳转后前台是 ${top.package_name}`), 'my_apps');
    return;
  }
  finish({ top_activity: top });
}

main().catch((err) => fail(err, 'my_apps'));
