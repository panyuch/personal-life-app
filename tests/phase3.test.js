/*
 * 阶段3 测试：工作计划（卡片式新模型）
 * 覆盖问题1-4：卡片形式/标题=名称、卡片布局、添加工作内容、勾选完成与删除、摘要与隔离。
 * 随问题推进逐步累加 section。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Work = mods.work;

function reset() { storage.clear(); Store.load(); }

// ============ 问题1：卡片形式 + 标题=名称 ============
H.section('工作计划·问题1 卡片形式与标题=名称');
H.test('addPlan 创建计划卡，标题即名称', function () {
  reset();
  const p = Work.addPlan(' 项目A ');
  H.eq(p.name, '项目A', '应去掉首尾空格');
  H.eq(Store.data.work.plans.length, 1, '应有一张计划卡');
  H.eq(Store.data.work.plans[0].items.length, 0, '初始无工作内容');
});
H.test('build 每个计划渲染为一张卡片，标题等于计划名称', function () {
  reset();
  Work.addPlan('项目A');
  const html = Work.build();
  H.includes(html, 'work-card', '应渲染卡片容器');
  const m = html.match(/<h2 class="work-card-title">([\s\S]*?)<\/h2>/);
  H.ok(m, '应存在标题元素 work-card-title');
  H.eq(m[1], '项目A', '标题文本应等于计划名称');
});
H.test('多计划渲染为多张卡片', function () {
  reset();
  Work.addPlan('计划一');
  Work.addPlan('计划二');
  const html = Work.build();
  const cards = (html.match(/class="work-card"/g) || []).length;
  H.eq(cards, 2, '应渲染两张计划卡');
});
H.test('renamePlan 后标题随之更新', function () {
  reset();
  const p = Work.addPlan('旧名');
  Work.renamePlan(p.id, '新名');
  H.includes(Work.build(), '新名', 'build 应显示新名称');
  H.notIncludes(Work.build(), '>旧名<', '不应再显示旧名');
});
H.test('空状态引导', function () {
  reset();
  H.includes(Work.build(), '还没有工作计划', '无计划时应显示引导文案');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  Work.addPlan('计划一');
  let threw = false;
  try { Work.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});
H.test('数据隔离：工作计划改动不污染今日计划', function () {
  reset();
  Work.addPlan('X');
  H.eq(Store.data.today.length, 0, 'today 不应受影响');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
