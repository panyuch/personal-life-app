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

  // 当前视图的日期与筛选状态：跨重渲染保留，使“筛选/切换日期”点击后持续生效
  var state = { date: null, mode: null };

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
    if (!it) UI.toast('无法添加空内容', 'error');
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
    // 初始化并保留筛选/日期状态：从路由重渲染时仍展示用户上次的选择
    if (state.date == null) state.date = UI.todayStr();
    if (state.mode == null) state.mode = 'all';
    var date = state.date;
    var mode = state.mode;

    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '今日计划';
      // 顶部日期始终表示系统当前日期；日期导航只切换下方计划列表。
      var p = topbar.querySelector('#page-date'); if (p) p.textContent = UI.fmtDate(UI.todayStr());
      var b = topbar.querySelector('#primary-btn');
      if (b) { b.textContent = '+ 新建'; b.style.display = ''; b.onclick = function () { var inp = viewEl && viewEl.querySelector('#today-input'); if (inp) inp.focus(); }; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build({ date: date, mode: mode });

    // 空状态“添加一条”按钮：聚焦输入框（每次渲染重建的按钮，绑定无累积风险）
    var emptyAction = viewEl.querySelector('.empty-action');
    if (emptyAction) emptyAction.addEventListener('click', function () {
      var inpEl = viewEl.querySelector('#today-input');
      if (inpEl) inpEl.focus();
    });

    var inp = viewEl.querySelector('#today-input');
    var addBtn = viewEl.querySelector('#today-add');
    function doAdd() {
      if (!inp) return;
      var it = tryAdd(date, inp.value);
      if (it) { inp.value = ''; rerender(); }
    }
    if (addBtn) addBtn.addEventListener('click', doAdd);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });

    var list = viewEl.querySelector('#today-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var li = e.target.closest ? e.target.closest('li') : null;
        if (!li) return;
        var id = li.getAttribute('data-id');
        if (e.target.classList.contains('todo-check')) { toggle(id); rerender(); }
        else if (e.target.classList.contains('todo-del')) {
          if (UI.confirm({ title: '删除待办', message: '确定删除这条计划吗？' })) { remove(id); rerender(); }
        } else if (e.target.classList.contains('todo-edit')) {
          var it = find(id);
          var nv = W.prompt ? W.prompt('编辑内容', it ? it.text : '') : null;
          if (nv != null) { updateText(id, nv); rerender(); }
        }
      });
    }

    bindDateAndFilter(viewEl);
  }

  // 以当前 state（日期 + 筛选）重新渲染今日计划视图，确保选择持续生效
  function rerender() {
    var viewEl = W.document && W.document.getElementById ? W.document.getElementById('view') : null;
    var topbar = W.document && W.document.getElementById ? W.document.getElementById('topbar') : null;
    render(viewEl, topbar);
  }

  function bindDateAndFilter(viewEl) {
    var prev = viewEl.querySelector('#today-prev');
    var next = viewEl.querySelector('#today-next');
    var todayBtn = viewEl.querySelector('#today-today');
    var filter = viewEl.querySelector('#today-filter');
    if (prev) prev.addEventListener('click', function () { state.date = shiftDate(state.date, -1); rerender(); });
    if (next) next.addEventListener('click', function () { state.date = shiftDate(state.date, 1); rerender(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { state.date = UI.todayStr(); rerender(); });
    if (filter) filter.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      state.mode = b.getAttribute('data-mode') || 'all';
      rerender();
    });
  }

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
