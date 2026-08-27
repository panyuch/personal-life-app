# 01: 抽出 Chart adapter 缝（T1：抽缝 + 补测试）

**What to build:** 体重趋势图照常用 ECharts 渲染，但绘图逻辑从健身模块迁入独立的图表适配器，让业务模块只传数据、不认识绘图细节。对用户而言图表外观与行为不变，但代码已解耦、可测，并为彻底去依赖铺好缝。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 新增独立图表模块，暴露 `renderWeightTrend(dom, { dates, weights })` 与 `dispose()` 两个接口（T1 内部以 ECharts 实现，主题色/暗色由适配器内部自己读）。
- [x] 健身模块删除全部图表 plumbing（约 70 行：取主题色 / hex→rgba / 暗色轴色 / renderChart / disposeChart / resize 绑定解绑），改为只调用图表适配器接口。
- [x] 外壳在 ui 之后、router 之前加载该图表模块。
- [x] 健身模块不再直接引用全局 echarts；体重趋势图在浏览器中照常渲染（T1 仍用 ECharts）。
- [x] 新增测试注入假图表适配器，断言：有数据时传入 dates/weights 正确、无数据时跳过调用、离开详情页时调用 dispose。
- [x] 控制台无致命报错；图表调用路径有测试覆盖。

> 来源：spec `docs/specs/chart-adapter-seam.md`、ADR-0002。仓库本阶段仍含 echarts.min.js，暂不动。

## Answer

T1 已落成。要点：

- `js/chart.js` 作为独立图表适配器，对外契约 `W.Chart = { renderWeightTrend(dom, {dates, weights}), dispose() }`，由 `index.html` 在 `js/ui.js` 之后、`js/router.js` 之前加载。
- `js/fitness.js` 删除了原约 70 行图表 plumbing，体重趋势改为委托 `W.Chart.renderWeightTrend`（有数据时）与 `W.Chart.dispose`（进入当日详情页 `renderDetail` 时），不再直接引用全局 `echarts`。
- `tests/chart-seam.test.js` 注入假 adapter 断言：有数据传入按日期升序的 `dates/weights`、无数据跳过调用、进入详情页触发 `dispose` 均通过。
- 验证：`node tests/run-all.js` 全套 125 项通过（含 chart-seam 6 项），控制台无致命报错。

（注：T2 已在本仓库实际以原生 SVG 实现并移除 ECharts，见 02 工单。）
