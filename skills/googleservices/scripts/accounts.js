/**
 * @description 列出设备上所有 com.google 账号,含登录态 / 默认账号等高层字段
 */

'use strict';

const { listGoogleAccounts, finish, fail } = require('./_lib.js');

async function main() {
  const accounts = await listGoogleAccounts();
  finish({
    logged_in: accounts.length > 0,
    count: accounts.length,
    default_account: accounts[0] ? accounts[0].name : null,
    accounts,
  });
}

main().catch((err) => fail(err, 'accounts'));
