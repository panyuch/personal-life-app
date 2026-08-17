/*
 * 阶段5 测试（v2 重构版）：饮食计划（diet.js）
 * 覆盖：餐次记录（按克数折算/手填宏量）、当日汇总与供能比、食材库 CRUD（per100g）、
 *      目标设定与进度条、禁忌管理、食谱推荐、餐次配置、数据隔离、渲染冒烟。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Diet = mods.diet;

function reset() { storage.clear(); Store.load(); }
const D = '2026-08-17';

H.section('餐食记录（v2 克数/宏量）');
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
  const f = Diet.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
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

H.section('食材库（per100g 结构化）');
H.test('addFood / removeFood（库 CRUD）', function () {
  reset();
  const f = Diet.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 }, tags: ['high-protein'] });
  H.eq(Store.data.diet.foods.length, 1, '库应有 1 条');
  H.eq(f.per100g.kcal, 165, '每100g 热量');
  H.ok(Diet.removeFood(f.id), '应删除成功');
  H.eq(Store.data.diet.foods.length, 0, '库应空');
});
H.test('listFoods 支持分类/标签/关键词过滤', function () {
  reset();
  Diet.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31 }, tags: ['high-protein'], aliases: ['鸡胸'] });
  Diet.addFood({ name: '燕麦', category: '主食', per100g: { kcal: 380, protein: 15 }, tags: ['high-carb'] });
  H.eq(Diet.listFoods({ category: '蛋白' }).length, 1, '分类过滤');
  H.eq(Diet.listFoods({ tag: 'high-carb' }).length, 1, '标签过滤');
  H.eq(Diet.listFoods({ q: '鸡胸' }).length, 1, '别名搜索');
});

H.section('禁忌 / 过敏管理');
H.test('addRestriction / isRestricted 拦截', function () {
  reset();
  Diet.addRestriction({ kind: 'allergy', name: '花生' });
  H.ok(Diet.isRestricted('花生酱'), '花生酱 命中 花生');
  H.notOk(Diet.isRestricted('鸡胸肉'), '鸡胸肉 不命中');
});

H.section('目标设定与进度条');
H.test('setTarget（兼容）设定与进度比例', function () {
  reset();
  Diet.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 300 } });
  Diet.setTarget(600);
  H.eq(Diet.getActiveGoal(D).targetKcal, 600, '目标应保存');
  const html = Diet.build({ date: D });
  H.includes(html, 'width:50%', '300/600 应为 50%');
  H.includes(html, '已摄入 50%', '应显示 50%');
});
H.test('setTarget 设空清除目标', function () {
  reset();
  Diet.setTarget(600);
  Diet.setTarget('');
  H.eq(Diet.getActiveGoal(D).targetKcal, null, '清空后应为 null');
});

H.section('食谱推荐');
H.test('recommend 排出过敏项与不超预算', function () {
  reset();
  Diet.setGoal({ method: 'manual', targetKcal: 2000 });
  Diet.addEntry(D, 'breakfast', { name: '已吃', grams: 100, nutrition: { kcal: 1800 } }); // 剩余 200
  Diet.addFood({ name: '鸡胸', category: '蛋白', per100g: { kcal: 165, protein: 31 } });
  Diet.addFood({ name: '巨无霸', category: '快餐', per100g: { kcal: 600, protein: 30 } });
  Diet.addRestriction({ kind: 'allergy', name: '花生' });
  Diet.addFood({ name: '花生糖', category: '零食', per100g: { kcal: 100 } });
  const rec = Diet.recommend(D, { topN: 10 }).map(function (c) { return c.name; });
  H.ok(rec.indexOf('巨无霸') < 0, '超预算排除');
  H.ok(rec.indexOf('花生糖') < 0, '过敏排除');
  H.ok(rec.indexOf('鸡胸') >= 0, '合规出现');
});

H.section('餐次配置');
H.test('增删/改名餐次后汇总与结构正确', function () {
  reset();
  const key = Diet.addMeal(null, '宵夜');
  H.ok(Diet.getMealsOrder().indexOf(key) >= 0, '新增餐次');
  H.ok(Diet.renameMeal(key, '夜宵'), '改名');
  H.ok(Diet.removeMeal(key), '删除');
  // 删到只剩一餐，验证“至少保留一餐”守卫
  while (Diet.getMealsOrder().length > 1) { Diet.removeMeal(Diet.getMealsOrder()[Diet.getMealsOrder().length - 1]); }
  H.eq(Diet.getMealsOrder().length, 1, '应只剩一餐');
  H.eq(Diet.removeMeal(Diet.getMealsOrder()[0]), false, '仅剩一餐时拒绝删除');
});

H.section('数据隔离与渲染');
H.test('饮食改动不污染其他模块', function () {
  reset();
  Diet.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  Diet.addFood({ name: 'y', category: '其他', per100g: { kcal: 100 } });
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
