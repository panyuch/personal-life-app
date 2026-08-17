/*
 * settings.js — 数据与设置（阶段1）
 * 设置：昵称 / 主题色 / 深色开关，改动即时保存 + applyTheme。
 * 数据：导出备份 / 导入恢复（二次确认）/ 清空（危险二次确认）/ 关于。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;
  var UI = W.UI;
  var Store = W.Store;

  var PRESET_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9', '#64748b'];

  // ——— 数据操作（被 UI 事件调用）———
  function setNickname(v) {
    Store.data.settings.nickname = String(v == null ? '' : v).trim();
    Store.save();
    return Store.data.settings.nickname;
  }
  function setThemeColor(v) {
    if (v) Store.data.settings.themeColor = v;
    Store.save();
    if (UI && UI.applyTheme) UI.applyTheme();
    return Store.data.settings.themeColor;
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
    var swatches = PRESET_COLORS.map(function (c) {
      var active = (c === s.themeColor) ? ' active' : '';
      return '<button class="swatch' + active + '" data-color="' + c + '" style="background:' + c + '"></button>';
    }).join('');

    var html = '';
    html += '<div class="card" style="max-width:560px">';
    html += '<h3>基础设置</h3>';

    html += '<label class="field"><span>昵称</span>';
    html += '<input type="text" id="set-nickname" value="' + UI.escapeHtml(s.nickname) + '" placeholder="给自己起个名字" /></label>';

    html += '<div class="field"><span>主题色</span><div class="swatches">' + swatches + '</div>';
    html += '<input type="color" id="set-color" value="' + UI.escapeHtml(s.themeColor) + '" /></div>';

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
    if (nick) nick.addEventListener('input', function () {
      setNickname(nick.value);
      if (UI && UI.toast) UI.toast('昵称已保存', 'success');
    });

    var color = viewEl.querySelector('#set-color');
    if (color) color.addEventListener('input', function () { setThemeColor(color.value); });

    var swatches = viewEl.querySelectorAll('.swatch');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].addEventListener('click', function () {
        var c = this.getAttribute('data-color');
        setThemeColor(c);
        Router_rerender();
      });
    }

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
    PRESET_COLORS: PRESET_COLORS,
    setNickname: setNickname,
    setThemeColor: setThemeColor,
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
