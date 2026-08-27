# 01: 侧边栏导航图标（全站骨架）

**What to build:** 让「首页总览」及全站六个页面的侧边栏导航项都带图标，图标与文字同行排列、当前页高亮不受影响。从使用者视角：打开任一页面，左侧导航每个入口都显示对应图标，视觉与风格原型一致。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 六个导航项（首页总览 / 今日计划 / 工作计划 / 健身计划 / 饮食计划 / 数据与设置）各显示对应图标
- [x] 图标与文字同行、间距对齐风格原型
- [x] 当前页高亮样式不受图标影响
- [x] 五套界面风格下图标清晰可见、不遮挡文字

## Answer

工单 01 已落成。要点：

- `index.html`：六个导航 `<a>` 各加 `<span class="nav-ico">图标</span>`（◉ 首页总览 / ☐ 今日计划 / ▤ 工作计划 / ◍ 健身计划 / ◔ 饮食计划 / ◈ 数据与设置），与风格原型一致。
- `assets/styles.css`：`#sidebar nav a` 增加 `display:flex; align-items:center; gap:11px`，新增 `.nav-ico`（固定 20px 宽、居中、15px、line-height:1），保证图标与文字同行且间距对齐原型。
- 当前页高亮沿用既有 `a.active` 类（由 `Router.highlight` 切换），图标 `<span>` 继承文字颜色，不新增高亮逻辑、不影响既有皮肤。
- 测试：`tests/acceptance.test.js` 新增「侧边栏导航图标」两用例（六导航项各含对应图标 + `.nav-ico` 定义 + 导航 flex 同行），全量 `node tests/run-all.js` 146 项全绿、无回归。
