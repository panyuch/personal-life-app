/*
 * 阶段5 测试：饮食计划（diet.js）
 * 覆盖：四餐加/删食物、当日汇总、常用食物库 CRUD、从库选填、目标热量进度条、数据隔离。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Diet = mods.diet;

function reset() { storage.clear(); Store.load(); }
const D = '2026-08-17';

H.section('餐食记录');
H.test('addFood 加入指定餐并保存', function () {
  reset();
  const it = Diet.addFood(D, 'breakfast', { name: '鸡蛋', kcal: 100, protein: 10, carb: 2, fat: 8 });
  H.ok(it && it.id, '应返回食物项');
  H.eq(Store.data.diet.days[D].meals.breakfast.length, 1, '早餐应有 1 条');
});
H.test('addFood 拒绝非法餐型与空名', function () {
  reset();
  H.eq(Diet.addFood(D, 'invalid', { name: 'x' }), null, '非法餐型返回 null');
  H.eq(Diet.addFood(D, 'lunch', { name: '  ' }), null, '空名返回 null');
});
H.test('removeFood 删除', function () {
  reset();
  const it = Diet.addFood(D, 'lunch', { name: '饭', kcal: 200 });
  H.ok(Diet.removeFood(D, 'lunch', it.id), '应删除成功');
  H.eq(Store.data.diet.days[D].meals.lunch.length, 0, '午餐应空');
});

H.section('当日汇总');
H.test('dailySummary 汇总热量与营养素', function () {
  reset();
  Diet.addFood(D, 'breakfast', { name: '蛋', kcal: 100, protein: 10, carb: 2, fat: 8 });
  Diet.addFood(D, 'lunch', { name: '饭', kcal: 200, protein: 15, carb: 30, fat: 5 });
  const s = Diet.dailySummary(D);
  H.eq(Math.round(s.kcal), 300, '总热量 300');
  H.eq(Math.round(s.protein), 25, '蛋白 25');
  H.eq(Math.round(s.carb), 32, '碳水 32');
  H.eq(Math.round(s.fat), 13, '脂肪 13');
});
H.test('dailySummary 无记录返回零', function () {
  reset();
  const s = Diet.dailySummary(D);
  H.eq(s.kcal, 0, '应为 0');
});

H.section('常用食物库');
H.test('addLibraryFood / removeLibraryFood', function () {
  reset();
  const f = Diet.addLibraryFood({ name: '鸡胸肉', kcal: 165, protein: 31, carb: 0, fat: 3 });
  H.eq(Store.data.diet.foods.length, 1, '库应有 1 条');
  H.ok(Diet.removeLibraryFood(f.id), '应删除成功');
  H.eq(Store.data.diet.foods.length, 0, '库应空');
});
H.test('从库选填会复制营养值', function () {
  reset();
  const f = Diet.addLibraryFood({ name: '燕麦', kcal: 150, protein: 5, carb: 27, fat: 3 });
  const it = Diet.addFood(D, 'breakfast', { name: f.name, kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat });
  H.eq(it.kcal, 150, '热量应复制');
  H.eq(it.carb, 27, '碳水应复制');
});

H.section('目标热量进度条');
H.test('setTarget 设定与进度比例', function () {
  reset();
  Diet.addFood(D, 'breakfast', { name: 'x', kcal: 300 });
  Diet.setTarget(600);
  H.eq(Store.data.diet.targetKcal, 600, '目标应保存');
  const html = Diet.build({ date: D });
  H.includes(html, 'width:50%', '300/600 应为 50%');
  H.includes(html, '已摄入 50%', '应显示 50%');
});
H.test('setTarget 设空清除目标', function () {
  reset();
  Diet.setTarget(600);
  Diet.setTarget('');
  H.eq(Store.data.diet.targetKcal, null, '清空后应为 null');
});

H.section('数据隔离与渲染');
H.test('饮食改动不污染其他模块', function () {
  reset();
  Diet.addFood(D, 'breakfast', { name: 'x', kcal: 100 });
  Diet.addLibraryFood({ name: 'y' });
  H.eq(Store.data.today.length, 0, 'today 不应受影响');
  H.eq(Store.data.work.plans.length, 0, 'work 不应受影响');
  H.eq(Store.data.fitness.body.length, 0, 'fitness 不应受影响');
});
H.test('build 含四餐标签与食物项', function () {
  reset();
  Diet.addFood(D, 'dinner', { name: '沙拉', kcal: 120 });
  const html = Diet.build({ date: D });
  ['早餐', '午餐', '晚餐', '加餐'].forEach(function (l) { H.includes(html, l, '应包含 ' + l); });
  H.includes(html, '沙拉', '应显示食物项');
});
H.test('build 空状态有引导', function () {
  reset();
  const html = Diet.build({ date: D });
  H.includes(html, 'empty-state', '应有空状态');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  Diet.addFood(D, 'breakfast', { name: 'x', kcal: 100 });
  let threw = false;
  try { Diet.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
