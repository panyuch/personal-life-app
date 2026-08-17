/*
 * today.js — 今日计划（阶段2，PRD §5.1）
 * 独立待办：按日期的 { id, date, text, done, createdAt }。
 * 操作：增删改、勾选完成、筛选、切换日期。与其他模块数据隔离。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  function listForDate(date) {
    return Store.data.today.filter(function (t) { return t.date === date; });
  }

  function addItem(date, text) {
    text = (text == null ? '' : String(text)).trim();
    if (!text) return null;
    var item = {
      id: Store.uid(),
      date: date,
      text: text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    Store.data.today.push(item);
    Store.save();
    return item;
  }

  // 界面添加入口：空白内容不写入并提示"无法添加空内容"
  function tryAdd(date, text) {
    var it = addItem(date, text);
    if (!it) UI.toast('无法添加空内容');
    return it;
  }

  function find(id) {
    var list = Store.data.today;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function toggle(id) {
    var it = find(id);
    if (!it) return null;
    it.done = !it.done;
    Store.save();
    return it;
  }

  function updateText(id, text) {
    text = (text == null ? '' : String(text)).trim();
    if (!text) return false;
    var it = find(id);
    if (!it) return false;
    it.text = text;
    Store.save();
    return true;
  }

  function remove(id) {
    var list = Store.data.today;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }

  function filterItems(items, mode) {
    if (mode === 'active') return items.filter(function (t) { return !t.done; });
    if (mode === 'done') return items.filter(function (t) { return t.done; });
    return items;
  }

  // 日期平移（delta 天），返回 'YYYY-MM-DD'
  function shiftDate(date, delta) {
    var p = String(date).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + delta);
    return UI.todayStr(d);
  }

  function build(ctx) {
    ctx = ctx || {};
    var date = ctx.date || UI.todayStr();
    var mode = ctx.mode || 'all';
    var items = filterItems(listForDate(date), mode);

    var html = '';
    // 日期切换器
    html += '<div class="date-nav">';
    html += '<button class="btn btn-sm" id="today-prev">‹ 前一天</button>';
    html += '<span id="today-date" class="date-label">' + UI.escapeHtml(UI.fmtDate(date)) + '</span>';
    html += '<button class="btn btn-sm" id="today-next">后一天 ›</button>';
    html += '<button class="btn btn-sm" id="today-today">回到今天</button>';
    html += '</div>';

    // 添加
    html += '<div class="add-row">';
    html += '<input type="text" id="today-input" placeholder="今天要做什么？" />';
    html += '<button class="btn btn-primary" id="today-add">添加</button>';
    html += '</div>';

    // 筛选
    html += '<div class="segmented" id="today-filter">';
    ['all', 'active', 'done'].forEach(function (m) {
      var label = { all: '全部', active: '未完成', done: '已完成' }[m];
      var active = (m === mode) ? ' active' : '';
      html += '<button class="' + active.trim() + '" data-mode="' + m + '">' + label + '</button>';
    });
    html += '</div>';

    // 列表
    if (items.length === 0) {
      html += UI.empty('这一天还没有计划，添加一条吧', '添加一条', null);
    } else {
      html += '<ul class="list" id="today-list">';
      items.forEach(function (t) {
        html += '<li data-id="' + t.id + '">';
        html += '<input type="checkbox" class="todo-check"' + (t.done ? ' checked' : '') + ' />';
        html += '<span class="grow' + (t.done ? ' done-text' : '') + '">' + UI.escapeHtml(t.text) + '</span>';
        html += '<button class="btn btn-sm todo-edit">编辑</button>';
        html += '<button class="btn btn-sm btn-danger todo-del">删除</button>';
        html += '</li>';
      });
      html += '</ul>';
    }
    return html;
  }

  function render(viewEl, topbar) {
    var date = UI.todayStr();
    var mode = 'all';
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '今日计划';
      var p = topbar.querySelector('#page-date'); if (p) p.textContent = UI.fmtDate(date);
      var b = topbar.querySelector('#primary-btn');
      if (b) { b.textContent = '+ 新建'; b.style.display = ''; b.onclick = function () { var inp = viewEl && viewEl.querySelector('#today-input'); if (inp) inp.focus(); }; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build({ date: date, mode: mode });

    var inp = viewEl.querySelector('#today-input');
    var addBtn = viewEl.querySelector('#today-add');
    function doAdd() {
      if (!inp) return;
      var it = tryAdd(date, inp.value);
      if (it) { inp.value = ''; W.Router && W.Router.reload(); }
    }
    if (addBtn) addBtn.addEventListener('click', doAdd);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });

    var list = viewEl.querySelector('#today-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var li = e.target.closest ? e.target.closest('li') : null;
        if (!li) return;
        var id = li.getAttribute('data-id');
        if (e.target.classList.contains('todo-check')) { toggle(id); W.Router.reload(); }
        else if (e.target.classList.contains('todo-del')) {
          if (UI.confirm({ title: '删除待办', message: '确定删除这条计划吗？' })) { remove(id); W.Router.reload(); }
        } else if (e.target.classList.contains('todo-edit')) {
          var it = find(id);
          var nv = W.prompt ? W.prompt('编辑内容', it ? it.text : '') : null;
          if (nv != null) { updateText(id, nv); W.Router.reload(); }
        }
      });
    }

    bindDateAndFilter(viewEl, date, mode);
  }

  function bindDateAndFilter(viewEl, date, mode) {
    var prev = viewEl.querySelector('#today-prev');
    var next = viewEl.querySelector('#today-next');
    var todayBtn = viewEl.querySelector('#today-today');
    var filter = viewEl.querySelector('#today-filter');
    if (prev) prev.addEventListener('click', function () { rerender(shiftDate(date, -1), mode); });
    if (next) next.addEventListener('click', function () { rerender(shiftDate(date, 1), mode); });
    if (todayBtn) todayBtn.addEventListener('click', function () { rerender(UI.todayStr(), mode); });
    if (filter) filter.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      rerender(date, b.getAttribute('data-mode') || 'all');
    });
  }
  function rerender(d, m) { if (W.Router) W.Router.reload(); }

  var Today = {
    listForDate: listForDate,
    addItem: addItem,
    tryAdd: tryAdd,
    toggle: toggle,
    updateText: updateText,
    remove: remove,
    filterItems: filterItems,
    shiftDate: shiftDate,
    build: build,
    render: render,
  };

  W.Today = Today;
  if (W.Router) W.Router.register('today', render, '今日计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Today;
})();
