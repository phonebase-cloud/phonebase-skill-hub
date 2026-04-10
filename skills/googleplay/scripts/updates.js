/**
 * @description 打开「管理应用和设备 → 可用更新」页，启发式抽出待更新 App 名
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const {
  sleep,
  parseVisibleNodes,
  isForeground,
  isNeedsLoginPage,
  openInPlayStore,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  // 「管理应用和设备 → 更新」没有稳定 deeplink，
  // 但 https://play.google.com/store/myapps 通过 intent 会被 Play Store 劫持到正确页面。
  await openInPlayStore('https://play.google.com/store/myapps');
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`跳转后前台是 ${top.package_name}，可能被浏览器劫持`),
      'updates',
    );
    return;
  }

  const nodes = parseVisibleNodes(await pb.dumpc());
  if (isNeedsLoginPage(nodes)) {
    return finish({
      logged_in: false,
      pending_updates_guess: [],
    });
  }

  const SKIP = new Set([
    'Update', 'Update all', 'Install', 'Uninstall', 'Open',
    'Manage', 'Updates available', 'Recently updated', 'See details',
    'Apps', 'Games', 'Search apps & games',
  ]);

  const texts = nodes.map((n) => n.text).filter(Boolean);
  const candidates = [];
  const seen = new Set();
  for (const t of texts) {
    if (t.length < 3 || t.length > 60) continue;
    if (SKIP.has(t)) continue;
    if (/^\d+(\.\d+)?\s*(MB|KB|GB)$/i.test(t)) continue; // 更新大小
    if (/^\d+(\.\d+)?[MK]?\+?$/.test(t)) continue; // 下载数
    if (seen.has(t)) continue;
    seen.add(t);
    candidates.push(t);
    if (candidates.length >= 30) break;
  }

  finish({
    pending_updates_guess: candidates,
    note: '启发式抽取，可能包含非 App 名；最终以 UI 为准',
  });
}

main().catch((err) => fail(err, 'updates'));
