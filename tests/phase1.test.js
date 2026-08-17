/*
 * 阶段1 测试：数据与设置（settings.js）
 * 覆盖：昵称/主题色/深色即时保存、导出备份、导入（二次确认+校验）、清空（危险二次确认）、关于、applyTheme。
 */
'use strict';
const H = require('./harness');
const { win, mods, storage } = H.loadAll();
const Store = mods.store;
const UI = mods.ui;
const Settings = mods.settings;

let confirmAnswer = true;
win.__confirmHandler = function () { return confirmAnswer; };

function reset() { storage.clear(); Store.load(); }

H.section('设置即时保存');
H.test('setNickname 保存并持久化', function () {
  reset();
  Settings.setNickname(' 小陈 ');
  H.eq(Store.data.settings.nickname, '小陈', '应去除首尾空格');
  const re = JSON.parse(storage.getItem('lifeApp:data:v1'));
  H.eq(re.settings.nickname, '小陈', '应写入 localStorage');
});
H.test('setThemeColor 保存并立即改变主题变量', function () {
  reset();
  Settings.setThemeColor('#ff3366');
  H.eq(Store.data.settings.themeColor, '#ff3366', '应保存主题色');
  H.eq(win.document._themeColor, '#ff3366', 'applyTheme 应写入 CSS 变量');
});
H.test('setDarkMode 切换深色并写 data-theme', function () {
  reset();
  Settings.setDarkMode(true);
  H.eq(Store.data.settings.darkMode, true, '应保存深色开关');
  H.eq(win.document._themeDark, true, '应开启深色');
  Settings.setDarkMode(false);
  H.eq(win.document._themeDark, false, '应关闭深色');
});

H.section('导出 / 导入 / 清空');
H.test('exportBackup 文件名与内容正确', function () {
  reset();
  Store.data.today.push({ id: 't1', date: '2026-08-17', text: 'a', done: false, createdAt: '' });
  Store.save();
  const r = Settings.exportBackup();
  H.ok(/^life-app-backup-\d{4}-\d{2}-\d{2}\.json$/.test(r.filename), '文件名格式应为 life-app-backup-YYYY-MM-DD.json，实际：' + r.filename);
  const parsed = JSON.parse(r.content);
  H.eq(parsed.today.length, 1, '导出内容应包含当前数据');
});
H.test('requestImport：确认后导入合法数据', async function () {
  reset();
  confirmAnswer = true;
  const payload = JSON.stringify({
    version: 1,
    settings: { nickname: '导入的用户', themeColor: '#123456', darkMode: false },
    today: [], work: { projects: [], tasks: [] },
    fitness: { templates: [], checkins: [], body: [] },
    diet: { targetKcal: 1800, foods: [], days: {} }, memo: [],
  });
  let done = await Settings.requestImport(payload);
  H.eq(done, true, '应返回 true');
  H.eq(Store.data.settings.nickname, '导入的用户', '数据应被替换');
});
H.test('requestImport：确认后导入非法 JSON 应拒绝且数据不变', async function () {
  reset();
  Store.data.today.push({ id: 'keep', date: '2026-08-17', text: '保留', done: false, createdAt: '' });
  Store.save();
  confirmAnswer = true;
  let rejected = false;
  try { await Settings.requestImport('{bad json'); } catch (e) { rejected = true; }
  H.ok(rejected, '非法 JSON 应导致 promise 拒绝');
  H.eq(Store.data.today.length, 1, '导入失败数据应保持不变');
});
H.test('requestImport：用户取消（二次确认 false）不导入', async function () {
  reset();
  confirmAnswer = false;
  const before = Store.data.today.length;
  let done = await Settings.requestImport(JSON.stringify({
    version: 1, settings: { nickname: 'x', themeColor: '#000', darkMode: false },
    today: [{ id: 'a', date: '2026-08-17', text: 'a', done: false, createdAt: '' }],
    work: { projects: [], tasks: [] }, fitness: { templates: [], checkins: [], body: [] },
    diet: { targetKcal: null, foods: [], days: {} }, memo: [],
  }));
  H.eq(done, false, '取消应返回 false');
  H.eq(Store.data.today.length, before, '取消后数据不应变化');
});
H.test('requestClear：确认后清空', async function () {
  reset();
  Store.data.today.push({ id: 't', date: '2026-08-17', text: 'x', done: false, createdAt: '' });
  Store.save();
  confirmAnswer = true;
  let done = await Settings.requestClear();
  H.eq(done, true, '应返回 true');
  H.eq(Store.data.today.length, 0, '清空后应为空');
});
H.test('requestClear：取消（危险二次确认 false）不清空', async function () {
  reset();
  Store.data.today.push({ id: 't', date: '2026-08-17', text: 'x', done: false, createdAt: '' });
  Store.save();
  confirmAnswer = false;
  let done = await Settings.requestClear();
  H.eq(done, false, '应返回 false');
  H.eq(Store.data.today.length, 1, '取消后不应清空');
});

H.section('设置页渲染');
H.test('build 含昵称值、主题色控件、备份按钮与关于', function () {
  reset();
  Store.data.settings.nickname = '阿明';
  const html = Settings.build();
  H.includes(html, 'value="阿明"', '应回显昵称');
  H.includes(html, 'id="set-color"', '应包含主题色控件');
  H.includes(html, 'id="set-export"', '应包含导出按钮');
  H.includes(html, 'id="set-import"', '应包含导入按钮');
  H.includes(html, 'id="set-clear"', '应包含清空按钮');
  H.includes(html, '单机版', '应包含关于说明');
});

H.finish().then(function (ok) { process.exit(ok ? 0 : 1); });
