/*
 * diet.js — 饮食计划（阶段5，PRD §5.4）
 * 按日期记录四餐（早/午/晚/加餐），食物手填或从常用库选择；常用食物库 CRUD；
 * 当日汇总（热量+蛋白/碳水/脂肪），设定 targetKcal 时显示进度条。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  var MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  var MEAL_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

  function ensureDay(date) {
    if (!Store.data.diet.days[date]) {
      Store.data.diet.days[date] = { meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
    }
    return Store.data.diet.days[date];
  }

  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  // 当前“查看日期”：跨重渲染保留，使日期切换与任意增删后停留在当前查看日期
  var state = { date: null };

  function addFood(date, meal, food) {
    if (MEALS.indexOf(meal) < 0) return null;
    food = food || {};
    var name = (food.name == null ? '' : String(food.name)).trim();
    if (!name) return null;
    var day = ensureDay(date);
    var item = {
      id: Store.uid(),
      name: name,
      kcal: num(food.kcal),
      protein: num(food.protein),
      carb: num(food.carb),
      fat: num(food.fat),
    };
    day.meals[meal].push(item);
    Store.save();
    return item;
  }

  function removeFood(date, meal, itemId) {
    if (MEALS.indexOf(meal) < 0) return false;
    var day = Store.data.diet.days[date];
    if (!day) return false;
    var list = day.meals[meal];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === itemId) { list.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }

  // 常用食物库
  function addLibraryFood(food) {
    food = food || {};
    var name = (food.name == null ? '' : String(food.name)).trim();
    if (!name) return null;
    var f = { id: Store.uid(), name: name, kcal: num(food.kcal), protein: num(food.protein), carb: num(food.carb), fat: num(food.fat) };
    Store.data.diet.foods.push(f);
    Store.save();
    return f;
  }
  function findLibraryFood(id) {
    var fs = Store.data.diet.foods;
    for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i];
    return null;
  }
  function updateLibraryFood(id, fields) {
    var f = findLibraryFood(id);
    if (!f) return false;
    fields = fields || {};
    if (fields.name != null) { var n = String(fields.name).trim(); if (n) f.name = n; }
    if (fields.kcal != null) f.kcal = num(fields.kcal);
    if (fields.protein != null) f.protein = num(fields.protein);
    if (fields.carb != null) f.carb = num(fields.carb);
    if (fields.fat != null) f.fat = num(fields.fat);
    Store.save();
    return true;
  }
  function removeLibraryFood(id) {
    var fs = Store.data.diet.foods;
    for (var i = 0; i < fs.length; i++) {
      if (fs[i].id === id) { fs.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }

  // 当日汇总
  function dailySummary(date) {
    var day = Store.data.diet.days[date];
    var sum = { kcal: 0, protein: 0, carb: 0, fat: 0 };
    if (!day) return sum;
    MEALS.forEach(function (m) {
      day.meals[m].forEach(function (it) {
        sum.kcal += it.kcal; sum.protein += it.protein; sum.carb += it.carb; sum.fat += it.fat;
      });
    });
    return sum;
  }

  function setTarget(kcal) {
    Store.data.diet.targetKcal = (kcal == null || kcal === '' || isNaN(Number(kcal))) ? null : Number(kcal);
    Store.save();
    return Store.data.diet.targetKcal;
  }

  // ——— 渲染 ———
  function build(ctx) {
    ctx = ctx || {};
    var date = ctx.date || UI.todayStr();
    var day = ensureDay(date);
    var sum = dailySummary(date);
    var target = Store.data.diet.targetKcal;

    var html = '<div class="date-nav">';
    html += '<button class="btn btn-sm" id="diet-prev">‹ 前一天</button>';
    html += '<span class="date-label">' + UI.escapeHtml(UI.fmtDate(date)) + '</span>';
    html += '<button class="btn btn-sm" id="diet-next">后一天 ›</button>';
    html += '<button class="btn btn-sm" id="diet-today">回到今天</button>';
    html += '</div>';

    // 目标
    html += '<div class="card" style="margin-bottom:12px"><h3>今日汇总</h3>';
    html += '<div class="actions"><label>目标热量 <input type="number" id="diet-target" value="' + (target != null ? target : '') + '" placeholder="可选" style="width:120px;display:inline-block" /> kcal <button class="btn btn-sm" id="diet-set-target">设定</button></label></div>';
    html += '<p class="card-sub">总热量 <b>' + Math.round(sum.kcal) + '</b> kcal · 蛋白 ' + Math.round(sum.protein) + 'g · 碳水 ' + Math.round(sum.carb) + 'g · 脂肪 ' + Math.round(sum.fat) + 'g</p>';
    if (target != null) {
      var pct = Math.min(100, Math.round(sum.kcal / target * 100));
      html += '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>';
      html += '<p class="card-sub">已摄入 ' + pct + '% 目标</p>';
    }
    html += '</div>';

    // 四餐
    html += '<div class="grid">';
    MEALS.forEach(function (m) {
      html += '<div class="card"><h3>' + MEAL_LABEL[m] + '</h3>';
      var items = day.meals[m];
      if (items.length === 0) {
        html += '<p class="card-sub">还没记录</p>';
      } else {
        html += '<ul class="list">';
        items.forEach(function (it) {
          html += '<li data-mid="' + it.id + '" data-meal="' + m + '"><span class="grow">' + UI.escapeHtml(it.name) + ' <small class="card-sub">' + Math.round(it.kcal) + 'kcal</small></span><button class="btn btn-sm btn-danger diet-del-food">删</button></li>';
        });
        html += '</ul>';
      }
      html += '<button class="btn btn-sm btn-primary diet-add-food" data-meal="' + m + '">+ 添加食物</button> ';
      if (Store.data.diet.foods.length) {
        html += '<select class="diet-lib" data-meal="' + m + '"><option value="">从常用库选…</option>';
        Store.data.diet.foods.forEach(function (f) {
          html += '<option value="' + f.id + '">' + UI.escapeHtml(f.name) + ' (' + Math.round(f.kcal) + 'kcal)</option>';
        });
        html += '</select>';
      }
      html += '</div>';
    });
    html += '</div>';

    // 常用库
    html += '<div class="card" style="margin-top:12px"><h3>常用食物库</h3>';
    if (Store.data.diet.foods.length === 0) {
      html += UI.empty('食物库还是空的，先加几个常吃的', null, null);
    } else {
      html += '<ul class="list">';
      Store.data.diet.foods.forEach(function (f) {
        html += '<li data-fid="' + f.id + '"><span class="grow">' + UI.escapeHtml(f.name) + ' <small class="card-sub">' + Math.round(f.kcal) + 'kcal · 蛋' + Math.round(f.protein) + ' 碳' + Math.round(f.carb) + ' 脂' + Math.round(f.fat) + '</small></span><button class="btn btn-sm btn-danger diet-del-lib">删</button></li>';
      });
      html += '</ul>';
    }
    html += '<button class="btn btn-sm btn-primary" id="diet-add-lib">+ 添加常用食物</button>';
    html += '</div>';
    return html;
  }

  function shiftDate(date, delta) {
    var p = String(date).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + delta);
    return UI.todayStr(d);
  }

  function render(viewEl, topbar) {
    if (state.date == null) state.date = UI.todayStr();
    var date = state.date;
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '饮食计划';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    // 包一层会随 innerHTML 重建的子容器，事件委托挂在其上，避免监听器在持久 #view 上累积
    viewEl.innerHTML = '<div class="diet-root">' + build({ date: date }) + '</div>';
    bind(viewEl.querySelector('.diet-root'), date);
  }

  function bind(viewEl, date) {
    var prev = viewEl.querySelector('#diet-prev');
    var next = viewEl.querySelector('#diet-next');
    var todayBtn = viewEl.querySelector('#diet-today');
    if (prev) prev.addEventListener('click', function () { state.date = shiftDate(state.date, -1); rerender(); });
    if (next) next.addEventListener('click', function () { state.date = shiftDate(state.date, 1); rerender(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { state.date = UI.todayStr(); rerender(); });

    var setTarget = viewEl.querySelector('#diet-set-target');
    if (setTarget) setTarget.addEventListener('click', function () {
      var inp = viewEl.querySelector('#diet-target');
      setTarget_func(inp ? inp.value : '');
      W.Router && W.Router.reload();
    });

    var addBtns = viewEl.querySelectorAll('.diet-add-food');
    for (var i = 0; i < addBtns.length; i++) {
      addBtns[i].addEventListener('click', function () {
        var meal = this.getAttribute('data-meal');
        var name = W.prompt ? W.prompt('食物名称') : null;
        if (!name) return;
        var kcal = W.prompt ? W.prompt('热量 kcal', '0') : '0';
        addFood(date, meal, { name: name, kcal: kcal });
        W.Router.reload();
      });
    }
    var libSel = viewEl.querySelectorAll('.diet-lib');
    for (var j = 0; j < libSel.length; j++) {
      libSel[j].addEventListener('change', function () {
        var meal = this.getAttribute('data-meal');
        var fid = this.value;
        if (!fid) return;
        var f = findLibraryFood(fid);
        if (f) { addFood(date, meal, { name: f.name, kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat }); W.Router.reload(); }
      });
    }
    viewEl.addEventListener('click', function (e) {
      if (e.target.classList.contains('diet-del-food')) {
        var li = e.target.closest('li'); if (!li) return;
        removeFood(date, li.getAttribute('data-meal'), li.getAttribute('data-mid'));
        W.Router.reload();
      } else if (e.target.classList.contains('diet-del-lib')) {
        var l2 = e.target.closest('li'); if (!l2) return;
        if (UI.confirm({ title: '删除常用食物', message: '确定从食物库删除吗？' })) { removeLibraryFood(l2.getAttribute('data-fid')); W.Router.reload(); }
      } else if (e.target.id === 'diet-add-lib') {
        var nm = W.prompt ? W.prompt('食物名称') : null;
        if (!nm) return;
        var kc = W.prompt ? W.prompt('热量 kcal', '0') : '0';
        addLibraryFood({ name: nm, kcal: kc });
        W.Router.reload();
      }
    });
  }
  function setTarget_func(v) { setTarget(v); }
  // 以当前 state（查看日期）重新渲染饮食计划视图，确保日期切换/增删后持续生效
  function rerender() {
    var viewEl = W.document && W.document.getElementById ? W.document.getElementById('view') : null;
    var topbar = W.document && W.document.getElementById ? W.document.getElementById('topbar') : null;
    render(viewEl, topbar);
  }

  var Diet = {
    MEALS: MEALS,
    ensureDay: ensureDay,
    addFood: addFood, removeFood: removeFood,
    addLibraryFood: addLibraryFood, findLibraryFood: findLibraryFood,
    updateLibraryFood: updateLibraryFood, removeLibraryFood: removeLibraryFood,
    dailySummary: dailySummary, setTarget: setTarget,
    build: build, render: render,
  };

  W.Diet = Diet;
  if (W.Router) W.Router.register('diet', render, '饮食计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Diet;
})();
