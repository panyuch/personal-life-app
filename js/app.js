/*
 * app.js — 入口（最后加载）
 * 初始化 Store、应用主题、启动路由。各视图模块在加载时已通过 Router.register 注册。
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;

  function boot() {
    W.Store.load();
    if (W.UI && W.UI.applyTheme) W.UI.applyTheme();
    if (W.Router && W.Router.start) W.Router.start();
  }

  if (W.document && (W.document.readyState === 'loading')) {
    W.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { boot: boot };
})();
