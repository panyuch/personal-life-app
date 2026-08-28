/*
 * 阶段7+8 测试：主题/空状态/联调回归 + PRD §10 验收清单（可程序化检查项）
 * 覆盖：跨模块数据隔离全矩阵、各模块空状态引导、无“保存”按钮依赖、
 *       file:// 静态约束（无 ES Module / fetch / CDN）、验收清单逐项核对。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Today = mods.today, Work = mods.work, Fitness = mods.fitness, Diet = mods.diet, Home = mods.home, Settings = mods.settings;

function reset() { storage.clear(); Store.load(); }
const REF = '2026-08-17';
const JS_DIR = path.join(__dirname, '..', 'js');
const ROOT = path.join(__dirname, '..');

H.section('跨模块数据隔离（全矩阵）');
H.test('改动今日计划不影响 work/fitness/diet/memo', function () {
  reset();
  Today.addItem(REF, '仅今日');
  H.eq(Store.data.work.plans.length, 0, 'work 不变');
  H.eq(Store.data.fitness.body.length, 0, 'fitness 不变');
  H.eq(Store.data.diet.days && Object.keys(Store.data.diet.days).length, 0, 'diet 不变');
  H.eq(Store.data.memo.length, 0, 'memo 不变');
});
H.test('改动工作计划不影响今日/健身/饮食/备忘', function () {
  reset();
  const p = Work.addPlan('P'); p.items.push({ id: Store.uid(), text: 't', done: false }); Store.save();
  H.eq(Store.data.today.length, 0, 'today 不变');
  H.eq(Store.data.fitness.checkins.length, 0, 'fitness 不变');
  H.eq(Store.data.diet.foods.length, 0, 'diet 不变');
  H.eq(Store.data.memo.length, 0, 'memo 不变');
});
H.test('改动健身不影响今日/工作/饮食/备忘', function () {
  reset();
  Fitness.setPart(REF, '背'); Fitness.addBody({ weight: 70 });
  H.eq(Store.data.today.length, 0, 'today 不变');
  H.eq(Store.data.work.plans.length, 0, 'work 不变');
  H.eq(Store.data.diet.foods.length, 0, 'diet 不变');
  H.eq(Store.data.memo.length, 0, 'memo 不变');
});
H.test('改动饮食不影响今日/工作/健身/备忘', function () {
  reset();
  Diet.addEntry(REF, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 100 } }); Diet.addLibraryFood({ name: 'y', category: '其他', per100g: { kcal: 100 } });
  H.eq(Store.data.today.length, 0, 'today 不变');
  H.eq(Store.data.work.plans.length, 0, 'work 不变');
  H.eq(Store.data.fitness.body.length, 0, 'fitness 不变');
  H.eq(Store.data.memo.length, 0, 'memo 不变');
});
H.test('改动备忘不影响今日/工作/健身/饮食', function () {
  reset();
  Home.memoAdd('记一笔');
  H.eq(Store.data.today.length, 0, 'today 不变');
  H.eq(Store.data.work.plans.length, 0, 'work 不变');
  H.eq(Store.data.fitness.body.length, 0, 'fitness 不变');
  H.eq(Store.data.diet.foods.length, 0, 'diet 不变');
});

H.section('空状态引导文案');
H.test('各模块空状态均有引导文案', function () {
  reset();
  H.includes(Today.build({ date: REF }), 'empty-state', '今日计划空状态');
  H.includes(Work.build(), 'empty-state', '工作计划空状态');
  const fb = Fitness.build();
  H.includes(fb, '训练日程', '健身日程标题');
  H.includes(fb, '暂无身体数据', '健身身体数据空状态');
  const db = Diet.build({ date: REF });
  H.includes(db, '还没记录', '饮食餐次空状态');
  H.includes(db, '食物库还是空的', '饮食库空状态');
  const hb = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(hb, '还没有备忘', '首页备忘空状态');
  H.includes(hb, '今日计划都完成啦', '首页今日空状态');
});

H.section('写即存（无“保存”按钮依赖）');
H.test('各模块 build 不含“保存”按钮（写即存，无显式保存按钮）', function () {
  reset();
  const outputs = [
    Today.build({ date: REF }),
    Work.build(),
    Fitness.build(),
    Diet.build({ date: REF }),
    Settings.build(),
    Home.build({ now: new Date(2026, 7, 17, 9), date: REF }),
  ];
  outputs.forEach(function (o, i) {
    // 仅检查“按钮文字为 保存”的情况；描述性文案（如“数据保存在本机”）不算
    H.ok(!/<button[^>]*>\s*保存\s*<\/button>/.test(o), '第 ' + i + ' 个页面不应含“保存”按钮');
  });
});

H.section('file:// 静态约束（无 ES Module / fetch / CDN）');
function read(p) { return fs.readFileSync(p, 'utf8'); }
H.test('所有 js 文件不含 fetch()', function () {
  const files = fs.readdirSync(JS_DIR).filter(function (f) { return /\.js$/.test(f); });
  files.forEach(function (f) {
    const c = read(path.join(JS_DIR, f));
    H.eq(c.indexOf('fetch('), -1, f + ' 不应使用 fetch');
  });
});
H.test('所有 js 文件不含 ES Module import/export 语句', function () {
  const files = fs.readdirSync(JS_DIR).filter(function (f) { return /\.js$/.test(f); });
  files.forEach(function (f) {
    const c = read(path.join(JS_DIR, f));
    H.ok(!/(^|\n)\s*import\s+[\w'"{*]/.test(c), f + ' 不应有 ES import 语句');
    H.ok(!/(^|\n)\s*export\s+(default|function|const|let|var|class|\{)/.test(c), f + ' 不应有 ES export 语句');
  });
});
H.test('index.html 使用经典 script 且无 CDN/type=module', function () {
  const html = read(path.join(ROOT, 'index.html'));
  H.eq(html.indexOf('type="module"'), -1, '不应使用 module');
  H.eq(html.indexOf('http://'), -1, '不应引用 http CDN');
  H.eq(html.indexOf('https://'), -1, '不应引用 https CDN');
  H.ok(/<script src="js\//.test(html), '应引用本地 js/ 脚本');
});

H.section('侧边栏导航图标（home-restructure · 工单01）');
H.test('六个导航项各含对应图标', function () {
  const html = read(path.join(ROOT, 'index.html'));
  H.includes(html, '<span class="nav-ico">◉</span>首页总览', '首页总览图标');
  H.includes(html, '<span class="nav-ico">☐</span>今日计划', '今日计划图标');
  H.includes(html, '<span class="nav-ico">▤</span>工作计划', '工作计划图标');
  H.includes(html, '<span class="nav-ico">◍</span>健身计划', '健身计划图标');
  H.includes(html, '<span class="nav-ico">◔</span>饮食计划', '饮食计划图标');
  H.includes(html, '<span class="nav-ico">◈</span>数据与设置', '数据与设置图标');
});
H.test('导航图标样式已定义且与文字同行', function () {
  const css = read(path.join(ROOT, 'assets', 'styles.css'));
  H.includes(css, '.nav-ico', 'styles.css 应定义 .nav-ico');
  const navA = css.match(/#sidebar nav a\s*\{([\s\S]*?)\}/);
  H.ok(navA && /display:\s*flex/.test(navA[1]), '导航链接应为 flex 布局（图标与文字同行）');
});

H.section('五套皮肤差异化 + 720px 窄屏（home-restructure · 工单06）');
H.test('五套皮肤各自覆盖新增组件（图标/数字条/分节标题/宏量条/三餐/空态）', function () {
  const css = read(path.join(ROOT, 'assets', 'themes.css'));
  const skins = ['brutal', 'editorial', 'neumorph', 'gradient', 'cyber'];
  const comps = ['.nav-ico', '.stat', '.section-title', '.macro', '.meal', '.preview-empty'];
  skins.forEach(function (s) {
    comps.forEach(function (c) {
      H.includes(css, 'body[data-skin="' + s + '"] ' + c, '皮肤 ' + s + ' 应差异化覆盖 ' + c);
    });
  });
});
H.test('暗色皮肤档存在（cyber 恒暗除外）', function () {
  const css = read(path.join(ROOT, 'assets', 'themes.css'));
  ['brutal', 'editorial', 'neumorph', 'gradient'].forEach(function (s) {
    H.includes(css, 'body[data-skin="' + s + '"][data-theme="dark"]', '皮肤 ' + s + ' 应有暗色档');
  });
  H.notIncludes(css, 'body[data-skin="cyber"][data-theme="dark"]', 'cyber 恒暗不应有暗色档');
});
H.test('720px 窄屏：侧栏转顶部导航、新组件收紧不溢出', function () {
  const css = read(path.join(ROOT, 'assets', 'styles.css'));
  const media = css.match(/@media \(max-width: 720px\)\s*\{([\s\S]*?)\n\}/);
  H.ok(media, 'styles.css 应含 720px 断点');
  H.includes(media[1], '#sidebar', '窄屏应处理侧边栏');
  H.includes(media[1], '.stat-row', '窄屏应收紧数字条');
  H.includes(media[1], '.preview-cal', '窄屏应收紧预览月历');
});

H.section('PRD §10 验收清单（程序化可检项）');
H.test('导出可下载 .json（文件名格式）', function () {
  reset();
  const r = Settings.exportBackup();
  H.ok(/^life-app-backup-\d{4}-\d{2}-\d{2}\.json$/.test(r.filename), '文件名应为 .json');
});
H.test('导入可恢复全部数据', function () {
  reset();
  const payload = JSON.stringify({
    version: 1, settings: { nickname: '恢复', theme: 'gradient', darkMode: false },
    today: [{ id: 'a', date: REF, text: 't', done: false, createdAt: '' }],
    work: { plans: [{ id: 'p', name: 'P', items: [] }] },
    fitness: { templates: [], checkins: [], body: [{ id: 'b', date: REF, weight: 70, bodyFat: null, note: '' }] },
    diet: { targetKcal: 2000, foods: [], days: {} }, memo: [],
  });
  Store.import(payload);
  H.eq(Store.data.settings.nickname, '恢复', '昵称恢复');
  H.eq(Store.data.settings.theme, 'gradient', '界面风格恢复');
  H.eq(Store.data.today.length, 1, '今日计划恢复');
  H.eq(Store.data.fitness.body.length, 1, '身体数据恢复');
});
H.test('导入与清空均有二次确认', function () {
  reset();
  let importConfirmed = false, clearConfirmed = false;
  win.__confirmHandler = function (opts) { if (/导入/.test(opts.title || '')) importConfirmed = true; if (/清空/.test(opts.title || '')) clearConfirmed = true; return true; };
  return Promise.resolve()
    .then(function () { return Settings.requestImport(JSON.stringify({ version: 1, settings: {}, work: { plans: [] }, fitness: { templates: [], checkins: [], body: [] }, diet: { targetKcal: null, foods: [], days: {} }, today: [], memo: [] })); })
    .then(function () { H.ok(importConfirmed, '导入应触发二次确认'); return Settings.requestClear(); })
    .then(function () { H.ok(clearConfirmed, '清空应触发二次确认'); });
});
H.test('切换界面风格即时变化且刷新保留', function () {
  reset();
  Settings.setTheme('gradient');
  H.eq(win.document._skin, 'gradient', '界面风格即时变化');
  const re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.settings.theme, 'gradient', '刷新后仍保留');
});
H.test('新增/修改后刷新数据仍在（持久化）', function () {
  reset();
  Today.addItem(REF, '持久化测试');
  Work.addPlan('持久计划');
  // 模拟“刷新”：丢弃内存引用后重新 load
  Store.data = null;
  Store.load();
  H.eq(Store.data.today.length, 1, '今日计划刷新后仍在');
  H.eq(Store.data.work.plans.length, 1, '计划刷新后仍在');
});
H.test('首页与各模块摘要数字同源一致', function () {
  reset();
  const pA = Work.addPlan('A');
  pA.items.push({ id: Store.uid(), text: '今日', done: false });
  pA.items.push({ id: Store.uid(), text: '逾期', done: true });
  Store.save();
  const ft = Fitness.setPart(REF, '背');
  Fitness.addBody({ date: '2026-08-16', weight: 72 });
  Diet.addEntry(REF, 'breakfast', { name: 'x', grams: 100, nutrition: { kcal: 250 } });
  const html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  const ws = Work.summary();
  H.includes(html, '<div class="stat"><b>' + ws.plans + '</b><span>计划</span></div>', '工作数字一致');
  H.includes(html, '<div class="stat"><b>' + ws.done + '</b><span>已完成</span></div>', '已完成数字一致');
});

H.section('端到端流程冒烟');
H.test('今日新增→首页显示→首页勾选同步模块', function () {
  reset();
  const it = Today.addItem(REF, '买菜');
  let html = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.includes(html, '买菜', '首页应显示该待办');
  Today.toggle(it.id); // 模拟首页勾选
  const html2 = Home.build({ now: new Date(2026, 7, 17, 9), date: REF });
  H.notIncludes(html2, '买菜', '勾选完成后首页今日未完成卡不再显示该项');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
