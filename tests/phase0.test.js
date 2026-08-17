/*
 * 阶段0 测试：脚手架 + 数据层(store) + 通用工具(ui) + 路由(router)
 * 覆盖：数据读写/导出/导入校验/清空/normalize、日期与时间工具、路由解析与注册。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Router = mods.router;

function reset() { storage.clear(); Store.load(); }

H.section('数据层 Store');
H.test('空白 localStorage 时 load() 返回默认结构并落盘', function () {
  storage.clear();
  const d = Store.load();
  H.ok(d && d.version === 1, '应返回默认数据');
  H.ok(Array.isArray(d.today) && Array.isArray(d.work.plans) && Array.isArray(d.diet.days) === false, '');
  H.ok(Array.isArray(d.diet.foods), 'diet.foods 应为数组');
  H.eq(storage.getItem('lifeApp:data:v1') != null, true, '默认数据应已写入 localStorage');
});

H.test('save() 后刷新(重新 load)数据仍在', function () {
  reset();
  Store.data.today.push({ id: 'x1', date: '2026-08-17', text: '写代码', done: false, createdAt: '' });
  Store.save();
  storage.clear && (function () { /* 模拟“刷新”：丢掉内存引用，重新从 localStorage 读 */
    Store.data = null;
  })();
  const re = Store.load();
  H.eq(re.today.length, 1, '重新加载后今日计划应有 1 条');
  H.eq(re.today[0].text, '写代码', '内容应一致');
});

H.test('export() 返回可解析 JSON 且含必要顶层字段', function () {
  reset();
  const json = Store.export();
  const parsed = JSON.parse(json);
  ['version', 'settings', 'work', 'fitness', 'diet', 'today', 'memo'].forEach(function (k) {
    H.ok(k in parsed, 'export 应包含字段 ' + k);
  });
});

H.test('import() 合法数据整体替换', function () {
  reset();
  const payload = {
    version: 1,
    settings: { nickname: '小陈', themeColor: '#ff0000', darkMode: true },
    today: [{ id: 't1', date: '2026-08-17', text: 'a', done: false, createdAt: '' }],
    work: { projects: [{ id: 'p1', name: '项目A', note: '' }], tasks: [] },
    fitness: { templates: [], checkins: [], body: [] },
    diet: { targetKcal: 2000, foods: [], days: {} },
    memo: [],
  };
  Store.import(JSON.stringify(payload));
  H.eq(Store.data.settings.nickname, '小陈', '昵称应被导入');
  H.eq(Store.data.today.length, 1, '今日计划应被导入');
  // 导入应落盘
  const re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.settings.nickname, '小陈', '导入应持久化');
});

H.test('import() 非法 JSON 抛错', function () {
  reset();
  let threw = false;
  try { Store.import('{not json'); } catch (e) { threw = true; }
  H.ok(threw, '非 JSON 应抛错');
});

H.test('import() 缺少必要字段抛错', function () {
  reset();
  let threw = false;
  try { Store.import(JSON.stringify({ version: 1, settings: {} })); } catch (e) { threw = true; }
  H.ok(threw, '缺少 work/fitness/diet 应抛错');
});

H.test('clear() 重置为默认空结构', function () {
  reset();
  Store.data.today.push({ id: 't', date: '2026-08-17', text: 'x', done: false, createdAt: '' });
  Store.save();
  Store.clear();
  H.eq(Store.data.today.length, 0, '清空后 today 应为空');
  H.eq(Store.data.work.plans.length, 0, '清空后 work.plans 应为空');
  H.eq(Store.data.settings.nickname, '', '清空后设置应恢复默认');
});

H.test('uid() 生成唯一且不重复', function () {
  const a = Store.uid(), b = Store.uid();
  H.ok(a && b && a !== b, '两次 uid 应不同');
});

H.test('normalize：旧数据缺字段时补齐默认结构（经 load 路径）', function () {
  storage.clear();
  const partial = { version: 1, settings: { nickname: '老用户' }, today: [{ id: 't', date: '2026-08-17', text: 'x', done: false }] };
  storage.setItem('lifeApp:data:v1', JSON.stringify(partial));
  Store.load();
  H.ok(Array.isArray(Store.data.work.plans), '缺失 work 应补为默认');
  H.ok(Array.isArray(Store.data.fitness.body), '缺失 fitness 应补为默认');
  H.eq(Store.data.settings.themeColor, '#3b82f6', '缺失 themeColor 应补默认');
  H.eq(Store.data.settings.nickname, '老用户', '已有昵称应保留');
});

