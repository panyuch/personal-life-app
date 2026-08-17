/*
 * 修复测试 1：今日计划 — 空内容添加应提示"无法添加空内容"
 * 验证：
 *   1) tryAdd 传入空白/纯空格时返回 null，不写入数据，并触发 UI.toast('无法添加空内容')
 *   2) tryAdd 传入有效文本时正常写入，且不弹出提示
 *   3) UI 交互（doAdd）使用 tryAdd，从而复用同一提示逻辑
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Today = mods.today;

function reset() { storage.clear(); Store.load(); }

// 临时替换 UI.toast，捕获提示内容
function spyToast() {
  const captured = [];
  const orig = UI.toast;
  UI.toast = function (msg) { captured.push(msg); };
  return {
    captured,
    restore() { UI.toast = orig; },
  };
}

H.section('今日计划-空内容提示');
H.test('空内容(纯空格)添加：返回 null、不写入、弹出"无法添加空内容"', function () {
  reset();
  const spy = spyToast();
  try {
    const r = Today.tryAdd('2026-08-17', '   ');
    H.eq(r, null, '空白内容应返回 null');
    H.eq(Store.data.today.length, 0, '不应写入任何数据');
    H.ok(spy.captured.indexOf('无法添加空内容') >= 0, '应弹出"无法添加空内容"提示');
  } finally {
    spy.restore();
  }
});
H.test('空字符串添加：同样提示且不写入', function () {
  reset();
  const spy = spyToast();
  try {
    const r = Today.tryAdd('2026-08-17', '');
    H.eq(r, null, '空字符串应返回 null');
    H.eq(Store.data.today.length, 0, '不应写入');
    H.ok(spy.captured.indexOf('无法添加空内容') >= 0, '应弹出提示');
  } finally {
    spy.restore();
  }
});
H.test('有效内容添加：正常写入且不弹提示', function () {
  reset();
  const spy = spyToast();
  try {
    const r = Today.tryAdd('2026-08-17', '买菜');
    H.ok(r && r.id, '应返回带 id 的新项');
    H.eq(Store.data.today.length, 1, '应写入一条');
    H.eq(Store.data.today[0].text, '买菜', '文本应正确');
    H.eq(spy.captured.length, 0, '有效内容不应弹出任何提示');
  } finally {
    spy.restore();
  }
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
