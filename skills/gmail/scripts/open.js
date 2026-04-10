/**
 * @description 启动 Gmail（纯启动）
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { PACKAGE, sleep, isForeground, finish, fail } = require('./_lib.js');

async function main() {
  await pb.launch(PACKAGE);
  // Gmail 在 ConversationListActivityGmail 和 MailActivityGmail 之间会切换，
  // 等 3 秒让 Activity 稳定。
  await sleep(3000);
  const top = await pb.topActivity();
  finish({
    top_activity: top,
    foreground: isForeground(top),
  });
}

main().catch((err) => fail(err, 'open'));
