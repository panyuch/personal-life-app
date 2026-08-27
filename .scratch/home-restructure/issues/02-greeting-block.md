# 02: 问候条独立区块 + 动态待办文案

**What to build:** 首页顶部的问候从「卡片内」改为独立区块：大标题显示时段问候 + 昵称，副文案动态显示「今天有 N 件待办，保持节奏。」（N = 今日未完成待办数），N 为 0 时显示鼓励文案。从使用者视角：打开首页，顶部是一条独立的问候区块，副文案实时反映当天待办量。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 问候条为独立区块（非卡片），视觉与风格原型一致
- [x] 大标题按时段（早上好 / 下午好 / 晚上好）+ 昵称
- [x] 副文案动态反映今日未完成待办数
- [x] 无待办时显示鼓励文案
- [x] 编辑杂志风格下问候标题仍为衬线大标题

## Answer

工单 02 已落成。要点：

- `js/home.js`：问候从 `<div class="card greet">` 改为独立区块 `<div id="greeting">`（`<p class="hello">` 大标题 + `<p class="sub">` 副文案）。标题 = 时段问候 + 昵称（昵称用 `<em>` 包裹，供编辑杂志风做斜体/主色强调）；新增 `greetingSub(n)`：N>0 显示「今天有 N 件待办，保持节奏。」，N=0 显示「今天没有待办，放松一下，或规划明天吧。」；N 取 `todayIncomplete(date).length`（今日未完成待办数）。旧问候里的日期已移除（日期仍在顶栏 `#page-date` 显示）。
- `assets/styles.css`：新增 `#greeting` / `.hello` / `.sub` 基础布局样式（与一次性风格原型共享布局一致，颜色/字体走 CSS 变量）。
- `assets/themes.css`：把编辑杂志风的 `body[data-skin="editorial"] .card.greet h2` 规则替换为 `#greeting .hello`（衬线 40px 大标题）+ `#greeting .hello em`（斜体主色）+ `#greeting .sub`（小号大写字距），满足「编辑杂志风问候标题仍为衬线大标题」。
- `tests/phase6.test.js`：更新问候断言为 `早上好，<em>阿明</em>`；新增「独立区块 + 副文案反映未完成数」「无待办鼓励文案」两用例。全量测试 **148 项通过，0 失败**。
