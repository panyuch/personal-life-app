/*
 * 阶段4 测试：健身计划（fitness.js）
 * 覆盖：训练模板 CRUD、打卡（模板预填/勾完成）、身体数据、体重趋势、摘要、数据隔离。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Fitness = mods.fitness;

function reset() { storage.clear(); Store.load(); }
const REF = '2026-08-17';

H.section('训练模板');
H.test('addTemplate + addExercise + removeExercise', function () {
  reset();
  const t = Fitness.addTemplate('推日');
  H.ok(t && t.id, '应返回模板');
  Fitness.addExercise(t.id, { name: '卧推', sets: 3, reps: 10, weight: 40 });
  Fitness.addExercise(t.id, { name: '肩推', sets: 3, reps: 12, weight: 20 });
  H.eq(Fitness.findTemplate(t.id).exercises.length, 2, '应有 2 个动作');
  Fitness.removeExercise(t.id, 0);
  H.eq(Fitness.findTemplate(t.id).exercises.length, 1, '删除后应剩 1 个动作');
});
H.test('removeTemplate 删除模板', function () {
  reset();
  const t = Fitness.addTemplate('A');
  Fitness.addExercise(t.id, { name: 'x' });
  H.ok(Fitness.removeTemplate(t.id), '应删除成功');
  H.eq(Store.data.fitness.templates.length, 0, '模板应清空');
});

H.section('训练打卡');
H.test('从模板打卡会预填动作', function () {
  reset();
  const t = Fitness.addTemplate('腿日');
  Fitness.addExercise(t.id, { name: '深蹲', sets: 3, reps: 10, weight: 50 });
  const c = Fitness.addCheckin({ templateId: t.id, date: REF });
  H.eq(c.items.length, 1, '应预填 1 个动作');
  H.eq(c.items[0].name, '深蹲', '动作名应为深蹲');
  H.eq(c.items[0].done, false, '默认未完成');
});
H.test('空白模板打卡不预填', function () {
  reset();
  const c = Fitness.addCheckin({ date: REF });
  H.eq(c.items.length, 0, '无模板应无动作');
  H.eq(c.templateId, null, 'templateId 应为 null');
});
H.test('toggleCheckinItem 切换完成', function () {
  reset();
  const t = Fitness.addTemplate('A');
  Fitness.addExercise(t.id, { name: 'x' });
  const c = Fitness.addCheckin({ templateId: t.id, date: REF });
  Fitness.toggleCheckinItem(c.id, 0);
  H.eq(Fitness.findCheckin(c.id).items[0].done, true, '应标记为完成');
});

H.section('身体数据');
H.test('addBody 录入体重', function () {
  reset();
  const b = Fitness.addBody({ date: '2026-08-16', weight: 70, bodyFat: 18 });
  H.eq(b.weight, 70, '体重正确');
  H.eq(b.bodyFat, 18, '体脂正确');
  H.eq(Store.data.fitness.body.length, 1, '应写入');
});
H.test('addBody 无效体重被拒绝', function () {
  reset();
  H.eq(Fitness.addBody({ weight: 'abc' }), null, '非数字应返回 null');
  H.eq(Store.data.fitness.body.length, 0, '不应写入');
});
H.test('removeBody 删除', function () {
  reset();
  const b = Fitness.addBody({ weight: 70 });
  H.ok(Fitness.removeBody(b.id), '应删除成功');
  H.eq(Store.data.fitness.body.length, 0, '应清空');
});

H.section('趋势与摘要');
H.test('trendData 按日期升序', function () {
  reset();
  Fitness.addBody({ date: '2026-08-18', weight: 69 });
  Fitness.addBody({ date: '2026-08-16', weight: 71 });
  Fitness.addBody({ date: '2026-08-17', weight: 70 });
  const td = Fitness.trendData();
  H.eq(td[0].date, '2026-08-16', '第一条应最早');
  H.eq(td[2].date, '2026-08-18', '最后一条应最晚');
  H.eq(td[1].weight, 70, '中间权重 70');
});
H.test('summary 今日训练 + 最近体重', function () {
  reset();
  const t = Fitness.addTemplate('晨练');
  Fitness.addCheckin({ templateId: t.id, date: REF });
  Fitness.addBody({ date: '2026-08-16', weight: 71 });
  Fitness.addBody({ date: '2026-08-20', weight: 69 });
  const s = Fitness.summary(REF);
  H.eq(s.trainedToday, '晨练', '今日训练应为模板名');
  H.eq(s.latestWeight.weight, 69, '最近体重 69');
  H.eq(s.latestWeight.date, '2026-08-20', '最近体重日期');
});
H.test('summary 无训练日 trainedToday 为 null', function () {
  reset();
  const s = Fitness.summary(REF);
  H.eq(s.trainedToday, null, '无打卡应为 null');
});

H.section('数据隔离与渲染');
H.test('健身改动不污染今日/工作计划', function () {
  reset();
  const t = Fitness.addTemplate('A');
  Fitness.addCheckin({ templateId: t.id, date: REF });
  Fitness.addBody({ weight: 70 });
  H.eq(Store.data.today.length, 0, 'today 不应受影响');
  H.eq(Store.data.work.plans.length, 0, 'work 不应受影响');
});
H.test('build 含模板名与体重趋势 SVG', function () {
  reset();
  Fitness.addTemplate('腿日');
  Fitness.addBody({ date: '2026-08-16', weight: 70 });
  const html = Fitness.build();
  H.includes(html, '腿日', '应显示模板名');
  H.includes(html, '<svg', '应包含趋势 SVG');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  let threw = false;
  try { Fitness.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
