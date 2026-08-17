/*
 * 阶段4 测试：健身计划（fitness.js，月历日程重构版）
 * 覆盖：训练日程安排（setPart / getDay / removeDay）、训练动作完成（toggleExercise / dayComplete / doneCount）、
 *      身体数据（addBody / removeBody / trendData）、摘要（summary）、数据隔离与渲染冒烟。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Fitness = mods.fitness;

function reset() { storage.clear(); Store.load(); }
const REF = '2026-08-17';

H.section('训练日程安排');
H.test('setPart 安排部位并预置 5 个默认动作', function () {
  reset();
  Fitness.setPart(REF, '背');
  const d = Fitness.getDay(REF);
  H.ok(d && d.part === '背', '应记录部位 背');
  H.eq(d.exercises.length, 5, '应预置 5 个动作');
  H.eq(d.exercises[0].done, false, '默认未完成');
});
H.test('setPart 换部位会重置动作', function () {
  reset();
  Fitness.setPart(REF, '背');
  Fitness.toggleExercise(REF, 0);
  H.eq(Fitness.getDay(REF).exercises[0].done, true, '背日第1个已完成');
  Fitness.setPart(REF, '腿');
  const d = Fitness.getDay(REF);
  H.eq(d.part, '腿', '部位应变为 腿');
  H.eq(d.exercises.length, 5, '动作数仍为 5');
  H.eq(d.exercises[0].done, false, '换部位后动作应重置为未完成');
});
H.test('removeDay 删除当天安排', function () {
  reset();
  Fitness.setPart(REF, '胸');
  H.ok(Fitness.removeDay(REF), '应删除成功');
  H.eq(Fitness.getDay(REF), null, '当天应无安排');
  H.eq(Fitness.removeDay(REF), false, '重复删除返回 false');
});

H.section('训练动作完成');
H.test('toggleExercise 切换完成态', function () {
  reset();
  Fitness.setPart(REF, '肩');
  H.ok(Fitness.toggleExercise(REF, 1), '应切换成功');
  H.eq(Fitness.getDay(REF).exercises[1].done, true, '第2个应标记完成');
  Fitness.toggleExercise(REF, 1);
  H.eq(Fitness.getDay(REF).exercises[1].done, false, '再次切换回未完成');
});
H.test('dayComplete 当 5 个动作全完成时为真', function () {
  reset();
  Fitness.setPart(REF, '有氧');
  H.notOk(Fitness.dayComplete(REF), '初始未完成');
  for (let i = 0; i < 5; i++) Fitness.toggleExercise(REF, i);
  H.ok(Fitness.dayComplete(REF), '全 5 个完成应为真');
});
H.test('doneCount 统计已完成数', function () {
  reset();
  Fitness.setPart(REF, '腿');
  H.eq(Fitness.doneCount(REF), 0, '初始 0 个');
  Fitness.toggleExercise(REF, 0);
  Fitness.toggleExercise(REF, 2);
  H.eq(Fitness.doneCount(REF), 2, '已完成 2 个');
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
  H.eq(Fitness.addBody({ weight: '' }), null, '空体重应返回 null');
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
H.test('summary 今日训练部位 + 最近体重', function () {
  reset();
  Fitness.setPart(REF, '背');
  Fitness.addBody({ date: '2026-08-16', weight: 71 });
  Fitness.addBody({ date: '2026-08-20', weight: 69 });
  const s = Fitness.summary(REF);
  H.eq(s.trainedToday, '背', '今日训练应为部位 背');
  H.eq(s.latestWeight.weight, 69, '最近体重 69');
  H.eq(s.latestWeight.date, '2026-08-20', '最近体重日期');
});
H.test('summary 无训练日 trainedToday 为 null', function () {
  reset();
  const s = Fitness.summary(REF);
  H.eq(s.trainedToday, null, '无安排应为 null');
});

H.section('数据隔离与渲染');
H.test('健身改动不污染今日/工作计划', function () {
  reset();
  Fitness.setPart(REF, '胸');
  Fitness.addBody({ weight: 70 });
  H.eq(Store.data.today.length, 0, 'today 不应受影响');
  H.eq(Store.data.work.plans.length, 0, 'work 不应受影响');
});
H.test('build 含日程标题与空状态引导', function () {
  reset();
  const html = Fitness.build();
  H.includes(html, '训练日程', '应显示日程标题');
  H.includes(html, '身体数据', '应显示身体数据区');
  H.includes(html, '暂无身体数据', '无数据时应有引导文案');
});
H.test('render 不抛错（冒烟）', function () {
  reset();
  let threw = false;
  try { Fitness.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
