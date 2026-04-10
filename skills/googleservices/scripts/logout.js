/**
 * @description 移除指定 Google 账号；不带 --email 时只打开账号设置页
 * @arg email:string 要移除的 Google 账号邮箱（不传只打开设置页）
 * @arg wait:int=15 点 Remove account 后多少秒内轮询 dumpsys account 确认账号被移除
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  sleep,
  listGoogleAccounts,
  openAccountSettings,
  finish,
  fail,
} = require('./_lib.js');

/** dumpc 一帧，按文案找 clickable 节点。 */
async function findClickableText(candidates) {
  const dumpStr = await pb.dumpc();
  const lines = dumpStr.split('\n');
  for (const line of lines) {
    if (!/\bclickable=true\b/.test(line)) continue;
    const tm = line.match(/\btext="([^"]*)"/);
    const dm = line.match(/content-desc="([^"]*)"/);
    const t = tm ? tm[1] : '';
    const d = dm ? dm[1] : '';
    for (const c of candidates) {
      if (t === c || d === c || t.startsWith(c) || d.startsWith(c)) {
        const bm = line.match(/bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        if (!bm) continue;
        const [x1, y1, x2, y2] = bm.slice(1, 5).map((v) => parseInt(v, 10));
        return {
          text: t || d,
          center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
        };
      }
    }
  }
  return null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      wait: { type: 'string' },
    },
  });
  const email = values.email || null;
  const waitSec = parseInt(values.wait || '15', 10);

  const before = await listGoogleAccounts();
  if (before.length === 0) {
    return finish({
      logged_in: false,
      already_logged_out: true,
      accounts: [],
    });
  }

  // 不带 --email：只打开设置页
  if (!email) {
    await openAccountSettings();
    await sleep(2000);
    return finish({
      logged_in: true,
      page_opened: true,
      accounts: before,
      hint: '已打开系统账号设置页；要自动移除请加 --email <gmail>',
    });
  }

  if (!before.some((a) => a.name === email)) {
    fail(
      new Error(`设备上没有账号 ${email}（现有：${before.map((a) => a.name).join(', ')}）`),
      'logout',
    );
    return;
  }

  // 1. 打开账号设置页
  await openAccountSettings();
  await sleep(2500);

  // 2. 找到 email 那一行点进去
  const emailRow = await findClickableText([email]);
  if (!emailRow) {
    fail(
      new Error(`账号设置页里找不到 ${email} 的可点击行`),
      'logout',
    );
    return;
  }
  await pb.tap(emailRow.center[0], emailRow.center[1]);
  await sleep(2500);

  // 3. 找 Remove account
  const removeBtn = await findClickableText([
    'Remove account', 'REMOVE ACCOUNT', '移除账号', '移除帐号',
  ]);
  if (!removeBtn) {
    fail(
      new Error('账号详情页找不到 Remove account 按钮'),
      'logout',
    );
    return;
  }
  await pb.tap(removeBtn.center[0], removeBtn.center[1]);
  await sleep(1500);

  // 4. 确认对话框
  const confirmBtn = await findClickableText([
    'REMOVE ACCOUNT', 'Remove account', 'Remove', '移除账号', '移除', 'OK', '确定',
  ]);
  if (confirmBtn) {
    await pb.tap(confirmBtn.center[0], confirmBtn.center[1]);
    await sleep(2500);
  }

  // 5. 轮询确认账号被移除
  const deadline = Date.now() + waitSec * 1000;
  let after = before;
  while (Date.now() < deadline) {
    after = await listGoogleAccounts();
    if (!after.some((a) => a.name === email)) {
      return finish({
        email,
        logged_in: after.length > 0,
        accounts: after,
      });
    }
    await sleep(1000);
  }

  finish({
    email,
    logged_in: true,
    timed_out: true,
    waited_sec: waitSec,
    accounts: after,
    hint: `等待 ${waitSec}s 后 ${email} 仍在 dumpsys account 里`,
  });
}

main().catch((err) => fail(err, 'logout'));
