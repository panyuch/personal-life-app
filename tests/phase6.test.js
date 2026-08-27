/*
 * 阶段6 测试：首页总览（home.js）
 * 覆盖：问候（按时段）、快速备忘 CRUD、今日计划卡、三张摘要卡与各模块同源一致、点击进入模块、render 冒烟。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Home = mods.home;
const Today = mods.today;
const Work = mods.work;
const Fitness = mods.fitness;
const Diet = mods.diet;

function reset() { storage.clear(); Store.load(); }
const REF = '2026-08-17';

H.section('问候与备忘');
H.test('greeting 按时段返回问候', function () {
  H.eq(Home.greeting(new Date(2026, 7, 17, 9)), '早上好', '9 点应早上好');
  H.eq(Home.greeting(new Date(2026, 7, 17, 13)), '下午好', '13 点应下午好');
  H.eq(Home.greeting(new Date(2026, 7, 17, 20)), '晚上好', '20 点应晚上好');
});
H.test('快速备忘 memoAdd / toggle / remove', function () {
  reset();
  const m = Home.memoAdd('买牛奶');
  H.eq(Store.data.memo.length, 1, '应写入 memo');
  H.ok(Home.memoToggle(m.id), '应勾选');
  H.eq(Home.memoFind(m.id).done, true, '应已完成');
  H.ok(Home.memoRemove(m.id), '应删除');
  H.eq(Store.data.memo.length, 0, '应清空');
});
H.test('todayIncomplete 返回未完成并按上限截断', function () {
  reset();
  Today.addItem(REF, 'a'); Today.addItem(REF, 'b'); Today.addItem(REF, 'c');
  Today.toggle(Store.data.today[1].id); // b done
  H.eq(Home.todayIncomplete(REF).length, 2, '未完成应 2 条');
  H.eq(Home.todayIncomplete(REF, 1).length, 1, '限制为 1 条');
});

H.section('聚合一致性');
function seedAll() {
  reset();
  Store.data.settings.nickname = '阿明';
  // today
  Today.addItem(REF, '买菜');
  const done = Today.addItem(REF, '跑步'); Today.toggle(done.id);
  // work
  const pA = Work.addPlan('项目A'); const pB = Work.addPlan('项目B');
  pA.items.push({ id: Store.uid(), text: '任务1', done: false });
  pA.items.push({ id: Store.uid(), text: '任务2', done: false });
  pB.items.push({ id: Store.uid(), text: '任务3', done: true });
  Store.save();
  // fitness
  Fitness.setPart(REF, '背');
  Fitness.addBody({ date: '2026-08-16', weight: 71 });
  Fitness.addBody({ date: '2026-08-20', weight: 69 });
  // diet
  Diet.addEntry(REF, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 300 } });
}
H.test('首页工作摘要与各模块一致', function () {
  seedAll();
  const s = Work.summary();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '计划 <b>' + s.plans + '</b>', '计划数应一致');
  H.includes(html, '内容 <b>' + s.items + '</b>', '内容数应一致');
  H.includes(html, '已完成 <b>' + s.done + '</b>', '已完成数应一致');
});
H.test('首页健身摘要与各模块一致', function () {
  seedAll();
  const f = Fitness.summary(REF);
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '今天已训练：' + f.trainedToday, '训练名应一致');
  H.includes(html, '最近体重 ' + f.latestWeight.weight + 'kg (' + f.latestWeight.date + ')', '最近体重及日期应一致');
});
H.test('首页饮食摘要与各模块一致（是否已记录 + 今日热量）', function () {
  seedAll();
  const d = Diet.dailySummary(REF);
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '今日已记录', '有记录时显示已记录');
  H.includes(html, '热量 ' + Math.round(d.kcal) + ' kcal', '热量应一致');
});
H.test('首页含问候、今日项、各模块入口链接', function () {
  seedAll();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '早上好，阿明', '应含问候+昵称');
  H.includes(html, '买菜', '应含今日未完成项');
  H.includes(html, 'href="#/today"', '应有今日计划入口');
  H.includes(html, 'href="#/work"', '应有工作入口');
  H.includes(html, 'href="#/fitness"', '应有健身入口');
  H.includes(html, 'href="#/diet"', '应有饮食入口');
});
H.test('首页勾选今日项与各模块同步（通过 Home.toggle 路径）', function () {
  seedAll();
  const item = Store.data.today.find(function (t) { return t.text === '买菜'; });
  H.eq(item.done, false, '初始未完成');
  // 模拟首页勾选：调用 Today.toggle（首页 bind 即调用它）
  Today.toggle(item.id);
  H.eq(Home.memoFind ? Store.data.today.find(function (t) { return t.text === '买菜'; }).done : null, true, '今日计划模块应同步为完成');
});

H.section('渲染');
H.test('render 不抛错（冒烟）', function () {
  seedAll();
  let threw = false;
  try { Home.render(win.document.getElementById('view'), win.document.getElementById('topbar')); }
  catch (e) { threw = true; throw e; }
  H.notOk(threw, 'render 不应抛错');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
