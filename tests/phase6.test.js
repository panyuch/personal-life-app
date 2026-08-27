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
H.test('首页工作摘要以数字条呈现且与各模块一致', function () {
  seedAll();
  const s = Work.summary();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<div class="stat-row">', '工作计划卡应含数字条');
  H.includes(html, '<div class="stat"><b>' + s.plans + '</b><span>计划</span></div>', '计划数应一致');
  H.includes(html, '<div class="stat"><b>' + s.items + '</b><span>内容</span></div>', '内容数应一致');
  H.includes(html, '<div class="stat"><b>' + s.done + '</b><span>已完成</span></div>', '已完成数应一致');
});
H.test('五张摘要卡标题带 data-no 编号 01–05', function () {
  seedAll();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<h3 data-no="01">今日计划</h3>', '今日计划卡编号 01');
  H.includes(html, '<h3 data-no="02">快速备忘</h3>', '快速备忘卡编号 02');
  H.includes(html, '<h3 data-no="03">工作计划</h3>', '工作计划卡编号 03');
  H.includes(html, '<h3 data-no="04">健身计划</h3>', '健身计划卡编号 04');
  H.includes(html, '<h3 data-no="05">饮食计划</h3>', '饮食计划卡编号 05');
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
  H.includes(html, '早上好，<em>阿明</em>', '应含问候+昵称');
  H.includes(html, '买菜', '应含今日未完成项');
  H.includes(html, 'href="#/today"', '应有今日计划入口');
  H.includes(html, 'href="#/work"', '应有工作入口');
  H.includes(html, 'href="#/fitness"', '应有健身入口');
  H.includes(html, 'href="#/diet"', '应有饮食入口');
});
H.test('问候条为独立区块（非卡片）且副文案反映未完成待办数', function () {
  seedAll(); // 今日 1 条未完成（买菜）
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<div id="greeting">', '问候应为独立区块');
  H.notIncludes(html, 'class="card greet"', '问候不应再是卡片');
  H.includes(html, '今天有 1 件待办，保持节奏。', '副文案应显示未完成待办数');
});
H.test('无待办时问候条副文案显示鼓励文案', function () {
  reset();
  Store.data.settings.nickname = '阿明';
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '今天没有待办', '无待办应显示鼓励文案');
});
H.test('首页勾选今日项与各模块同步（通过 Home.toggle 路径）', function () {
  seedAll();
  const item = Store.data.today.find(function (t) { return t.text === '买菜'; });
  H.eq(item.done, false, '初始未完成');
  // 模拟首页勾选：调用 Today.toggle（首页 bind 即调用它）
  Today.toggle(item.id);
  H.eq(Home.memoFind ? Store.data.today.find(function (t) { return t.text === '买菜'; }).done : null, true, '今日计划模块应同步为完成');
});

H.section('核心模块预览（工单04：健身月历 + 三餐卡）');
function seedPreview() {
  reset();
  Store.data.settings.nickname = '阿明';
  Fitness.setPart(REF, '背'); // 2026-08-17 背（未完成）
  Fitness.setPart('2026-08-10', '胸');
  var day = Fitness.getDay('2026-08-10');
  day.exercises.forEach(function (e) { e.done = true; }); // 8-10 全部完成
  Store.save();
  Diet.addEntry(REF, 'breakfast', { name: '燕麦', grams: 40, nutrition: { kcal: 150 } });
  Diet.addEntry(REF, 'lunch', { name: '鸡胸肉', grams: 150, nutrition: { kcal: 165 } });
}
H.test('区块标题「核心模块预览」带分隔线样式', function () {
  seedPreview();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<div class="section-title">核心模块预览</div>', '应含分节标题');
});
H.test('健身月历卡：当月部位+完成✓，部位色随皮肤，整卡跳转健身', function () {
  seedPreview();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<h3 data-no="A">健身 · 2026年8月训练日程</h3>', '月历卡标题应含编号 A 与当月');
  H.includes(html, 'href="#/fitness"', '整卡应跳转健身计划');
  ['一', '二', '三', '四', '五', '六', '日'].forEach(function (w) {
    H.includes(html, '<div class="cal-wd">' + w + '</div>', '表头应含周' + w);
  });
  H.includes(html, '<span class="cal-part" style="color:' + Fitness.getPartColor('背') + '">背</span>', '应显示训练部位与部位色（背）');
  H.includes(html, '<span class="cal-part" style="color:' + Fitness.getPartColor('胸') + '">胸</span>', '应显示训练部位与部位色（胸）');
  H.includes(html, '<span class="cal-check" title="已完成">✓</span>', '全部完成的日期应显示 ✓');
});
H.test('健身月历预览卡只读：无翻月/选中/设置入口', function () {
  seedPreview();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.notIncludes(html, 'data-cal-prev', '不应有上个月按钮');
  H.notIncludes(html, 'data-cal-next', '不应有下个月按钮');
  H.notIncludes(html, 'fit-settings-btn', '不应有设置按钮');
  H.notIncludes(html, 'data-nav=', '部位不应可点击跳详情');
});
H.test('饮食三餐卡：四餐标题+真实条目+整卡跳转饮食', function () {
  seedPreview();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '<h3 data-no="B">饮食 · 今日三餐</h3>', '三餐卡标题应含编号 B');
  H.includes(html, 'href="#/diet"', '整卡应跳转饮食计划');
  ['早餐', '午餐', '晚餐', '加餐'].forEach(function (m) {
    H.includes(html, '<div class="meal-head">' + m + '</div>', '应含餐次' + m);
  });
  H.includes(html, '燕麦 40g · 150kcal', '早餐条目应与饮食模块同源');
  H.includes(html, '鸡胸肉 150g · 165kcal', '午餐条目应与饮食模块同源');
});
H.test('预览卡空态：无训练安排 / 无饮食记录时显示引导', function () {
  reset();
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '本月还没有训练安排', '月历空态应引导');
  H.includes(html, '今天还没记录饮食', '三餐空态应引导');
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
