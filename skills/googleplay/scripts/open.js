/**
 * @description 启动 Google Play Store（纯启动）
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { PACKAGE, sleep, isForeground, finish, fail } = require('./_lib.js');

async function main() {
  await pb.launch(PACKAGE);
  await sleep(2500);
  const top = await pb.topActivity();
  finish({
    top_activity: top,
    foreground: isForeground(top),
  });
}

main().catch((err) => fail(err, 'open'));
