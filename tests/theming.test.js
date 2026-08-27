/*
 * theming.test.js — 多风格皮肤 + 深色模式（theming spec）验收
 * 只测外部行为（设置 → 渲染的可见结果、持久化结果），不测具体 CSS 值 / DOM 细节。
 * 覆盖：
 *  1) 设置结构迁移：themeColor 被丢弃、theme 缺失/非法回落 brutal、darkMode 保留
 *  2) 主题引擎：applyTheme 把 theme → body[data-skin]、darkMode → body[data-theme]
 *  3) 备份导入/导出包含 theme 与 darkMode
 *  4) setTheme：白名单校验 + 持久化 + 应用主题
 *  5) 设置页：5 张风格卡片、当前高亮、无主题色控件
 *  6) 训练部位色随皮肤 CSS 变量（getPartColor）
 *  7) 图表：皮肤为暗色（cyber）或深色开启时按暗色渲染；主色读当前皮肤 accent
 */
'use strict';
const H = require('./harness');
const path = require('path');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Settings = mods.settings;
const Fitness = mods.fitness;
const Chart = require(path.join(__dirname, '..', 'js', 'chart.js'));
win.Chart = Chart;

function reset() { storage.clear(); Store.load(); win.document.body.removeAttribute('data-skin'); win.document.body.removeAttribute('data-theme'); }
function seedRaw(settings) {
  storage.clear();
  storage.setItem('lifeApp:data:v1', JSON.stringify({
    version: 1,
    settings: settings,
    today: [], work: { plans: [] },
    fitness: { templates: [], checkins: [], body: [] },
    diet: { foods: [], days: {} }, memo: [],
  }));
  Store.load();
}

H.section('设置结构迁移（T01）');
H.test('旧数据含 themeColor：丢弃并回落 brutal、darkMode 保留', function () {
  seedRaw({ nickname: '老用户', themeColor: '#ff0000', darkMode: true });
  H.eq(Store.data.settings.theme, 'brutal', 'theme 应回落默认 brutal');
  H.eq(Store.data.settings.darkMode, true, 'darkMode 应保留');
  H.ok(!('themeColor' in Store.data.settings), 'themeColor 应被丢弃');
  H.eq(Store.data.settings.nickname, '老用户', '其余数据不受影响');
});
H.test('缺 theme 字段回落 brutal、darkMode 保留', function () {
  seedRaw({ nickname: '', darkMode: false });
  H.eq(Store.data.settings.theme, 'brutal', '缺 theme 应回落 brutal');
});
H.test('theme 非法值回落 brutal', function () {
  seedRaw({ nickname: '', theme: 'rainbow', darkMode: true });
  H.eq(Store.data.settings.theme, 'brutal', '非法 theme 应回落 brutal');
  H.eq(Store.data.settings.darkMode, true, 'darkMode 应保留');
});
H.test('theme 白名单内合法值原样保留', function () {
  seedRaw({ nickname: '', theme: 'cyber', darkMode: false });
  H.eq(Store.data.settings.theme, 'cyber', 'cyber 应保留');
});
H.test('备份导出包含 theme 与 darkMode，导入可恢复', function () {
  reset();
  Store.data.settings.theme = 'neumorph';
  Store.data.settings.darkMode = true;
  const parsed = JSON.parse(Store.export());
  H.eq(parsed.settings.theme, 'neumorph', '导出应含 theme');
  H.eq(parsed.settings.darkMode, true, '导出应含 darkMode');
  Store.data.settings.theme = 'brutal';
  Store.data.settings.darkMode = false;
  Store.import(JSON.stringify(parsed));
  H.eq(Store.data.settings.theme, 'neumorph', '导入应恢复 theme');
  H.eq(Store.data.settings.darkMode, true, '导入应恢复 darkMode');
});

H.section('主题引擎（T02）');
H.test('applyTheme 映射 theme → data-skin', function () {
  reset();
  Store.data.settings.theme = 'editorial';
  UI.applyTheme();
  H.eq(win.document.body.getAttribute('data-skin'), 'editorial', 'body 应写 data-skin=editorial');
});
H.test('applyTheme 对非法 theme 回落默认 brutal', function () {
  reset();
  Store.data.settings.theme = 'rainbow';
  UI.applyTheme();
  H.eq(win.document.body.getAttribute('data-skin'), 'brutal', '非法 theme 应回落 brutal');
});
H.test('applyTheme 映射 darkMode → data-theme（开写 / 关移除）', function () {
  reset();
  Store.data.settings.theme = 'brutal';
  Store.data.settings.darkMode = true;
  UI.applyTheme();
  H.eq(win.document.body.getAttribute('data-theme'), 'dark', '深色开启应写 data-theme=dark');
  Store.data.settings.darkMode = false;
  UI.applyTheme();
  H.eq(win.document.body.getAttribute('data-theme'), null, '深色关闭应移除 data-theme');
});
H.test('applyTheme 不再写主题色变量（--theme-color 无副作用）', function () {
  reset();
  const before = win.document._themeColor;
  UI.applyTheme();
  H.eq(win.document._themeColor, before, '不应再写 --theme-color');
});

