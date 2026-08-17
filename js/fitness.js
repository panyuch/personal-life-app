/*
 * fitness.js — 健身计划（阶段4，PRD §5.3）
 * 训练模板 CRUD、训练打卡（选模板预填/空白、记录组次重、勾完成、备注）、
 * 身体数据录入、体重趋势（原生 SVG 折线）。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  // ——— 训练模板 ———
  function addTemplate(name, note) {
    name = (name == null ? '' : String(name)).trim();
    if (!name) return null;
    var t = { id: Store.uid(), name: name, note: note || '', exercises: [] };
    Store.data.fitness.templates.push(t);
    Store.save();
    return t;
  }
  function findTemplate(id) {
    var ts = Store.data.fitness.templates;
    for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
    return null;
  }
  function updateTemplate(id, fields) {
    var t = findTemplate(id);
    if (!t) return false;
    fields = fields || {};
    if (fields.name != null) { var n = String(fields.name).trim(); if (n) t.name = n; }
    if (fields.note != null) t.note = fields.note;
    Store.save();
    return true;
  }
  function removeTemplate(id) {
    var ts = Store.data.fitness.templates;
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].id === id) { ts.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }
  function addExercise(templateId, ex) {
    var t = findTemplate(templateId);
    if (!t) return false;
    ex = ex || {};
    t.exercises.push({
      name: (ex.name == null ? '' : String(ex.name)).trim() || '动作',
      sets: ex.sets || 1, reps: ex.reps || 1, weight: ex.weight || 0,
    });
    Store.save();
    return true;
  }
  function removeExercise(templateId, index) {
    var t = findTemplate(templateId);
    if (!t || index < 0 || index >= t.exercises.length) return false;
    t.exercises.splice(index, 1);
    Store.save();
    return true;
  }

  // ——— 打卡 ———
  function prefillFromTemplate(templateId) {
    var t = findTemplate(templateId);
    if (!t) return [];
    return t.exercises.map(function (e) {
      return { name: e.name, sets: e.sets, reps: e.reps, weight: e.weight, done: false };
    });
  }
  function addCheckin(opts) {
    opts = opts || {};
    var items = opts.items;
    if (!items && opts.templateId) items = prefillFromTemplate(opts.templateId);
    items = (items || []).map(function (it) {
      return { name: it.name || '动作', sets: it.sets || 0, reps: it.reps || 0, weight: it.weight || 0, done: !!it.done };
    });
    var c = {
      id: Store.uid(),
      date: opts.date || UI.todayStr(),
      templateId: opts.templateId || null,
      items: items,
      note: opts.note || '',
    };
    Store.data.fitness.checkins.push(c);
    Store.save();
    return c;
  }
  function findCheckin(id) {
    var cs = Store.data.fitness.checkins;
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
    return null;
  }
  function updateCheckin(id, fields) { // fields: { items, note }
    var c = findCheckin(id);
    if (!c) return false;
    if (fields.items) c.items = fields.items;
    if (fields.note != null) c.note = fields.note;
    if (fields.templateId !== undefined) c.templateId = fields.templateId || null;
    Store.save();
    return true;
  }
  function removeCheckin(id) {
    var cs = Store.data.fitness.checkins;
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].id === id) { cs.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }
  function toggleCheckinItem(checkinId, index) {
    var c = findCheckin(checkinId);
    if (!c || index < 0 || index >= c.items.length) return false;
    c.items[index].done = !c.items[index].done;
    Store.save();
    return true;
  }

  // ——— 身体数据 ———
  function addBody(opts) {
    opts = opts || {};
    if (opts.weight == null || opts.weight === '' || isNaN(Number(opts.weight))) return null;
    var b = {
      id: Store.uid(),
      date: opts.date || UI.todayStr(),
      weight: Number(opts.weight),
      bodyFat: (opts.bodyFat == null || opts.bodyFat === '') ? null : Number(opts.bodyFat),
      note: opts.note || '',
    };
    Store.data.fitness.body.push(b);
    Store.save();
    return b;
  }
  function findBody(id) {
    var bs = Store.data.fitness.body;
    for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i];
    return null;
  }
  function removeBody(id) {
    var bs = Store.data.fitness.body;
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].id === id) { bs.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }
  // 按日期升序的体重序列
  function trendData() {
    return Store.data.fitness.body.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
  }

  // ——— 摘要 ———
  function summary(refStr) {
    refStr = refStr || UI.todayStr();
    var trained = null;
    for (var i = 0; i < Store.data.fitness.checkins.length; i++) {
      if (Store.data.fitness.checkins[i].date === refStr) {
        var c = Store.data.fitness.checkins[i];
        trained = c.templateId ? (findTemplate(c.templateId) || {}).name || '训练' : '训练';
        break;
      }
    }
    var sorted = trendData();
    var latest = sorted.length ? { date: sorted[sorted.length - 1].date, weight: sorted[sorted.length - 1].weight } : null;
    return { trainedToday: trained, latestWeight: latest };
  }

  // ——— 体重趋势 SVG（原生，无依赖）———
  function buildTrendSvg() {
    var data = trendData();
    var Wd = 320, Ht = 140, pad = 28;
    if (data.length === 0) {
      return '<svg class="chart-svg" viewBox="0 0 ' + Wd + ' ' + Ht + '"><text x="' + (Wd / 2) + '" y="' + (Ht / 2) + '" text-anchor="middle" fill="#94a3b8">暂无体重数据</text></svg>';
    }
    var weights = data.map(function (d) { return d.weight; });
    var minW = Math.min.apply(null, weights), maxW = Math.max.apply(null, weights);
    if (minW === maxW) { minW -= 1; maxW += 1; }
    function x(i) { return pad + (data.length === 1 ? (Wd - 2 * pad) / 2 : (Wd - 2 * pad) * i / (data.length - 1)); }
    function y(w) { return pad + (Ht - 2 * pad) * (1 - (w - minW) / (maxW - minW)); }
    var pts = data.map(function (d, i) { return x(i) + ',' + y(d.weight); }).join(' ');
    var circles = data.map(function (d, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(d.weight) + '" r="3.5" fill="var(--theme-color)"><title>' + UI.escapeHtml(d.date) + ' : ' + d.weight + 'kg</title></circle>';
    }).join('');
    var labels = data.map(function (d, i) {
      if (data.length > 8 && i % 2 !== 0 && i !== data.length - 1) return '';
      return '<text x="' + x(i) + '" y="' + (Ht - 8) + '" text-anchor="middle" font-size="9" fill="#94a3b8">' + d.date.slice(5) + '</text>';
    }).join('');
    return '<svg class="chart-svg" viewBox="0 0 ' + Wd + ' ' + Ht + '" role="img" aria-label="体重趋势">'
      + '<polyline points="' + pts + '" fill="none" stroke="var(--theme-color)" stroke-width="2"/>'
      + circles + labels + '</svg>';
  }

  // ——— 渲染 ———
  function build(ctx) {
    ctx = ctx || {};
    var html = '';

    // 模板
    html += '<div class="card"><h3>训练模板</h3><div class="actions"><button class="btn btn-sm btn-primary" id="fit-add-tpl">+ 新建模板</button></div>';
    if (Store.data.fitness.templates.length === 0) {
      html += UI.empty('还没有模板，先建一个吧', null, null);
    } else {
      html += '<ul class="list">';
      Store.data.fitness.templates.forEach(function (t) {
        html += '<li data-tid="' + t.id + '"><span class="grow"><b>' + UI.escapeHtml(t.name) + '</b>';
        html += ' <small class="card-sub">' + t.exercises.length + ' 个动作</small></span>';
        html += '<button class="btn btn-sm fit-add-ex">加动作</button><button class="btn btn-sm fit-edit-tpl">编辑</button><button class="btn btn-sm btn-danger fit-del-tpl">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 打卡
    html += '<div class="card"><h3>训练打卡</h3>';
    html += '<label class="field"><span>选择模板（可留空自定义）</span><select id="fit-tpl-select"><option value="">— 自定义 —</option>';
    Store.data.fitness.templates.forEach(function (t) {
      html += '<option value="' + t.id + '">' + UI.escapeHtml(t.name) + '</option>';
    });
    html += '</select></label>';
    html += '<button class="btn btn-sm btn-primary" id="fit-do-checkin">开始打卡</button>';
    html += '<div class="actions" style="margin-top:10px"><b>最近打卡</b></div>';
    if (Store.data.fitness.checkins.length === 0) {
      html += '<p class="card-sub">还没有打卡记录</p>';
    } else {
      html += '<ul class="list">';
      Store.data.fitness.checkins.slice().reverse().slice(0, 5).forEach(function (c) {
        var name = c.templateId ? (findTemplate(c.templateId) || {}).name || '已删模板' : '自定义';
        var done = c.items.filter(function (i) { return i.done; }).length;
        html += '<li data-cid="' + c.id + '"><span class="grow">' + UI.escapeHtml(UI.fmtDate(c.date) || c.date) + ' · ' + UI.escapeHtml(name) + ' <small class="card-sub">完成 ' + done + '/' + c.items.length + '</small></span><button class="btn btn-sm btn-danger fit-del-checkin">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 身体数据 + 趋势
    html += '<div class="card"><h3>身体数据</h3>';
    html += '<div class="add-row"><input type="number" id="fit-weight" placeholder="体重 kg" step="0.1" /><input type="number" id="fit-fat" placeholder="体脂 %（可选）" step="0.1" /><button class="btn btn-primary" id="fit-add-body">记录</button></div>';
    html += buildTrendSvg();
    if (Store.data.fitness.body.length) {
      html += '<ul class="list">';
      trendData().slice().reverse().slice(0, 5).forEach(function (b) {
        html += '<li data-bid="' + b.id + '"><span class="grow">' + UI.escapeHtml(b.date) + ' · ' + b.weight + 'kg' + (b.bodyFat != null ? ' · 体脂 ' + b.bodyFat + '%' : '') + '</span><button class="btn btn-sm btn-danger fit-del-body">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  function render(viewEl, topbar) {
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '健身计划';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build();
    bind(viewEl);
  }

  function bind(viewEl) {
    var addTpl = viewEl.querySelector('#fit-add-tpl');
    if (addTpl) addTpl.addEventListener('click', function () {
      var name = W.prompt ? W.prompt('模板名称') : null;
      if (name) { addTemplate(name); W.Router.reload(); }
    });
    var tpls = viewEl.querySelector('#fit-add-tpl') ? viewEl : null;
    var list = viewEl;
    list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li') : null;
      if (!li) return;
      if (e.target.classList.contains('fit-del-tpl')) {
        if (UI.confirm({ title: '删除模板', message: '确定删除该模板吗？', danger: true })) { removeTemplate(li.getAttribute('data-tid')); W.Router.reload(); }
      } else if (e.target.classList.contains('fit-edit-tpl')) {
        var t = findTemplate(li.getAttribute('data-tid'));
        var nv = W.prompt ? W.prompt('模板名称', t.name) : null;
        if (nv != null) { updateTemplate(t.id, { name: nv }); W.Router.reload(); }
      } else if (e.target.classList.contains('fit-add-ex')) {
        var tt = findTemplate(li.getAttribute('data-tid'));
        var en = W.prompt ? W.prompt('动作名称') : null;
        if (en) { addExercise(tt.id, { name: en, sets: 3, reps: 12, weight: 0 }); W.Router.reload(); }
      } else if (e.target.classList.contains('fit-del-checkin')) {
        if (UI.confirm({ title: '删除打卡', message: '确定删除该打卡记录吗？' })) { removeCheckin(li.getAttribute('data-cid')); W.Router.reload(); }
      } else if (e.target.classList.contains('fit-del-body')) {
        if (UI.confirm({ title: '删除记录', message: '确定删除该身体数据吗？' })) { removeBody(li.getAttribute('data-bid')); W.Router.reload(); }
      }
    });
    var doCheckin = viewEl.querySelector('#fit-do-checkin');
    if (doCheckin) doCheckin.addEventListener('click', function () {
      var sel = viewEl.querySelector('#fit-tpl-select');
      var tid = sel ? sel.value : '';
      addCheckin({ templateId: tid || null, note: '' });
      W.Router.reload();
    });
    var addBody = viewEl.querySelector('#fit-add-body');
    if (addBody) addBody.addEventListener('click', function () {
      var w = viewEl.querySelector('#fit-weight');
      var f = viewEl.querySelector('#fit-fat');
      if (w && addBodyEntry(w.value, f ? f.value : '')) W.Router.reload();
    });
  }
  function addBodyEntry(weight, fat) {
    var b = addBody({ weight: weight, bodyFat: fat });
    if (!b && W.UI && W.UI.toast) W.UI.toast('请输入有效体重', 'error');
    return b;
  }

  var Fitness = {
    addTemplate: addTemplate, findTemplate: findTemplate, updateTemplate: updateTemplate, removeTemplate: removeTemplate,
    addExercise: addExercise, removeExercise: removeExercise,
    prefillFromTemplate: prefillFromTemplate, addCheckin: addCheckin, findCheckin: findCheckin,
    updateCheckin: updateCheckin, removeCheckin: removeCheckin, toggleCheckinItem: toggleCheckinItem,
    addBody: addBody, findBody: findBody, removeBody: removeBody, trendData: trendData,
    summary: summary, buildTrendSvg: buildTrendSvg,
    build: build, render: render,
  };

  W.Fitness = Fitness;
  if (W.Router) W.Router.register('fitness', render, '健身计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Fitness;
})();
