/*
 * 阶段5 测试（v3-lite）：饮食计划（diet.js）
 * 覆盖：餐次记录（按克数折算/手填宏量）、当日汇总与供能比、食材库 CRUD（per100g）、
 *      数据隔离、渲染冒烟。目标/禁忌/食谱/餐次配置等已被简化方案砍掉，不再测试。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const Diet = mods.diet;

function reset() { storage.clear(); Store.load(); }
const D = '2026-08-17';

H.section('餐食记录（克数/宏量）');
H.test('addEntry 加入指定餐并保存', function () {
  reset();
  const it = Diet.addEntry(D, 'breakfast', { name: '鸡蛋', grams: 100, nutrition: { kcal: 100, protein: 10, carb: 2, fat: 8 } });
  H.ok(it && it.id, '应返回食物项');
  H.eq(Store.data.diet.days[D].meals.breakfast.length, 1, '早餐应有 1 条');
  H.eq(it.grams, 100, '克数记录');
});
H.test('addEntry 拒绝非法餐型与空名', function () {
  reset();
  H.eq(Diet.addEntry(D, 'invalid', { name: 'x' }), null, '非法餐型返回 null');
  H.eq(Diet.addEntry(D, 'lunch', { name: '  ' }), null, '空名返回 null');
});
H.test('addEntry 选食材库按克数自动折算营养', function () {
  reset();
  const f = Diet.addFood({ name: '鸡胸肉', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  const it = Diet.addEntry(D, 'breakfast', { foodId: f.id, name: '鸡胸', grams: 200 });
  H.eq(Math.round(it.nutrition.kcal), 330, '200g -> 330kcal');
  H.eq(Math.round(it.nutrition.protein), 62, '200g -> 62g 蛋白');
});
H.test('removeEntry 删除', function () {
  reset();
  const it = Diet.addEntry(D, 'lunch', { name: '饭', grams: 100, nutrition: { kcal: 200 } });
  H.ok(Diet.removeEntry(D, 'lunch', it.id), '应删除成功');
  H.eq(Store.data.diet.days[D].meals.lunch.length, 0, '午餐应空');
});

H.section('当日汇总与供能比');
H.test('dailySummary 汇总热量与营养素', function () {
  reset();
  Diet.addEntry(D, 'breakfast', { name: '蛋', grams: 100, nutrition: { kcal: 100, protein: 10, carb: 2, fat: 8 } });
  Diet.addEntry(D, 'lunch', { name: '饭', grams: 100, nutrition: { kcal: 200, protein: 15, carb: 30, fat: 5 } });
  const s = Diet.dailySummary(D);
  H.eq(s.kcal, 300, '总热量 300');
  H.eq(s.protein, 25, '蛋白 25');
  H.eq(s.carb, 32, '碳水 32');
  H.eq(s.fat, 13, '脂肪 13');
  H.eq(s.proteinPct + s.carbPct + s.fatPct, 100, '供能比合计 100%');
});
H.test('dailySummary 无记录返回零', function () {
  reset();
  const s = Diet.dailySummary(D);
  H.eq(s.kcal, 0, '应为 0');
});

H.section('食材库（per100g 结构化，按名称搜索）');
H.test('addFood / removeFood（库 CRUD）', function () {
  reset();
  const f = Diet.addFood({ name: '鸡胸肉', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  H.eq(Store.data.diet.foods.length, 1, '库应有 1 条');
  H.eq(f.per100g.kcal, 165, '每100g 热量');
  H.ok(Diet.removeFood(f.id), '应删除成功');
  H.eq(Store.data.diet.foods.length, 0, '库应空');
});
H.test('listFoods 按名称关键词搜索（分类/标签/别名已移除）', function () {
  reset();
  Diet.addFood({ name: '鸡胸肉', per100g: { kcal: 165, protein: 31 } });
  Diet.addFood({ name: '燕麦', per100g: { kcal: 380, protein: 15 } });
  H.eq(Diet.listFoods({ q: '鸡胸' }).length, 1, '名称搜索');
  H.eq(Diet.listFoods({ q: '燕麦' }).length, 1, '名称搜索 2');
  H.eq(Diet.listFoods({}).length, 2, '无过滤返回全部');
});

H.section('数据隔离与渲染');
H.test('饮食改动不污染其他模块', function () {
  reset();
  Diet.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  Diet.addFood({ name: 'y', per100g: { kcal: 100 } });
  H.eq(Store.data.today.length, 0, 'today 不应受影响');
  H.eq(Store.data.work.plans.length, 0, 'work 不应受影响');
  H.eq(Store.data.fitness.body.length, 0, 'fitness 不应受影响');
});
H.test('build 含餐次标签与食物项与空状态', function () {
  reset();
  Diet.addEntry(D, 'dinner', { name: '沙拉', grams: 100, nutrition: { kcal: 120 } });
  const html = Diet.build({ date: D });
  ['早餐', '午餐', '晚餐', '加餐'].forEach(function (l) { H.includes(html, l, '应包含 ' + l); });
  H.includes(html, '沙拉', '应显示食物项');
  H.includes(html, '还没记录', '空餐次应有引导');
  H.includes(html, '食物库还是空的', '空食材库应有引导');
  H.includes(html, 'empty-state', '应有 empty-state');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  Diet.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  let threw = false;
  try { Diet.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
