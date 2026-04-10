/**
 * @description 触发系统 ADD_ACCOUNT_SETTINGS 流程添加 Google 账号；可选 best-effort 凭证填充
 * @arg email:string 要登录的邮箱（不传则只打开页面让人工完成）
 * @arg password:string 密码（与 --email 配合）
 * @arg wait:int=120 登录页打开后多少秒内轮询 dumpsys account 直到检测到新账号
 *
 * ⚠️ 注意：Google 登录页（MinuteMaidActivity）是 WebView 渲染，**不是原生 Android 视图**。
 * Google 对脚本登录有重度风控（reCAPTCHA / 设备验证 / 2FA），首次在新设备上登录基本会被
 * "Verify it's you" 拦截。脚本只能 best-effort 填邮箱+密码，遇到风控时返回
 * `verification_required: true`。
 */

'use strict';

const pb = require('@phonebase-cloud/pb');
const { parseArgs } = require('node:util');
const {
  sleep,
  listGoogleAccounts,
  openAddGoogleAccount,
  isOnMinuteMaid,
  dumpMinuteMaid,
  findEmailField,
  findPasswordField,
  findNextButton,
  detectVerificationChallenge,
  collectVisibleTexts,
  clearFocusedField,
  finish,
  fail,
} = require('./_lib.js');

async function tryFillEmailPage(email) {
  const nodes = await dumpMinuteMaid();
  const emailField = findEmailField(nodes);
  if (!emailField) return false;
  await pb.tap(emailField.center[0], emailField.center[1]);
  await sleep(800);
  await clearFocusedField();
  await pb.input(email);
  await sleep(2500); // 等 IME 应用 + Google JS 校验
  // 提交：先按 ENTER（更稳），找不到 NEXT 也无所谓
  await pb.keyevent('ENTER');
  await sleep(3000);
  // 兜底点 NEXT
  const after = await dumpMinuteMaid();
  const next = findNextButton(after);
  if (next) {
    await pb.tap(next.center[0], next.center[1]);
    await sleep(3000);
  }
  return true;
}

async function tryFillPasswordPage(password) {
  const nodes = await dumpMinuteMaid();
  const pwField = findPasswordField(nodes);
  if (!pwField) return false;
  await pb.tap(pwField.center[0], pwField.center[1]);
  await sleep(800);
  await clearFocusedField();
  await pb.input(password);
  await sleep(2500);
  await pb.keyevent('ENTER');
  await sleep(4000);
  const after = await dumpMinuteMaid();
  const next = findNextButton(after);
  if (next) {
    await pb.tap(next.center[0], next.center[1]);
    await sleep(4000);
  }
  return true;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      wait: { type: 'string' },
    },
  });
  const email = values.email || null;
  const password = values.password || null;
  const waitSec = parseInt(values.wait || '120', 10);

  // 0. 已经登录就直接返回
  const before = await listGoogleAccounts();
  if (email && before.some((a) => a.name === email)) {
    return finish({
      email,
      logged_in: true,
      already_logged_in: true,
      accounts: before,
    });
  }

  // 1. 触发系统 Add Account 流程
  await openAddGoogleAccount();
  await sleep(3500);

  let top = await pb.topActivity();
  if (!isOnMinuteMaid(top)) {
    fail(
      new Error(`Add Account intent 后前台不是 MinuteMaid，是 ${top.class_name || top.package_name}`),
      'login',
    );
    return;
  }

  // 2. 没传凭证：只把页面打开让人工处理
  if (!email || !password) {
    const nodes = await dumpMinuteMaid();
    return finish({
      email: email || null,
      logged_in: false,
      page_opened: true,
      hint: '已打开 Google 登录页，请在云手机上手动完成；或者带 --email + --password 重试',
      visible_texts: collectVisibleTexts(nodes),
    });
  }

  // 3. best-effort 自动填充
  const filledEmail = await tryFillEmailPage(email);
  if (!filledEmail) {
    const nodes = await dumpMinuteMaid();
    fail(
      new Error('登录页里没找到邮箱输入框（EditText）'),
      'login',
    );
    return;
  }

  // 4. 检查是否进了风控页（不是密码页就大概率是风控）
  let challenge = await detectVerificationChallenge();
  if (challenge) {
    const nodes = await dumpMinuteMaid();
    return finish({
      email,
      logged_in: false,
      verification_required: true,
      verification_kind: challenge.kind,
      current_page_snippet: challenge.snippet,
      visible_texts: collectVisibleTexts(nodes),
      hint: 'Google 风控介入，需要在云手机上人工完成验证',
    });
  }

  // 5. 填密码
  const filledPassword = await tryFillPasswordPage(password);
  if (!filledPassword) {
    const nodes = await dumpMinuteMaid();
    return finish({
      email,
      logged_in: false,
      verification_required: false,
      hint: '邮箱填好后没看到密码输入框，可能页面跳转异常',
      visible_texts: collectVisibleTexts(nodes),
    });
  }

  // 6. 密码后再检查一遍风控
  challenge = await detectVerificationChallenge();
  if (challenge) {
    const nodes = await dumpMinuteMaid();
    return finish({
      email,
      logged_in: false,
      verification_required: true,
      verification_kind: challenge.kind,
      current_page_snippet: challenge.snippet,
      visible_texts: collectVisibleTexts(nodes),
      hint: '密码填完后被 Google 风控拦截',
    });
  }

  // 7. 轮询 dumpsys account 等待账号被系统记录（处理 ToS / 同意页等）
  const deadline = Date.now() + waitSec * 1000;
  while (Date.now() < deadline) {
    const accounts = await listGoogleAccounts();
    if (accounts.some((a) => a.name === email)) {
      return finish({
        email,
        logged_in: true,
        verification_required: false,
        accounts,
      });
    }
    // 中途如果出现风控也直接返回
    challenge = await detectVerificationChallenge();
    if (challenge) {
      const nodes = await dumpMinuteMaid();
      return finish({
        email,
        logged_in: false,
        verification_required: true,
        verification_kind: challenge.kind,
        visible_texts: collectVisibleTexts(nodes),
      });
    }
    await sleep(3000);
  }

  // 8. 超时
  const finalAccounts = await listGoogleAccounts();
  finish({
    email,
    logged_in: finalAccounts.some((a) => a.name === email),
    verification_required: false,
    timed_out: true,
    waited_sec: waitSec,
    accounts: finalAccounts,
  });
}

main().catch((err) => fail(err, 'login'));
