/*
 * chart-seam.test.js — 图表 adapter 缝（W.Chart）验收
 * 覆盖：
 *  1) W.Chart 原生 SVG 纯函数（数据 → SVG 字符串）
 *  2) fitness 委托缝：有数据时调 renderWeightTrend 且传入正确 dates/weights
 *  3) 无数据时跳过（不调用）
 *  4) 进入当日详情页（renderDetail）时调 dispose（生命周期自管）
 */
'use strict';
const H = require('./harness');
const path = require('path');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Fitness = mods.fitness;

// 真实 chart adapter（用于 SVG 纯函数测试；seam 测试会临时替换为假 adapter 以断言传参）
const Chart = require(path.join(__dirname, '..', 'js', 'chart.js'));
win.Chart = Chart;

function reset() { storage.clear(); Store.load(); }

H.section('W.Chart 原生 SVG 纯函数');
H.test('_buildSvg 返回含坐标轴/折线/数据点的 SVG', function () {
  const svg = Chart._buildSvg(
    ['2026-08-16', '2026-08-18', '2026-08-20'],
    [71, 70, 69],
    { width: 600, height: 280, color: '#3b82f6', dark: false }
  );
  H.includes(svg, '<svg', '应含 svg 根元素');
  H.includes(svg, '<circle', '应含数据点');
  H.includes(svg, '<path', '应含折线/面积路径');
  H.includes(svg, '08-16', '应含起始日期标签');
  H.includes(svg, '08-20', '应含结束日期标签');
  H.includes(svg, '#3b82f6', '应含主题色描边');
});
H.test('_buildSvg 单点也能生成（不抛错、含唯一数据点）', function () {
  const svg = Chart._buildSvg(['2026-08-16'], [70], { width: 600, height: 280 });
  H.includes(svg, '<svg', '单点应生成 svg');
  H.includes(svg, '<circle', '单点应含一个数据点');
});
H.test('_buildSvg 空数据返回空串（安全）', function () {
  H.eq(Chart._buildSvg([], [], {}), '', '空数据应返回空串');
});

H.section('fitness 委托 W.Chart（注入假 adapter 断言传参）');
H.test('有数据时 render 调用 renderWeightTrend 并传入正确 dates/weights', function () {
  reset();
  Fitness.addBody({ date: '2026-08-18', weight: 69 });
  Fitness.addBody({ date: '2026-08-16', weight: 71 });
  Fitness.addBody({ date: '2026-08-17', weight: 70 });
  let called = null;
  win.Chart = {
    renderWeightTrend: function (dom, data) { called = { dom: dom, dates: data.dates, weights: data.weights }; },
    dispose: function () {}
  };
  win.location.hash = ''; // 走月历页
  Fitness.render(win.document.getElementById('view'), win.document.getElementById('topbar'));
  H.ok(called, '应调用 renderWeightTrend');
  H.ok(called.dom, '应传入 dom 容器');
  // trendData 已按日期升序，fitness 应原样透传
  H.eq(called.dates.join(','), '2026-08-16,2026-08-17,2026-08-18', 'dates 应按日期升序透传');
  H.eq(called.weights.join(','), '71,70,69', 'weights 应与 dates 一一对应');
});
H.test('无数据时 render 不调用 renderWeightTrend', function () {
  reset();
  let called = false;
  win.Chart = { renderWeightTrend: function () { called = true; }, dispose: function () {} };
  win.location.hash = '';
  Fitness.render(win.document.getElementById('view'), win.document.getElementById('topbar'));
  H.notOk(called, '无数据不应调用 renderWeightTrend');
});
H.test('进入当日详情页（renderDetail）时调用 dispose', function () {
  reset();
  let disposed = false;
  win.Chart = { renderWeightTrend: function () {}, dispose: function () { disposed = true; } };
  win.location.hash = '#/fitness/day/2026-08-17';
  Fitness.render(win.document.getElementById('view'), win.document.getElementById('topbar'));
  H.ok(disposed, '进入详情页应触发 dispose（释放旧图表实例与监听）');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
