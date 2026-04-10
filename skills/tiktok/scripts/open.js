/**
 * @description 启动 TikTok（纯启动；自动关掉 Google Sign-In 抢前台弹窗）
 *
 * 单一职责：仅启动 App，返回最小验证信息（top_activity + foreground）。
 * 任何页面 introspection（dump / visible_texts / 登录态）都归 `state` 命令。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const {
  PACKAGE,
  sleep,
  isForeground,
  dismissGoogleSignIn,
  finish,
  fail,
} = require('./_lib.js');

async function main() {
  await pb.launch(PACKAGE);
  await sleep(2500);

  // TikTok 启动后 GMS 经常抢前台弹 Sign-In，连续 BACK 关掉
  const top = await dismissGoogleSignIn();

  finish({
    top_activity: top,
    foreground: isForeground(top),
  });
}

main().catch((err) => fail(err, 'open'));
