/*
 * work.js — 工作计划（卡片式）
 * 新模型：每张计划 = 一张卡片 { id, name, items:[{id,text,done}] }。
 * 文档标题就是工作计划的名称；卡片内挂“工作内容”清单。
 * 问题1：卡片形式 + 标题=名称
 * 问题2：卡片布局（大标题左 / 添加工作内容按钮右 / 内容小字）
 * 问题3：添加工作内容（聚焦输入框 + 回车添加）
 * 问题4：工作内容勾选完成（横线变灰）+ 删除按钮
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  // ——— 计划（卡片）———
  function addPlan(name) {
    name = (name == null ? '' : String(name)).trim();
    if (!name) return null;
    var p = { id: Store.uid(), name: name, items: [] };
    Store.data.work.plans.push(p);
    Store.save();
    return p;
  }
  function renamePlan(id, name) {
    var p = findPlan(id);
    if (!p) return false;
    name = (name == null ? '' : String(name)).trim();
    if (!name) return false;
    p.name = name;
    Store.save();
    return true;
  }
  function removePlan(id) {
    var plans = Store.data.work.plans;
    for (var i = 0; i < plans.length; i++) {
      if (plans[i].id === id) { plans.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }
  function findPlan(id) {
    var plans = Store.data.work.plans;
    for (var i = 0; i < plans.length; i++) if (plans[i].id === id) return plans[i];
    return null;
  }

  // ——— 工作内容（卡片内清单项）———
  // addContent / toggleContent / removeContent 在问题3、问题4 中实现。

  // ——— 摘要（供首页读取；新模型无截止日/状态）———
  function summary() {
    var plans = Store.data.work.plans;
    var plansN = plans.length, itemsN = 0, doneN = 0;
    plans.forEach(function (p) {
      (p.items || []).forEach(function (it) { itemsN++; if (it.done) doneN++; });
    });
    return { plans: plansN, items: itemsN, done: doneN };
  }

  // ——— 渲染（问题1：每张计划是一张卡片，标题=计划名称）———
  function build() {
    var html = '<div class="work-plans">';
    html += '<div class="actions"><button class="btn btn-primary" id="work-add-plan">+ 新建工作计划</button></div>';
    var plans = Store.data.work.plans;
    if (plans.length === 0) {
      html += UI.empty('还没有工作计划，点「+ 新建工作计划」创建', null, null);
    } else {
      plans.forEach(function (p) {
        html += '<div class="work-card" data-pid="' + p.id + '">';
        html += '<div class="work-card-head">';
        html += '<h2 class="work-card-title">' + UI.escapeHtml(p.name) + '</h2>';
        html += '</div>'; // work-card-head
        html += '</div>'; // work-card
      });
    }
    html += '</div>';
    return html;
  }

  function render(viewEl, topbar) {
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '工作计划';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build();
    bind(viewEl);
  }

  function bind(viewEl) {
    var addPlanBtn = viewEl.querySelector('#work-add-plan');
    if (addPlanBtn) addPlanBtn.addEventListener('click', function () {
      var name = W.prompt ? W.prompt('工作计划名称') : null;
      if (name && name.trim()) { addPlan(name); W.Router && W.Router.reload(); }
    });
  }

  var Work = {
    addPlan: addPlan, renamePlan: renamePlan, removePlan: removePlan, findPlan: findPlan,
    summary: summary,
    build: build, render: render,
  };

  W.Work = Work;
  if (W.Router) W.Router.register('work', render, '工作计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Work;
})();
