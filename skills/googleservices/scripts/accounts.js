/**
 * @description 列出设备上所有 com.google 类型的账号（解析 dumpsys account）
 */

'use strict';

const { listGoogleAccounts, finish, fail } = require('./_lib.js');

async function main() {
  const accounts = await listGoogleAccounts();
  finish({
    accounts,
    count: accounts.length,
  });
}

main().catch((err) => fail(err, 'accounts'));
