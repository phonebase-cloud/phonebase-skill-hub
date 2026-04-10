/**
 * @description 强制停止 Gmail
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { PACKAGE, finish, fail } = require('./_lib.js');

async function main() {
  await pb.forceStop(PACKAGE);
  const top = await pb.topActivity();
  finish({ top_activity: top });
}

main().catch((err) => fail(err, 'close'));
