/*
 * chart.js — 图表渲染 adapter（原生 SVG，零依赖）
 * 把"画体重趋势图"收敛到一条 seam：业务模块只传 { dates, weights }，不认识绘图细节。
 * 适配器自管生命周期：renderWeightTrend 时 bind window.resize，dispose 时 unbind 并清理，
 * 从结构上消除原 BUG-004 的全局监听泄漏。
 * 全局契约：W.Chart = { renderWeightTrend(dom, {dates, weights}), dispose() }
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;

  // 当前渲染上下文，dispose 时清空
  var current = null;

  function getThemeColor() {
    try {
      // 主色随当前皮肤 accent 变化（theming：--accent 取代旧 --theme-color）
      // 注意：皮肤变量定义在 <body data-skin> 上，CSS 变量只向下继承，必须读 body 而非 html
      var v = W.getComputedStyle(W.document.body).getPropertyValue('--accent');
      return (v && v.trim()) || '#3b82f6';
    } catch (e) { return '#3b82f6'; }
  }
  function isDark() {
    // 明暗判断 = 深色开启 或 皮肤本身为暗色（cyber 恒暗）
    try {
      var body = W.document.body;
      if (!body) return false;
      return body.getAttribute('data-theme') === 'dark' || body.getAttribute('data-skin') === 'cyber';
    } catch (e) { return false; }
  }
  function hexToRgba(hex, a) {
    hex = (hex || '').trim();
    if (hex[0] !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // 纯函数：数据 + 尺寸 → SVG 字符串（便于无 DOM 单元测试）
  function buildSvg(dates, weights, opts) {
    opts = opts || {};
    var width = opts.width || 600;
    var height = opts.height || 280;
    var color = opts.color || '#3b82f6';
    var dark = !!opts.dark;
    var axisColor = dark ? '#94a3b8' : '#6b7280';
    var splitColor = dark ? '#334155' : '#e5e7eb';

    var n = dates.length;
    if (!n) return '';

    var padL = 44, padR = 16, padT = 16, padB = 30;
    var plotW = Math.max(10, width - padL - padR);
    var plotH = Math.max(10, height - padT - padB);

    var min = Math.min.apply(null, weights);
    var max = Math.max.apply(null, weights);
    if (min === max) { min -= 1; max += 1; }

    function xAt(i) { return n === 1 ? padL + plotW / 2 : padL + plotW * (i / (n - 1)); }
    function yAt(v) { return padT + plotH * ((max - v) / (max - min)); }

    var i, x, y;
    // 网格线 + y 轴刻度
    var grid = '';
    var ticks = [max, (max + min) / 2, min];
    for (i = 0; i < ticks.length; i++) {
      var gy = yAt(ticks[i]);
      grid += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + gy.toFixed(1) + '" stroke="' + splitColor + '" stroke-width="1" />';
      grid += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + axisColor + '">' + Math.round(ticks[i]) + '</text>';
    }

    // x 轴标签：点少全显，点多只显首 / 中 / 尾
    var xLabels = '';
    var labelIdx = n <= 7 ? null : [0, Math.floor((n - 1) / 2), n - 1];
    for (i = 0; i < n; i++) {
      if (labelIdx && labelIdx.indexOf(i) === -1) continue;
      var lx = xAt(i);
      xLabels += '<text x="' + lx.toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle" font-size="11" fill="' + axisColor + '">' + String(dates[i]).slice(5) + '</text>';
    }

    // 折线 + 数据点
    var linePts = '';
    var dots = '';
    for (i = 0; i < n; i++) {
      x = xAt(i); y = yAt(weights[i]);
      linePts += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + color + '" />';
    }
    var baseY = (padT + plotH).toFixed(1);
    var areaPath = 'M' + xAt(0).toFixed(1) + ',' + baseY + ' ' + linePts.trim() + ' L' + xAt(n - 1).toFixed(1) + ',' + baseY + ' Z';

    return '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="体重趋势">' +
      grid +
      '<path d="' + areaPath + '" fill="' + hexToRgba(color, 0.12) + '" stroke="none" />' +
      '<path d="' + linePts.trim() + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
      dots +
      xLabels +
      '</svg>';
  }

  function draw() {
    if (!current) return;
    var width = (current.dom.clientWidth && current.dom.clientWidth > 0) ? current.dom.clientWidth : 600;
    var color = getThemeColor();
    var dark = isDark();
    current.dom.innerHTML = buildSvg(current.dates, current.weights, { width: width, height: 280, color: color, dark: dark });
  }

  function onResize() { draw(); }

  function bindResize() {
    if (W.__chartResizeBound) return;
    if (typeof W.addEventListener === 'function') {
      W.addEventListener('resize', onResize);
      W.__chartResizeBound = true;
    }
  }
  function unbindResize() {
    if (W.__chartResizeBound && typeof W.removeEventListener === 'function') {
      W.removeEventListener('resize', onResize);
    }
    W.__chartResizeBound = false;
  }

  function renderWeightTrend(dom, data) {
    if (!dom || !data || !data.dates || !data.dates.length) return;
    dispose(); // 先清理旧实例与监听，保证幂等、不泄漏
    current = { dom: dom, dates: data.dates.slice(), weights: data.weights.slice() };
    draw();
    bindResize();
  }

  function dispose() {
    unbindResize();
    current = null;
  }

  var Chart = {
    renderWeightTrend: renderWeightTrend,
    dispose: dispose,
    _buildSvg: buildSvg
  };
  W.Chart = Chart;
  if (typeof module !== 'undefined' && module.exports) module.exports = Chart;
})();
