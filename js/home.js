/*
 * home.js — 首页总览（阶段6，PRD §3）
 * 聚合各模块真实数据：问候条、今日计划卡（可勾选）、快速备忘卡、
 * 工作/健身/饮食三张摘要卡，点击进入对应模块。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  function greeting(now) {
    var h = now.getHours();
    if (h < 11) return '早上好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  // 问候条副文案：动态反映今日未完成待办数；0 件时给鼓励文案
  function greetingSub(n) {
    if (n > 0) return '今天有 ' + n + ' 件待办，保持节奏。';
    return '今天没有待办，放松一下，或规划明天吧。';
  }

  // ——— 快速备忘 (memo) ———
  function memoAdd(text) {
    text = (text == null ? '' : String(text)).trim();
    if (!text) return null;
    var m = { id: Store.uid(), text: text, done: false, createdAt: new Date().toISOString() };
    Store.data.memo.push(m);
    Store.save();
    return m;
  }
  function memoFind(id) {
    var ms = Store.data.memo;
    for (var i = 0; i < ms.length; i++) if (ms[i].id === id) return ms[i];
    return null;
  }
  function memoToggle(id) {
    var m = memoFind(id);
    if (!m) return false;
    m.done = !m.done; Store.save(); return true;
  }
  function memoRemove(id) {
    var ms = Store.data.memo;
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].id === id) { ms.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }

  function todayIncomplete(date, limit) {
    var items = Store.data.today.filter(function (t) { return t.date === date && !t.done; });
    return limit ? items.slice(0, limit) : items;
  }

  // ——— 渲染 ———
  function build(ctx) {
    ctx = ctx || {};
    var now = ctx.now || new Date();
    var date = ctx.date || UI.todayStr(now);
    var nick = (Store.data.settings.nickname || '').trim();
    var greet = greeting(now);
    var incomplete = todayIncomplete(date).length;
    var w = W.Work ? W.Work.summary() : { plans: 0, items: 0, done: 0 };
    var f = W.Fitness ? W.Fitness.summary(date) : { trainedToday: null, latestWeight: null };
    var dSum = W.Diet ? W.Diet.dailySummary(date) : { kcal: 0 };
    var dHasFood = W.Diet ? W.Diet.hasAnyFood(date) : false;

    var html = '';
    // 问候条（独立区块，非卡片）
    html += '<div id="greeting">';
    html += '<p class="hello">' + UI.escapeHtml(greet) + (nick ? '，<em>' + UI.escapeHtml(nick) + '</em>' : '') + '</p>';
    html += '<p class="sub">' + UI.escapeHtml(greetingSub(incomplete)) + '</p>';
    html += '</div>';

    html += '<div class="grid">';

    // 今日计划卡
    html += '<div class="card"><h3>今日计划</h3>';
    var inc = todayIncomplete(date, 5);
    if (inc.length === 0) {
      html += '<p class="card-sub">今日计划都完成啦，或还没添加 🎉</p>';
    } else {
      html += '<ul class="list" id="home-today">';
      inc.forEach(function (t) {
        html += '<li data-id="' + t.id + '"><input type="checkbox" class="home-todo-check" /><span class="grow">' + UI.escapeHtml(t.text) + '</span></li>';
      });
      html += '</ul>';
    }
    html += '<a class="card-link" href="#/today">查看全部 →</a></div>';

    // 快速备忘卡
    html += '<div class="card"><h3>快速备忘</h3>';
    html += '<div class="add-row"><input type="text" id="home-memo-input" placeholder="随手记一条…" /><button class="btn btn-primary" id="home-memo-add">记</button></div>';
    if (Store.data.memo.length === 0) {
      html += '<p class="card-sub">还没有备忘</p>';
    } else {
      html += '<ul class="list" id="home-memo">';
      Store.data.memo.forEach(function (m) {
        html += '<li data-id="' + m.id + '"><input type="checkbox" class="home-memo-check"' + (m.done ? ' checked' : '') + ' /><span class="grow' + (m.done ? ' done-text' : '') + '">' + UI.escapeHtml(m.text) + '</span><button class="btn btn-sm btn-danger home-memo-del">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 工作摘要卡
    html += '<a class="card card-link-wrap" href="#/work"><h3>工作计划</h3>';
    html += '<p class="big">计划 <b>' + w.plans + '</b> · 内容 <b>' + w.items + '</b> · 已完成 <b>' + w.done + '</b></p>';
    html += '<div class="card-sub">点击进入工作计划 →</div></a>';

    // 健身摘要卡
    html += '<a class="card card-link-wrap" href="#/fitness"><h3>健身计划</h3>';
    var fitText = f.trainedToday ? ('今天已训练：' + UI.escapeHtml(f.trainedToday)) : '今天还没训练';
    html += '<p class="big">' + UI.escapeHtml(fitText) + '</p>';
    var weightText = f.latestWeight ? ('最近体重 ' + f.latestWeight.weight + 'kg (' + UI.escapeHtml(f.latestWeight.date) + ')') : '暂无体重记录';
    html += '<div class="card-sub">' + UI.escapeHtml(weightText) + ' →</div></a>';

    // 饮食摘要卡（是否已记录 + 今日热量，无目标对比）
    html += '<a class="card card-link-wrap" href="#/diet"><h3>饮食计划</h3>';
    var dietText = dHasFood ? ('今日已记录 · 热量 ' + Math.round(dSum.kcal) + ' kcal') : '今日还没记录';
    html += '<p class="big">' + UI.escapeHtml(dietText) + '</p>';
    html += '<div class="card-sub">点击进入饮食计划 →</div></a>';

    html += '</div>'; // grid
    return html;
  }

  function render(viewEl, topbar) {
    var now = new Date();
    var date = UI.todayStr(now);
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '首页总览';
      var p = topbar.querySelector('#page-date'); if (p) p.textContent = UI.fmtDate(date);
      var b = topbar.querySelector('#primary-btn'); if (b) { b.textContent = ''; b.style.display = 'none'; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build({ now: now, date: date });
    bind(viewEl, date);
  }

  function bind(viewEl, date) {
    var todoList = viewEl.querySelector('#home-today');
    if (todoList) todoList.addEventListener('click', function (e) {
      if (e.target.classList.contains('home-todo-check')) {
        var li = e.target.closest('li'); if (!li) return;
        var id = li.getAttribute('data-id');
        if (W.Today) W.Today.toggle(id);
        W.Router.reload();
      }
    });
    var memoAddBtn = viewEl.querySelector('#home-memo-add');
    var memoInput = viewEl.querySelector('#home-memo-input');
    if (memoAddBtn) memoAddBtn.addEventListener('click', function () {
      if (!memoInput) return;
      if (memoAdd(memoInput.value)) { memoInput.value = ''; W.Router.reload(); }
    });
    if (memoInput) memoInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && memoAdd(memoInput.value)) { memoInput.value = ''; W.Router.reload(); }
    });
    var memoList = viewEl.querySelector('#home-memo');
    if (memoList) memoList.addEventListener('click', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      var id = li.getAttribute('data-id');
      if (e.target.classList.contains('home-memo-check')) { memoToggle(id); W.Router.reload(); }
      else if (e.target.classList.contains('home-memo-del')) { memoRemove(id); W.Router.reload(); }
    });
  }

  var Home = {
    greeting: greeting,
    greetingSub: greetingSub,
    memoAdd: memoAdd, memoToggle: memoToggle, memoRemove: memoRemove, memoFind: memoFind,
    todayIncomplete: todayIncomplete,
    build: build, render: render,
  };

  W.Home = Home;
  if (W.Router) W.Router.register('home', render, '首页总览');
  if (typeof module !== 'undefined' && module.exports) module.exports = Home;
})();
