/*
 * work.js — 工作计划（卡片式，PRD §5.2 简化模型）
 *
 * 数据模型（store.js 已支持）：
 *   每张工作计划 = 一张卡片 { id, name, items:[{ id, text, done }] }
 *   name 即文档标题（工作计划名称）；items 为卡片内的「工作内容」清单。
 *
 * 需求实现：
 *   1. 卡片形式呈现，每张卡片对应一个工作计划，标题即计划名称。
 *   2. 卡片左上角大标题（计划名称），右上角「添加工作内容」按钮；
 *      卡片下方区域展示已添加的工作内容，字号小于标题。
 *   3. 点击「添加工作内容」→ 光标自动定位到卡片下半部分的输入框；
 *      用户输入并回车 → 该工作内容添加并显示在卡片下方。
 *   4. 每条工作内容前有可勾选小框（勾选=已完成，文字划线变灰）；
 *      内容右侧配删除按钮，用于移除该条工作内容。
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
  function addContent(planId, text) {
    text = (text == null ? '' : String(text)).trim();
    if (!text) return null;
    var p = findPlan(planId);
    if (!p) return null;
    if (!Array.isArray(p.items)) p.items = [];
    var it = { id: Store.uid(), text: text, done: false };
    p.items.push(it);
    Store.save();
    return it;
  }
  function toggleContent(planId, itemId) {
    var p = findPlan(planId);
    if (!p) return false;
    var changed = false;
    (p.items || []).forEach(function (it) {
      if (it.id === itemId) { it.done = !it.done; changed = true; }
    });
    if (changed) Store.save();
    return changed;
  }
  function removeContent(planId, itemId) {
    var p = findPlan(planId);
    if (!p || !Array.isArray(p.items)) return false;
    for (var i = 0; i < p.items.length; i++) {
      if (p.items[i].id === itemId) { p.items.splice(i, 1); Store.save(); return true; }
    }
    return false;
  }

  // ——— 摘要（供首页读取）———
  function summary() {
    var plans = Store.data.work.plans;
    var plansN = plans.length, itemsN = 0, doneN = 0;
    plans.forEach(function (p) {
      (p.items || []).forEach(function (it) { itemsN++; if (it.done) doneN++; });
    });
    return { plans: plansN, items: itemsN, done: doneN };
  }

  // ——— 片段渲染 ———
  function itemHtml(it) {
    return '<li class="work-item" data-iid="' + it.id + '">' +
      '<input type="checkbox" class="work-item-check"' + (it.done ? ' checked' : '') + ' />' +
      '<span class="item-text' + (it.done ? ' done' : '') + '">' + UI.escapeHtml(it.text) + '</span>' +
      '<button class="btn btn-sm btn-danger work-item-del" title="删除工作内容">删除</button>' +
      '</li>';
  }
  function emptyHintHtml() {
    return '<li class="work-empty-hint">还没有工作内容，点上方「添加工作内容」开始</li>';
  }
  function cardBodyHtml(p) {
    var items = (p.items || []);
    var html = '<div class="work-card-body">';
    // 卡片下半部分的输入框
    html += '<div class="work-content-input-row">';
    html += '<input type="text" class="work-content-input" data-pid="' + p.id + '" placeholder="输入工作内容，回车添加" />';
    html += '<button class="btn btn-sm work-content-add-btn" data-pid="' + p.id + '">添加</button>';
    html += '</div>';
    // 已添加的工作内容清单（字号小于标题）
    html += '<ul class="work-items" data-pid="' + p.id + '">';
    if (items.length === 0) {
      html += emptyHintHtml();
    } else {
      items.forEach(function (it) { html += itemHtml(it); });
    }
    html += '</ul>';
    html += '</div>';
    return html;
  }

  // ——— 整页渲染（build 保持纯字符串，供测试与 render 复用）———
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
        // 左上角：大标题（= 计划名称）
        html += '<div class="work-card-head-left">';
        html += '<h2 class="work-card-title">' + UI.escapeHtml(p.name) + '</h2>';
        html += '<button class="icon-btn work-plan-del" data-pid="' + p.id + '" title="删除计划">✕</button>';
        html += '</div>';
        // 右上角：「添加工作内容」按钮
        html += '<div class="work-card-head-right">';
        html += '<button class="btn btn-sm btn-primary work-add-content" data-pid="' + p.id + '">+ 添加工作内容</button>';
        html += '</div>';
        html += '</div>'; // work-card-head
        html += cardBodyHtml(p);
        html += '</div>'; // work-card
      });
    }
    html += '</div>';
    return html;
  }

  function render(viewEl, topbar) {
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '工作计划';
      var p = topbar.querySelector('#page-date'); if (p) p.textContent = '';
      var b = topbar.querySelector('#primary-btn'); if (b) { b.textContent = ''; b.style.display = 'none'; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build();
    bind(viewEl);
  }

  // ——— 事件绑定（事件委托，支持多卡片、就地更新以保留输入焦点）———
  function bind(viewEl) {
    // 新建计划
    var addPlanBtn = viewEl.querySelector('#work-add-plan');
    if (addPlanBtn) addPlanBtn.addEventListener('click', function () {
      var name = W.prompt ? W.prompt('工作计划名称') : null;
      if (name && name.trim()) { addPlan(name); W.Router && W.Router.reload(); }
    });

    var wrap = viewEl.querySelector('.work-plans');
    if (!wrap) return;

    function cardOf(pid) { return wrap.querySelector('.work-card[data-pid="' + pid + '"]'); }

    // 点击委托
    wrap.addEventListener('click', function (e) {
      var addBtn = e.target.closest ? e.target.closest('.work-add-content') : null;
      if (addBtn) { focusInput(addBtn.getAttribute('data-pid')); return; }

      var addItemBtn = e.target.closest ? e.target.closest('.work-content-add-btn') : null;
      if (addItemBtn) { addFromInput(addItemBtn.getAttribute('data-pid')); return; }

      var check = e.target.closest ? e.target.closest('.work-item-check') : null;
      if (check) { toggleItem(check); return; }

      var del = e.target.closest ? e.target.closest('.work-item-del') : null;
      if (del) { deleteItem(del); return; }

      var planDel = e.target.closest ? e.target.closest('.work-plan-del') : null;
      if (planDel) { deletePlan(planDel.getAttribute('data-pid')); return; }
    });

    // 回车添加（委托在输入框上）
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('work-content-input')) {
        addFromInput(e.target.getAttribute('data-pid'));
      }
    });

    // 双击标题重命名
    wrap.addEventListener('dblclick', function (e) {
      var titleEl = e.target.closest ? e.target.closest('.work-card-title') : null;
      if (titleEl) renameFlow(titleEl);
    });

    // 点击「添加工作内容」→ 聚焦卡片下方输入框
    function focusInput(pid) {
      var card = cardOf(pid);
      if (!card) return;
      var input = card.querySelector('.work-content-input');
      if (input) input.focus();
    }

    // 从输入框添加一条工作内容（就地追加 <li>，保留焦点，交互流畅）
    function addFromInput(pid) {
      var card = cardOf(pid);
      if (!card) return;
      var input = card.querySelector('.work-content-input');
      if (!input) return;
      var text = input.value.trim();
      if (!text) { UI.toast('请输入工作内容', 'error'); return; }
      var it = addContent(pid, text);
      if (!it) return;
      input.value = '';
      var ul = card.querySelector('.work-items');
      var hint = ul.querySelector('.work-empty-hint');
      if (hint) ul.removeChild(hint);
      ul.insertAdjacentHTML('beforeend', itemHtml(it));
      input.focus();
    }

    // 勾选完成 / 取消完成（就地更新样式）
    function toggleItem(check) {
      var li = check.closest ? check.closest('.work-item') : null;
      var card = check.closest ? check.closest('.work-card') : null;
      if (!li || !card) return;
      var pid = card.getAttribute('data-pid');
      var iid = li.getAttribute('data-iid');
      if (!toggleContent(pid, iid)) return;
      var span = li.querySelector('.item-text');
      if (check.checked) { if (span) span.classList.add('done'); }
      else { if (span) span.classList.remove('done'); }
    }

    // 删除一条工作内容（轻量，无需二次确认以保证流畅）
    function deleteItem(del) {
      var li = del.closest ? del.closest('.work-item') : null;
      var card = del.closest ? del.closest('.work-card') : null;
      if (!li || !card) return;
      var pid = card.getAttribute('data-pid');
      var iid = li.getAttribute('data-iid');
      if (removeContent(pid, iid)) {
        li.parentNode.removeChild(li);
        var ul = card.querySelector('.work-items');
        if (ul && ul.children.length === 0) ul.innerHTML = emptyHintHtml();
      }
    }

    // 删除整张计划卡（破坏性，二次确认）
    function deletePlan(pid) {
      UI.confirm({
        title: '删除计划',
        message: '确定删除这张工作计划卡吗？卡内的工作内容会一并删除。',
      }).then(function (ok) {
        if (!ok) return;
        if (removePlan(pid)) {
          var card = cardOf(pid);
          if (card) card.parentNode.removeChild(card);
          // 全部删除后展示空状态
          if (Store.data.work.plans.length === 0) { W.Router && W.Router.reload(); }
        }
      });
    }

    // 双击标题重命名（就地更新）
    function renameFlow(titleEl) {
      var card = titleEl.closest ? titleEl.closest('.work-card') : null;
      if (!card) return;
      var pid = card.getAttribute('data-pid');
      var p = findPlan(pid);
      if (!p) return;
      var nv = W.prompt ? W.prompt('重命名工作计划', p.name) : null;
      if (nv == null) return;
      nv = nv.trim();
      if (!nv) { UI.toast('名称不能为空', 'error'); return; }
      if (renamePlan(pid, nv)) { titleEl.textContent = nv; }
    }
  }

  var Work = {
    addPlan: addPlan, renamePlan: renamePlan, removePlan: removePlan, findPlan: findPlan,
    addContent: addContent, toggleContent: toggleContent, removeContent: removeContent,
    summary: summary,
    build: build, render: render,
  };

  W.Work = Work;
  if (W.Router) W.Router.register('work', render, '工作计划');
  if (typeof module !== 'undefined' && module.exports) module.exports = Work;
})();
