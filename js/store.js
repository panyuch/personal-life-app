/*
 * store.js — 数据层（全局 Store）
 * 统一 key：lifeApp:data:v1，整体对象存于 localStorage。
 * 暴露：load / save / export / import / clear / uid / data。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var STORAGE_KEY = 'lifeApp:data:v1';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ——— 饮食模块默认结构（v2）———
  // 仅含字段默认值；迁移逻辑见 migrateDiet()。
  function defaultDiet() {
    return {
      version: 2,
      // 目标计算身体参数（体重可选取自健身）
      profile: { sex: null, age: null, heightCm: null, weightKg: null, useFitnessWeight: true },
      // 饮食目标设定
      goals: {
        type: null, // 'cut' | 'maintain' | 'bulk'
        method: 'auto', // 'auto' | 'manual'
        activity: 'moderate', // 'sedentary'|'light'|'moderate'|'high'
        targetKcal: null,
        macroTarget: { protein: null, carb: null, fat: null },
        macroRatio: { protein: 30, carb: 40, fat: 30 },
        applyFrom: null, // 'YYYY-MM-DD'
      },
      restrictions: [], // { id, kind, name, note }
      foods: [], // 食材库（食材级，每100g 营养）
      recipes: [], // 食谱库
      mealsOrder: ['breakfast', 'lunch', 'dinner', 'snack'],
      mealLabels: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' },
      mealTemplates: [], // { id, name, meal, items }
      days: {}, // 'YYYY-MM-DD' -> day
    };
  }

  function defaultData() {
    return {
      version: 1,
      settings: { nickname: '', themeColor: '#3b82f6', darkMode: false },
      today: [], // { id, date:'YYYY-MM-DD', text, done, createdAt }
      // 工作计划：卡片式。每张计划卡 = { id, name, items:[{id,text,done}] }
      work: { plans: [] },
      fitness: { templates: [], checkins: [], body: [], schedule: {} },
      diet: defaultDiet(),
      memo: [], // { id, text, done, createdAt }
    };
  }

  // ——— 数值/字符串安全转换 ———
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function str(v, d) { v = (v == null ? '' : String(v)).trim(); return v || (d != null ? d : ''); }

  // ——— 饮食模块 v1→v2 迁移（同时兼容已是 v2 的数据）———
  // 老字段：targetKcal / foods[{id,name,kcal,protein,carb,fat}] / days[date].meals[meal][{id,name,kcal,protein,carb,fat}]
  // 新字段：见 defaultDiet()。老 entries 补 grams=100、nutrition 取原值；老 foods 补 per100g/category/tags/aliases。
  function migrateDiet(src) {
    var diet = defaultDiet();
    if (!src || typeof src !== 'object') return diet;
    var isV2 = src.version === 2;

    // profile
    if (src.profile && typeof src.profile === 'object') {
      var p = src.profile;
      diet.profile = {
        sex: (p.sex === 'male' || p.sex === 'female') ? p.sex : null,
        age: p.age != null ? num(p.age) : null,
        heightCm: p.heightCm != null ? num(p.heightCm) : null,
        weightKg: p.weightKg != null ? num(p.weightKg) : null,
        useFitnessWeight: p.useFitnessWeight == null ? true : !!p.useFitnessWeight,
      };
    }

    // goals（v2 结构化；v1 仅 targetKcal）
    if (src.goals && typeof src.goals === 'object') {
      var g = src.goals;
      var types = ['cut', 'maintain', 'bulk'];
      var acts = ['sedentary', 'light', 'moderate', 'high'];
      diet.goals = {
        type: types.indexOf(g.type) >= 0 ? g.type : null,
        method: g.method === 'manual' ? 'manual' : 'auto',
        activity: acts.indexOf(g.activity) >= 0 ? g.activity : 'moderate',
        targetKcal: g.targetKcal != null ? num(g.targetKcal) : null,
        macroTarget: {
          protein: (g.macroTarget && g.macroTarget.protein != null) ? num(g.macroTarget.protein) : null,
          carb: (g.macroTarget && g.macroTarget.carb != null) ? num(g.macroTarget.carb) : null,
          fat: (g.macroTarget && g.macroTarget.fat != null) ? num(g.macroTarget.fat) : null,
        },
        macroRatio: {
          protein: (g.macroRatio && g.macroRatio.protein != null) ? num(g.macroRatio.protein) : 30,
          carb: (g.macroRatio && g.macroRatio.carb != null) ? num(g.macroRatio.carb) : 40,
          fat: (g.macroRatio && g.macroRatio.fat != null) ? num(g.macroRatio.fat) : 30,
        },
        applyFrom: g.applyFrom != null ? String(g.applyFrom) : null,
      };
    } else if (src.targetKcal != null) {
      // v1：标量目标 → 手填模式
      diet.goals.targetKcal = num(src.targetKcal);
      diet.goals.method = 'manual';
    }

    // restrictions
    if (Array.isArray(src.restrictions)) {
      diet.restrictions = src.restrictions.map(function (r) {
        var kinds = ['allergy', 'intolerance', 'dislike', 'medical'];
        return {
          id: r.id || uid(),
          kind: kinds.indexOf(r.kind) >= 0 ? r.kind : 'dislike',
          name: str(r.name, '未命名'),
          note: r.note || '',
        };
      });
    }

    // foods（食材库）
    if (Array.isArray(src.foods)) {
      diet.foods = src.foods.map(function (f) {
        if (f.per100g && typeof f.per100g === 'object') {
          return {
            id: f.id || uid(),
            name: str(f.name, '未命名'),
            category: str(f.category, '其他'),
            per100g: {
              kcal: num(f.per100g.kcal), protein: num(f.per100g.protein),
              carb: num(f.per100g.carb), fat: num(f.per100g.fat),
              fiber: num(f.per100g.fiber), sodium: num(f.per100g.sodium),
            },
            tags: Array.isArray(f.tags) ? f.tags.slice() : [],
            aliases: Array.isArray(f.aliases) ? f.aliases.slice() : [],
          };
        }
        // v1 食物：原 kcal/protein/carb/fat 视作“整份”，默认 per100g 取原值、grams 记为 100
        return {
          id: f.id || uid(),
          name: str(f.name, '未命名'),
          category: '其他',
          per100g: { kcal: num(f.kcal), protein: num(f.protein), carb: num(f.carb), fat: num(f.fat), fiber: 0, sodium: 0 },
          tags: [],
          aliases: [],
        };
      });
    }

    // recipes / mealTemplates / mealsOrder / mealLabels
    if (Array.isArray(src.recipes)) diet.recipes = src.recipes.map(function (r) { return r; });
    if (Array.isArray(src.mealTemplates)) diet.mealTemplates = src.mealTemplates.map(function (t) { return t; });
    if (Array.isArray(src.mealsOrder) && src.mealsOrder.length) diet.mealsOrder = src.mealsOrder.slice();
    if (src.mealLabels && typeof src.mealLabels === 'object') {
      Object.keys(src.mealLabels).forEach(function (k) { diet.mealLabels[k] = str(src.mealLabels[k], k); });
    }

    // days
    var daysSrc = (src.days && typeof src.days === 'object') ? src.days : {};
    Object.keys(daysSrc).forEach(function (date) {
      var sd = daysSrc[date] || {};
      var day = {
        goalSnapshot: sd.goalSnapshot || null,
        trainingBonusKcal: sd.trainingBonusKcal != null ? num(sd.trainingBonusKcal) : 0,
        waterMl: sd.waterMl != null ? num(sd.waterMl) : 0,
        note: sd.note != null ? String(sd.note) : '',
        meals: {},
      };
      var mealsSrc = (sd.meals && typeof sd.meals === 'object') ? sd.meals : {};
      diet.mealsOrder.forEach(function (m) {
        var arr = Array.isArray(mealsSrc[m]) ? mealsSrc[m] : [];
        day.meals[m] = arr.map(function (it) {
          var n = (it.nutrition && typeof it.nutrition === 'object') ? it.nutrition : null;
          return {
            id: it.id || uid(),
            foodId: it.foodId != null ? it.foodId : null,
            name: str(it.name, '未命名'),
            grams: it.grams != null ? num(it.grams) : 100,
            nutrition: {
              kcal: num(it.kcal != null ? it.kcal : (n ? n.kcal : 0)),
              protein: num(it.protein != null ? it.protein : (n ? n.protein : 0)),
              carb: num(it.carb != null ? it.carb : (n ? n.carb : 0)),
              fat: num(it.fat != null ? it.fat : (n ? n.fat : 0)),
            },
          };
        });
      });
      diet.mealsOrder.forEach(function (m) { if (!day.meals[m]) day.meals[m] = []; });
      diet.days[date] = day;
    });

    diet.version = 2;
    return diet;
  }

  // 浅合并默认结构，旧数据缺字段时避免整页崩
  function normalize(d) {
    var def = defaultData();
    if (!d || typeof d !== 'object') return def;
    var out = def;
    if (d.settings && typeof d.settings === 'object') {
      out.settings = {
        nickname: d.settings.nickname != null ? String(d.settings.nickname) : '',
        themeColor: d.settings.themeColor || '#3b82f6',
        darkMode: !!d.settings.darkMode,
      };
    }
    out.today = Array.isArray(d.today) ? d.today : [];
    if (d.work && typeof d.work === 'object') {
      // 旧模型兼容迁移：projects/tasks -> plans/items
      var plans = [];
      if (Array.isArray(d.work.projects)) {
        var byProj = {};
        if (Array.isArray(d.work.tasks)) {
          d.work.tasks.forEach(function (t) {
            (byProj[t.projectId] = byProj[t.projectId] || []).push(t);
          });
        }
        d.work.projects.forEach(function (p) {
          var items = (byProj[p.id] || []).map(function (t) {
            return { id: uid(), text: (t.title != null ? String(t.title) : ''), done: t.status === '已完成' };
          });
          plans.push({ id: p.id || uid(), name: (p.name != null ? String(p.name) : '未命名'), items: items });
        });
      } else if (Array.isArray(d.work.plans)) {
        plans = d.work.plans.map(function (p) {
          return {
            id: p.id || uid(),
            name: (p.name != null ? String(p.name) : '未命名'),
            items: Array.isArray(p.items) ? p.items.map(function (it) {
              return { id: it.id || uid(), text: (it.text != null ? String(it.text) : ''), done: !!it.done };
            }) : [],
          };
        });
      }
      out.work.plans = plans;
    }
    if (d.fitness && typeof d.fitness === 'object') {
      out.fitness.templates = Array.isArray(d.fitness.templates) ? d.fitness.templates : [];
      out.fitness.checkins = Array.isArray(d.fitness.checkins) ? d.fitness.checkins : [];
      out.fitness.body = Array.isArray(d.fitness.body) ? d.fitness.body : [];
      out.fitness.schedule = (d.fitness.schedule && typeof d.fitness.schedule === 'object') ? d.fitness.schedule : {};
    }
    if (d.diet) {
      out.diet = migrateDiet(d.diet);
    }
    out.memo = Array.isArray(d.memo) ? d.memo : [];
    out.version = 1;
    return out;
  }

  var data = null;

  function load() {
    var ls = W.localStorage;
    var raw = null;
    try { raw = ls.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) {
      data = defaultData();
      save();
      return data;
    }
    try {
      var parsed = JSON.parse(raw);
      data = normalize(parsed);
    } catch (e) {
      data = defaultData();
      // 数据损坏：回退默认并提示
      if (W.UI && W.UI.toast) W.UI.toast('本地数据已损坏，已重置为默认', 'error');
    }
    return data;
  }

  function save() {
    var ls = W.localStorage;
    try { ls.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 容量溢出等忽略 */ }
  }

  function exportData() {
    return JSON.stringify(data, null, 2);
  }

  // 校验：必须含 version + settings/work/fitness/diet，否则抛错
  function importData(jsonStr) {
    if (typeof jsonStr !== 'string' || !jsonStr.trim()) throw new Error('导入内容为空');
    var parsed;
    try { parsed = JSON.parse(jsonStr); } catch (e) { throw new Error('不是合法的 JSON'); }
    if (!parsed || typeof parsed !== 'object') throw new Error('格式错误');
    var required = ['version', 'settings', 'work', 'fitness', 'diet'];
    for (var i = 0; i < required.length; i++) {
      if (!(required[i] in parsed)) throw new Error('缺少必要字段：' + required[i]);
    }
    data = normalize(parsed);
    save();
    return true;
  }

  function clear() {
    data = defaultData();
    save();
    return true;
  }

  var Store = {
    STORAGE_KEY: STORAGE_KEY,
    load: load,
    save: save,
    export: exportData,
    import: importData,
    clear: clear,
    uid: uid,
  };
  Object.defineProperty(Store, 'data', {
    get: function () { return data; },
    set: function (v) { data = v; },
  });

  W.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})();
