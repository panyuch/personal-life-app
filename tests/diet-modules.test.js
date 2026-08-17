/*
 * diet-modules.test.js — 饮食模块 v2 子模块（M1–M6）深度测试
 * 覆盖：目标引擎 / 食材与禁忌 / 记录与餐次 / 食谱推荐 / 趋势统计 / 健康联动，
 *      含边界情况与异常处理。使用 tests/harness 的 Node 测试基座运行。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const Diet = mods.diet;
const Fitness = mods.fitness;

function reset() { storage.clear(); Store.load(); }
const D = '2026-08-17';

// 取出各子模块（门面与全局命名空间一致性校验用）
const Goals = Diet.Goals, Foods = Diet.Foods, Log = Diet.Log, Recipes = Diet.Recipes, Stats = Diet.Stats, Link = Diet.Link;

H.section('命名空间暴露');
H.test('W.DietGoals…W.DietLink 与 Diet.* 门面子模块均存在', function () {
  ['DietGoals', 'DietFoods', 'DietLog', 'DietRecipes', 'DietStats', 'DietLink'].forEach(function (n) {
    H.ok(win[n] && typeof win[n] === 'object', 'W.' + n + ' 应为对象');
  });
  H.ok(Diet.Goals === Goals && Diet.Foods === Foods, '门面子模块应指向同一对象');
});

// ============ M1 目标引擎 ============
H.section('M1 目标引擎 DietGoals');
H.test('computeBMR：字段缺失返回 null', function () {
  H.eq(Goals.computeBMR({ sex: 'male' }), null, '缺 weight/height/age 应为 null');
  H.eq(Goals.computeBMR({ sex: 'female', age: 30, heightCm: 165, weightKg: 60 }), 1320, '女性 BMR');
});
H.test('computeBMR：男性标准计算', function () {
  H.eq(Goals.computeBMR({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 }), 1649, '男性 BMR 应为 1649');
});
H.test('computeTDEE：bmr 为 null 返回 null，否则按系数', function () {
  H.eq(Goals.computeTDEE(null, 'moderate'), null, 'null bmr -> null');
  H.eq(Goals.computeTDEE(1649, 'moderate'), 2556, '1649 * 1.55 ≈ 2556');
});
H.test('deriveTargets：auto + 减脂 推算目标与宏量', function () {
  reset();
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
  Goals.setGoal({ type: 'cut', method: 'auto', activity: 'moderate' });
  var t = Goals.deriveTargets(Goals.getGoals());
  H.eq(t.targetKcal, 2045, '减脂目标应为 2045');
  H.eq(t.macroTarget.protein, 153, '蛋白目标 153g');
  H.eq(t.macroTarget.carb, 205, '碳水目标 205g');
  H.eq(t.macroTarget.fat, 68, '脂肪目标 68g');
});
H.test('deriveTargets：manual 直接采用手填目标，宏量按占比反推', function () {
  reset();
  Goals.setGoal({ type: null, method: 'manual', targetKcal: 2000 });
  var t = Goals.deriveTargets(Goals.getGoals());
  H.eq(t.targetKcal, 2000, 'manual 目标 2000');
  H.eq(t.macroTarget.protein, 150, 'P=2000*0.3/4=150');
  H.eq(t.macroTarget.carb, 200, 'C=2000*0.4/4=200');
  H.eq(t.macroTarget.fat, 67, 'F=2000*0.3/9≈67');
});
H.test('deriveTargets：manual 且未填目标 -> 目标 null', function () {
  reset();
  Goals.setGoal({ method: 'manual', targetKcal: null });
  H.eq(Goals.deriveTargets(Goals.getGoals()).targetKcal, null, '应为 null');
});
H.test('getActiveGoal：写入当日 goalSnapshot', function () {
  reset();
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
  Goals.setGoal({ type: 'cut', method: 'auto', activity: 'moderate' });
  var g = Diet.getActiveGoal(D);
  H.eq(g.targetKcal, 2045, '当日生效目标 2045');
  H.ok(Store.data.diet.days[D] && Store.data.diet.days[D].goalSnapshot, '应写入 goalSnapshot');
  H.eq(Store.data.diet.days[D].goalSnapshot.targetKcal, 2045, '快照目标一致');
});
H.test('getActiveGoal：applyFrom 生效日前目标未激活', function () {
  reset();
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
  Goals.setGoal({ type: 'cut', method: 'auto', activity: 'moderate', applyFrom: '2026-09-01' });
  H.eq(Diet.getActiveGoal('2026-08-20').targetKcal, null, '生效日前应为 null');
  H.eq(Diet.getActiveGoal('2026-09-05').targetKcal, 2045, '生效日后应激活');
});
H.test('setGoal/updateProfile：非法枚举被忽略，持久化', function () {
  reset();
  Goals.setGoal({ type: 'invalid', activity: 'super' });
  H.eq(Goals.getGoals().type, null, '非法 type 忽略');
  H.eq(Goals.getGoals().activity, 'moderate', '非法 activity 回退默认');
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
  var re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.diet.profile.weightKg, 70, 'profile 应持久化');
});

// ============ M2 食材与禁忌 ============
H.section('M2 食材与禁忌 DietFoods');
H.test('addFood：per100g 结构化存储', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 }, tags: ['high-protein'], aliases: ['鸡胸'] });
  H.ok(f && f.id, '应返回食材');
  H.eq(f.per100g.kcal, 165, '每100g 热量');
  H.eq(Store.data.diet.foods.length, 1, '库应 1 条');
});
H.test('addFood：空名返回 null（异常输入）', function () {
  reset();
  H.eq(Foods.addFood({ name: '  ' }), null, '空名应返回 null');
});
H.test('listFoods：分类/标签/关键词过滤', function () {
  reset();
  Foods.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 }, tags: ['high-protein'], aliases: ['鸡胸'] });
  Foods.addFood({ name: '燕麦', category: '主食', per100g: { kcal: 380, protein: 15, carb: 65, fat: 7 }, tags: ['high-carb'] });
  H.eq(Foods.listFoods({ category: '蛋白' }).length, 1, '按分类过滤');
  H.eq(Foods.listFoods({ tag: 'high-carb' }).length, 1, '按标签过滤');
  H.eq(Foods.listFoods({ q: '鸡' }).length, 1, '按名称关键词');
  H.eq(Foods.listFoods({ q: '鸡胸' }).length, 1, '按别名匹配');
});
H.test('updateFood/removeFood：更新与删除', function () {
  reset();
  var f = Foods.addFood({ name: 'A', category: 'x', per100g: { kcal: 100 } });
  Foods.updateFood(f.id, { name: 'B', per100g: { kcal: 200 } });
  H.eq(Foods.find(f.id).name, 'B', '名称更新');
  H.eq(Foods.find(f.id).per100g.kcal, 200, '营养更新');
  H.ok(Foods.removeFood(f.id), '应删除');
  H.eq(Foods.find(f.id), null, '删除后查不到');
  H.eq(Foods.removeFood(f.id), false, '重复删除返回 false');
});
H.test('isRestricted：名称/别名命中原则', function () {
  reset();
  Foods.addRestriction({ kind: 'allergy', name: '花生' });
  H.ok(Foods.isRestricted('花生酱'), '花生酱 命中 花生');
  H.ok(Foods.isRestricted('花生油'), '花生油 命中 花生');
  H.notOk(Foods.isRestricted('鸡胸肉'), '鸡胸肉 不命中');
  Foods.addRestriction({ kind: 'allergy', name: '甲壳类', aliases: ['虾', 'crab'] });
  H.ok(Foods.isRestricted('清蒸虾'), '别名 虾 命中');
  H.notOk(Foods.isRestricted(''), '空字符串不命中');
});

// ============ M3 记录与餐次 ============
H.section('M3 每日记录与餐次 DietLog');
H.test('ensureDay：补齐所有餐次容器', function () {
  reset();
  var day = Log.ensureDay(D);
  H.ok(day && day.meals, '应有 meals');
  Diet.getMealsOrder().forEach(function (m) { H.ok(Array.isArray(day.meals[m]), m + ' 应为数组'); });
});
H.test('addEntry：选食材库按克数折算营养', function () {
  reset();
  var f = Foods.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
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
  var f = Foods.addFood({ name: '鸡胸肉', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  var e = Log.addEntry(D, 'breakfast', { foodId: f.id, name: '鸡胸', grams: 200 });
  Log.updateEntry(D, 'breakfast', e.id, { grams: 100 });
  var upd = Log.getDay(D).meals.breakfast[0];
  H.eq(Math.round(upd.nutrition.kcal), 165, '改克数后 165kcal');
  // 手填条目改营养
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
H.test('餐次管理：增/改名/删（至少保留 1 餐）+ 顺序设置', function () {
  reset();
  var key = Log.addMeal(null, '宵夜');
  H.ok(Diet.getMealsOrder().indexOf(key) >= 0, '新餐次已加入');
  H.ok(Log.renameMeal(key, '夜宵'), '改名成功');
  H.eq(Diet.mealLabel(key), '夜宵', '标签更新');
  H.ok(Log.removeMeal(key), '删除成功');
  // 删到只剩一餐，验证“至少保留一餐”守卫
  while (Diet.getMealsOrder().length > 1) { Log.removeMeal(Diet.getMealsOrder()[Diet.getMealsOrder().length - 1]); }
  H.eq(Diet.getMealsOrder().length, 1, '应只剩一餐');
  H.eq(Log.removeMeal(Diet.getMealsOrder()[0]), false, '仅剩一餐时删除应失败');
  H.eq(Log.setMealsOrder([]), false, '空顺序应拒绝');
});
H.test('餐次模板：保存并跨日复用', function () {
  reset();
  var f = Foods.addFood({ name: '鸡蛋', category: '蛋白', per100g: { kcal: 150, protein: 13, carb: 1, fat: 10 } });
  var t = Log.saveMealTemplate({ name: '快手早餐', meal: 'breakfast', items: [{ foodId: f.id, name: '鸡蛋', grams: 100 }] });
  H.ok(t && t.id, '模板已保存');
  Log.applyMealTemplate('2026-08-18', 'breakfast', t.id);
  H.eq(Log.getDay('2026-08-18').meals.breakfast.length, 1, '模板应生成 1 条');
  H.eq(Log.applyMealTemplate('2026-08-18', 'breakfast', 'nope'), false, '不存在模板返回 false');
});
H.test('setWater / hasAnyFood', function () {
  reset();
  H.eq(Log.hasAnyFood(D), false, '初始无食物');
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  H.ok(Log.hasAnyFood(D), '有食物');
  H.eq(Log.setWater(D, 500), 500, '饮水设置');
});

// ============ M4 食谱推荐与生成 ============
H.section('M4 食谱推荐与生成 DietRecipes');
H.test('addRecipe：自动汇总 totalNutrition', function () {
  reset();
  var f1 = Foods.addFood({ name: '鸡胸', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  var r = Recipes.addRecipe({
    name: '高蛋白餐', meal: 'lunch', tags: ['high-protein'],
    items: [{ foodId: f1.id, name: '鸡胸', grams: 200 }, { name: '米饭', grams: 100, nutrition: { kcal: 120, protein: 3, carb: 26, fat: 1 } }],
  });
  H.eq(r.totalNutrition.kcal, 330 + 120, '总热量应为 450');
  H.eq(Recipes.removeRecipe('nope'), false, '删除不存在返回 false');
});
H.test('recommend：排除过敏项 + 不超预算', function () {
  reset();
  Goals.setGoal({ method: 'manual', targetKcal: 2000 });
  Log.addEntry(D, 'breakfast', { name: '已吃', grams: 100, nutrition: { kcal: 1600, protein: 100, carb: 100, fat: 50 } }); // 剩余 400
  var ok = Foods.addFood({ name: '鸡胸', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  var big = Foods.addFood({ name: '巨无霸', category: '快餐', per100g: { kcal: 600, protein: 30, carb: 50, fat: 30 } });
  Foods.addRestriction({ kind: 'allergy', name: '花生' });
  var peanut = Foods.addFood({ name: '花生糖', category: '零食', per100g: { kcal: 100, protein: 5, carb: 10, fat: 5 } });
  var rec = Recipes.recommend(D, { topN: 10 });
  var names = rec.map(function (c) { return c.name; });
  H.ok(names.indexOf('巨无霸') < 0, '超预算应排除');
  H.ok(names.indexOf('花生糖') < 0, '过敏项应排除');
  H.ok(names.indexOf('鸡胸') >= 0, '合规项应出现');
  rec.forEach(function (c) { H.ok(c.kcal <= 400 + 1e-6, c.name + ' 不超剩余预算'); });
});
H.test('recommend：无目标时返回空（预算为 0）', function () {
  reset();
  Foods.addFood({ name: '鸡胸', category: '蛋白', per100g: { kcal: 165, protein: 31 } });
  H.eq(Recipes.recommend(D, {}).length, 0, '无目标 -> 空推荐');
});
H.test('composeMeal：在预算内组装且排除禁忌', function () {
  reset();
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
  Goals.setGoal({ type: 'cut', method: 'auto', activity: 'moderate' }); // 目标 2045
  Foods.addFood({ name: '鸡胸', category: '蛋白', per100g: { kcal: 165, protein: 31, carb: 0, fat: 3 } });
  Foods.addFood({ name: '燕麦', category: '主食', per100g: { kcal: 380, protein: 15, carb: 65, fat: 7 } });
  Foods.addRestriction({ kind: 'allergy', name: '花生' });
  Foods.addFood({ name: '花生', category: '零食', per100g: { kcal: 100 } });
  var entries = Recipes.composeMeal(D, null);
  H.ok(entries.length > 0, '应生成条目');
  var sumK = entries.reduce(function (a, e) { return a + e.nutrition.kcal; }, 0);
  H.ok(sumK <= 2045 + 100, '总热量不超过目标+容差');
  entries.forEach(function (e) { H.notOk(Foods.isRestricted(e.name), e.name + ' 不应是禁忌'); });
});
H.test('composeMeal：无目标 / 无食材库 返回空', function () {
  reset();
  H.eq(Recipes.composeMeal(D, null).length, 0, '无目标空');
  Goals.setGoal({ method: 'manual', targetKcal: 2000 });
  H.eq(Recipes.composeMeal(D, null).length, 0, '无食材库空');
});
H.test('addRecipeToDay：一键加入按克数折算', function () {
  reset();
  var f = Foods.addFood({ name: '鸡蛋', category: '蛋白', per100g: { kcal: 150, protein: 13, carb: 1, fat: 10 } });
  var r = Recipes.addRecipe({ name: '蛋餐', meal: 'breakfast', items: [{ foodId: f.id, name: '鸡蛋', grams: 100 }] });
  H.ok(Recipes.addRecipeToDay(D, 'breakfast', r.id), '应加入');
  H.eq(Log.getDay(D).meals.breakfast.length, 1, '应新增 1 条');
  H.eq(Recipes.addRecipeToDay(D, 'breakfast', 'nope'), false, '不存在返回 false');
});

// ============ M5 趋势统计 ============
H.section('M5 趋势统计 DietStats');
H.test('trend：日期序列与数据长度一致', function () {
  reset();
  Goals.setGoal({ method: 'manual', targetKcal: 2000 });
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 500 } });
  var tr = Stats.trend({ from: '2026-08-15', to: '2026-08-21' });
  H.eq(tr.dates.length, 7, '区间 7 天');
  H.eq(tr.kcal.length, 7, 'kcal 长度 7');
  H.eq(tr.target.length, 7, 'target 长度 7');
  H.eq(tr.kcal[2], 500, 'D(17) 在索引 2 为 500');
});
H.test('aggregate：totalDays 与达标统计', function () {
  reset();
  Goals.setGoal({ method: 'manual', targetKcal: 2000 });
  // 三天精确 2000 -> 达标
  ['2026-08-15', '2026-08-16', '2026-08-17'].forEach(function (d) {
    Log.addEntry(d, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 2000 } });
  });
  var agg = Stats.aggregate({ from: '2026-08-15', to: '2026-08-21' });
  H.eq(agg.totalDays, 7, '总天数 7');
  H.eq(agg.onTargetDays, 3, '达标 3 天');
  H.eq(agg.avgKcal, 2000, '平均 2000');
});
H.test('macroDistribution：供能比合计 100%', function () {
  reset();
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 400, protein: 40, carb: 40, fat: 10 } });
  var md = Stats.macroDistribution(D);
  H.eq(md.proteinPct + md.carbPct + md.fatPct, 100, '合计 100%');
});

// ============ M6 健康联动（只读） ============
H.section('M6 健康联动 DietLink（只读）');
H.test('getEffectiveProfile：取健身最近体重', function () {
  reset();
  Goals.updateProfile({ sex: 'male', age: 30, heightCm: 175, weightKg: null, useFitnessWeight: true });
  Fitness.addBody({ date: '2026-08-10', weight: 68 });
  Fitness.addBody({ date: '2026-08-16', weight: 66 });
  H.eq(Link.getEffectiveProfile().weightKg, 66, '应取最近体重 66');
});
H.test('getLatestWeight / getTrainingDays：读取健身数据', function () {
  reset();
  Fitness.addBody({ date: '2026-08-16', weight: 69 });
  H.eq(Link.getLatestWeight().weight, 69, '最近体重 69');
  Fitness.setPart('2026-08-17', '胸');
  Fitness.setPart('2026-08-18', '腿');
  var td = Link.getTrainingDays({ from: '2026-08-17', to: '2026-08-18' });
  H.eq(td.length, 2, '应读到 2 个训练日');
});
H.test('trainingBonus：训练日加成并写入饮食自身数据，且不回写健身', function () {
  reset();
  Fitness.setPart(D, '背');
  var before = JSON.stringify(Fitness.summary(D));
  var bonus = Link.trainingBonus(D);
  H.eq(bonus, 250, '训练日加成 250');
  H.eq(Store.data.diet.days[D].trainingBonusKcal, 250, '写入饮食 trainingBonusKcal');
  H.eq(JSON.stringify(Fitness.summary(D)), before, '健身数据未被修改（只读）');
  // 非训练日
  H.eq(Link.trainingBonus('2026-08-20'), 0, '非训练日 0');
});
H.test('饮食改动不污染健身数据（隔离）', function () {
  reset();
  Fitness.addBody({ date: D, weight: 70 });
  Log.addEntry(D, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } });
  H.eq(Fitness.trendData().length, 1, '健身体重记录仍为 1 条');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
