/*
 * 修复测试 3：今日计划 — 筛选标签（全部/未完成/已完成）点击后正确切换并显示对应列表
 * 同时验证 修复2（添加按钮与输入框同行）的结构与样式规则存在。
 *
 * 通过轻量 fake DOM 驱动 Today.render，模拟点击筛选标签，核对：
 *   - 点击“未完成/已完成/全部”后，列表只显示对应状态项，且对应标签高亮（class="active"）
 *   - 点击无反应的问题已彻底解决（每次点击都会以新状态重渲染）
 * 以及 修复2：
 *   - build 输出中 输入框(id=today-input) 位于 添加按钮(id=today-add) 之前且同处 .add-row
 *   - assets/styles.css 含 .add-row{display:flex...} 规则（保证同行布局）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Today = mods.today;

// ---- 轻量 fake DOM：支持 innerHTML 存储 + 按选择器缓存子桩 + addEventListener 捕获 ----
function fakeEl(id) {
  const el = {
    id: id || '',
    _html: '',
    _text: '',
    _listeners: {},
    _children: {},
    _attrs: {},
    value: '',
    onclick: null,
    style: { setProperty() {}, display: '' },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { this._listeners[type] = fn; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    focus() {},
    click() {},
    appendChild() {},
    removeChild() {},
    querySelector(sel) {
      if (!this._children[sel]) this._children[sel] = fakeEl(sel);
      return this._children[sel];
    },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
  return el;
}

const viewEl = fakeEl('view');
const topbar = fakeEl('topbar');
// 覆盖 getElementById：today 视图与 topbar 使用可交互的 fake 元素
win.document.getElementById = function (id) {
  if (id === 'view') return viewEl;
  if (id === 'topbar') return topbar;
  return fakeEl(id);
};

function reset() { storage.clear(); Store.load(); }

function clickFilter(mode) {
  const filter = viewEl.querySelector('#today-filter');
  const handler = filter._listeners.click;
  if (!handler) throw new Error('筛选标签未绑定 click 事件');
  // 模拟事件：e.target.closest('button') 返回带 data-mode 的按钮
  handler({
    target: {
      closest: function () {
        return { getAttribute: function (a) { return a === 'data-mode' ? mode : null; } };
      },
    },
  });
}

H.section('今日计划-筛选切换');
H.test('渲染初始为“全部”，含全部项', function () {
  reset();
  const d = UI.todayStr();
  Today.addItem(d, 'A-未完成');
  const doneItem = Today.addItem(d, 'B-已完成');
  Today.toggle(doneItem.id);
  // 清空模块内部 state（如需），直接重渲染：先以全状态渲染
  Today.render(viewEl, topbar);
  H.includes(viewEl.innerHTML, 'A-未完成', '全部视图应显示未完成项');
  H.includes(viewEl.innerHTML, 'B-已完成', '全部视图应显示已完成项');
  H.includes(viewEl.innerHTML, 'class="active" data-mode="all"', '“全部”标签应高亮');
});

H.test('点击“未完成”后只显示未完成项且高亮', function () {
  clickFilter('active');
  H.includes(viewEl.innerHTML, 'A-未完成', '未完成视图应显示未完成项');
  H.notIncludes(viewEl.innerHTML, 'B-已完成', '未完成视图不应显示已完成项');
  H.includes(viewEl.innerHTML, 'class="active" data-mode="active"', '“未完成”标签应高亮');
});

H.test('点击“已完成”后只显示已完成项且高亮', function () {
  clickFilter('done');
  H.includes(viewEl.innerHTML, 'B-已完成', '已完成视图应显示已完成项');
  H.notIncludes(viewEl.innerHTML, 'A-未完成', '已完成视图不应显示未完成项');
  H.includes(viewEl.innerHTML, 'class="active" data-mode="done"', '“已完成”标签应高亮');
});

H.test('再次点击“全部”恢复显示所有项', function () {
  clickFilter('all');
  H.includes(viewEl.innerHTML, 'A-未完成', '回到全部应显示未完成项');
  H.includes(viewEl.innerHTML, 'B-已完成', '回到全部应显示已完成项');
  H.includes(viewEl.innerHTML, 'class="active" data-mode="all"', '“全部”标签应重新高亮');
});

H.section('今日计划-添加按钮同行(修复2)');
H.test('build 输出：输入框在添加按钮之前且同处 .add-row', function () {
  const html = Today.build({ date: UI.todayStr(), mode: 'all' });
  H.includes(html, '<div class="add-row">', '应包含 .add-row 容器');
  const iInput = html.indexOf('id="today-input"');
  const iBtn = html.indexOf('id="today-add"');
  const iRowEnd = html.indexOf('</div>', iInput);
  H.ok(iInput > -1 && iBtn > -1, '输入框与添加按钮都存在');
  H.ok(iInput < iBtn, '输入框应位于添加按钮之前');
  H.ok(iBtn < iRowEnd, '添加按钮应仍在 .add-row 容器内（同行）');
});

H.test('styles.css 含 .add-row 的 flex 布局规则', function () {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'styles.css'), 'utf8');
  H.ok(/\.add-row\s*\{[^}]*display:\s*flex/.test(css), '.add-row 应设为 display:flex（输入框与按钮同行）');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
