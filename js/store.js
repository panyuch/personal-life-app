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

  function defaultData() {
    return {
      version: 1,
      settings: { nickname: '', themeColor: '#3b82f6', darkMode: false },
      today: [], // { id, date:'YYYY-MM-DD', text, done, createdAt }
      // 工作计划：卡片式。每张计划卡 = { id, name, items:[{id,text,done}] }
      work: { plans: [] },
      fitness: { templates: [], checkins: [], body: [], schedule: {} },
      diet: { targetKcal: null, foods: [], days: {} },
      memo: [], // { id, text, done, createdAt }
    };
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
    if (d.diet && typeof d.diet === 'object') {
      out.diet.targetKcal = d.diet.targetKcal != null ? d.diet.targetKcal : null;
      out.diet.foods = Array.isArray(d.diet.foods) ? d.diet.foods : [];
      out.diet.days = d.diet.days && typeof d.diet.days === 'object' ? d.diet.days : {};
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
