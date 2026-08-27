/*
 * diet.js — 饮食计划模块（v3-lite，纯记录 + 当日汇总）
 *
 * 一句话定位：记每餐吃了什么（带克数/营养）→ 看今天总共摄入多少。
 * 砍掉了原 v2 的目标引擎 / 禁忌拦截 / 食谱推荐 / 餐次配置 / 趋势图 / 健身联动。
 *
 * 架构（清晰独立的两类服务 + 统一门面）：
 *   - DietFoods  食材库：增删改 + 按名称搜索（无分类/标签/别名）
 *   - DietLog    记录：四固定餐次（早/午/晚/加餐）记录、克数折算、编辑删除、当日汇总、饮水、日期切换
 *   - Diet       门面：对外统一接口，供 home.js / router / 测试使用，并暴露子服务命名空间
 *
 * 约束（沿用基线）：file:// 双击打开、无 ES Module、无 fetch、无 CDN、localStorage 持久化。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  // ——— 常量：四个固定餐次（不可改）———
  var MEALS = [
    { key: 'breakfast', label: '早餐' },
    { key: 'lunch', label: '午餐' },
    { key: 'dinner', label: '晚餐' },
    { key: 'snack', label: '加餐' },
  ];
  var MEAL_KEYS = MEALS.map(function (m) { return m.key; });

  // ——— 通用工具 ———
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v, d) { v = (v == null ? '' : String(v)).trim(); return v || (d != null ? d : ''); }
  function r1(v) { return Math.round(num(v) * 10) / 10; }
  function round(v) { return Math.round(num(v)); }
  function esc(s) { return UI ? UI.escapeHtml(s) : String(s == null ? '' : s); }

  // 按每 100g 营养 × 克数比例折算
  function scaleNutrition(per100g, factor) {
    return {
      kcal: r1(per100g.kcal * factor),
      protein: r1(per100g.protein * factor),
      carb: r1(per100g.carb * factor),
      fat: r1(per100g.fat * factor),
    };
  }

  // ——— 内部辅助 ———
  function ensureDay(date) {
    if (!Store.data.diet.days[date]) {
      Store.data.diet.days[date] = {
        meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
        waterMl: 0,
      };
    }
    return Store.data.diet.days[date];
  }
  function findFood(id) {
    var fs = Store.data.diet.foods;
    for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i];
    return null;
  }

  // ============================================================
  // DietFoods — 食材库服务（精简：{ id, name, per100g:{kcal,protein,carb,fat} }）
  // ============================================================
  var Foods = {
    addFood: function (spec) {
      spec = spec || {};
      var name = str(spec.name);
      if (!name) return null;
      var f = {
        id: Store.uid(),
        name: name,
        per100g: {
          kcal: num(spec.per100g && spec.per100g.kcal),
          protein: num(spec.per100g && spec.per100g.protein),
          carb: num(spec.per100g && spec.per100g.carb),
          fat: num(spec.per100g && spec.per100g.fat),
        },
      };
      Store.data.diet.foods.push(f);
      Store.save();
      return f;
    },
    updateFood: function (id, fields) {
      var f = findFood(id); if (!f) return false;
      fields = fields || {};
      if (fields.name != null) { var n = str(fields.name); if (n) f.name = n; }
      if (fields.per100g) {
        var p = fields.per100g;
        if (p.kcal != null) f.per100g.kcal = num(p.kcal);
        if (p.protein != null) f.per100g.protein = num(p.protein);
        if (p.carb != null) f.per100g.carb = num(p.carb);
        if (p.fat != null) f.per100g.fat = num(p.fat);
      }
      Store.save();
      return true;
    },
    removeFood: function (id) {
      var fs = Store.data.diet.foods;
      for (var i = 0; i < fs.length; i++) { if (fs[i].id === id) { fs.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    find: function (id) { return findFood(id); },
    // 仅支持按名称关键词搜索（去掉分类/标签/别名）
    listFoods: function (filter) {
      filter = filter || {};
      var arr = Store.data.diet.foods.slice();
      if (filter.q) {
        var q = String(filter.q).trim().toLowerCase();
        if (q) arr = arr.filter(function (f) { return f.name.toLowerCase().indexOf(q) >= 0; });
      }
      return arr;
    },
  };

  // ============================================================
  // DietLog — 记录 / 餐次 / 饮水 / 汇总 / 日期 服务
  // ============================================================
  var Log = {
    ensureDay: ensureDay,
    getDay: function (date) { return Store.data.diet.days[date] || null; },
    addEntry: function (date, meal, spec) {
      if (MEAL_KEYS.indexOf(meal) < 0) return null;
      spec = spec || {};
      var name = str(spec.name);
      if (!name) return null;
      var day = ensureDay(date);
      var entry = { id: Store.uid(), foodId: null, name: name, grams: 100, nutrition: { kcal: 0, protein: 0, carb: 0, fat: 0 } };
      if (spec.foodId) {
        var f = findFood(spec.foodId);
        if (!f) return null;
        entry.foodId = f.id;
        entry.name = f.name;
        var grams = spec.grams != null ? num(spec.grams) : 100;
        entry.grams = grams;
        entry.nutrition = scaleNutrition(f.per100g, grams / 100);
      } else {
        entry.grams = spec.grams != null ? num(spec.grams) : 100;
        var n = spec.nutrition || {};
        entry.nutrition = { kcal: num(n.kcal), protein: num(n.protein), carb: num(n.carb), fat: num(n.fat) };
      }
      day.meals[meal].push(entry);
      Store.save();
      return entry;
    },
    updateEntry: function (date, meal, entryId, fields) {
      if (MEAL_KEYS.indexOf(meal) < 0) return false;
      var day = Store.data.diet.days[date]; if (!day) return false;
      var list = day.meals[meal]; if (!list) return false;
      var entry = null;
      for (var i = 0; i < list.length; i++) { if (list[i].id === entryId) { entry = list[i]; break; } }
      if (!entry) return false;
      fields = fields || {};
      if (fields.name != null) { var n = str(fields.name); if (n) entry.name = n; }
      if (fields.grams != null) {
        entry.grams = num(fields.grams);
        if (entry.foodId) { var f = findFood(entry.foodId); if (f) entry.nutrition = scaleNutrition(f.per100g, entry.grams / 100); }
      }
      if (fields.nutrition) {
        var n2 = fields.nutrition;
        entry.nutrition = { kcal: num(n2.kcal), protein: num(n2.protein), carb: num(n2.carb), fat: num(n2.fat) };
      }
      Store.save();
      return true;
    },
    removeEntry: function (date, meal, entryId) {
      if (MEAL_KEYS.indexOf(meal) < 0) return false;
      var day = Store.data.diet.days[date]; if (!day) return false;
      var list = day.meals[meal]; if (!list) return false;
      for (var i = 0; i < list.length; i++) { if (list[i].id === entryId) { list.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    dailySummary: function (date) {
      var day = Store.data.diet.days[date];
      var sum = { kcal: 0, protein: 0, carb: 0, fat: 0 };
      if (day) {
        MEAL_KEYS.forEach(function (m) {
          (day.meals[m] || []).forEach(function (it) {
            sum.kcal += it.nutrition.kcal; sum.protein += it.nutrition.protein;
            sum.carb += it.nutrition.carb; sum.fat += it.nutrition.fat;
          });
        });
      }
      sum.kcal = round(sum.kcal); sum.protein = round(sum.protein); sum.carb = round(sum.carb);
      sum.fat = round(sum.fat);
      var totalE = sum.protein * 4 + sum.carb * 4 + sum.fat * 9;
      sum.proteinPct = totalE > 0 ? round(sum.protein * 4 / totalE * 100) : 0;
      sum.carbPct = totalE > 0 ? round(sum.carb * 4 / totalE * 100) : 0;
      sum.fatPct = totalE > 0 ? round(sum.fat * 9 / totalE * 100) : 0;
      return sum;
    },
    hasAnyFood: function (date) {
      var day = Store.data.diet.days[date]; if (!day) return false;
      return MEAL_KEYS.some(function (m) { return (day.meals[m] || []).length > 0; });
    },
    setWater: function (date, ml) {
      var day = ensureDay(date);
      day.waterMl = num(ml);
      Store.save();
      return day.waterMl;
    },
  };

  // ============================================================
  // 统一门面 Diet（兼容旧接口别名 + 暴露子服务命名空间）
  // ============================================================
  var Diet = {
    // 子服务命名空间
    Foods: Foods,
    Log: Log,
    MEALS: MEALS,
    // 食材库
    addFood: function (spec) { return Foods.addFood(spec); },
    addLibraryFood: function (spec) { return Foods.addFood(spec); },
    updateLibraryFood: function (id, fields) { return Foods.updateFood(id, fields); },
    removeFood: function (id) { return Foods.removeFood(id); },
    removeLibraryFood: function (id) { return Foods.removeFood(id); },
    findLibraryFood: function (id) { return Foods.find(id); },
    listFoods: function (f) { return Foods.listFoods(f); },
    // 记录 / 餐次 / 饮水 / 汇总
    ensureDay: function (d) { return Log.ensureDay(d); },
    addEntry: function (d, m, s) { return Log.addEntry(d, m, s); },
    updateEntry: function (d, m, id, f) { return Log.updateEntry(d, m, id, f); },
    removeEntry: function (d, m, id) { return Log.removeEntry(d, m, id); },
    getDay: function (d) { return Log.getDay(d); },
    dailySummary: function (d) { return Log.dailySummary(d); },
    hasAnyFood: function (d) { return Log.hasAnyFood(d); },
    setWater: function (d, ml) { return Log.setWater(d, ml); },
    // 视图
    build: build,
    render: render,
  };

  // ============================================================
  // 视图层（build / render / 弹窗表单）
  // ============================================================
  var state = { date: null };
  var lastView = null, lastTopbar = null;

  function shiftDate(date, delta) {
    var p = String(date).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + delta);
    return UI.todayStr(d);
  }

  function openModal(html) {
    var d = W.document;
    var mask = d.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = '<div class="modal">' + html + '</div>';
    d.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(mask); });
    return mask;
  }
  function closeModal(mask) { if (mask && mask.parentNode) mask.parentNode.removeChild(mask); }

  function build(ctx) {
    ctx = ctx || {};
    var date = ctx.date || (UI && UI.todayStr());
    state.date = date;
    var day = ensureDay(date);
    var sum = Log.dailySummary(date);

    var html = '';
    // 日期导航
    html += '<div class="date-nav">';
    html += '<button class="btn btn-sm" id="diet-prev">‹ 前一天</button>';
    html += '<span class="date-label">' + esc(UI.fmtDate(date)) + '</span>';
    html += '<button class="btn btn-sm" id="diet-next">后一天 ›</button>';
    html += '<button class="btn btn-sm" id="diet-today">回到今天</button>';
    html += '</div>';

    // —— 当日汇总（无目标对比）——
    html += '<div class="card" style="margin-bottom:12px"><h3>今日汇总（' + esc(UI.fmtDate(date)) + '）</h3>';
    html += '<p class="card-sub">总热量 <b>' + sum.kcal + '</b> kcal · 蛋白 ' + sum.protein + 'g · 碳水 ' + sum.carb + 'g · 脂肪 ' + sum.fat + 'g</p>';
    html += '<p class="card-sub">供能比：蛋白 ' + sum.proteinPct + '% · 碳水 ' + sum.carbPct + '% · 脂肪 ' + sum.fatPct + '% ｜ 饮水 ' + day.waterMl + ' ml</p>';
    html += '<div class="actions" style="margin-top:6px"><label class="inline">今日饮水 <input type="number" id="diet-water" value="' + day.waterMl + '" min="0" style="width:90px;display:inline-block" /> ml</label></div>';
    html += '</div>';

    // —— 餐次（四个固定）——
    html += '<div class="grid">';
    MEALS.forEach(function (m) {
      html += '<div class="card"><h3>' + esc(m.label) + '</h3>';
      var items = day.meals[m.key] || [];
      if (items.length === 0) {
        html += '<p class="empty-state">还没记录</p>';
      } else {
        html += '<ul class="list">';
        items.forEach(function (it) {
          html += '<li data-eid="' + it.id + '" data-meal="' + m.key + '"><span class="grow">' + esc(it.name) + ' <small class="card-sub">' + it.grams + 'g · ' + Math.round(it.nutrition.kcal) + 'kcal · P' + Math.round(it.nutrition.protein) + ' C' + Math.round(it.nutrition.carb) + ' F' + Math.round(it.nutrition.fat) + '</small></span><button class="btn btn-sm diet-edit-entry">改</button><button class="btn btn-sm btn-danger diet-del-entry">删</button></li>';
        });
        html += '</ul>';
      }
      html += '<button class="btn btn-sm btn-primary diet-add-entry" data-meal="' + m.key + '">+ 添加</button>';
      html += '</div>';
    });
    html += '</div>';

    // —— 食材库 ——
    html += '<div class="card" style="margin-top:12px"><h3>食材库</h3>';
    html += '<div class="actions"><input type="text" id="diet-food-q" placeholder="搜索名称" style="width:160px;display:inline-block" /> <button class="btn btn-sm btn-primary" id="diet-add-food">+ 添加食材</button></div>';
    var foods = Foods.listFoods({});
    if (foods.length === 0) {
      html += '<p class="empty-state">食物库还是空的，先加几个常吃的</p>';
    } else {
      html += '<ul class="list" id="diet-food-list">';
      foods.forEach(function (f) {
        html += '<li data-fid="' + f.id + '"><span class="grow">' + esc(f.name) + ' <small class="card-sub">' + Math.round(f.per100g.kcal) + 'kcal/100g · 蛋' + Math.round(f.per100g.protein) + ' 碳' + Math.round(f.per100g.carb) + ' 脂' + Math.round(f.per100g.fat) + '</small></span><button class="btn btn-sm diet-edit-food">改</button><button class="btn btn-sm btn-danger diet-del-food">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    return html;
  }

  function render(viewEl, topbar) {
    if (state.date == null) state.date = UI.todayStr();
    var date = state.date;
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '饮食计划';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    lastView = viewEl; lastTopbar = topbar;
    viewEl.innerHTML = '<div class="diet-root">' + build({ date: date }) + '</div>';
    bindView(viewEl.querySelector('.diet-root'), date);
  }

  function rerender() {
    if (lastView) render(lastView, lastTopbar);
  }

  function bindView(viewEl, date) {
    if (!viewEl) return; // 无 DOM 环境（如测试基座）下安全跳过绑定
    var prev = viewEl.querySelector('#diet-prev');
    var next = viewEl.querySelector('#diet-next');
    var todayBtn = viewEl.querySelector('#diet-today');
    if (prev) prev.addEventListener('click', function () { state.date = shiftDate(state.date, -1); rerender(); });
    if (next) next.addEventListener('click', function () { state.date = shiftDate(state.date, 1); rerender(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { state.date = UI.todayStr(); rerender(); });

    // 食材库搜索（局部刷新列表）
    var foodQ = viewEl.querySelector('#diet-food-q');
    function refreshFoodList() {
      var list = viewEl.querySelector('#diet-food-list');
      if (!list) return;
      var q = foodQ ? foodQ.value : '';
      var items = Foods.listFoods({ q: q });
      if (!items.length) { list.outerHTML = '<p class="empty-state">没有匹配的食材</p>'; return; }
      var ul = '<ul class="list" id="diet-food-list">';
      items.forEach(function (f) {
        ul += '<li data-fid="' + f.id + '"><span class="grow">' + esc(f.name) + ' <small class="card-sub">' + Math.round(f.per100g.kcal) + 'kcal/100g · 蛋' + Math.round(f.per100g.protein) + ' 碳' + Math.round(f.per100g.carb) + ' 脂' + Math.round(f.per100g.fat) + '</small></span><button class="btn btn-sm diet-edit-food">改</button><button class="btn btn-sm btn-danger diet-del-food">删</button></li>';
      });
      ul += '</ul>';
      list.outerHTML = ul;
    }
    if (foodQ) foodQ.addEventListener('input', refreshFoodList);

    // 饮水记录
    var waterInput = viewEl.querySelector('#diet-water');
    if (waterInput) waterInput.addEventListener('change', function () { Log.setWater(state.date, num(waterInput.value)); rerender(); });

    // 添加食材
    var addFoodBtn = viewEl.querySelector('#diet-add-food');
    if (addFoodBtn) addFoodBtn.addEventListener('click', function () { openFoodModal(); });

    // 条目 / 食材 的增删改（事件委托）
    viewEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('diet-add-entry')) { openEntryModal(t.getAttribute('data-meal')); return; }
      if (t.classList.contains('diet-edit-entry')) { var li = t.closest('li'); openEntryModal(li.getAttribute('data-meal'), li.getAttribute('data-eid')); return; }
      if (t.classList.contains('diet-del-entry')) { var le = t.closest('li'); Log.removeEntry(date, le.getAttribute('data-meal'), le.getAttribute('data-eid')); rerender(); return; }
      if (t.classList.contains('diet-edit-food')) { var lf = t.closest('li'); openFoodModal(lf.getAttribute('data-fid')); return; }
      if (t.classList.contains('diet-del-food')) { var lf2 = t.closest('li'); Foods.removeFood(lf2.getAttribute('data-fid')); rerender(); return; }
    });
  }

  // —— 弹窗表单 ——
  function openEntryModal(meal, entryId) {
    var foodOpts = '<option value="">手填营养</option>';
    Foods.listFoods({}).forEach(function (f) { foodOpts += '<option value="' + f.id + '">' + esc(f.name) + ' (' + Math.round(f.per100g.kcal) + 'kcal/100g)</option>'; });
    var mealOpts = '';
    MEALS.forEach(function (m) { mealOpts += '<option value="' + m.key + '"' + (m.key === meal ? ' selected' : '') + '>' + esc(m.label) + '</option>'; });
    var existing = entryId ? (function () {
      var d = Store.data.diet.days[state.date]; if (!d) return null;
      var res = null;
      MEAL_KEYS.forEach(function (m) { (d.meals[m] || []).forEach(function (it) { if (it.id === entryId) res = { meal: m, it: it }; }); });
      return res;
    })() : null;
    var init = existing ? existing.it : { name: '', grams: 100, nutrition: { kcal: 0, protein: 0, carb: 0, fat: 0 }, foodId: null };
    var mask = openModal(
      '<h4>' + (entryId ? '编辑条目' : '添加食物') + '</h4>' +
      '<label class="field"><span>餐次</span><select id="en-meal">' + mealOpts + '</select></label>' +
      '<label class="field"><span>从食材库选</span><select id="en-food">' + foodOpts + '</select></label>' +
      '<label class="field"><span>名称</span><input type="text" id="en-name" value="' + esc(init.name) + '" /></label>' +
      '<label class="field"><span>份量(g)</span><input type="number" id="en-grams" value="' + (init.grams || 100) + '" min="0" /></label>' +
      '<div id="en-manual" style="border-top:1px solid #eee;margin-top:8px;padding-top:8px">' +
      '<label class="field"><span>热量 kcal</span><input type="number" id="en-kcal" value="' + Math.round(init.nutrition.kcal) + '" /></label>' +
      '<label class="field"><span>蛋白 g</span><input type="number" id="en-p" value="' + Math.round(init.nutrition.protein) + '" /></label>' +
      '<label class="field"><span>碳水 g</span><input type="number" id="en-c" value="' + Math.round(init.nutrition.carb) + '" /></label>' +
      '<label class="field"><span>脂肪 g</span><input type="number" id="en-f" value="' + Math.round(init.nutrition.fat) + '" /></label>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn" id="en-cancel">取消</button><button class="btn btn-primary" id="en-ok">保存</button></div>'
    );
    var foodSel = mask.querySelector('#en-food');
    foodSel.addEventListener('change', function () {
      mask.querySelector('#en-manual').style.display = foodSel.value ? 'none' : 'block';
    });
    mask.querySelector('#en-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#en-ok').onclick = function () {
      var meal2 = mask.querySelector('#en-meal').value;
      var name = mask.querySelector('#en-name').value;
      var grams = num(mask.querySelector('#en-grams').value);
      var fid = foodSel.value || null;
      if (!name.trim()) { UI.toast('请填写名称', 'error'); return; }
      if (entryId) {
        Log.updateEntry(state.date, existing.meal, entryId, fid ? { foodId: fid, name: name, grams: grams } : { name: name, grams: grams, nutrition: { kcal: num(mask.querySelector('#en-kcal').value), protein: num(mask.querySelector('#en-p').value), carb: num(mask.querySelector('#en-c').value), fat: num(mask.querySelector('#en-f').value) } });
      } else {
        Log.addEntry(state.date, meal2, fid ? { foodId: fid, name: name, grams: grams } : { name: name, grams: grams, nutrition: { kcal: num(mask.querySelector('#en-kcal').value), protein: num(mask.querySelector('#en-p').value), carb: num(mask.querySelector('#en-c').value), fat: num(mask.querySelector('#en-f').value) } });
      }
      closeModal(mask); rerender();
    };
  }

  function openFoodModal(fid) {
    var f = fid ? Foods.find(fid) : null;
    var mask = openModal(
      '<h4>' + (fid ? '编辑食材' : '添加食材') + '</h4>' +
      '<label class="field"><span>名称</span><input type="text" id="ff-name" value="' + (f ? esc(f.name) : '') + '" /></label>' +
      '<label class="field"><span>热量/100g</span><input type="number" id="ff-kcal" value="' + (f ? Math.round(f.per100g.kcal) : 0) + '" /></label>' +
      '<label class="field"><span>蛋白/100g</span><input type="number" id="ff-p" value="' + (f ? Math.round(f.per100g.protein) : 0) + '" /></label>' +
      '<label class="field"><span>碳水/100g</span><input type="number" id="ff-c" value="' + (f ? Math.round(f.per100g.carb) : 0) + '" /></label>' +
      '<label class="field"><span>脂肪/100g</span><input type="number" id="ff-f" value="' + (f ? Math.round(f.per100g.fat) : 0) + '" /></label>' +
      '<div class="modal-actions"><button class="btn" id="ff-cancel">取消</button><button class="btn btn-primary" id="ff-ok">保存</button></div>'
    );
    mask.querySelector('#ff-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#ff-ok').onclick = function () {
      var spec = {
        name: mask.querySelector('#ff-name').value,
        per100g: { kcal: num(mask.querySelector('#ff-kcal').value), protein: num(mask.querySelector('#ff-p').value), carb: num(mask.querySelector('#ff-c').value), fat: num(mask.querySelector('#ff-f').value) },
      };
      if (fid) Foods.updateFood(fid, spec); else Foods.addFood(spec);
      closeModal(mask); rerender();
    };
  }

  // 暴露子服务命名空间 + 门面
  W.DietFoods = Foods;
  W.DietLog = Log;
  W.Diet = Diet;
  if (W.Router) W.Router.register('diet', render, '饮食计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Diet;
})();
