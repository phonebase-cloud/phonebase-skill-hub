/**
 * @description 用 market://search deeplink 在 Play Store 里搜索 App
 * @arg keyword:string! 搜索关键词
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
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
  const { values } = parseArgs({
    options: { keyword: { type: 'string' } },
  });
  const keyword = values.keyword;
  if (!keyword) {
    console.error('Error: --keyword required');
    process.exit(1);
  }

  // market://search?q=<keyword>&c=apps 直接送到搜索结果页，不需要模拟点击
  const uri = `market://search?q=${encodeURIComponent(keyword)}&c=apps`;
  await openInPlayStore(uri);
  await sleep(2500);

  const top = await pb.topActivity();
  if (!isForeground(top)) {
    fail(
      new Error(`market:// 跳转后前台是 ${top.package_name}，不是 Play Store`),
      'search',
    );
    return;
  }

  const dumpStr = await pb.dumpc();
  const nodes = parseVisibleNodes(dumpStr);

  if (isNeedsLoginPage(nodes)) {
    return finish({
      keyword,
      logged_in: false,
      candidates: [],
      hint: '搜索结果页被登录引导拦截',
    });
  }

  // 抽出候选 App 名：排除典型按钮 / 分类文案，保留 text 长度 > 2 的
  const BUTTON_WORDS = new Set([
    'Install', 'Uninstall', 'Update', 'Open',
    'Apps', 'Games', 'Movies', 'Books',
    'Search', 'More', 'Cancel', 'Filter', 'Sort',
  ]);
  const seen = new Set();
  const candidates = [];
  for (const n of nodes) {
    const t = (n.text || n.content_desc || '').trim();
    if (t.length < 3) continue;
    if (BUTTON_WORDS.has(t)) continue;
    if (/^\d+(\.\d+)?[MK]?$/.test(t)) continue; // 评分 / 下载数
    if (seen.has(t)) continue;
    seen.add(t);
    candidates.push(t);
    if (candidates.length >= 20) break;
  }

  finish({
    keyword,
    logged_in: true,
    top_activity: top,
    candidates,
  });
}

main().catch((err) => fail(err, 'search'));
