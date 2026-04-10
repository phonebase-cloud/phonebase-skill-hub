/**
 * @description 查询 Google 账号高层登录态：是否已登录 / 账号数 / 默认账号 / 账号列表
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

main().catch((err) => fail(err, 'status'));
