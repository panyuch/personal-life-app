/*
 * settings.js — 数据与设置（阶段1）
 * 设置：昵称 / 界面风格（5 套皮肤）/ 深色开关，改动即时保存 + applyTheme。
 * 数据：导出备份 / 导入恢复（二次确认）/ 清空（危险二次确认）/ 关于。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  // 界面风格清单（顺序即展示顺序；键与 Store.THEMES 白名单一致）
  // thumb：缩略图恒显亮色版（内联样式固定亮色，不随深色开关跳变）
  var SKINS = [
    { key: 'brutal', name: '野兽派', css: 'background:#efece3;border:3px solid #111;box-shadow:4px 4px 0 #111;', dot: 'background:#ff4d00;' },
    { key: 'editorial', name: '编辑杂志风', css: 'background:#faf8f4;border-top:3px solid #171512;border-bottom:1px solid #171512;', dot: 'background:#a31f1f;' },
    { key: 'neumorph', name: '新拟物派', css: 'background:#e4e9f1;box-shadow:inset 3px 3px 6px #c3cad6,inset -3px -3px 6px #fff;', dot: 'background:#6c63ff;border-radius:8px;' },
    { key: 'gradient', name: '现代渐变风', css: 'background:linear-gradient(135deg,#ffe3f1,#d7e4ff);', dot: 'background:linear-gradient(135deg,#6d5df6,#c86dd7);border-radius:8px;' },
    { key: 'cyber', name: '赛博朋克风', css: 'background:#08070f;border:1px solid #00e5ff;', dot: 'background:#ff2bd6;' },
  ];

  // ——— 数据操作（被 UI 事件调用）———
  function setNickname(v) {
    Store.data.settings.nickname = String(v == null ? '' : v).trim();
    Store.save();
    return Store.data.settings.nickname;
  }
  function setTheme(key) {
    // 白名单校验：非法键忽略（不落库）；合法则写库 + 持久化 + 应用主题
    if ((Store.THEMES || []).indexOf(key) === -1) return Store.data.settings.theme;
    Store.data.settings.theme = key;
    Store.save();
    if (UI && UI.applyTheme) UI.applyTheme();
    return Store.data.settings.theme;
  }
  function setDarkMode(on) {
    Store.data.settings.darkMode = !!on;
    Store.save();
    if (UI && UI.applyTheme) UI.applyTheme();
    return Store.data.settings.darkMode;
  }
  function clearAll() {
    Store.clear();
    if (UI && UI.applyTheme) UI.applyTheme();
    return true;
  }

  // 导出：返回 { filename, content }，浏览器端再做下载
  function exportBackup() {
    var date = UI.todayStr();
    return { filename: 'life-app-backup-' + date + '.json', content: Store.export() };
  }

  // 浏览器下载 JSON
  function downloadJSON(filename, text) {
    try {
      var blob = new W.Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = W.document.createElement('a');
      a.href = url; a.download = filename;
      W.document.body.appendChild(a); a.click();
      W.document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  // ——— 二次确认包装（导入/清空）———
  function requestImport(jsonStr) {
    return UI.confirm({
      title: '导入备份',
      message: '导入将覆盖当前全部数据，确定继续吗？',
    }).then(function (ok) {
      if (!ok) return false;
      Store.import(jsonStr); // 校验失败会抛错，调用方需 try/catch
      if (UI && UI.applyTheme) UI.applyTheme();
      return true;
    });
  }
  function requestClear() {
    return UI.confirm({
      title: '清空全部数据',
      message: '此操作不可恢复！建议先导出备份。确定要清空吗？',
      danger: true,
    }).then(function (ok) {
      if (!ok) return false;
      return clearAll();
    });
  }

  // ——— 渲染 ———
  function build() {
    var s = Store.data.settings;
    var skinCards = SKINS.map(function (k) {
      var active = (k.key === s.theme) ? ' active' : '';
      return '<button type="button" class="skin-card' + active + '" data-skin="' + k.key + '" data-name="' + UI.escapeHtml(k.name) + '">' +
        '<span class="skin-thumb" style="' + k.css + '"><i style="' + k.dot + '"></i></span>' +
        '<span class="skin-name">' + UI.escapeHtml(k.name) + '</span>' +
        '</button>';
    }).join('');

    var html = '';
    html += '<div class="card" style="max-width:560px">';
    html += '<h3>基础设置</h3>';

    html += '<label class="field"><span>昵称</span>';
    html += '<input type="text" id="set-nickname" value="' + UI.escapeHtml(s.nickname) + '" placeholder="给自己起个名字" /></label>';

    html += '<div class="field"><span>界面风格</span>';
    html += '<div class="skin-grid" id="skin-grid">' + skinCards + '</div>';
    html += '<p class="card-sub">选择后整个 App 立即换肤并自动保存；开启深色模式后当前风格显示其专属暗色版。</p></div>';

    html += '<label class="field row"><span>深色模式</span>';
    html += '<input type="checkbox" id="set-dark"' + (s.darkMode ? ' checked' : '') + ' /></label>';

    html += '</div>';

    html += '<div class="card" style="max-width:560px">';
    html += '<h3>数据与备份</h3>';
    html += '<p class="card-sub">数据保存在本机浏览器，换浏览器或清理缓存会丢失；备份文件是防丢的唯一手段。</p>';
    html += '<div class="actions">';
    html += '<button class="btn btn-primary" id="set-export">导出备份</button> ';
    html += '<button class="btn" id="set-import">导入恢复</button> ';
    html += '<button class="btn btn-danger" id="set-clear">清空数据</button>';
    html += '</div>';
    html += '<input type="file" id="set-import-file" accept="application/json,.json" style="display:none" />';
    html += '</div>';

    html += '<div class="card" style="max-width:560px">';
    html += '<h3>关于</h3>';
    html += '<p class="card-sub">个人工作生活专属 App · 单机版 v1.0<br/>纯本地运行，不联网、不登录、不上云。</p>';
    html += '</div>';

    return html;
  }

  function render(viewEl, topbar) {
    if (topbar) {
      var t = topbar.querySelector('#page-title'); if (t) t.textContent = '数据与设置';
      var p = topbar.querySelector('#primary-btn'); if (p) { p.textContent = ''; p.style.display = 'none'; }
    }
    if (!viewEl) return;
    viewEl.innerHTML = build();

    var nick = viewEl.querySelector('#set-nickname');
    // 使用 change（失焦/回车后触发一次），避免逐字符输入时反复弹 toast
    if (nick) nick.addEventListener('change', function () {
      setNickname(nick.value);
      if (UI && UI.toast) UI.toast('昵称已保存', 'success');
    });

    // 界面风格卡片：点击即时换肤 + 持久化 + toast
    var skinGrid = viewEl.querySelector('#skin-grid');
    if (skinGrid) skinGrid.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.skin-card') : null;
      if (!card) return;
      var key = card.getAttribute('data-skin');
      var name = card.getAttribute('data-name') || key;
      var applied = setTheme(key);
      if (applied !== key) return; // 非法键被忽略
      if (UI && UI.toast) UI.toast('已切换至 ' + name, 'success');
      Router_rerender();
    });

    var dark = viewEl.querySelector('#set-dark');
    if (dark) dark.addEventListener('change', function () {
      setDarkMode(dark.checked);
    });

    var exp = viewEl.querySelector('#set-export');
    if (exp) exp.addEventListener('click', function () {
      var r = exportBackup();
      downloadJSON(r.filename, r.content);
      if (UI && UI.toast) UI.toast('已导出备份', 'success');
    });

    var imp = viewEl.querySelector('#set-import');
    var impFile = viewEl.querySelector('#set-import-file');
    if (imp && impFile) imp.addEventListener('click', function () { impFile.click(); });
    if (impFile) impFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new W.FileReader();
      reader.onload = function () {
        requestImport(String(reader.result)).then(function (done) {
          if (done) { if (UI && UI.toast) UI.toast('导入成功', 'success'); Router_rerender(); }
          else if (UI && UI.toast) UI.toast('已取消导入', 'info');
        }).catch(function () {
          if (UI && UI.toast) UI.toast('导入失败：文件不合法', 'error');
        });
      };
      reader.readAsText(file);
    });

    var clr = viewEl.querySelector('#set-clear');
    if (clr) clr.addEventListener('click', function () {
      requestClear().then(function (done) {
        if (done) { if (UI && UI.toast) UI.toast('已清空全部数据', 'success'); Router_rerender(); }
        else if (UI && UI.toast) UI.toast('已取消清空', 'info');
      });
    });
  }

  function Router_rerender() { if (W.Router) W.Router.reload(); }

  var Settings = {
    SKINS: SKINS,
    setNickname: setNickname,
    setTheme: setTheme,
    setDarkMode: setDarkMode,
    clearAll: clearAll,
    exportBackup: exportBackup,
    downloadJSON: downloadJSON,
    requestImport: requestImport,
    requestClear: requestClear,
    build: build,
    render: render,
  };

  W.Settings = Settings;
  if (W.Router) W.Router.register('settings', render, '数据与设置');
  if (typeof module !== 'undefined' && module.exports) module.exports = Settings;
})();
