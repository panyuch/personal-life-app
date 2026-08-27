# 图表渲染走 adapter 缝（移除 vendored ECharts）

为让图表渲染与具体绘图库解耦、可测，并回归项目"离线零依赖"的既定约束，决定将体重趋势图渲染藏在一条 `Chart` adapter 缝后（`W.Chart.renderWeightTrend(dom, {dates, weights})` 与 `dispose()`）。分两阶段落地：T1 先以 vendored ECharts 作为实现抽出缝并补测试；T2 换成原生 SVG 实现，删除 `js/vendor/echarts.min.js` 与 `index.html` 的 script 标签，彻底回归零依赖。适配器自管 resize 监听（render 时 bind、dispose 时 unbind），从结构上修复 BUG-004 的全局监听泄漏。

**Status**: accepted

**Considered Options**
- 保留 vendored ECharts 且不抽缝：零改动，但耦合依旧、renderChart 在 Node 下零测试覆盖、与《开发计划》"图表零依赖、原生 SVG 手绘"声明冲突 —— 否决。
- 直接原生 SVG 重写并删除 ECharts：最贴合约束，但一次性改动大、回退成本高 —— 不首选。
- 两步法（先抽缝保留 ECharts，再换 SVG 删依赖）：兼顾低风险快赢与最终零依赖 —— 采纳。

**Consequences**
- `fitness.js` 删除约 70 行图表 plumbing（getThemeColor/isDark/hexToRgba/renderChart/disposeChart/onResize/bindResize/unbindResize），只依赖 `W.Chart` 接口，不再直接引用 `W.echarts`。
- 测试可注入假 `Chart` 断言传参，突破此前 Node 下零覆盖。
- 图表生命周期自管，不依赖候选 #4（视图生命周期 seam）；将来 #4 落地只需在视图 unmount 多调一次 `Chart.dispose`。
- 未来新增图表只需在 `W.Chart` 上加方法，业务模块不动。

**References**: ADR-0001（v1.1 领域简化，不重开）；架构保养报告 `architecture-review-20260827-222024.html` 候选 #1。
