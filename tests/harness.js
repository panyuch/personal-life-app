'use strict';
/*
 * 测试基座：为纯前端（file:// + 经典 script + 全局命名空间）代码提供 Node 端可运行环境。
 * - 用内存版 localStorage 模拟浏览器持久化
 * - 用轻量 window/document mock 让模块可加载、render 不崩溃
 * - 暴露 assert 工具；每个阶段的测试文件 require 本文件后调用 loadAll() 再写用例。
 *
 * 关键约定：所有 js 模块通过 window.* 暴露全局命名空间，
 * 因此模块代码内部统一用 (typeof window!=='undefined'?window:globalThis) 访问 Store/UI/Router。
 */

class MemStorage {
  constructor() { this.m = {}; }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null; }
  setItem(k, v) { this.m[k] = String(v); }
  removeItem(k) { delete this.m[k]; }
  clear() { this.m = {}; }
  get length() { return Object.keys(this.m).length; }
  key(i) { var ks = Object.keys(this.m); return i < ks.length ? ks[i] : null; }
}

function mockEl(id) {
  const el = {
    id: id || '',
    _html: '',
    _text: '',
    _attrs: {},
    addEventListener() {},
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    style: { setProperty() {}, getPropertyValue() { return ''; } },
    appendChild() {},
    removeChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    focus() {},
    click() {},
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); },
  });
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) { this._text = String(v); },
  });
  return el;
}

const storage = new MemStorage();
const elementCache = {};

const win = {
  localStorage: storage,
  location: { hash: '' },
  onhashchange: null,
  alert() {},
  Blob: function (parts, opts) { this.parts = parts; this.opts = opts || {}; },
  document: {
    _themeColor: '',
    _themeDark: false,
    documentElement: { style: { setProperty(k, v) { if (k === '--theme-color') win.document._themeColor = v; }, getPropertyValue() { return ''; } } },
    body: {
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; if (k === 'data-theme') win.document._themeDark = (v === 'dark'); },
      removeAttribute(k) { delete this._attrs[k]; if (k === 'data-theme') win.document._themeDark = false; },
      getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    },
    getElementById(id) { return elementCache[id] || (elementCache[id] = mockEl(id)); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return mockEl(); },
    addEventListener() {},
  },
};

global.window = win;
global.localStorage = storage;
global.document = win.document;
global.location = win.location;
global.Blob = win.Blob;

const path = require('path');

function loadAll() {
  const base = path.join(__dirname, '..', 'js');
  const order = ['store', 'ui', 'router', 'home', 'today', 'work', 'fitness', 'diet', 'settings', 'app'];
  const mods = {};
  order.forEach(function (n) { mods[n] = require(path.join(base, n + '.js')); });
  return { win, mods, storage };
}

// ---- 断言工具 ----
let passed = 0;
let failed = 0;
const report = [];
// 顺序执行链：确保用例之间（尤其共享全局状态/异步）互不交错
let chain = Promise.resolve();

function section(name) { report.push({ section: name, tests: [] }); }
function currentSec() { return report[report.length - 1]; }

function recordPass(sec, name) {
  sec.tests.push({ name, ok: true });
  passed++;
  console.log('  ✓ ' + name);
}
function recordFail(sec, name, e) {
  sec.tests.push({ name, ok: false, err: e && e.message });
  failed++;
  console.error('  ✗ ' + name + '  ->  ' + (e && e.message));
}

function test(name, fn) {
  const sec = currentSec();
  chain = chain.then(function () {
    return new Promise(function (resolve) {
      try {
        const r = fn();
        Promise.resolve(r).then(function () {
          recordPass(sec, name); resolve();
        }).catch(function (e) {
          recordFail(sec, name, e); resolve();
        });
      } catch (e) {
        recordFail(sec, name, e); resolve();
      }
    });
  });
}

function finish() {
  return chain.then(function () {
    console.log('\n──────── 测试汇总 ────────');
    console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
    return failed === 0;
  });
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '值不相等') + '：期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a));
}
function ok(v, msg) { if (!v) throw new Error(msg || '期望为真，实际为假'); }
function notOk(v, msg) { if (v) throw new Error(msg || '期望为假，实际为真'); }
function includes(hay, needle, msg) {
  if (hay == null || String(hay).indexOf(needle) === -1) throw new Error((msg || '未包含子串') + '：未找到 ' + JSON.stringify(needle));
}
function notIncludes(hay, needle, msg) {
  if (hay != null && String(hay).indexOf(needle) !== -1) throw new Error((msg || '不应包含子串') + '：却找到了 ' + JSON.stringify(needle));
}
function approx(a, b, eps, msg) {
  eps = eps == null ? 1e-6 : eps;
  if (Math.abs(a - b) > eps) throw new Error((msg || '数值偏差过大') + '：期望≈' + b + '，实际 ' + a);
}

function summary() {
  console.log('\n──────── 测试汇总 ────────');
  console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  return failed === 0;
}

module.exports = {
  win, storage, mockEl, loadAll,
  section, test, eq, ok, notOk, includes, notIncludes, approx, summary, finish,
  _stats: function () { return { passed: passed, failed: failed }; },
};
