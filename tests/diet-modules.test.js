/*
 * diet-lite.test.js — 饮食模块 lite（v3）重构后测试
 * 覆盖：食材库（增删改/搜索）、记录与餐次（克数折算/编辑/删除）、
 *      当日汇总（总热量+宏量+供能比）、饮水、日期切换、门面别名、
 *      build 空状态、以及旧 v2 备份平滑降级迁移。
 * 使用 tests/harness 的 Node 测试基座运行。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const Diet = mods.diet;
const Fitness = mods.fitness;

function reset() { storage.clear(); Store.load(); }
const D = '2026-08-17';

// 取出子服务（门面与全局命名空间一致性校验用）
const Foods = Diet.Foods, Log = Diet.Log;

H.section('命名空间暴露');
H.test('W.DietFoods / W.DietLog / W.Diet 均存在且门面指向同一对象', function () {
  H.ok(win.DietFoods && typeof win.DietFoods === 'object', 'W.DietFoods 应为对象');
  H.ok(win.DietLog && typeof win.DietLog === 'object', 'W.DietLog 应为对象');
  H.ok(Diet.Foods === Foods && Diet.Log === Log, '门面子模块应指向同一对象');
  H.eq(Diet.MEALS.length, 4, '固定四餐');
  H.eq(Diet.MEALS[0].key, 'breakfast', '首餐为早餐');
});

// ============ 食材库 DietFoods ============
H.section('食材库 DietFoods');
H.test('addFood：per100g 结构化存储，忽略废弃字段', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸肉', category: '蛋白', tags: ['x'], aliases: ['鸡胸'], per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  H.ok(f && f.id, '应返回食材');
  H.eq(f.per100g.kcal, 165, '每100g 热量');
  H.eq(Store.data.diet.foods.length, 1, '库应 1 条');
  H.eq(f.category, undefined, 'category 被忽略');
  H.eq(f.tags, undefined, 'tags 被忽略');
});
H.test('addFood：空名返回 null', function () {
  reset();
  H.eq(Foods.addFood({ name: '  ' }), null, '空名应返回 null');
});
H.test('listFoods：仅按名称关键词搜索（无分类/标签）', function () {
  reset();
  Foods.addFood({ name: '鸡胸肉', per100g: { kcal: 165 } });
  Foods.addFood({ name: '燕麦', per100g: { kcal: 380 } });
  H.eq(Foods.listFoods({ q: '鸡' }).length, 1, '按名称关键词');
  H.eq(Foods.listFoods({}).length, 2, '无过滤返回全部');
  H.eq(Foods.listFoods({ category: '蛋白' }).length, 2, '旧分类过滤不再生效');
});
H.test('updateFood/removeFood：更新与删除', function () {
  reset();
  var f = Foods.addFood({ name: 'A', per100g: { kcal: 100 } });
  Foods.updateFood(f.id, { name: 'B', per100g: { kcal: 200 } });
  H.eq(Foods.find(f.id).name, 'B', '名称更新');
  H.eq(Foods.find(f.id).per100g.kcal, 200, '营养更新');
  H.ok(Foods.removeFood(f.id), '应删除');
  H.eq(Foods.find(f.id), null, '删除后查不到');
  H.eq(Foods.removeFood(f.id), false, '重复删除返回 false');
});
H.test('门面别名：addLibraryFood/addFood/removeFood/findLibraryFood/updateLibraryFood 一致', function () {
  reset();
  var f = Diet.addLibraryFood({ name: '米', per100g: { kcal: 120 } });
  H.ok(f && f.id, 'addLibraryFood 返回食材');
  H.eq(Diet.findLibraryFood(f.id).name, '米', 'findLibraryFood');
  Diet.updateLibraryFood(f.id, { name: '米饭' });
  H.eq(Diet.listFoods({ q: '米饭' }).length, 1, 'updateLibraryFood 生效');
  H.ok(Diet.removeFood(f.id), 'removeFood');
  H.eq(Diet.listFoods({}).length, 0, '库为空');
});

// ============ 记录与餐次 DietLog ============
H.section('记录与餐次 DietLog');
H.test('ensureDay：补齐四个固定餐次容器', function () {
  reset();
  var day = Log.ensureDay(D);
  H.ok(day && day.meals, '应有 meals');
  Diet.MEALS.forEach(function (m) { H.ok(Array.isArray(day.meals[m.key]), m.key + ' 应为数组'); });
});
H.test('addEntry：选食材库按克数折算营养', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸肉', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  var e = Log.addEntry(D, 'breakfast', { foodId: f.id, name: '鸡胸', grams: 200 });
  H.eq(Math.round(e.nutrition.kcal), 330, '200g -> 330kcal');
  H.eq(Math.round(e.nutrition.protein), 62, '200g -> 62g 蛋白');
  H.eq(e.grams, 200, '克数记录');
});
H.test('addEntry：手填完整宏量；非法餐型/空名被拒', function () {
  reset();
  var e = Log.addEntry(D, 'lunch', { name: '米饭', grams: 150, nutrition: { kcal: 200, protein: 4, carb: 44, fat: 1 } });
  H.eq(Math.round(e.nutrition.carb), 44, '手填碳水');
  H.eq(Log.addEntry(D, 'invalid', { name: 'x' }), null, '非法餐型 null');
  H.eq(Log.addEntry(D, 'dinner', { name: '  ' }), null, '空名 null');
});
H.test('updateEntry：改克数重折算（foodId）/ 改营养（手填）', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸肉', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  var e = Log.addEntry(D, 'breakfast', { foodId: f.id, name: '鸡胸', grams: 200 });
  Log.updateEntry(D, 'breakfast', e.id, { grams: 100 });
  var upd = Log.getDay(D).meals.breakfast[0];
  H.eq(Math.round(upd.nutrition.kcal), 165, '改克数后 165kcal');
  var m = Log.addEntry(D, 'lunch', { name: '米饭', grams: 150, nutrition: { kcal: 200, protein: 4, carb: 44, fat: 1 } });
  Log.updateEntry(D, 'lunch', m.id, { nutrition: { kcal: 300, protein: 6, carb: 60, fat: 2 } });
  H.eq(Math.round(Log.getDay(D).meals.lunch[0].nutrition.kcal), 300, '改营养后 300kcal');
  H.eq(Log.updateEntry(D, 'lunch', 'nope', { grams: 1 }), false, '不存在条目返回 false');
});
H.test('removeEntry：删除条目', function () {
  reset();
  var e = Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  H.ok(Log.removeEntry(D, 'breakfast', e.id), '应删除');
  H.eq(Log.getDay(D).meals.breakfast.length, 0, '应为空');
});
H.test('dailySummary：汇总 + 供能比 + 空日归零', function () {
  reset();
  Log.addEntry(D, 'breakfast', { name: 'a', grams: 100, nutrition: { kcal: 200, protein: 20, carb: 20, fat: 4 } });
  Log.addEntry(D, 'lunch', { name: 'b', grams: 100, nutrition: { kcal: 300, protein: 10, carb: 40, fat: 6 } });
  var s = Log.dailySummary(D);
  H.eq(s.kcal, 500, '总热量 500');
  H.eq(s.protein, 30, '蛋白 30');
  H.eq(s.proteinPct + s.carbPct + s.fatPct, 100, '供能比合计 100%');
  H.eq(Log.dailySummary('2099-01-01').kcal, 0, '无记录日归零');
});
H.test('setWater / hasAnyFood', function () {
  reset();
  H.eq(Log.hasAnyFood(D), false, '初始无食物');
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  H.ok(Log.hasAnyFood(D), '有食物');
  H.eq(Log.setWater(D, 500), 500, '饮水设置');
  H.eq(Store.data.diet.days[D].waterMl, 500, '饮水已持久化');
});
H.test('日期切换：不同日期相互独立', function () {
  reset();
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  Log.addEntry('2026-08-18', 'dinner', { name: 'y', grams: 100, nutrition: { kcal: 250 } });
  H.eq(Log.dailySummary(D).kcal, 100, 'D 仅 100');
  H.eq(Log.dailySummary('2026-08-18').kcal, 250, '次日 250');
  H.eq(Log.hasAnyFood('2026-08-19'), false, '无记录日 false');
});

// ============ build 视图 / 空状态 ============
H.section('build 视图 / 空状态');
H.test('build：空状态含引导文案，无“保存”按钮，无目标/图表', function () {
  reset();
  var html = Diet.build({ date: D });
  H.includes(html, '还没记录', '餐次空状态');
  H.includes(html, '食物库还是空的', '食材库空状态');
  H.ok(!/<button[^>]*>\s*保存\s*<\/button>/.test(html), '页面不应含“保存”按钮');
  H.ok(html.indexOf('目标') === -1, '不应出现目标面板');
  H.ok(html.indexOf('diet-chart') === -1, '不应引用图表');
  H.ok(html.indexOf('echart') === -1, '不应引用 echarts');
});
H.test('build：有记录时显示四餐与当日汇总', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  Log.addEntry(D, 'breakfast', { foodId: f.id, name: '鸡胸', grams: 200 });
  Log.setWater(D, 600);
  var html = Diet.build({ date: D });
  H.includes(html, '鸡胸', '条目名称出现');
  H.includes(html, '330', '折算热量出现');
  H.includes(html, '600', '饮水量出现');
});

// ============ 数据隔离 ============
H.section('数据隔离（饮食改动不污染健身）');
H.test('饮食改动不污染健身数据', function () {
  reset();
  Fitness.addBody({ date: D, weight: 70 });
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  H.eq(Fitness.trendData().length, 1, '健身体重记录仍为 1 条');
});

// ============ 迁移：v2 备份平滑降级 ============
H.section('迁移：v2 备份平滑降级');
H.test('导入旧 v2 备份丢弃目标/禁忌/食谱，保留日记录与食材库', function () {
  reset();
  var legacy = {
    version: 1,
    settings: { nickname: '', themeColor: '#3b82f6', darkMode: false },
    today: [], work: { plans: [] }, fitness: { templates: [], checkins: [], body: [], schedule: {} },
    diet: {
      version: 2,
      profile: { sex: 'male', age: 30, heightCm: 175, weightKg: 70, useFitnessWeight: true },
      goals: { type: 'cut', method: 'auto', activity: 'moderate', targetKcal: 2000, macroTarget: { protein: 150, carb: 200, fat: 67 }, macroRatio: { protein: 30, carb: 40, fat: 30 }, applyFrom: null },
      restrictions: [{ id: 'r1', kind: 'allergy', name: '花生', note: '' }],
      foods: [{ id: 'f1', name: '鸡胸', category: '蛋白', tags: ['hp'], aliases: ['鸡胸肉'], per100g: { kcal: 165, protein: 31, carb: 0, fat: 3, fiber: 0, sodium: 0 } }],
      recipes: [{ id: 'rc1', name: '高蛋白餐', meal: 'lunch', items: [], totalNutrition: { kcal: 450, protein: 60, carb: 30, fat: 10 } }],
      mealsOrder: ['breakfast', 'lunch', 'dinner', 'snack', 'midnight'],
      mealLabels: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', midnight: '夜宵' },
      mealTemplates: [],
      days: {
        '2026-08-17': {
          goalSnapshot: { type: 'cut', targetKcal: 2045, macroTarget: {} },
          trainingBonusKcal: 250, waterMl: 800, note: 'x',
          meals: {
            breakfast: [{ id: 'e1', foodId: 'f1', name: '鸡胸', grams: 200, nutrition: { kcal: 330, protein: 62, carb: 0, fat: 6 } }],
            lunch: [], dinner: [], snack: [],
            midnight: [{ id: 'e2', name: '泡面', grams: 100, nutrition: { kcal: 400, protein: 10, carb: 50, fat: 15 } }],
          },
        },
      },
    },
    memo: [],
  };
  Store.import(JSON.stringify(legacy));
  var d = Store.data.diet;
  H.eq(d.version, 3, '降级为 v3-lite');
  H.eq(d.goals, undefined, 'goals 被丢弃');
  H.eq(d.profile, undefined, 'profile 被丢弃');
  H.eq(d.restrictions, undefined, 'restrictions 被丢弃');
  H.eq(d.recipes, undefined, 'recipes 被丢弃');
  H.eq(d.mealsOrder, undefined, 'mealsOrder 被丢弃');
  H.eq(d.foods.length, 1, '食材库保留 1 条');
  H.eq(d.foods[0].category, undefined, '食材 category 被丢弃');
  H.eq(d.foods[0].tags, undefined, '食材 tags 被丢弃');
  H.eq(d.foods[0].per100g.kcal, 165, '食材每100g 营养保留');
  H.eq(d.days['2026-08-17'].waterMl, 800, 'waterMl 保留');
  H.eq(d.days['2026-08-17'].meals.breakfast.length, 1, '早餐记录保留');
  H.eq(d.days['2026-08-17'].meals.midnight, undefined, '自定义餐次 midnight 被丢弃');
  H.eq(Log.dailySummary('2026-08-17').kcal, 330, '仅 4 固定餐次参与汇总（自定义餐次不入汇总）');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
