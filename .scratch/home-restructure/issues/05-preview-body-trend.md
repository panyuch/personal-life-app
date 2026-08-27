# 05: 核心模块预览·身体趋势卡（W.Chart + 宏量条）

**What to build:** 首页预览区新增「身体数据趋势」卡：按日期排序的体重折线（委托既有图表适配器绘制）+ 蛋白 / 碳水 / 脂肪三条宏量条；无身体数据时显示空态；整卡点击进入健身计划。从使用者视角：在首页即可看到体重趋势与今日宏量摄入概况。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 体重折线委托图表适配器绘制（注入假件可断言传参 `dates` / `weights`）
- [x] 宏量条显示蛋白 / 碳水 / 脂肪当日值
- [x] 无身体数据时显示空态、不绘图
- [x] 整卡点击进入健身计划

## Answer

工单 05 已落成。要点：

- `js/home.js` `buildPreviewBodyTrend(date)`：新增「身体数据 · 体重趋势」预览卡（`data-no="C"`，整卡 `<a class="card card-link-wrap preview-body" href="#/fitness">` 跳转健身计划）。有身体数据时输出折线容器 `<div class="body-chart" id="home-body-chart"></div>`，无数据时输出 `.preview-empty` 空态引导、不生成容器（天然不绘图）。
- 宏量条：`.macro-row` 内蛋白 / 碳水 / 脂肪三行 `.macro`（标签 + `.mbar > i` 轨道 + 克数），数值与 `W.Diet.dailySummary(date)` 同源；v1.1 无目标概念，宽度按三者相对最大比例呈现。
- 图表委托：`Home.bind()` 在渲染后查找 `#home-body-chart`，有容器且有 `W.Chart.renderWeightTrend` 时把 `Fitness.trendData()`（按日期升序）透传为 `{ dates, weights }`，与 fitness 模块的委托缝同模式；无数据时容器不存在、跳过调用。
- `assets/styles.css`：新增 `.body-chart` / `.macro-row` / `.macro` 基础布局样式（颜色走 CSS 变量）；各皮肤差异化留待工单 06。
- `tests/harness.js`：mockEl.querySelector 支持 `#home-body-chart`（供图表委托测试）。
- 测试：`phase6.test.js` 新增「核心模块预览（工单05）」三个用例（结构 + 宏量同源、假 Chart 注入断言 dates/weights 升序透传、空态不绘图）。全量 `node tests/run-all.js` **157 项通过，0 失败**，无回归。