H.test('load 遇到损坏 JSON 回退默认并提示', function () {
  storage.clear();
  storage.setItem('lifeApp:data:v1', '{ this is broken json');
  let toastCalled = false;
  win.UI = win.UI || {};
  const orig = win.UI.toast;
  win.UI.toast = function () { toastCalled = true; };
  Store.load();
  H.eq(Store.data.version, 1, '损坏数据应回退默认');
  H.ok(toastCalled, '应提示数据已损坏');
  win.UI.toast = orig;
});

H.section('通用工具 UI');
H.test('todayStr 使用本地时区且格式正确', function () {
  const s = UI.todayStr(new Date(2026, 7, 17)); // 2026-08-17 本地
  H.eq(s, '2026-08-17', '应为本地 YYYY-MM-DD');
});
H.test('fmtDate 输出 MM-DD 周X', function () {
  const s = UI.fmtDate('2026-08-17');
  H.includes(s, '08-17', '应包含 08-17');
  H.includes(s, '周一', '2026-08-17 应为周一');
});
H.test('isOverdue 判断', function () {
  H.eq(UI.isOverdue(null), false, '空截止日不算逾期');
  H.eq(UI.isOverdue('2026-08-10', '2026-08-17'), true, '早于今天应逾期');
  H.eq(UI.isOverdue('2026-08-20', '2026-08-17'), false, '晚于今天不逾期');
  H.eq(UI.isOverdue('2026-08-17', '2026-08-17'), false, '当天不算逾期');
});
H.test('weekRange 返回 7 天且周一为起点', function () {
  const week = UI.weekRange(new Date(2026, 7, 17));
  H.eq(week.length, 7, '应返回 7 天');
  H.includes(UI.fmtDate(week[0]), '周一', '第一天应为周一');
  H.includes(UI.fmtDate(week[6]), '周日', '最后一天应为周日');
  // 连续递增
  for (let i = 1; i < 7; i++) H.ok(week[i] > week[i - 1], '日期应递增');
});
H.test('escapeHtml 转义危险字符', function () {
  const out = UI.escapeHtml('<b>"x"&\'y\'</b>');
  H.notIncludes(out, '<b>', '尖括号应被转义');
  H.includes(out, '&lt;', '应包含 &lt;');
});
H.test('applyTheme 写入主题变量与深色', function () {
  reset();
  Store.data.settings.themeColor = '#ff3366';
  Store.data.settings.darkMode = true;
  UI.applyTheme();
  H.eq(win.document._themeColor, '#ff3366', '应写入 --theme-color');
  H.eq(win.document._themeDark, true, '应开启深色');
  Store.data.settings.darkMode = false;
  UI.applyTheme();
  H.eq(win.document._themeDark, false, '应关闭深色');
});

H.section('路由 Router');
H.test('parse 解析 hash 路由名', function () {
  win.location.hash = '#/work';
  H.eq(Router.parse(), 'work', '应解析为 work');
  win.location.hash = '#/fitness';
  H.eq(Router.parse(), 'fitness');
  win.location.hash = '';
  H.eq(Router.parse(), 'home', '空 hash 默认 home');
  win.location.hash = '#/diet';
  H.eq(Router.parse(), 'diet');
});
H.test('六个路由均已注册', function () {
  ['home', 'today', 'work', 'fitness', 'diet', 'settings'].forEach(function (n) {
    H.ok(typeof Router.routes[n] === 'function', '路由 ' + n + ' 应已注册 render');
  });
});
H.test('render 在各路由下不抛错（冒烟）', function () {
  ['home', 'today', 'work', 'fitness', 'diet', 'settings'].forEach(function (n) {
    win.location.hash = '#/' + n;
    let threw = false;
    try { Router.render(); } catch (e) { threw = true; throw e; }
    H.notOk(threw, '路由 ' + n + ' 渲染不应抛错');
  });
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