H.section('setTheme 设置函数（T05）');
H.test('setTheme 写入 theme、持久化并应用主题', function () {
  reset();
  Settings.setTheme('gradient');
  H.eq(Store.data.settings.theme, 'gradient', '应写入 theme');
  H.eq(win.document.body.getAttribute('data-skin'), 'gradient', '应应用主题');
  const re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.settings.theme, 'gradient', '应持久化');
});
H.test('setTheme 非法键被忽略，不改库不换肤', function () {
  reset();
  UI.applyTheme(); // 建立初始 body 状态（data-skin=brutal）
  Settings.setTheme('nope');
  H.eq(Store.data.settings.theme, 'brutal', '非法键不应写入');
  H.eq(win.document.body.getAttribute('data-skin'), 'brutal', '不应换肤');
});

H.section('设置界面风格选择器（T05）');
H.test('build 含 5 张风格卡片且当前风格高亮', function () {
  reset();
  Store.data.settings.theme = 'gradient';
  const html = Settings.build();
  ['brutal', 'editorial', 'neumorph', 'gradient', 'cyber'].forEach(function (k) {
    H.includes(html, 'data-skin="' + k + '"', '应包含 ' + k + ' 卡片');
  });
  H.includes(html, 'skin-card active" data-skin="gradient"', '当前风格应高亮');
  H.notIncludes(html, 'set-color', '不应再包含主题色取色器');
  H.notIncludes(html, 'class="swatch', '不应再包含主题色色块');
  H.includes(html, 'id="set-dark"', '深色开关应保留');
});

H.section('训练部位色主题化（T06）');
H.test('getPartColor 优先读皮肤 CSS 变量（读 body 上的变量）', function () {
  reset();
  let lastEl = null;
  win.getComputedStyle = function (el) {
    lastEl = el;
    return { getPropertyValue: function (k) { return k === '--part-chest' ? '#ff2d00' : ''; } };
  };
  H.eq(Fitness.getPartColor('胸'), '#ff2d00', '应读当前皮肤 --part-chest');
  // 皮肤变量定义在 body[data-skin] 上，必须读 body 而非 html，否则浏览器中恒不生效
  H.ok(lastEl === win.document.body, 'CSS 变量应读自 body（而非 documentElement）');
  delete win.getComputedStyle;
});
H.test('getPartColor 无 CSS 变量时回落兜底色表', function () {
  reset();
  H.eq(Fitness.getPartColor('胸'), '#ef4444', '胸默认色');
  H.eq(Fitness.getPartColor('有氧'), '#8b5cf6', '有氧默认色');
  H.eq(Fitness.getPartColor('未知'), 'var(--accent)', '未知部位回落 accent');
});

H.section('图表明暗自适应（T06）');
H.test('cyber 皮肤（恒暗）时图表按暗色渲染', function () {
  reset();
  win.document.body.setAttribute('data-skin', 'cyber'); // 无 data-theme
  const el = win.document.getElementById('fit-chart');
  Chart.renderWeightTrend(el, { dates: ['2026-08-16', '2026-08-17'], weights: [71, 70] });
  H.includes(el.innerHTML, '#94a3b8', 'cyber 皮肤应使用暗色轴色');
  Chart.dispose();
});
H.test('深色开启时图表按暗色渲染', function () {
  reset();
  win.document.body.setAttribute('data-skin', 'brutal');
  win.document.body.setAttribute('data-theme', 'dark');
  const el = win.document.getElementById('fit-chart');
  Chart.renderWeightTrend(el, { dates: ['2026-08-16', '2026-08-17'], weights: [71, 70] });
  H.includes(el.innerHTML, '#94a3b8', '深色开启应使用暗色轴色');
  Chart.dispose();
});
H.test('亮色皮肤且未开深色时图表按亮色渲染', function () {
  reset();
  win.document.body.setAttribute('data-skin', 'brutal');
  const el = win.document.getElementById('fit-chart');
  Chart.renderWeightTrend(el, { dates: ['2026-08-16', '2026-08-17'], weights: [71, 70] });
  H.includes(el.innerHTML, '#6b7280', '亮色应使用亮色轴色');
  Chart.dispose();
});
H.test('图表主色随当前皮肤 accent（读 body 上的变量）', function () {
  reset();
  let lastEl = null;
  win.getComputedStyle = function (el) {
    lastEl = el;
    return { getPropertyValue: function (k) { return k === '--accent' ? '#ff00aa' : ''; } };
  };
  win.document.body.setAttribute('data-skin', 'brutal');
  const el = win.document.getElementById('fit-chart');
  Chart.renderWeightTrend(el, { dates: ['2026-08-16', '2026-08-17'], weights: [71, 70] });
  H.includes(el.innerHTML, '#ff00aa', '主色应来自当前皮肤 accent');
  // 皮肤变量定义在 body[data-skin] 上，必须读 body 而非 html，否则浏览器中恒不生效
  H.ok(lastEl === win.document.body, 'CSS 变量应读自 body（而非 documentElement）');
  Chart.dispose();
  delete win.getComputedStyle;
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
