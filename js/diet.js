/*
 * diet.js — 饮食计划模块（v2 重构）
 *
 * 架构（数据层 → 领域层 → 视图层）：
 *   - M1 DietGoals    目标引擎（目标类型 / BMR / TDEE / 宏量目标 / 生效期）
 *   - M2 DietFoods    食材库（per100g / 分类 / 标签 / 别名）+ 禁忌·过敏管理
 *   - M3 DietLog      每日记录与餐次（克数折算 / 条目编辑 / 餐次配置 / 模板 / 饮水 / 汇总）
 *   - M4 DietRecipes  食谱库 + 离线启发式推荐 / 一餐生成
 *   - M5 DietStats    周月聚合 / 趋势序列 / 供能比
 *   - M6 DietLink     健康联动（只读 fitness.body / schedule，绝不回写）
 *
 * 对外统一经 W.Diet 门面暴露，并同时暴露各子模块命名空间（W.DietGoals … W.DietLink）。
 * 约束（沿用开发计划基线）：file:// 双击打开、无 ES Module、无 fetch、无 CDN、localStorage 持久化。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  // ——— 常量 ———
  var ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 };
  var TYPE_FACTORS = { cut: 0.80, maintain: 1.0, bulk: 1.12 }; // 减脂 0.75~0.85 / 增肌 1.10~1.15 区间内取值
  var TRAINING_BONUS = 250; // 训练日热量加成（kcal）
  var ENERGY = { protein: 4, carb: 4, fat: 9 };
  var RESTRICT_KINDS = ['allergy', 'intolerance', 'dislike', 'medical'];

  // ——— 通用工具 ———
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v, d) { v = (v == null ? '' : String(v)).trim(); return v || (d != null ? d : ''); }
  function r1(v) { return Math.round(num(v) * 10) / 10; }
  function round(v) { return Math.round(num(v)); }

  function getGoals() { return Store.data.diet.goals; }
  function getProfile() { return Store.data.diet.profile; }
  function getMealsOrder() { return Store.data.diet.mealsOrder; }
  function mealLabel(key) { return Store.data.diet.mealLabels[key] || key; }

  function ensureDay(date) {
    if (!Store.data.diet.days[date]) {
      var day = { goalSnapshot: null, trainingBonusKcal: 0, waterMl: 0, note: '', meals: {} };
      getMealsOrder().forEach(function (m) { day.meals[m] = []; });
      Store.data.diet.days[date] = day;
    }
    return Store.data.diet.days[date];
  }

  function scaleNutrition(per100g, factor) {
    return {
      kcal: r1(per100g.kcal * factor),
      protein: r1(per100g.protein * factor),
      carb: r1(per100g.carb * factor),
      fat: r1(per100g.fat * factor),
      fiber: r1((per100g.fiber || 0) * factor),
      sodium: r1((per100g.sodium || 0) * factor),
    };
  }

  function deriveMacro(targetKcal, ratio, partial) {
    ratio = ratio || { protein: 30, carb: 40, fat: 30 };
    partial = partial || { protein: null, carb: null, fat: null };
    var out = { protein: null, carb: null, fat: null };
    if (targetKcal == null) return out;
    ['protein', 'carb', 'fat'].forEach(function (k) {
      if (partial[k] != null) { out[k] = round(num(partial[k])); return; }
      var pct = ((ratio[k] != null ? ratio[k] : (k === 'protein' ? 30 : k === 'carb' ? 40 : 30))) / 100;
      var kcalShare = targetKcal * pct;
      var perGram = (k === 'fat') ? ENERGY.fat : ENERGY.protein; // carb/fat 同 4
      out[k] = round(kcalShare / perGram);
    });
    return out;
  }

  // ============================================================
  // M1 目标引擎 DietGoals
  // ============================================================
  var Goals = {
    computeBMR: function (profile) {
      profile = profile || Link.getEffectiveProfile();
      if (profile.sex !== 'male' && profile.sex !== 'female') return null;
      if (profile.weightKg == null || profile.heightCm == null || profile.age == null) return null;
      var b = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === 'male' ? 5 : -161);
      return round(b);
    },
    computeTDEE: function (bmr, activity) {
      if (bmr == null) return null;
      var f = ACTIVITY_FACTORS[activity] || ACTIVITY_FACTORS.moderate;
      return round(bmr * f);
    },
    deriveTargets: function (goal, profile) {
      goal = goal || getGoals();
      profile = profile || Link.getEffectiveProfile();
      var g = { type: goal.type || null, targetKcal: null, macroTarget: { protein: null, carb: null, fat: null } };
      var bmr = Goals.computeBMR(profile);
      var tdee = Goals.computeTDEE(bmr, goal.activity || 'moderate');
      if (goal.method === 'manual') {
        g.targetKcal = goal.targetKcal != null ? num(goal.targetKcal) : null;
      } else {
        if (tdee != null) {
          var f = goal.type === 'cut' ? TYPE_FACTORS.cut : goal.type === 'bulk' ? TYPE_FACTORS.bulk : 1.0;
          g.targetKcal = round(tdee * f);
        } else {
          g.targetKcal = goal.targetKcal != null ? num(goal.targetKcal) : null;
        }
      }
      g.macroTarget = deriveMacro(g.targetKcal, goal.macroRatio, goal.macroTarget);
      return g;
    },
    getActiveGoal: function (date) {
      date = date || (UI && UI.todayStr());
      var goals = getGoals();
      if (goals.applyFrom && date < goals.applyFrom) {
        var inactive = { type: null, targetKcal: null, macroTarget: { protein: null, carb: null, fat: null } };
        writeSnapshot(date, inactive);
        return inactive;
      }
      var t = Goals.deriveTargets(goals);
      var active = { type: goals.type || null, targetKcal: t.targetKcal, macroTarget: t.macroTarget };
      writeSnapshot(date, active);
      return active;
    },
    setGoal: function (fields) {
      fields = fields || {};
      var g = getGoals();
      if (fields.type !== undefined) g.type = ['cut', 'maintain', 'bulk'].indexOf(fields.type) >= 0 ? fields.type : null;
      if (fields.method !== undefined) g.method = fields.method === 'manual' ? 'manual' : 'auto';
      if (fields.activity !== undefined) g.activity = ['sedentary', 'light', 'moderate', 'high'].indexOf(fields.activity) >= 0 ? fields.activity : 'moderate';
      if (fields.targetKcal !== undefined) g.targetKcal = (fields.targetKcal == null || fields.targetKcal === '') ? null : num(fields.targetKcal);
      if (fields.applyFrom !== undefined) g.applyFrom = fields.applyFrom ? String(fields.applyFrom) : null;
      if (fields.macroRatio) {
        if (fields.macroRatio.protein != null) g.macroRatio.protein = num(fields.macroRatio.protein);
        if (fields.macroRatio.carb != null) g.macroRatio.carb = num(fields.macroRatio.carb);
        if (fields.macroRatio.fat != null) g.macroRatio.fat = num(fields.macroRatio.fat);
      }
      if (fields.macroTarget) {
        ['protein', 'carb', 'fat'].forEach(function (k) {
          if (fields.macroTarget[k] != null) g.macroTarget[k] = (fields.macroTarget[k] === '' || fields.macroTarget[k] == null) ? null : num(fields.macroTarget[k]);
        });
      }
      Store.save();
      return g;
    },
    updateProfile: function (fields) {
      fields = fields || {};
      var p = getProfile();
      if (fields.sex !== undefined) p.sex = (fields.sex === 'male' || fields.sex === 'female') ? fields.sex : null;
      if (fields.age !== undefined) p.age = (fields.age === '' || fields.age == null) ? null : num(fields.age);
      if (fields.heightCm !== undefined) p.heightCm = (fields.heightCm === '' || fields.heightCm == null) ? null : num(fields.heightCm);
      if (fields.weightKg !== undefined) p.weightKg = (fields.weightKg === '' || fields.weightKg == null) ? null : num(fields.weightKg);
      if (fields.useFitnessWeight !== undefined) p.useFitnessWeight = !!fields.useFitnessWeight;
      Store.save();
      return p;
    },
    getGoals: function () { return getGoals(); },
    getProfile: function () { return getProfile(); },
  };

  function writeSnapshot(date, active) {
    var day = ensureDay(date);
    day.goalSnapshot = { type: active.type, targetKcal: active.targetKcal, macroTarget: active.macroTarget };
    Store.save();
  }

  // ============================================================
  // M2 食材与禁忌 DietFoods
  // ============================================================
  function findFood(id) {
    var fs = Store.data.diet.foods;
    for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i];
    return null;
  }

  var Foods = {
    addFood: function (spec) {
      spec = spec || {};
      var name = str(spec.name);
      if (!name) return null;
      var f = {
        id: Store.uid(),
        name: name,
        category: str(spec.category, '其他'),
        per100g: {
          kcal: num(spec.per100g && spec.per100g.kcal),
          protein: num(spec.per100g && spec.per100g.protein),
          carb: num(spec.per100g && spec.per100g.carb),
          fat: num(spec.per100g && spec.per100g.fat),
          fiber: num(spec.per100g && spec.per100g.fiber),
          sodium: num(spec.per100g && spec.per100g.sodium),
        },
        tags: Array.isArray(spec.tags) ? spec.tags.slice() : [],
        aliases: Array.isArray(spec.aliases) ? spec.aliases.slice() : [],
      };
      Store.data.diet.foods.push(f);
      Store.save();
      return f;
    },
    updateFood: function (id, fields) {
      var f = findFood(id); if (!f) return false;
      fields = fields || {};
      if (fields.name != null) { var n = str(fields.name); if (n) f.name = n; }
      if (fields.category != null) f.category = str(fields.category, '其他');
      if (fields.per100g) {
        var p = fields.per100g;
        if (p.kcal != null) f.per100g.kcal = num(p.kcal);
        if (p.protein != null) f.per100g.protein = num(p.protein);
        if (p.carb != null) f.per100g.carb = num(p.carb);
        if (p.fat != null) f.per100g.fat = num(p.fat);
        if (p.fiber != null) f.per100g.fiber = num(p.fiber);
        if (p.sodium != null) f.per100g.sodium = num(p.sodium);
      }
      if (fields.tags) f.tags = Array.isArray(fields.tags) ? fields.tags.slice() : [];
      if (fields.aliases) f.aliases = Array.isArray(fields.aliases) ? fields.aliases.slice() : [];
      Store.save();
      return true;
    },
    removeFood: function (id) {
      var fs = Store.data.diet.foods;
      for (var i = 0; i < fs.length; i++) { if (fs[i].id === id) { fs.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    find: function (id) { return findFood(id); },
    listFoods: function (filter) {
      filter = filter || {};
      var arr = Store.data.diet.foods.slice();
      if (filter.category) arr = arr.filter(function (f) { return f.category === filter.category; });
      if (filter.tag) arr = arr.filter(function (f) { return (f.tags || []).indexOf(filter.tag) >= 0; });
      if (filter.q) {
        var q = String(filter.q).trim().toLowerCase();
        if (q) arr = arr.filter(function (f) {
          if (f.name.toLowerCase().indexOf(q) >= 0) return true;
          return (f.aliases || []).some(function (a) { return a.toLowerCase().indexOf(q) >= 0; });
        });
      }
      return arr;
    },
    addRestriction: function (spec) {
      spec = spec || {};
      var name = str(spec.name); if (!name) return null;
      var r = { id: Store.uid(), kind: RESTRICT_KINDS.indexOf(spec.kind) >= 0 ? spec.kind : 'dislike', name: name, aliases: Array.isArray(spec.aliases) ? spec.aliases.slice() : [], note: spec.note || '' };
      Store.data.diet.restrictions.push(r);
      Store.save();
      return r;
    },
    removeRestriction: function (id) {
      var rs = Store.data.diet.restrictions;
      for (var i = 0; i < rs.length; i++) { if (rs[i].id === id) { rs.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    listRestrictions: function () { return Store.data.diet.restrictions.slice(); },
    isRestricted: function (foodName) {
      foodName = str(foodName).toLowerCase();
      if (!foodName) return false;
      return Store.data.diet.restrictions.some(function (r) {
        var name = String(r.name || '').toLowerCase();
        if (!name) return false;
        if (foodName.indexOf(name) >= 0 || name.indexOf(foodName) >= 0) return true;
        return (r.aliases || []).some(function (a) {
          a = String(a || '').toLowerCase();
          return a && (foodName.indexOf(a) >= 0 || a.indexOf(foodName) >= 0);
        });
      });
    },
  };

  // ============================================================
  // M3 每日记录与餐次 DietLog
  // ============================================================
  var Log = {
    ensureDay: ensureDay,
    getDay: function (date) { return Store.data.diet.days[date] || null; },
    addEntry: function (date, meal, spec) {
      if (getMealsOrder().indexOf(meal) < 0) return null;
      spec = spec || {};
      var name = str(spec.name);
      if (!name) return null;
      var day = ensureDay(date);
      var entry = { id: Store.uid(), foodId: null, name: name, grams: 100, nutrition: { kcal: 0, protein: 0, carb: 0, fat: 0 } };
      if (spec.foodId) {
        var f = findFood(spec.foodId);
        if (!f) return null;
        entry.foodId = f.id;
        entry.name = f.name;
        var grams = spec.grams != null ? num(spec.grams) : 100;
        entry.grams = grams;
        entry.nutrition = scaleNutrition(f.per100g, grams / 100);
      } else {
        entry.grams = spec.grams != null ? num(spec.grams) : 100;
        var n = spec.nutrition || {};
        entry.nutrition = { kcal: num(n.kcal), protein: num(n.protein), carb: num(n.carb), fat: num(n.fat) };
      }
      day.meals[meal].push(entry);
      Store.save();
      return entry;
    },
    updateEntry: function (date, meal, entryId, fields) {
      if (getMealsOrder().indexOf(meal) < 0) return false;
      var day = Store.data.diet.days[date]; if (!day) return false;
      var list = day.meals[meal]; if (!list) return false;
      var entry = null;
      for (var i = 0; i < list.length; i++) { if (list[i].id === entryId) { entry = list[i]; break; } }
      if (!entry) return false;
      fields = fields || {};
      if (fields.name != null) { var n = str(fields.name); if (n) entry.name = n; }
      if (fields.grams != null) {
        entry.grams = num(fields.grams);
        if (entry.foodId) { var f = findFood(entry.foodId); if (f) entry.nutrition = scaleNutrition(f.per100g, entry.grams / 100); }
      }
      if (fields.nutrition) {
        var n2 = fields.nutrition;
        entry.nutrition = { kcal: num(n2.kcal), protein: num(n2.protein), carb: num(n2.carb), fat: num(n2.fat) };
      }
      Store.save();
      return true;
    },
    removeEntry: function (date, meal, entryId) {
      if (getMealsOrder().indexOf(meal) < 0) return false;
      var day = Store.data.diet.days[date]; if (!day) return false;
      var list = day.meals[meal]; if (!list) return false;
      for (var i = 0; i < list.length; i++) { if (list[i].id === entryId) { list.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    dailySummary: function (date) {
      var day = Store.data.diet.days[date];
      var sum = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0, sodium: 0 };
      if (day) {
        getMealsOrder().forEach(function (m) {
          (day.meals[m] || []).forEach(function (it) {
            sum.kcal += it.nutrition.kcal; sum.protein += it.nutrition.protein;
            sum.carb += it.nutrition.carb; sum.fat += it.nutrition.fat;
            sum.fiber += it.nutrition.fiber || 0; sum.sodium += it.nutrition.sodium || 0;
          });
        });
      }
      sum.kcal = round(sum.kcal); sum.protein = round(sum.protein); sum.carb = round(sum.carb);
      sum.fat = round(sum.fat); sum.fiber = round(sum.fiber); sum.sodium = round(sum.sodium);
      var totalE = sum.protein * 4 + sum.carb * 4 + sum.fat * 9;
      sum.proteinPct = totalE > 0 ? round(sum.protein * 4 / totalE * 100) : 0;
      sum.carbPct = totalE > 0 ? round(sum.carb * 4 / totalE * 100) : 0;
      sum.fatPct = totalE > 0 ? round(sum.fat * 9 / totalE * 100) : 0;
      return sum;
    },
    hasAnyFood: function (date) {
      var day = Store.data.diet.days[date]; if (!day) return false;
      return getMealsOrder().some(function (m) { return (day.meals[m] || []).length > 0; });
    },
    setMealsOrder: function (order) {
      if (!Array.isArray(order) || !order.length) return false;
      var valid = order.filter(function (k) { return typeof k === 'string' && Store.data.diet.mealLabels[k] != null; });
      if (!valid.length) return false;
      Store.data.diet.mealsOrder = valid;
      // 补齐已有日容器缺的餐次
      Object.keys(Store.data.diet.days).forEach(function (d) {
        valid.forEach(function (m) { if (!Store.data.diet.days[d].meals[m]) Store.data.diet.days[d].meals[m] = []; });
      });
      Store.save();
      return true;
    },
    addMeal: function (key, label) {
      key = key || ('meal_' + Store.uid().slice(0, 6));
      if (Store.data.diet.mealLabels[key] != null) return false; // 已存在
      Store.data.diet.mealLabels[key] = str(label, '新餐次');
      Store.data.diet.mealsOrder.push(key);
      Object.keys(Store.data.diet.days).forEach(function (d) { if (!Store.data.diet.days[d].meals[key]) Store.data.diet.days[d].meals[key] = []; });
      Store.save();
      return key;
    },
    renameMeal: function (key, label) {
      if (Store.data.diet.mealLabels[key] == null) return false;
      Store.data.diet.mealLabels[key] = str(label, key);
      Store.save();
      return true;
    },
    removeMeal: function (key) {
      if (Store.data.diet.mealsOrder.length <= 1) return false; // 至少保留一餐
      var idx = Store.data.diet.mealsOrder.indexOf(key);
      if (idx < 0) return false;
      Store.data.diet.mealsOrder.splice(idx, 1);
      delete Store.data.diet.mealLabels[key];
      Object.keys(Store.data.diet.days).forEach(function (d) { if (Store.data.diet.days[d].meals[key]) delete Store.data.diet.days[d].meals[key]; });
      Store.save();
      return true;
    },
    saveMealTemplate: function (spec) {
      spec = spec || {};
      var name = str(spec.name); if (!name) return null;
      if (getMealsOrder().indexOf(spec.meal) < 0) return null;
      var items = Array.isArray(spec.items) ? spec.items.map(function (it) {
        return { foodId: it.foodId != null ? it.foodId : null, name: str(it.name, '未命名'), grams: it.grams != null ? num(it.grams) : 100, nutrition: { kcal: num(it.nutrition && it.nutrition.kcal), protein: num(it.nutrition && it.nutrition.protein), carb: num(it.nutrition && it.nutrition.carb), fat: num(it.nutrition && it.nutrition.fat) } };
      }) : [];
      var t = { id: Store.uid(), name: name, meal: spec.meal, items: items };
      Store.data.diet.mealTemplates.push(t);
      Store.save();
      return t;
    },
    applyMealTemplate: function (date, meal, templateId) {
      if (getMealsOrder().indexOf(meal) < 0) return false;
      var t = null;
      Store.data.diet.mealTemplates.forEach(function (x) { if (x.id === templateId) t = x; });
      if (!t) return false;
      t.items.forEach(function (it) {
        Log.addEntry(date, meal, { foodId: it.foodId != null ? it.foodId : null, name: it.name, grams: it.grams != null ? it.grams : 100, nutrition: it.nutrition });
      });
      return true;
    },
    setWater: function (date, ml) {
      var day = ensureDay(date);
      day.waterMl = num(ml);
      Store.save();
      return day.waterMl;
    },
    setNote: function (date, note) {
      var day = ensureDay(date);
      day.note = str(note);
      Store.save();
      return day.note;
    },
  };

  // ============================================================
  // M4 食谱推荐与生成 DietRecipes
  // ============================================================
  function findRecipe(id) {
    var rs = Store.data.diet.recipes;
    for (var i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  }
  function relevanceScore(item, type) {
    var p = item.protein || 0, c = item.carb || 0, f = item.fat || 0;
    if (type === 'cut') return p * 2 - f - c * 0.5;
    if (type === 'bulk') return p + c;
    if (type === 'maintain') return p;
    return 0;
  }

  var Recipes = {
    addRecipe: function (spec) {
      spec = spec || {};
      var name = str(spec.name); if (!name) return null;
      var meals = getMealsOrder();
      var meal = (spec.meal && meals.indexOf(spec.meal) >= 0) ? spec.meal : (meals[0] || 'breakfast');
      var items = Array.isArray(spec.items) ? spec.items.map(function (it) {
        var nut;
        if (it.foodId != null) {
          var f = findFood(it.foodId);
          var g = it.grams != null ? num(it.grams) : 100;
          nut = f ? scaleNutrition(f.per100g, g / 100) : { kcal: 0, protein: 0, carb: 0, fat: 0 };
        } else {
          nut = { kcal: num(it.nutrition && it.nutrition.kcal), protein: num(it.nutrition && it.nutrition.protein), carb: num(it.nutrition && it.nutrition.carb), fat: num(it.nutrition && it.nutrition.fat) };
        }
        return {
          foodId: it.foodId != null ? it.foodId : null,
          name: str(it.name, '未命名'),
          grams: it.grams != null ? num(it.grams) : 100,
          nutrition: nut,
        };
      }) : [];
      var total = items.reduce(function (acc, it) {
        acc.kcal += it.nutrition.kcal; acc.protein += it.nutrition.protein; acc.carb += it.nutrition.carb; acc.fat += it.nutrition.fat; return acc;
      }, { kcal: 0, protein: 0, carb: 0, fat: 0 });
      var recipe = {
        id: Store.uid(), name: name, meal: meal,
        tags: Array.isArray(spec.tags) ? spec.tags.slice() : [],
        servings: spec.servings != null ? num(spec.servings) : 1,
        items: items, steps: spec.steps || '',
        totalNutrition: { kcal: round(total.kcal), protein: round(total.protein), carb: round(total.carb), fat: round(total.fat) },
      };
      Store.data.diet.recipes.push(recipe);
      Store.save();
      return recipe;
    },
    updateRecipe: function (id, fields) { var r = findRecipe(id); if (!r) return false; if (fields.name != null) { var n = str(fields.name); if (n) r.name = n; } if (fields.steps != null) r.steps = fields.steps; if (fields.tags) r.tags = Array.isArray(fields.tags) ? fields.tags.slice() : []; Store.save(); return true; },
    removeRecipe: function (id) {
      var rs = Store.data.diet.recipes;
      for (var i = 0; i < rs.length; i++) { if (rs[i].id === id) { rs.splice(i, 1); Store.save(); return true; } }
      return false;
    },
    find: function (id) { return findRecipe(id); },
    listRecipes: function (filter) {
      filter = filter || {};
      var arr = Store.data.diet.recipes.slice();
      if (filter.meal) arr = arr.filter(function (r) { return r.meal === filter.meal; });
      if (filter.tag) arr = arr.filter(function (r) { return (r.tags || []).indexOf(filter.tag) >= 0; });
      if (filter.q) { var q = String(filter.q).trim().toLowerCase(); if (q) arr = arr.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0; }); }
      return arr;
    },
    recommend: function (date, opts) {
      opts = opts || {};
      var active = Goals.getActiveGoal(date);
      var target = active.targetKcal;
      var summary = Log.dailySummary(date);
      var bonus = Link.trainingBonus(date);
      var remaining = (target != null) ? Math.max(0, target + bonus - summary.kcal) : 0;
      var type = active.type;
      var cands = [];
      Foods.listFoods({}).forEach(function (f) {
        if (Foods.isRestricted(f.name)) return;
        cands.push({ kind: 'food', id: f.id, name: f.name, kcal: f.per100g.kcal, protein: f.per100g.protein, carb: f.per100g.carb, fat: f.per100g.fat, relevance: relevanceScore(f.per100g, type) });
      });
      Store.data.diet.recipes.forEach(function (r) {
        if (Foods.isRestricted(r.name)) return;
        if (r.items.some(function (it) { return Foods.isRestricted(it.name); })) return;
        cands.push({ kind: 'recipe', id: r.id, name: r.name, kcal: r.totalNutrition.kcal, protein: r.totalNutrition.protein, carb: r.totalNutrition.carb, fat: r.totalNutrition.fat, relevance: relevanceScore(r.totalNutrition, type) });
      });
      // 无目标时 remaining=0，所有项均超出预算 -> 返回空
      cands = cands.filter(function (c) { return c.kcal <= remaining + 1e-6; });
      cands.sort(function (a, b) { if (b.relevance !== a.relevance) return b.relevance - a.relevance; return b.kcal - a.kcal; });
      var topN = opts.topN != null ? num(opts.topN) : 5;
      return cands.slice(0, topN);
    },
    composeMeal: function (date, meal, constraints) {
      constraints = constraints || {};
      var active = Goals.getActiveGoal(date);
      var target = active.targetKcal;
      if (target == null) return [];
      var summary = Log.dailySummary(date);
      var bonus = Link.trainingBonus(date);
      var remaining = Math.max(0, target + bonus - summary.kcal);
      var foods = Foods.listFoods({}).filter(function (f) { return !Foods.isRestricted(f.name); });
      if (!foods.length || remaining <= 0) return [];
      var macroT = active.macroTarget;
      var leftKcal = remaining;
      var leftProtein = macroT.protein != null ? Math.max(0, macroT.protein - summary.protein) : 0;
      var leftCarb = macroT.carb != null ? Math.max(0, macroT.carb - summary.carb) : 0;
      var leftFat = macroT.fat != null ? Math.max(0, macroT.fat - summary.fat) : 0;
      var entries = [];
      var guard = 0;
      while (leftKcal > 50 && guard < 60) {
        guard++;
        var need = [];
        if (leftProtein > 0) need.push('protein');
        if (leftCarb > 0) need.push('carb');
        if (leftFat > 0) need.push('fat');
        if (!need.length) break;
        var best = null, bestScore = Infinity;
        foods.forEach(function (f) {
          var per = f.per100g; var score = Infinity;
          if (need.indexOf('protein') >= 0 && per.protein > 0) score = Math.min(score, per.kcal / per.protein);
          if (need.indexOf('carb') >= 0 && per.carb > 0) score = Math.min(score, per.kcal / per.carb);
          if (need.indexOf('fat') >= 0 && per.fat > 0) score = Math.min(score, per.kcal / per.fat);
          if (score < bestScore) { bestScore = score; best = f; }
        });
        if (!best) break;
        var nut = scaleNutrition(best.per100g, 1); // 每 100g
        var grams = 100;
        if (nut.kcal > leftKcal) {
          grams = Math.max(10, Math.floor(leftKcal / (nut.kcal / 100) / 10) * 10);
          if (grams < 10) break;
          nut = scaleNutrition(best.per100g, grams / 100);
        }
        entries.push({ foodId: best.id, name: best.name, grams: grams, nutrition: nut });
        leftKcal -= nut.kcal;
        leftProtein -= nut.protein; leftCarb -= nut.carb; leftFat -= nut.fat;
      }
      return entries;
    },
    addRecipeToDay: function (date, meal, recipeId) {
      var r = findRecipe(recipeId); if (!r) return false;
      if (getMealsOrder().indexOf(meal) < 0) return false;
      r.items.forEach(function (it) {
        Log.addEntry(date, meal, { foodId: it.foodId != null ? it.foodId : null, name: it.name, grams: it.grams != null ? it.grams : 100, nutrition: it.nutrition });
      });
      return true;
    },
  };

  // ============================================================
  // M5 趋势统计 DietStats
  // ============================================================
  function weekRange() {
    var wr = (UI && UI.weekRange) ? UI.weekRange() : [UI.todayStr(), UI.todayStr()];
    return { from: wr[0], to: wr[wr.length - 1] };
  }
  function dateList(from, to) {
    var out = [];
    var p = from.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var q = to.split('-'); var end = new Date(+q[0], +q[1] - 1, +q[2]);
    while (d <= end) { out.push(UI.todayStr(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  var Stats = {
    trend: function (range) {
      range = range || weekRange();
      var dates = dateList(range.from, range.to);
      var kcal = [], target = [], protein = [], carb = [], fat = [];
      dates.forEach(function (dd) {
        var s = Log.dailySummary(dd);
        var g = Goals.getActiveGoal(dd);
        kcal.push(s.kcal);
        target.push(g.targetKcal != null ? g.targetKcal : 0);
        protein.push(s.protein); carb.push(s.carb); fat.push(s.fat);
      });
      return { dates: dates, kcal: kcal, target: target, macros: { protein: protein, carb: carb, fat: fat } };
    },
    aggregate: function (range) {
      range = range || weekRange();
      var dates = dateList(range.from, range.to);
      var total = 0, days = 0, onTarget = 0, pSum = 0, cSum = 0, fSum = 0;
      dates.forEach(function (dd) {
        var s = Log.dailySummary(dd);
        var g = Goals.getActiveGoal(dd);
        if (s.kcal > 0) { total += s.kcal; days++; pSum += s.protein; cSum += s.carb; fSum += s.fat; }
        if (g.targetKcal != null && s.kcal > 0) {
          var tol = Math.max(50, g.targetKcal * 0.1);
          if (Math.abs(s.kcal - g.targetKcal) <= tol) onTarget++;
        }
      });
      return {
        avgKcal: days ? round(total / days) : 0,
        onTargetDays: onTarget,
        totalDays: dates.length,
        macroAvg: { protein: days ? round(pSum / days) : 0, carb: days ? round(cSum / days) : 0, fat: days ? round(fSum / days) : 0 },
      };
    },
    macroDistribution: function (date) {
      var s = Log.dailySummary(date);
      return { proteinPct: s.proteinPct, carbPct: s.carbPct, fatPct: s.fatPct };
    },
  };

  // ============================================================
  // M6 健康联动 DietLink（只读 fitness）
  // ============================================================
  var Link = {
    getEffectiveProfile: function () {
      var p = getProfile();
      if (p.useFitnessWeight) {
        var lw = Link.getLatestWeight();
        if (lw) p = { sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: lw.weight, useFitnessWeight: p.useFitnessWeight };
      }
      return p;
    },
    getLatestWeight: function () {
      if (!W.Fitness || !W.Fitness.trendData) return null;
      var t = W.Fitness.trendData();
      if (!t.length) return null;
      return { date: t[t.length - 1].date, weight: t[t.length - 1].weight };
    },
    getTrainingDays: function (range) {
      if (!W.Fitness || !W.Fitness.getDay) return [];
      range = range || weekRange();
      var dates = dateList(range.from, range.to);
      var out = [];
      dates.forEach(function (d) { var day = W.Fitness.getDay(d); if (day && day.part) out.push({ date: d, part: day.part }); });
      return out;
    },
    trainingBonus: function (date) {
      date = date || (UI && UI.todayStr());
      var bonus = 0;
      if (W.Fitness && W.Fitness.getDay) {
        var day = W.Fitness.getDay(date);
        if (day && day.part) bonus = TRAINING_BONUS;
      }
      var d = ensureDay(date);
      d.trainingBonusKcal = bonus;
      Store.save();
      return bonus;
    },
    getTrainingStatus: function (date) {
      date = date || (UI && UI.todayStr());
      if (!W.Fitness || !W.Fitness.getDay) return null;
      var day = W.Fitness.getDay(date);
      return (day && day.part) ? day.part : null;
    },
  };

  // ============================================================
  // 统一门面 Diet（转发至各子模块 + 兼容旧 API）
  // ============================================================
  var Diet = {
    // 子模块命名空间
    Goals: Goals, Foods: Foods, Log: Log, Recipes: Recipes, Stats: Stats, Link: Link,
    // 目标
    computeBMR: function (p) { return Goals.computeBMR(p); },
    computeTDEE: function (b, a) { return Goals.computeTDEE(b, a); },
    deriveTargets: function (g, p) { return Goals.deriveTargets(g, p); },
    getActiveGoal: function (d) { return Goals.getActiveGoal(d); },
    setGoal: function (f) { return Goals.setGoal(f); },
    updateProfile: function (f) { return Goals.updateProfile(f); },
    // 食材库 / 禁忌
    addFood: function (spec) { return Foods.addFood(spec); }, // 新签名：{name, category, per100g, tags, aliases}
    addLibraryFood: function (spec) { return Foods.addFood(spec); },
    removeFood: function (id) { return Foods.removeFood(id); }, // 兼容别名
    updateLibraryFood: function (id, fields) { return Foods.updateFood(id, fields); },
    removeLibraryFood: function (id) { return Foods.removeFood(id); },
    findLibraryFood: function (id) { return Foods.find(id); },
    listFoods: function (f) { return Foods.listFoods(f); },
    addRestriction: function (spec) { return Foods.addRestriction(spec); },
    removeRestriction: function (id) { return Foods.removeRestriction(id); },
    listRestrictions: function () { return Foods.listRestrictions(); },
    isRestricted: function (n) { return Foods.isRestricted(n); },
    // 记录 / 餐次
    ensureDay: function (d) { return Log.ensureDay(d); },
    addEntry: function (d, m, s) { return Log.addEntry(d, m, s); },
    updateEntry: function (d, m, id, f) { return Log.updateEntry(d, m, id, f); },
    removeEntry: function (d, m, id) { return Log.removeEntry(d, m, id); },
    getDay: function (d) { return Log.getDay(d); },
    dailySummary: function (d) { return Log.dailySummary(d); },
    hasAnyFood: function (d) { return Log.hasAnyFood(d); },
    setMealsOrder: function (o) { return Log.setMealsOrder(o); },
    addMeal: function (k, l) { return Log.addMeal(k, l); },
    renameMeal: function (k, l) { return Log.renameMeal(k, l); },
    removeMeal: function (k) { return Log.removeMeal(k); },
    getMealsOrder: function () { return getMealsOrder(); },
    mealLabel: function (k) { return mealLabel(k); },
    saveMealTemplate: function (s) { return Log.saveMealTemplate(s); },
    applyMealTemplate: function (d, m, t) { return Log.applyMealTemplate(d, m, t); },
    setWater: function (d, ml) { return Log.setWater(d, ml); },
    setNote: function (d, note) { return Log.setNote(d, note); },
    // 食谱
    addRecipe: function (s) { return Recipes.addRecipe(s); },
    recommend: function (d, o) { return Recipes.recommend(d, o); },
    composeMeal: function (d, m, c) { return Recipes.composeMeal(d, m, c); },
    addRecipeToDay: function (d, m, r) { return Recipes.addRecipeToDay(d, m, r); },
    // 统计
    trend: function (r) { return Stats.trend(r); },
    aggregate: function (r) { return Stats.aggregate(r); },
    macroDistribution: function (d) { return Stats.macroDistribution(d); },
    // 联动
    getLatestWeight: function () { return Link.getLatestWeight(); },
    getTrainingDays: function (r) { return Link.getTrainingDays(r); },
    trainingBonus: function (d) { return Link.trainingBonus(d); },
    getTrainingStatus: function (d) { return Link.getTrainingStatus(d); },
    // 兼容旧 API（过渡用，未来可移除）
    setTarget: function (kcal) { return Goals.setGoal({ method: 'manual', targetKcal: kcal }); },
    build: build,
    render: render,
  };
  // 兼容旧代码：Diet.MEALS 作为当前餐次顺序的实时快照
  Object.defineProperty(Diet, 'MEALS', { get: function () { return getMealsOrder().slice(); } });

  // ============================================================
  // 视图层（build / render / 弹窗表单）
  // ============================================================
  var state = { date: null };
  var lastView = null, lastTopbar = null;

  function shiftDate(date, delta) {
    var p = String(date).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + delta);
    return UI.todayStr(d);
  }

  function esc(s) { return UI.escapeHtml(s); }

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

  function build(ctx) {
    ctx = ctx || {};
    var date = ctx.date || (UI && UI.todayStr());
    state.date = date;
    var day = ensureDay(date);
    var sum = Log.dailySummary(date);
    var goal = Goals.getActiveGoal(date);
    var bonus = Link.trainingBonus(date);
    var ordered = getMealsOrder();

    var html = '';
    // 日期导航
    html += '<div class="date-nav">';
    html += '<button class="btn btn-sm" id="diet-prev">‹ 前一天</button>';
    html += '<span class="date-label">' + esc(UI.fmtDate(date)) + '</span>';
    html += '<button class="btn btn-sm" id="diet-next">后一天 ›</button>';
    html += '<button class="btn btn-sm" id="diet-today">回到今天</button>';
    html += '</div>';

    // —— 目标面板 ——
    var g = getGoals();
    html += '<div class="card" style="margin-bottom:12px"><h3>饮食目标</h3>';
    var types = [['cut', '减脂'], ['maintain', '维持'], ['bulk', '增肌']];
    html += '<div class="btn-group">';
    types.forEach(function (t) {
      var act = (g.type === t[0]) ? ' btn-primary' : '';
      html += '<button class="btn btn-sm' + act + '" data-goal-type="' + t[0] + '">' + t[1] + '</button>';
    });
    html += '</div>';
    html += '<div class="actions" style="margin-top:8px">';
    html += '方式 <select id="diet-method"><option value="auto"' + (g.method === 'auto' ? ' selected' : '') + '>自动推算</option><option value="manual"' + (g.method === 'manual' ? ' selected' : '') + '>手填</option></select> ';
    html += '活动量 <select id="diet-activity"><option value="sedentary"' + (g.activity === 'sedentary' ? ' selected' : '') + '>久坐</option><option value="light"' + (g.activity === 'light' ? ' selected' : '') + '>轻度</option><option value="moderate"' + (g.activity === 'moderate' ? ' selected' : '') + '>中度</option><option value="high"' + (g.activity === 'high' ? ' selected' : '') + '>高强度</option></select> ';
    html += '目标热量(手填) <input type="number" id="diet-target-kcal" value="' + (g.targetKcal != null ? g.targetKcal : '') + '" placeholder="自动" style="width:90px;display:inline-block" /> ';
    html += '<button class="btn btn-sm" id="diet-save-goal">保存目标</button>';
    html += '</div>';
    html += '<div class="actions" style="margin-top:8px">身体参数：性别 <select id="diet-sex"><option value="">-</option><option value="male"' + (getProfile().sex === 'male' ? ' selected' : '') + '>男</option><option value="female"' + (getProfile().sex === 'female' ? ' selected' : '') + '>女</option></select> ';
    html += '年龄 <input type="number" id="diet-age" value="' + (getProfile().age != null ? getProfile().age : '') + '" style="width:60px;display:inline-block" /> ';
    html += '身高 <input type="number" id="diet-height" value="' + (getProfile().heightCm != null ? getProfile().heightCm : '') + '" style="width:60px;display:inline-block" /> ';
    html += '体重 <input type="number" id="diet-weight" value="' + (getProfile().weightKg != null ? getProfile().weightKg : '') + '" style="width:60px;display:inline-block" /> ';
    html += '<label><input type="checkbox" id="diet-use-fit-weight"' + (getProfile().useFitnessWeight ? ' checked' : '') + ' /> 取健身体重</label> ';
    html += '<button class="btn btn-sm" id="diet-save-profile">保存参数</button>';
    html += '</div>';
    html += '<p class="card-sub">当前目标：' + (goal.targetKcal != null ? ('约 ' + goal.targetKcal + ' kcal') : '未设定（请填写身体参数或手填目标）') + ' ｜ 宏量目标 P' + (goal.macroTarget.protein != null ? goal.macroTarget.protein : '-') + '/C' + (goal.macroTarget.carb != null ? goal.macroTarget.carb : '-') + '/F' + (goal.macroTarget.fat != null ? goal.macroTarget.fat : '-') + ' g</p>';
    html += '</div>';

    // —— 当日汇总 ——
    html += '<div class="card" style="margin-bottom:12px"><h3>今日汇总（' + esc(UI.fmtDate(date)) + '）</h3>';
    if (goal.targetKcal != null) {
      var pct = Math.min(100, Math.round(sum.kcal / goal.targetKcal * 100));
      var remain = goal.targetKcal - sum.kcal;
      html += '<p class="card-sub">总热量 <b>' + sum.kcal + '</b> / ' + goal.targetKcal + ' kcal（' + (remain >= 0 ? '还可 ' + remain : '超出 ' + (-remain)) + '） · 蛋白 ' + sum.protein + 'g · 碳水 ' + sum.carb + 'g · 脂肪 ' + sum.fat + 'g</p>';
      html += '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>';
      html += '<p class="card-sub">已摄入 ' + pct + '% 目标</p>';
    } else {
      html += '<p class="card-sub">总热量 <b>' + sum.kcal + '</b> kcal · 蛋白 ' + sum.protein + 'g · 碳水 ' + sum.carb + 'g · 脂肪 ' + sum.fat + 'g（未设定目标）</p>';
    }
    html += '<p class="card-sub">供能比：蛋白 ' + sum.proteinPct + '% · 碳水 ' + sum.carbPct + '% · 脂肪 ' + sum.fatPct + '% ｜ 饮水 ' + day.waterMl + ' ml' + (bonus ? ' ｜ 训练日加成 +' + bonus + ' kcal' : '') + '</p>';
    html += '</div>';

    // —— 餐次 ——
    html += '<div class="grid">';
    ordered.forEach(function (m) {
      html += '<div class="card"><h3>' + esc(mealLabel(m)) + '</h3>';
      var items = day.meals[m] || [];
      if (items.length === 0) {
        html += '<p class="empty-state">还没记录</p>';
      } else {
        html += '<ul class="list">';
        items.forEach(function (it) {
          html += '<li data-eid="' + it.id + '" data-meal="' + m + '"><span class="grow">' + esc(it.name) + ' <small class="card-sub">' + it.grams + 'g · ' + Math.round(it.nutrition.kcal) + 'kcal · P' + Math.round(it.nutrition.protein) + ' C' + Math.round(it.nutrition.carb) + ' F' + Math.round(it.nutrition.fat) + '</small></span><button class="btn btn-sm diet-edit-entry">改</button><button class="btn btn-sm btn-danger diet-del-entry">删</button></li>';
        });
        html += '</ul>';
      }
      html += '<button class="btn btn-sm btn-primary diet-add-entry" data-meal="' + m + '">+ 添加</button> ';
      // 模板应用
      if (Store.data.diet.mealTemplates.length) {
        html += '<select class="diet-apply-tpl" data-meal="' + m + '"><option value="">套用模板…</option>';
        Store.data.diet.mealTemplates.forEach(function (t) { html += '<option value="' + t.id + '">' + esc(t.name) + '</option>'; });
        html += '</select>';
      }
      html += '</div>';
    });
    html += '</div>';

    // —— 食材库 ——
    html += '<div class="card" style="margin-top:12px"><h3>食材库</h3>';
    html += '<div class="actions"><input type="text" id="diet-food-q" placeholder="搜索名称/别名" style="width:160px;display:inline-block" /> <select id="diet-food-cat"><option value="">全部分类</option></select> <button class="btn btn-sm btn-primary" id="diet-add-food">+ 添加食材</button></div>';
    var foods = Foods.listFoods({});
    if (foods.length === 0) {
      html += '<p class="empty-state">食物库还是空的，先加几个常吃的</p>';
    } else {
      html += '<ul class="list" id="diet-food-list">';
      foods.forEach(function (f) {
        html += '<li data-fid="' + f.id + '"><span class="grow">' + esc(f.name) + ' <small class="card-sub">' + Math.round(f.per100g.kcal) + 'kcal/100g · 蛋' + Math.round(f.per100g.protein) + ' 碳' + Math.round(f.per100g.carb) + ' 脂' + Math.round(f.per100g.fat) + (f.category ? ' · ' + esc(f.category) : '') + '</small></span><button class="btn btn-sm diet-edit-food">改</button><button class="btn btn-sm btn-danger diet-del-food">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // —— 禁忌 / 过敏 ——
    html += '<div class="card" style="margin-top:12px"><h3>禁忌 / 过敏</h3>';
    html += '<div class="actions"><select id="diet-rest-kind"><option value="allergy">过敏</option><option value="intolerance">不耐受</option><option value="dislike">忌口</option><option value="medical">医嘱</option></select> <input type="text" id="diet-rest-name" placeholder="名称" style="width:120px;display:inline-block" /> <button class="btn btn-sm btn-primary" id="diet-add-rest">+ 添加</button></div>';
    if (Store.data.diet.restrictions.length === 0) {
      html += '<p class="empty-state">暂无禁忌记录</p>';
    } else {
      html += '<ul class="list">';
      Store.data.diet.restrictions.forEach(function (r) {
        html += '<li data-rid="' + r.id + '"><span class="grow">' + esc(r.name) + ' <small class="card-sub">[' + r.kind + ']' + (r.note ? ' ' + esc(r.note) : '') + '</small></span><button class="btn btn-sm btn-danger diet-del-rest">删</button></li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // —— 食谱 / 推荐 ——
    html += '<div class="card" style="margin-top:12px"><h3>食谱与推荐</h3>';
    html += '<div class="actions"><button class="btn btn-sm btn-primary" id="diet-add-recipe">+ 新建食谱</button> <button class="btn btn-sm" id="diet-recommend">智能推荐</button> <button class="btn btn-sm" id="diet-compose">生成一餐</button></div>';
    if (Store.data.diet.recipes.length === 0) {
      html += '<p class="empty-state">还没有收藏的食谱</p>';
    } else {
      html += '<ul class="list">';
      Store.data.diet.recipes.forEach(function (r) {
        html += '<li data-rid="' + r.id + '"><span class="grow">' + esc(r.name) + ' <small class="card-sub">' + esc(mealLabel(r.meal)) + ' · ' + r.totalNutrition.kcal + 'kcal</small></span><button class="btn btn-sm diet-recipe-to" data-rid="' + r.id + '">加入</button><button class="btn btn-sm btn-danger diet-del-recipe">删</button></li>';
      });
      html += '</ul>';
    }
    html += '<div id="diet-reco-box"></div>';
    html += '</div>';

    // —— 餐次管理 ——
    html += '<div class="card" style="margin-top:12px"><h3>餐次管理</h3>';
    html += '<div class="actions" id="diet-meal-manage">';
    ordered.forEach(function (m) {
      html += '<span class="meal-chip">' + esc(mealLabel(m)) + ' <button class="btn btn-sm diet-rename-meal" data-meal="' + m + '">改名</button><button class="btn btn-sm btn-danger diet-remove-meal" data-meal="' + m + '">删</button></span> ';
    });
    html += '<button class="btn btn-sm btn-primary" id="diet-add-meal">+ 新增餐次</button>';
    html += '</div></div>';

    // —— 趋势统计 ——
    html += '<div class="card" style="margin-top:12px"><h3>趋势统计（本周）</h3>';
    var agg = Stats.aggregate(weekRange());
    html += '<p class="card-sub">平均热量 <b>' + agg.avgKcal + '</b> kcal · 达标天数 ' + agg.onTargetDays + '/' + agg.totalDays + ' · 宏量均值 P' + agg.macroAvg.protein + '/C' + agg.macroAvg.carb + '/F' + agg.macroAvg.fat + ' g</p>';
    if (W.echarts) html += '<div id="diet-chart" class="echart-box"></div>';
    else html += '<p class="empty-state">图表依赖 echarts（离线内置）</p>';
    html += '</div>';

    return html;
  }

  function render(viewEl, topbar) {
    if (state.date == null) state.date = UI.todayStr();
    var date = state.date;
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '饮食计划';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    lastView = viewEl; lastTopbar = topbar;
    viewEl.innerHTML = '<div class="diet-root">' + build({ date: date }) + '</div>';
    bindView(viewEl.querySelector('.diet-root'), date);
    // 渲染趋势图（仅浏览器环境）
    if (W.echarts) {
      var dom = viewEl.querySelector('#diet-chart');
      if (dom) renderTrendChart(dom);
    }
  }

  function rerender() {
    if (lastView) render(lastView, lastTopbar);
  }

  function renderTrendChart(dom) {
    var tr = Stats.trend(weekRange());
    var themeColor = '#3b82f6', dark = false;
    try { var v = W.getComputedStyle(W.document.documentElement).getPropertyValue('--theme-color'); themeColor = (v && v.trim()) || '#3b82f6'; } catch (e) {}
    try { dark = !!(W.document.body && W.document.body.getAttribute('data-theme') === 'dark'); } catch (e) {}
    var axisColor = dark ? '#94a3b8' : '#6b7280', splitColor = dark ? '#334155' : '#e5e7eb';
    var chart = W.echarts.init(dom);
    chart.setOption({
      grid: { left: 46, right: 18, top: 24, bottom: 28 },
      tooltip: { trigger: 'axis' },
      legend: { data: ['摄入', '目标'], textStyle: { color: axisColor } },
      xAxis: { type: 'category', data: tr.dates, axisLabel: { color: axisColor, fontSize: 11 }, axisLine: { lineStyle: { color: splitColor } } },
      yAxis: { type: 'value', axisLabel: { color: axisColor }, splitLine: { lineStyle: { color: splitColor } } },
      series: [
        { name: '摄入', type: 'line', smooth: true, data: tr.kcal, itemStyle: { color: themeColor }, lineStyle: { color: themeColor, width: 2 }, areaStyle: { color: 'rgba(59,130,246,0.12)' } },
        { name: '目标', type: 'line', data: tr.target, lineStyle: { type: 'dashed', color: axisColor }, itemStyle: { color: axisColor }, symbol: 'none' },
      ],
    });
  }

  function bindView(viewEl, date) {
    if (!viewEl) return; // 无 DOM 环境（如测试基座）下安全跳过绑定
    var prev = viewEl.querySelector('#diet-prev');
    var next = viewEl.querySelector('#diet-next');
    var todayBtn = viewEl.querySelector('#diet-today');
    if (prev) prev.addEventListener('click', function () { state.date = shiftDate(state.date, -1); rerender(); });
    if (next) next.addEventListener('click', function () { state.date = shiftDate(state.date, 1); rerender(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { state.date = UI.todayStr(); rerender(); });

    // 目标类型快捷切换
    var typeBtns = viewEl.querySelectorAll('[data-goal-type]');
    for (var i = 0; i < typeBtns.length; i++) {
      typeBtns[i].addEventListener('click', function () {
        Goals.setGoal({ type: this.getAttribute('data-goal-type') });
        rerender();
      });
    }
    var saveGoal = viewEl.querySelector('#diet-save-goal');
    if (saveGoal) saveGoal.addEventListener('click', function () {
      var method = viewEl.querySelector('#diet-method').value;
      var activity = viewEl.querySelector('#diet-activity').value;
      var tk = viewEl.querySelector('#diet-target-kcal').value;
      Goals.setGoal({ method: method, activity: activity, targetKcal: tk === '' ? null : num(tk) });
      rerender();
    });
    var saveProfile = viewEl.querySelector('#diet-save-profile');
    if (saveProfile) saveProfile.addEventListener('click', function () {
      var sex = viewEl.querySelector('#diet-sex').value;
      var age = viewEl.querySelector('#diet-age').value;
      var h = viewEl.querySelector('#diet-height').value;
      var w = viewEl.querySelector('#diet-weight').value;
      var useFit = viewEl.querySelector('#diet-use-fit-weight').checked;
      Goals.updateProfile({ sex: sex || null, age: age === '' ? null : num(age), heightCm: h === '' ? null : num(h), weightKg: w === '' ? null : num(w), useFitnessWeight: useFit });
      rerender();
    });

    // 食材库搜索/过滤（局部刷新列表）
    var foodQ = viewEl.querySelector('#diet-food-q');
    var foodCat = viewEl.querySelector('#diet-food-cat');
    if (foodCat) {
      var cats = {}; Foods.listFoods({}).forEach(function (f) { if (f.category) cats[f.category] = 1; });
      Object.keys(cats).forEach(function (c) { foodCat.innerHTML += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
    }
    function refreshFoodList() {
      var list = viewEl.querySelector('#diet-food-list');
      if (!list) return;
      var q = foodQ ? foodQ.value : '';
      var cat = foodCat ? foodCat.value : '';
      var items = Foods.listFoods({ q: q, category: cat });
      if (!items.length) { list.outerHTML = '<p class="empty-state">没有匹配的食材</p>'; return; }
      var ul = '<ul class="list" id="diet-food-list">';
      items.forEach(function (f) {
        ul += '<li data-fid="' + f.id + '"><span class="grow">' + esc(f.name) + ' <small class="card-sub">' + Math.round(f.per100g.kcal) + 'kcal/100g · 蛋' + Math.round(f.per100g.protein) + ' 碳' + Math.round(f.per100g.carb) + ' 脂' + Math.round(f.per100g.fat) + (f.category ? ' · ' + esc(f.category) : '') + '</small></span><button class="btn btn-sm diet-edit-food">改</button><button class="btn btn-sm btn-danger diet-del-food">删</button></li>';
      });
      ul += '</ul>';
      list.outerHTML = ul;
    }
    if (foodQ) foodQ.addEventListener('input', refreshFoodList);
    if (foodCat) foodCat.addEventListener('change', refreshFoodList);

    // 添加食材 / 添加禁忌 / 添加餐次 / 添加食谱
    var addFoodBtn = viewEl.querySelector('#diet-add-food');
    if (addFoodBtn) addFoodBtn.addEventListener('click', function () { openFoodModal(); });
    var addRestBtn = viewEl.querySelector('#diet-add-rest');
    if (addRestBtn) addRestBtn.addEventListener('click', function () {
      var kind = viewEl.querySelector('#diet-rest-kind').value;
      var name = viewEl.querySelector('#diet-rest-name').value;
      if (!name.trim()) { UI.toast('请填写名称', 'error'); return; }
      Foods.addRestriction({ kind: kind, name: name });
      rerender();
    });
    var addMealBtn = viewEl.querySelector('#diet-add-meal');
    if (addMealBtn) addMealBtn.addEventListener('click', function () {
      var key = Log.addMeal(null, '新餐次');
      rerender();
    });

    // 条目 / 食材 / 禁忌 / 食谱 的增删改（事件委托）
    viewEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t.classList.contains('diet-add-entry')) { openEntryModal(t.getAttribute('data-meal')); return; }
      if (t.classList.contains('diet-edit-entry')) { var li = t.closest('li'); openEntryModal(li.getAttribute('data-meal'), li.getAttribute('data-eid')); return; }
      if (t.classList.contains('diet-del-entry')) { var le = t.closest('li'); Log.removeEntry(date, le.getAttribute('data-meal'), le.getAttribute('data-eid')); rerender(); return; }
      if (t.classList.contains('diet-edit-food')) { var lf = t.closest('li'); openFoodModal(lf.getAttribute('data-fid')); return; }
      if (t.classList.contains('diet-del-food')) { var lf2 = t.closest('li'); Foods.removeFood(lf2.getAttribute('data-fid')); rerender(); return; }
      if (t.classList.contains('diet-del-rest')) { var lr = t.closest('li'); Foods.removeRestriction(lr.getAttribute('data-rid')); rerender(); return; }
      if (t.classList.contains('diet-recipe-to')) { var rid = t.getAttribute('data-rid'); openApplyRecipeModal(rid); return; }
      if (t.classList.contains('diet-del-recipe')) { var lp = t.closest('li'); Recipes.removeRecipe(lp.getAttribute('data-rid')); rerender(); return; }
      if (t.classList.contains('diet-rename-meal')) { openRenameMealModal(t.getAttribute('data-meal')); return; }
      if (t.classList.contains('diet-remove-meal')) { openRemoveMeal(t.getAttribute('data-meal')); return; }
    });
    viewEl.addEventListener('change', function (e) {
      if (e.target.classList.contains('diet-apply-tpl')) {
        var tplId = e.target.value; if (!tplId) return;
        Log.applyMealTemplate(date, e.target.getAttribute('data-meal'), tplId);
        rerender();
      }
    });
    var recoBtn = viewEl.querySelector('#diet-recommend');
    if (recoBtn) recoBtn.addEventListener('click', function () { showRecommend(date); });
    var composeBtn = viewEl.querySelector('#diet-compose');
    if (composeBtn) composeBtn.addEventListener('click', function () { showCompose(date); });
    var addRecipeBtn = viewEl.querySelector('#diet-add-recipe');
    if (addRecipeBtn) addRecipeBtn.addEventListener('click', function () { openRecipeModal(); });
  }

  // —— 弹窗表单 ——
  function openEntryModal(meal, entryId) {
    var ordered = getMealsOrder();
    var foodOpts = '<option value="">手填营养</option>';
    Foods.listFoods({}).forEach(function (f) { foodOpts += '<option value="' + f.id + '">' + esc(f.name) + ' (' + Math.round(f.per100g.kcal) + 'kcal/100g)</option>'; });
    var mealOpts = '';
    ordered.forEach(function (m) { mealOpts += '<option value="' + m + '"' + (m === meal ? ' selected' : '') + '>' + esc(mealLabel(m)) + '</option>'; });
    var existing = entryId ? (function () { var d = Store.data.diet.days[state.date]; if (!d) return null; var res = null; ordered.forEach(function (m) { (d.meals[m] || []).forEach(function (it) { if (it.id === entryId) res = { meal: m, it: it }; }); }); return res; })() : null;
    var init = existing ? existing.it : { name: '', grams: 100, nutrition: { kcal: 0, protein: 0, carb: 0, fat: 0 }, foodId: null };
    var mask = openModal(
      '<h4>' + (entryId ? '编辑条目' : '添加食物') + '</h4>' +
      '<label class="field"><span>餐次</span><select id="en-meal">' + mealOpts + '</select></label>' +
      '<label class="field"><span>从食材库选</span><select id="en-food">' + foodOpts + '</select></label>' +
      '<label class="field"><span>名称</span><input type="text" id="en-name" value="' + esc(init.name) + '" /></label>' +
      '<label class="field"><span>份量(g)</span><input type="number" id="en-grams" value="' + (init.grams || 100) + '" min="0" /></label>' +
      '<div id="en-manual" style="border-top:1px solid #eee;margin-top:8px;padding-top:8px">' +
      '<label class="field"><span>热量 kcal</span><input type="number" id="en-kcal" value="' + Math.round(init.nutrition.kcal) + '" /></label>' +
      '<label class="field"><span>蛋白 g</span><input type="number" id="en-p" value="' + Math.round(init.nutrition.protein) + '" /></label>' +
      '<label class="field"><span>碳水 g</span><input type="number" id="en-c" value="' + Math.round(init.nutrition.carb) + '" /></label>' +
      '<label class="field"><span>脂肪 g</span><input type="number" id="en-f" value="' + Math.round(init.nutrition.fat) + '" /></label>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn" id="en-cancel">取消</button><button class="btn btn-primary" id="en-ok">保存</button></div>'
    );
    var foodSel = mask.querySelector('#en-food');
    foodSel.addEventListener('change', function () {
      if (foodSel.value) { mask.querySelector('#en-manual').style.display = 'none'; }
      else { mask.querySelector('#en-manual').style.display = 'block'; }
    });
    mask.querySelector('#en-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#en-ok').onclick = function () {
      var meal2 = mask.querySelector('#en-meal').value;
      var name = mask.querySelector('#en-name').value;
      var grams = num(mask.querySelector('#en-grams').value);
      var fid = foodSel.value || null;
      if (!name.trim()) { UI.toast('请填写名称', 'error'); return; }
      var doAdd = function () {
        if (entryId) {
          Log.updateEntry(state.date, existing.meal, entryId, fid ? { foodId: fid, name: name, grams: grams } : { name: name, grams: grams, nutrition: { kcal: num(mask.querySelector('#en-kcal').value), protein: num(mask.querySelector('#en-p').value), carb: num(mask.querySelector('#en-c').value), fat: num(mask.querySelector('#en-f').value) } });
        } else {
          Log.addEntry(state.date, meal2, fid ? { foodId: fid, name: name, grams: grams } : { name: name, grams: grams, nutrition: { kcal: num(mask.querySelector('#en-kcal').value), protein: num(mask.querySelector('#en-p').value), carb: num(mask.querySelector('#en-c').value), fat: num(mask.querySelector('#en-f').value) } });
        }
        closeModal(mask); rerender();
      };
      if (Foods.isRestricted(name)) {
        UI.confirm({ title: '过敏原警告', message: '「' + name + '」命中禁忌，确定添加？' }).then(function (ok) { if (ok) doAdd(); });
      } else { doAdd(); }
    };
  }

  function openFoodModal(fid) {
    var f = fid ? Foods.find(fid) : null;
    var mask = openModal(
      '<h4>' + (fid ? '编辑食材' : '添加食材') + '</h4>' +
      '<label class="field"><span>名称</span><input type="text" id="ff-name" value="' + (f ? esc(f.name) : '') + '" /></label>' +
      '<label class="field"><span>分类</span><input type="text" id="ff-cat" value="' + (f ? esc(f.category) : '') + '" placeholder="如 主食/蛋白/蔬菜" /></label>' +
      '<label class="field"><span>热量/100g</span><input type="number" id="ff-kcal" value="' + (f ? Math.round(f.per100g.kcal) : 0) + '" /></label>' +
      '<label class="field"><span>蛋白/100g</span><input type="number" id="ff-p" value="' + (f ? Math.round(f.per100g.protein) : 0) + '" /></label>' +
      '<label class="field"><span>碳水/100g</span><input type="number" id="ff-c" value="' + (f ? Math.round(f.per100g.carb) : 0) + '" /></label>' +
      '<label class="field"><span>脂肪/100g</span><input type="number" id="ff-f" value="' + (f ? Math.round(f.per100g.fat) : 0) + '" /></label>' +
      '<label class="field"><span>标签(逗号)</span><input type="text" id="ff-tags" value="' + (f ? (f.tags || []).join(',') : '') + '" /></label>' +
      '<label class="field"><span>别名(逗号)</span><input type="text" id="ff-aliases" value="' + (f ? (f.aliases || []).join(',') : '') + '" /></label>' +
      '<div class="modal-actions"><button class="btn" id="ff-cancel">取消</button><button class="btn btn-primary" id="ff-ok">保存</button></div>'
    );
    mask.querySelector('#ff-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#ff-ok').onclick = function () {
      var spec = {
        name: mask.querySelector('#ff-name').value,
        category: mask.querySelector('#ff-cat').value,
        per100g: { kcal: num(mask.querySelector('#ff-kcal').value), protein: num(mask.querySelector('#ff-p').value), carb: num(mask.querySelector('#ff-c').value), fat: num(mask.querySelector('#ff-f').value), fiber: 0, sodium: 0 },
        tags: mask.querySelector('#ff-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        aliases: mask.querySelector('#ff-aliases').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      };
      if (fid) Foods.updateFood(fid, spec); else Foods.addFood(spec);
      closeModal(mask); rerender();
    };
  }

  function openRecipeModal() {
    var ordered = getMealsOrder();
    var mealOpts = ''; ordered.forEach(function (m) { mealOpts += '<option value="' + m + '">' + esc(mealLabel(m)) + '</option>'; });
    var foodOpts = '<option value="">—</option>';
    Foods.listFoods({}).forEach(function (f) { foodOpts += '<option value="' + f.id + '">' + esc(f.name) + '</option>'; });
    var mask = openModal(
      '<h4>新建食谱</h4>' +
      '<label class="field"><span>名称</span><input type="text" id="rc-name" /></label>' +
      '<label class="field"><span>适用餐次</span><select id="rc-meal">' + mealOpts + '</select></label>' +
      '<label class="field"><span>标签(逗号)</span><input type="text" id="rc-tags" placeholder="cut,high-protein" /></label>' +
      '<div id="rc-items"><p class="card-sub">添加食材组成：</p></div>' +
      '<div class="actions"><select id="rc-food">' + foodOpts + '</select> <input type="number" id="rc-grams" value="100" style="width:80px;display:inline-block" /> g <button class="btn btn-sm" id="rc-add-item">+ 加料</button></div>' +
      '<div class="modal-actions"><button class="btn" id="rc-cancel">取消</button><button class="btn btn-primary" id="rc-ok">保存食谱</button></div>'
    );
    var itemBox = mask.querySelector('#rc-items');
    var itemData = [];
    mask.querySelector('#rc-add-item').onclick = function () {
      var fid = mask.querySelector('#rc-food').value;
      var grams = num(mask.querySelector('#rc-grams').value);
      if (!fid) { UI.toast('请选择食材', 'error'); return; }
      var f = Foods.find(fid); if (!f) return;
      var nut = scaleNutrition(f.per100g, grams / 100);
      itemData.push({ foodId: f.id, name: f.name, grams: grams, nutrition: nut });
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = f.name + ' ' + grams + 'g (' + Math.round(nut.kcal) + 'kcal)';
      itemBox.appendChild(chip);
    };
    mask.querySelector('#rc-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#rc-ok').onclick = function () {
      var name = mask.querySelector('#rc-name').value;
      if (!name.trim()) { UI.toast('请填写名称', 'error'); return; }
      Recipes.addRecipe({ name: name, meal: mask.querySelector('#rc-meal').value, tags: mask.querySelector('#rc-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean), items: itemData });
      closeModal(mask); rerender();
    };
  }

  function openApplyRecipeModal(rid) {
    var r = Recipes.find(rid); if (!r) return;
    var ordered = getMealsOrder();
    var mealOpts = ''; ordered.forEach(function (m) { mealOpts += '<option value="' + m + '"' + (m === r.meal ? ' selected' : '') + '>' + esc(mealLabel(m)) + '</option>'; });
    var mask = openModal(
      '<h4>加入食谱「' + esc(r.name) + '」</h4>' +
      '<p class="card-sub">' + r.totalNutrition.kcal + ' kcal · P' + r.totalNutrition.protein + ' C' + r.totalNutrition.carb + ' F' + r.totalNutrition.fat + '</p>' +
      '<label class="field"><span>目标餐次</span><select id="ap-meal">' + mealOpts + '</select></label>' +
      '<div class="modal-actions"><button class="btn" id="ap-cancel">取消</button><button class="btn btn-primary" id="ap-ok">加入</button></div>'
    );
    mask.querySelector('#ap-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#ap-ok').onclick = function () {
      Recipes.addRecipeToDay(state.date, mask.querySelector('#ap-meal').value, rid);
      closeModal(mask); rerender();
    };
  }

  function showRecommend(date) {
    var box = lastView && lastView.querySelector('#diet-reco-box');
    if (!box) return;
    var recos = Recipes.recommend(date, { topN: 6 });
    if (!recos.length) { box.innerHTML = '<p class="card-sub">暂无可推荐项（请先设定目标与食材库，且预算充足）</p>'; return; }
    var html = '<ul class="list">';
    recos.forEach(function (c) {
      html += '<li><span class="grow">' + (c.kind === 'recipe' ? '🍱 ' : '🥗 ') + esc(c.name) + ' <small class="card-sub">' + Math.round(c.kcal) + 'kcal · P' + Math.round(c.protein) + ' C' + Math.round(c.carb) + ' F' + Math.round(c.fat) + '</small></span></li>';
    });
    html += '</ul>';
    box.innerHTML = html;
  }

  function showCompose(date) {
    var box = lastView && lastView.querySelector('#diet-reco-box');
    if (!box) return;
    var entries = Recipes.composeMeal(date, null);
    if (!entries.length) { box.innerHTML = '<p class="card-sub">无法生成（请先设定目标、录入身体参数并添加食材库）</p>'; return; }
    var html = '<p class="card-sub">建议补充：</p><ul class="list">';
    entries.forEach(function (e) {
      html += '<li><span class="grow">' + esc(e.name) + ' <small class="card-sub">' + e.grams + 'g · ' + Math.round(e.nutrition.kcal) + 'kcal · P' + Math.round(e.nutrition.protein) + '</small></span></li>';
    });
    html += '</ul>';
    box.innerHTML = html;
  }

  function openRenameMealModal(key) {
    var mask = openModal(
      '<h4>重命名餐次</h4>' +
      '<label class="field"><span>名称</span><input type="text" id="rm-label" value="' + esc(mealLabel(key)) + '" /></label>' +
      '<div class="modal-actions"><button class="btn" id="rm-cancel">取消</button><button class="btn btn-primary" id="rm-ok">保存</button></div>'
    );
    mask.querySelector('#rm-cancel').onclick = function () { closeModal(mask); };
    mask.querySelector('#rm-ok').onclick = function () { Log.renameMeal(key, mask.querySelector('#rm-label').value); closeModal(mask); rerender(); };
  }

  function openRemoveMeal(key) {
    UI.confirm({ title: '删除餐次', message: '确定删除「' + mealLabel(key) + '」？该餐次所有记录将被移除。', danger: true }).then(function (ok) {
      if (ok) { Log.removeMeal(key); rerender(); }
    });
  }

  // 暴露子模块命名空间
  W.DietGoals = Goals;
  W.DietFoods = Foods;
  W.DietLog = Log;
  W.DietRecipes = Recipes;
  W.DietStats = Stats;
  W.DietLink = Link;
  W.Diet = Diet;
  if (W.Router) W.Router.register('diet', render, '饮食计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Diet;
})();
