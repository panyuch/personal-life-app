/*
 * fitness.js — 健身计划（重构版）
 * 需求：
 *  1) 以「月历日程表」呈现；右上角显示当月日期与星期；下方提供「设置」按钮。
 *  2) 点击「设置」弹出弹窗，训练部位下拉框（胸/肩/背/腿/有氧 共五项）。
 *  3) 选择部位后，日程表该日以醒目大字显示部位名称。
 *  4) 点击日程表中的训练部位，跳转新页面，展示当日 5 个训练动作。
 *  5) 当日 5 个动作全部完成，日程表当天右下角显示绿色「√」。
 *  6) 日程表下方用 ECharts 展示身体数据变化，提供「记录」按钮，输入年月日+体重(kg)后实时更新图表。
 * 依赖：本地内置 js/vendor/echarts.min.js（全局 echarts），离线可用。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 训练部位（下拉框五项）
  var PARTS = ['胸', '肩', '背', '腿', '有氧'];
  var PART_COLORS = { '胸': '#ef4444', '肩': '#f59e0b', '背': '#10b981', '腿': '#3b82f6', '有氧': '#8b5cf6' };

  // 各部位默认 5 个训练动作（安排部位时自动初始化）
  var DEFAULT_EXERCISES = {
    '胸': ['杠铃平板卧推', '上斜哑铃推举', '双杠臂屈伸', '坐姿器械夹胸', '标准俯卧撑'],
    '肩': ['站姿杠铃推举', '哑铃侧平举', '哑铃前平举', '俯身反向飞鸟', '绳索面拉'],
    '背': ['引体向上', '杠铃俯身划船', '高位下拉', '坐姿划船', '传统硬拉'],
    '腿': ['杠铃深蹲', '腿举', '罗马尼亚硬拉', '坐姿腿屈伸', '站姿提踵'],
    '有氧': ['慢跑', '跳绳', '划船机', '椭圆机', '动感单车']
  };

  // 视图状态（月历翻月、选中某天）——模块级保持，避免翻月/返回丢状态
  var viewState = { year: 0, month: 0, selectedDate: '' };
  var chart = null; // ECharts 实例

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDateWeek(dateStr) {
    var p = String(dateStr).split('-');
    if (p.length < 3) return dateStr;
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return dateStr + ' ' + WEEK[dt.getDay()];
  }

  // ——— 日程表（schedule）读写 ———
  function getDay(dateStr) { return Store.data.fitness.schedule[dateStr] || null; }

  function setPart(dateStr, part) {
    var d = Store.data.fitness.schedule[dateStr];
    if (!d) { d = { part: null, exercises: [] }; Store.data.fitness.schedule[dateStr] = d; }
    if (d.part !== part) {
      d.part = part;
      d.exercises = (DEFAULT_EXERCISES[part] || []).map(function (n) { return { name: n, done: false }; });
    }
    Store.save();
  }

  function dayComplete(dateStr) {
    var d = getDay(dateStr);
    return !!(d && d.exercises && d.exercises.length === 5 && d.exercises.every(function (e) { return e.done; }));
  }

  function toggleExercise(dateStr, idx) {
    var d = getDay(dateStr);
    if (!d || !d.exercises[idx]) return false;
    d.exercises[idx].done = !d.exercises[idx].done;
    Store.save();
    return true;
  }

  function removeDay(dateStr) {
    if (Store.data.fitness.schedule[dateStr]) { delete Store.data.fitness.schedule[dateStr]; Store.save(); return true; }
    return false;
  }

  function doneCount(dateStr) {
    var d = getDay(dateStr);
    if (!d || !d.exercises) return 0;
    return d.exercises.filter(function (e) { return e.done; }).length;
  }

  // ——— 身体数据（体重趋势，供 ECharts）———
  function addBody(opts) {
    opts = opts || {};
    if (opts.weight == null || opts.weight === '' || isNaN(Number(opts.weight))) return null;
    var b = {
      id: Store.uid(),
      date: opts.date || UI.todayStr(),
      weight: Number(opts.weight),
      bodyFat: (opts.bodyFat == null || opts.bodyFat === '') ? null : Number(opts.bodyFat),
      note: opts.note || ''
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
  function trendData() {
    return Store.data.fitness.body.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
  }

  // ——— 摘要（供首页读取，改用新 schedule）———
  function summary(refStr) {
    refStr = refStr || UI.todayStr();
    var d = Store.data.fitness.schedule[refStr];
    var trained = d ? d.part : null;
    // 兼容旧数据（checkins）
    if (!trained) {
      for (var i = 0; i < Store.data.fitness.checkins.length; i++) {
        if (Store.data.fitness.checkins[i].date === refStr) { trained = '训练'; break; }
      }
    }
    var sorted = trendData();
    var latest = sorted.length ? { date: sorted[sorted.length - 1].date, weight: sorted[sorted.length - 1].weight } : null;
    return { trainedToday: trained, latestWeight: latest };
  }

  // ——— 通用弹窗 ———
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

  function openSettings() {
    var sd = viewState.selectedDate || UI.todayStr();
    var opts = PARTS.map(function (p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');
    var mask = openModal(
      '<h4>设置训练部位</h4>' +
      '<p class="card-sub" style="margin:0 0 12px">日期：' + UI.escapeHtml(fmtDateWeek(sd)) + '</p>' +
      '<label class="field"><span>训练部位</span><select id="fit-part-select">' + opts + '</select></label>' +
      '<div class="modal-actions"><button class="btn" id="fit-set-cancel">取消</button><button class="btn btn-primary" id="fit-set-ok">确定</button></div>'
    );
    var sel = mask.querySelector('#fit-part-select');
    var cur = getDay(sd);
    if (cur && cur.part) sel.value = cur.part;
    mask.querySelector('#fit-set-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#fit-set-ok').onclick = function () {
      setPart(sd, sel.value);
      closeModal(mask);
      W.Router.reload();
    };
  }

  function openRecord() {
    var today = UI.todayStr();
    var mask = openModal(
      '<h4>记录身体数据</h4>' +
      '<label class="field"><span>日期（年月日）</span><input type="date" id="fit-rec-date" value="' + today + '" /></label>' +
      '<label class="field"><span>体重 (kg)</span><input type="number" id="fit-rec-weight" step="0.1" min="0" placeholder="如 68.5" /></label>' +
      '<div class="modal-actions"><button class="btn" id="fit-rec-cancel">取消</button><button class="btn btn-primary" id="fit-rec-ok">保存</button></div>'
    );
    mask.querySelector('#fit-rec-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#fit-rec-ok').onclick = function () {
      var date = mask.querySelector('#fit-rec-date').value;
      var w = mask.querySelector('#fit-rec-weight').value;
      if (!date) { UI.toast('请选择日期', 'error'); return; }
      var b = addBody({ date: date, weight: w });
      if (!b) { UI.toast('请输入有效体重', 'error'); return; }
      closeModal(mask);
      W.Router.reload(); // 图表实时刷新
    };
  }

  // ——— ECharts 体重趋势 ———
  function getThemeColor() {
    try {
      var v = W.getComputedStyle(W.document.documentElement).getPropertyValue('--theme-color');
      return (v && v.trim()) || '#3b82f6';
    } catch (e) { return '#3b82f6'; }
  }
  function isDark() { return !!(W.document.body && W.document.body.getAttribute('data-theme') === 'dark'); }
  function hexToRgba(hex, a) {
    hex = (hex || '').trim();
    if (hex[0] !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function disposeChart() { if (chart) { try { chart.dispose(); } catch (e) {} chart = null; } }

  function renderChart(dom) {
    if (!W.echarts || !dom) return;
    disposeChart();
    chart = W.echarts.init(dom);
    var data = trendData();
    var dates = data.map(function (d) { return d.date; });
    var weights = data.map(function (d) { return d.weight; });
    var themeColor = getThemeColor();
    var dark = isDark();
    var axisColor = dark ? '#94a3b8' : '#6b7280';
    var splitColor = dark ? '#334155' : '#e5e7eb';
    chart.setOption({
      grid: { left: 46, right: 18, top: 18, bottom: 28 },
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return v + ' kg'; } },
      xAxis: {
        type: 'category', data: dates, boundaryGap: false,
        axisLabel: { color: axisColor, fontSize: 11 }, axisLine: { lineStyle: { color: splitColor } }
      },
      yAxis: {
        type: 'value', scale: true, name: 'kg', nameTextStyle: { color: axisColor, fontSize: 11 },
        axisLabel: { color: axisColor, fontSize: 11 }, splitLine: { lineStyle: { color: splitColor } }
      },
      series: [{
        name: '体重', type: 'line', smooth: true, data: weights,
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: themeColor }, lineStyle: { color: themeColor, width: 2 },
        areaStyle: { color: hexToRgba(themeColor, 0.12) }
      }]
    });
  }

  // ——— 顶栏 ———
  function setTopbar(topbar, title, dateStr) {
    if (!topbar) return;
    var t = topbar.querySelector('#page-title'); if (t) t.textContent = title;
    var p = topbar.querySelector('#page-date'); if (p) p.textContent = dateStr || '';
    var b = topbar.querySelector('#primary-btn'); if (b) { b.textContent = ''; b.style.display = 'none'; }
  }

  // ——— 月历渲染 ———
  function ensureViewState() {
    if (!viewState.year) {
      var now = new Date();
      viewState.year = now.getFullYear();
      viewState.month = now.getMonth();
      viewState.selectedDate = UI.todayStr(now);
    }
  }

  function shiftMonth(delta) {
    var m = viewState.month + delta, y = viewState.year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    viewState.month = m; viewState.year = y;
    W.Router.reload();
  }

  function buildCalendar() {
    ensureViewState();
    var y = viewState.year, m = viewState.month; // m: 0-based
    var monthLabel = y + '年' + (m + 1) + '月';
    var sd = viewState.selectedDate || UI.todayStr();
    var today = UI.todayStr();

    var first = new Date(y, m, 1);
    var startDay = first.getDay(); // 0=周日
    var lead = (startDay === 0) ? 6 : startDay - 1; // 周一为一周起点
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var cells = '';
    var i;
    for (i = 0; i < lead; i++) cells += '<div class="cal-cell cal-blank"></div>';
    for (i = 1; i <= daysInMonth; i++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(i);
      var cls = 'cal-cell';
      if (ds === today) cls += ' today';
      if (ds === sd) cls += ' selected';
      var inner = '<div class="cal-daynum">' + i + '</div>';
      var day = getDay(ds);
      if (day && day.part) {
        var color = PART_COLORS[day.part] || 'var(--theme-color)';
        inner += '<button class="cal-part" data-nav="' + ds + '" style="color:' + color + '">' + UI.escapeHtml(day.part) + '</button>';
      }
      if (dayComplete(ds)) inner += '<span class="cal-check" title="已完成">✓</span>';
      cells += '<div class="' + cls + '" data-date="' + ds + '">' + inner + '</div>';
    }
    // 补齐最后一行到 7 的倍数
    var total = lead + daysInMonth;
    var rem = total % 7; if (rem !== 0) { for (var k = 0; k < 7 - rem; k++) cells += '<div class="cal-cell cal-blank"></div>'; }

    var weekdays = ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<div class="cal-wd">' + w + '</div>'; }).join('');

    var html = '';
    html += '<div class="cal-card">';
    html += '<div class="cal-head">';
    html += '<div class="cal-title">训练日程</div>';
    html += '<div class="cal-head-right">';
    html += '<div class="cal-nav"><button class="icon-btn" data-cal-prev aria-label="上个月">‹</button><span class="cal-month">' + monthLabel + '</span><button class="icon-btn" data-cal-next aria-label="下个月">›</button></div>';
    html += '<div class="cal-date">' + UI.escapeHtml(fmtDateWeek(sd)) + '</div>';
    html += '</div></div>';
    html += '<div class="cal-toolbar"><span class="cal-hint">选中某天 → 点「设置」安排训练部位；点击部位名称进入当日动作</span><button class="btn btn-primary" id="fit-settings-btn">设置</button></div>';
    html += '<div class="cal-weekdays">' + weekdays + '</div>';
    html += '<div class="cal-grid">' + cells + '</div>';
    html += '</div>';

    // 身体数据 + ECharts
    html += '<div class="card"><div class="cal-body-head"><h3>身体数据</h3><button class="btn btn-primary" id="fit-record-btn">记录</button></div>';
    var data = trendData();
    if (data.length === 0) {
      html += '<div class="echart-empty">暂无身体数据，点「记录」添加体重</div>';
    } else {
      html += '<div id="fit-chart" class="echart-box"></div>';
    }
    if (data.length) {
      html += '<ul class="list" style="margin-top:12px">';
      data.slice().reverse().slice(0, 6).forEach(function (b) {
        html += '<li data-bid="' + b.id + '"><span class="grow">' + UI.escapeHtml(b.date) + ' · ' + b.weight + ' kg' + (b.bodyFat != null ? ' · 体脂 ' + b.bodyFat + '%' : '') + '</span><button class="btn btn-sm btn-danger" data-del-body="' + b.id + '">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  function renderCalendar(viewEl, topbar) {
    setTopbar(topbar, '健身计划', fmtDateWeek(viewState.selectedDate || UI.todayStr()));
    if (!viewEl) return;
    // 包一层会随 innerHTML 重建的子容器，事件委托挂在其上，避免监听器在持久 #view 上累积
    viewEl.innerHTML = '<div class="fit-root">' + buildCalendar() + '</div>';
    var root = viewEl.querySelector('.fit-root');
    bindCalendar(root);
    // 初始化 ECharts（仅在有数据时）
    var dom = root.querySelector('#fit-chart');
    if (dom) renderChart(dom);
  }

  function bindCalendar(viewEl) {
    // viewEl 为每次渲染重建的 .fit-root 子容器
    viewEl.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { W.location.hash = '#/fitness/day/' + nav.getAttribute('data-nav'); return; }
      if (e.target.closest('[data-cal-prev]')) { shiftMonth(-1); return; }
      if (e.target.closest('[data-cal-next]')) { shiftMonth(1); return; }
      if (e.target.id === 'fit-settings-btn') { openSettings(); return; }
      if (e.target.id === 'fit-record-btn') { openRecord(); return; }
      var del = e.target.closest('[data-del-body]');
      if (del) {
        var id = del.getAttribute('data-del-body');
        UI.confirm({ title: '删除记录', message: '确定删除该身体数据吗？' }).then(function (ok) {
          if (ok) { removeBody(id); W.Router.reload(); }
        });
        return;
      }
      var cell = e.target.closest('.cal-cell');
      if (cell && cell.getAttribute('data-date') && !cell.classList.contains('cal-blank')) {
        viewState.selectedDate = cell.getAttribute('data-date');
        W.Router.reload();
      }
    });
  }

  // ——— 当日详情页（5 个训练动作）———
  function buildDetail(dateStr) {
    var day = getDay(dateStr);
    var html = '';
    html += '<a class="card-link" href="#/fitness" id="fit-back">← 返回日程</a>';
    html += '<div class="card detail-card">';
    html += '<div class="detail-head"><h3>' + UI.escapeHtml(fmtDateWeek(dateStr)) + '</h3>';
    if (day && day.part) html += '<span class="detail-part" style="color:' + (PART_COLORS[day.part] || 'var(--theme-color)') + '">' + UI.escapeHtml(day.part) + '训练</span>';
    html += '</div>';

    if (!day || !day.part) {
      html += '<div class="empty-state"><div class="empty-icon">∅</div><div class="empty-text">该日尚未安排训练</div>';
      html += '<button class="empty-action" id="fit-back2">返回日程安排</button></div>';
      html += '</div>';
      return html;
    }

    var done = doneCount(dateStr);
    var complete = dayComplete(dateStr);
    if (complete) {
      html += '<div class="detail-banner">🎉 今日 5 个动作全部完成！</div>';
    } else {
      html += '<div class="ex-progress">已完成 <b>' + done + '</b> / 5</div>';
    }
    html += '<ul class="list ex-list">';
    day.exercises.forEach(function (ex, i) {
      html += '<li data-ex-index="' + i + '"><input type="checkbox" class="ex-check"' + (ex.done ? ' checked' : '') + ' /><span class="grow' + (ex.done ? ' done-text' : '') + '"><b>' + (i + 1) + '.</b> ' + UI.escapeHtml(ex.name) + '</span></li>';
    });
    html += '</ul>';
    html += '<div class="detail-foot"><button class="btn btn-danger" id="fit-clear-day">清除当天安排</button></div>';
    html += '</div>';
    return html;
  }

  function renderDetail(dateStr, viewEl, topbar) {
    disposeChart();
    // 校验日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { W.location.hash = '#/fitness'; return; }
    setTopbar(topbar, '训练详情', fmtDateWeek(dateStr));
    if (!viewEl) return;
    // 包一层会随 innerHTML 重建的子容器，事件委托挂在其上，避免监听器在持久 #view 上累积
    viewEl.innerHTML = '<div class="fit-root">' + buildDetail(dateStr) + '</div>';
    var root = viewEl.querySelector('.fit-root');
    bindDetail(root, dateStr);
  }

  function bindDetail(viewEl, dateStr) {
    // viewEl 为每次渲染重建的 .fit-root 子容器
    viewEl.addEventListener('click', function (e) {
      if (e.target.id === 'fit-back' || e.target.id === 'fit-back2') { W.location.hash = '#/fitness'; return; }
      if (e.target.id === 'fit-clear-day') {
        UI.confirm({ title: '清除安排', message: '确定清除 ' + dateStr + ' 的训练安排吗？', danger: true }).then(function (ok) {
          if (ok) { removeDay(dateStr); W.location.hash = '#/fitness'; }
        });
        return;
      }
    });
    viewEl.addEventListener('change', function (e) {
      if (e.target.classList.contains('ex-check')) {
        var li = e.target.closest('li');
        var idx = +li.getAttribute('data-ex-index');
        toggleExercise(dateStr, idx);
        W.Router.reload();
      }
    });
  }

  // ——— 路由入口：根据 hash 走日历页或详情页 ———
  function render(viewEl, topbar) {
    var m = (W.location.hash || '').match(/^#\/fitness\/day\/(.+)$/);
    if (m) { renderDetail(decodeURIComponent(m[1]), viewEl, topbar); return; }
    renderCalendar(viewEl, topbar);
  }

  if (!W.__fitResizeBound) {
    W.addEventListener('resize', function () { if (chart) chart.resize(); });
    W.__fitResizeBound = true;
  }

  var Fitness = {
    PARTS: PARTS, DEFAULT_EXERCISES: DEFAULT_EXERCISES,
    getDay: getDay, setPart: setPart, dayComplete: dayComplete,
    toggleExercise: toggleExercise, removeDay: removeDay, doneCount: doneCount,
    addBody: addBody, findBody: findBody, removeBody: removeBody, trendData: trendData,
    summary: summary, render: render,
  };
  W.Fitness = Fitness;
  if (W.Router) W.Router.register('fitness', render, '健身计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Fitness;
})();
