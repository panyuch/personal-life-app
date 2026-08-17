/*
 * router.js — 基于 hash 的路由（全局 Router）
 * hash 形式：#/home #/today #/work #/fitness #/diet #/settings
 */
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : globalThis;

  var routes = {};        // 名称 -> render(viewEl, topbar)
  var titles = {};        // 名称 -> 标题

  function register(name, fn, title) {
    routes[name] = fn;
    if (title) titles[name] = title;
  }

  function parse() {
    var h = (W.location && W.location.hash) || '';
    var m = h.match(/^#\/(\w[\w-]*)/);
    return m ? m[1] : 'home';
  }

  function currentName() {
    var n = parse();
    return routes[n] ? n : 'home';
  }

  function highlight(name) {
    var d = W.document;
    if (!d) return;
    var links = d.querySelectorAll ? d.querySelectorAll('a[data-route]') : [];
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      if (el.getAttribute && el.getAttribute('data-route') === name) {
        if (el.classList) el.classList.add('active');
      } else {
        if (el.classList) el.classList.remove('active');
      }
    }
  }

  function renderCurrent() {
    var name = currentName();
    var d = W.document;
    var viewEl = d && d.getElementById ? d.getElementById('view') : null;
    var topbar = d && d.getElementById ? d.getElementById('topbar') : null;
    var fn = routes[name] || routes.home;
    if (fn) fn(viewEl, topbar);
    highlight(name);
    return name;
  }

  function start() {
    if (!W.location.hash) W.location.hash = '#/home';
    renderCurrent();
    W.onhashchange = renderCurrent;
  }

  function reload() { return renderCurrent(); }

  var Router = {
    register: register,
    parse: parse,
    currentName: currentName,
    render: renderCurrent,
    start: start,
    reload: reload,
    routes: routes,
    titles: titles,
  };

  W.Router = Router;
  if (typeof module !== 'undefined' && module.exports) module.exports = Router;
})();
