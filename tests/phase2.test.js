/*
 * 阶段2 测试：今日计划（today.js）
 * 覆盖：增删改、勾选、筛选、切换日期、数据隔离、build 渲染。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Today = mods.today;

function reset() { storage.clear(); Store.load(); }

H.section('今日计划 CRUD');
H.test('addItem 按日期新增并保存', function () {
  reset();
  const it = Today.addItem('2026-08-17', '写周报');
  H.ok(it && it.id, '应返回带 id 的项');
  H.eq(it.date, '2026-08-17', '日期应正确');
  H.eq(it.done, false, '默认未完成');
  H.eq(Store.data.today.length, 1, '应写入 today');
  const re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.today.length, 1, '应持久化');
});
H.test('addItem 空白文本被忽略', function () {
  reset();
  H.eq(Today.addItem('2026-08-17', '   '), null, '空白应返回 null');
  H.eq(Store.data.today.length, 0, '不应写入');
});
H.test('toggle 切换完成状态', function () {
  reset();
  const it = Today.addItem('2026-08-17', 'a');
  const r = Today.toggle(it.id);
  H.eq(r.done, true, '应变为完成');
  const r2 = Today.toggle(it.id);
  H.eq(r2.done, false, '应回到未完成');
});
H.test('updateText 修改文字', function () {
  reset();
  const it = Today.addItem('2026-08-17', '旧');
  H.ok(Today.updateText(it.id, '新内容'), '应修改成功');
  H.eq(Today.find ? Today.find(it.id).text : Store.data.today[0].text, '新内容', '文字应更新');
  H.eq(Today.updateText(it.id, '  '), false, '空白不应修改');
});
H.test('remove 删除项', function () {
  reset();
  const it = Today.addItem('2026-08-17', 'a');
  Today.addItem('2026-08-17', 'b');
  H.ok(Today.remove(it.id), '应删除成功');
  H.eq(Store.data.today.length, 1, '应只剩 1 条');
});

H.section('筛选与日期');
H.test('filterItems 按状态过滤', function () {
  reset();
  const a = Today.addItem('2026-08-17', 'a');
  const b = Today.addItem('2026-08-17', 'b');
  Today.toggle(b.id); // b done
  const all = Today.listForDate('2026-08-17');
  H.eq(Today.filterItems(all, 'active').length, 1, '未完成应 1 条');
  H.eq(Today.filterItems(all, 'done').length, 1, '已完成应 1 条');
  H.eq(Today.filterItems(all, 'all').length, 2, '全部应 2 条');
});
H.test('不同日期数据互不干扰', function () {
  reset();
  Today.addItem('2026-08-17', '今天的事');
  Today.addItem('2026-08-10', '上周的事');
  H.eq(Today.listForDate('2026-08-17').length, 1, '17 号只有 1 条');
  H.eq(Today.listForDate('2026-08-10').length, 1, '10 号只有 1 条');
  H.eq(Today.listForDate('2026-08-17')[0].text, '今天的事', '内容应正确');
});
H.test('shiftDate 正确平移日期', function () {
  H.eq(Today.shiftDate('2026-08-17', 1), '2026-08-18', '后一天');
  H.eq(Today.shiftDate('2026-08-17', -1), '2026-08-16', '前一天');
  H.eq(Today.shiftDate('2026-03-01', -1), '2026-02-28', '跨月应为 2-28');
});

H.section('数据隔离');
H.test('今日计划改动不污染其他模块', function () {
  reset();
  Today.addItem('2026-08-17', '只属于今日计划');
  H.eq(Store.data.work.plans.length, 0, 'work 不应受影响');
  H.eq(Store.data.fitness.checkins.length, 0, 'fitness 不应受影响');
  H.eq(Store.data.diet.days && Object.keys(Store.data.diet.days).length, 0, 'diet 不应受影响');
  H.eq(Store.data.memo.length, 0, 'memo 不应受影响');
});

H.section('渲染');
H.test('build 含新增项文本与未完成态', function () {
  reset();
  Today.addItem('2026-08-17', '买菜');
  const html = Today.build({ date: '2026-08-17', mode: 'all' });
  H.includes(html, '买菜', '应显示文本');
  H.includes(html, 'id="today-add"', '应有添加按钮');
  H.includes(html, 'data-mode="active"', '应有筛选控件');
});
H.test('build 空状态有引导文案', function () {
  reset();
  const html = Today.build({ date: '2026-08-17', mode: 'all' });
  H.includes(html, 'empty-state', '应有空状态');
  H.includes(html, '这一天还没有计划', '应有引导文案');
});
H.test('build 已完成项带删除线样式', function () {
  reset();
  const it = Today.addItem('2026-08-17', 'done task');
  Today.toggle(it.id);
  const html = Today.build({ date: '2026-08-17', mode: 'all' });
  H.includes(html, 'done-text', '已完成应带样式');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  Today.addItem('2026-08-17', 'x');
  let threw = false;
  try { Today.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
