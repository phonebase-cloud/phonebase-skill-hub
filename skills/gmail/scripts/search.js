/**
 * @description 在 Gmail 里搜索邮件（点搜索框 → 清空旧值 → 输入关键词 → Enter）
 * @arg keyword:string! 搜索关键词
 * @arg limit:int=20 最多返回几条结果
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  PACKAGE,
  sleep,
  parseVisibleNodes,
  parseInboxItems,
  isForeground,
  isNeedsLoginPage,
  detectLoginStatus,
  clearFocusedField,
  finish,
  fail,
} = require('./_lib.js');

/**
 * 在当前 dump 里找到 Gmail 顶部的搜索框。
 * 判据：resource-id 以 :id/open_search 结尾，或 text/content-desc 包含 "Search in mail"。
 */
function findSearchBar(nodes) {
  for (const n of nodes) {
    if (n.resource_id && n.resource_id.endsWith(':id/open_search')) return n;
  }
  for (const n of nodes) {
    const s = `${n.text || ''} ${n.content_desc || ''}`.toLowerCase();
    if (s.includes('search in mail')) return n;
  }
  return null;
}

async function main() {
  const { values } = parseArgs({
    options: { keyword: { type: 'string' }, limit: { type: 'string' } },
  });
  const keyword = values.keyword;
  const limit = parseInt(values.limit || '20', 10);
  if (!keyword) {
    console.error('Error: --keyword required');
    process.exit(1);
  }

  // 1. 确保 Gmail 在前台
  let top = await pb.topActivity();
  if (!isForeground(top)) {
    await pb.launch(PACKAGE);
    await sleep(3000);
    top = await pb.topActivity();
    if (!isForeground(top)) {
      fail(new Error(`Gmail 启动后前台是 ${top.package_name}`), 'search');
      return;
    }
  }

  // 2. 登录拦截检查
  let dumpStr = await pb.dumpc();
  let nodes = parseVisibleNodes(dumpStr);
  if (isNeedsLoginPage(nodes)) {
    return finish({
      keyword,
      logged_in: false,
      items: [],
      count: 0,
    });
  }

  // 3. 找搜索框并点击
  const searchBar = findSearchBar(nodes);
  if (!searchBar) {
    fail(new Error('Gmail 顶部搜索框找不到，可能处于子页面'), 'search');
    return;
  }
  await pb.tap(searchBar.center[0], searchBar.center[1]);
  await sleep(1500);

  // 4. 清空旧关键词（防止重复调用追加），再输入新的 + 回车
  //    第二次调用 search 时如果不清空，新关键词会被拼到旧的后面
  await clearFocusedField();
  await pb.input(keyword);
  await sleep(500);
  await pb.keyevent('ENTER');
  await sleep(3000);

  // 5. 关掉可能弹出的 "Sort results" tooltip
  dumpStr = await pb.dumpc();
  nodes = parseVisibleNodes(dumpStr);
  const tooltipBtn = nodes.find((n) => {
    if (!n.clickable) return false;
    const rid = n.resource_id || '';
    return rid.endsWith(':id/education_tooltip_cta') || /^Got it$/i.test(n.text || '');
  });
  if (tooltipBtn) {
    await pb.tap(tooltipBtn.center[0], tooltipBtn.center[1]);
    await sleep(1500);
    dumpStr = await pb.dumpc();
    nodes = parseVisibleNodes(dumpStr);
  }

  const items = parseInboxItems(dumpStr).slice(0, limit);
  const login = detectLoginStatus(nodes);

  finish({
    keyword,
    logged_in: login.logged_in,
    account: login.account,
    count: items.length,
    items: items.map((it) => ({
      index: it.index,
      sender: it.sender,
      subject: it.subject,
      snippet: it.snippet,
      date: it.date,
      unread: it.unread,
    })),
  });
}

main().catch((err) => fail(err, 'search'));
