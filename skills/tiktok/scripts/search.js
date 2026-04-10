/**
 * @description 在 TikTok 内搜索关键词
 * @arg keyword:string! 搜索关键词
 *
 * 未登录时返回 `{logged_in: false, candidates: []}`，由调用方判断。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseClickableNodes,
  parseScreenSize,
  findTopRightIcon,
  detectLoginPage,
  dismissGoogleSignIn,
  clearFocusedField,
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

  // 1. 确保 TikTok 在前台
  let top = await pb.topActivity();
  if (top.package_name !== PACKAGE) {
    await pb.launch(PACKAGE);
    await sleep(2500);
    top = await dismissGoogleSignIn();
    await sleep(500);
    top = await pb.topActivity();
  }

  if (top.package_name !== PACKAGE) {
    fail(new Error(`TikTok 未进入前台，当前 ${top.package_name}`), 'search');
    return;
  }

  // 2. 检测登录状态
  let dumpStr = await pb.dumpc();
  let nodes = parseVisibleNodes(dumpStr);
  if (detectLoginPage(top, nodes)) {
    return finish({
      keyword,
      logged_in: false,
      candidates: [],
      hint: 'TikTok 需先登录后才能搜索',
    });
  }

  // 3. 找搜索入口。优先按 text/content-desc 匹配，其次按"右上角 clickable 图标"
  //    （TikTok 主页搜索图标是 NAF ImageView，没有 text/desc）。
  let searchIcon = nodes.find(
    (n) => n.content_desc === 'Search' || n.text === 'Search',
  );
  if (!searchIcon) {
    const clickables = parseClickableNodes(dumpStr);
    const screen = parseScreenSize(dumpStr);
    searchIcon = findTopRightIcon(clickables, screen);
  }
  if (!searchIcon) {
    fail(
      new Error('当前页面没找到搜索入口（NAF 右上角图标也没识别到）'),
      'search',
    );
    return;
  }

  await pb.tap(searchIcon.center[0], searchIcon.center[1]);
  await sleep(1500);

  // 4. 清空旧的关键词（防止重复调用追加），再输入新关键词 + 回车
  //    第二次 search 时如果不清空，新关键词会被拼到旧的后面
  await clearFocusedField();
  await pb.input(keyword);
  await sleep(600);
  await pb.keyevent('ENTER');
  await sleep(2500);

  // 5. 抓结果页
  dumpStr = await pb.dumpc();
  nodes = parseVisibleNodes(dumpStr);
  const finalActivity = await pb.topActivity();

  // 6. 简单抽取「候选标题」：较长 text，排除常见按钮文案
  const BUTTON_WORDS = new Set([
    'Top', 'Users', 'Videos', 'Sounds', 'LIVE', 'Hashtags',
    'Cancel', 'Search', 'Filters',
  ]);
  const candidates = nodes
    .filter((n) => n.text && n.text.length > 5 && !BUTTON_WORDS.has(n.text))
    .slice(0, 20)
    .map((n) => ({ text: n.text, bounds: n.bounds }));

  finish({
    keyword,
    logged_in: true,
    top_activity: finalActivity,
    candidates,
  });
}

main().catch((err) => fail(err, 'search'));
