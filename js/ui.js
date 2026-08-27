/*
 * ui.js — 通用工具（全局 UI）
 * toast / confirm / empty / uid / 日期与时间工具 / applyTheme
 * 仅依赖 Store（在调用时通过 window 访问），加载时不强依赖。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 本地年月日拼字符串，避免 toISOString 的 UTC 偏移
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function fmtDate(str) {
    if (!str) return '';
    var p = String(str).split('-');
    if (p.length < 3) return str;
    var y = +p[0], m = +p[1], d = +p[2];
    var dt = new Date(y, m - 1, d);
    return pad(m) + '-' + pad(d) + ' ' + WEEK[dt.getDay()];
  }

  function dayOfWeek(str) {
    if (!str) return 0;
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  }

  // dueDate < 今天(或 refStr) 且非空 -> 逾期
  function isOverdue(dueDate, refStr) {
    if (!dueDate) return false;
    refStr = refStr || todayStr();
    return dueDate < refStr;
  }

  // 本周一~周日日期数组（周一为一周起点）
  function weekRange(ref) {
    ref = ref || new Date();
    var day = ref.getDay(); // 0=周日
    var diff = (day === 0) ? -6 : (1 - day);
    var mon = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff);
    var arr = [];
    for (var i = 0; i < 7; i++) {
      arr.push(todayStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
    }
    return arr;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 轻提示（浏览器中插入 DOM；Node 下无副作用）
  function toast(msg, type) {
    var d = W.document;
    if (!d || !d.body) return;
    var box = d.createElement('div');
    box.className = 'toast toast-' + (type || 'info');
    box.textContent = msg;
    d.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2200);
  }

  // 二次确认，返回 Promise<boolean>
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (W.window === W && typeof W.confirm === 'function' && !W.__testMode) {
        resolve(W.confirm((opts.title ? opts.title + '\n' : '') + (opts.message || '')));
        return;
      }
      var r = W.__confirmHandler ? W.__confirmHandler(opts) : false;
      resolve(r);
    });
  }

  // 空状态引导卡（返回 HTML 字符串）
  function empty(text, actionLabel, fn) {
    var html = '<div class="empty-state">';
    html += '<div class="empty-icon">∅</div>';
    html += '<div class="empty-text">' + escapeHtml(text || '暂无数据') + '</div>';
    if (actionLabel) {
      html += '<button class="empty-action" data-empty-action="1">' + escapeHtml(actionLabel) + '</button>';
    }
    html += '</div>';
    return html;
  }

  // 把设置映射到 <body> 属性：data-skin（风格键）+ data-theme="dark"（深色）。
  // 这是唯一的「设置 → 渲染」转换点：皮肤样式据这两个属性命中；不再写主题色变量。
  function applyTheme() {
    var d = W.document;
    if (!d) return;
    var s = (W.Store && W.Store.data) ? W.Store.data.settings : null;
    var theme = (s && s.theme) || (W.Store && W.Store.DEFAULT_THEME) || 'brutal';
    // 白名单校验：非法值回落默认风格，避免写出无效 data-skin
    if (W.Store && W.Store.THEMES && W.Store.THEMES.indexOf(theme) === -1) theme = (W.Store && W.Store.DEFAULT_THEME) || 'brutal';
    var dark = s ? !!s.darkMode : false;
    if (d.body) {
      d.body.setAttribute('data-skin', theme);
      if (dark) d.body.setAttribute('data-theme', 'dark');
      else d.body.removeAttribute('data-theme');
    }
  }

  var UI = {
    uid: uid,
    todayStr: todayStr,
    fmtDate: fmtDate,
    dayOfWeek: dayOfWeek,
    isOverdue: isOverdue,
    weekRange: weekRange,
    escapeHtml: escapeHtml,
    toast: toast,
    confirm: confirm,
    empty: empty,
    applyTheme: applyTheme,
  };

  W.UI = UI;
  if (typeof module !== 'undefined' && module.exports) module.exports = UI;
})();
