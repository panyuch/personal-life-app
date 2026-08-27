# 变更日志 (CHANGELOG)

## v1.1.1 — 图表回归原生 SVG，离线零依赖（2026-08-28）

### 改动
- **移除 vendored ECharts**：删除 `js/vendor/echarts.min.js` 与 `index.html` 对应 `<script>` 标签，App 整体回归「离线零依赖」约束（《开发计划》明令「图表零依赖、原生 SVG 手绘」）。
- **新增图表 adapter 缝** `js/chart.js`：对外契约 `W.Chart = { renderWeightTrend(dom, { dates, weights }), dispose() }`。体重趋势改用原生 SVG 手绘（折线 + 数据点 + 网格/坐标轴 + 主题色/暗色自适应），业务模块只传数据、不认识绘图细节。
- **健身模块瘦身** `js/fitness.js`：删除约 70 行图表 plumbing（`getThemeColor` / `isDark` / `hexToRgba` / `renderChart` / `disposeChart` / `onResize` / `bindResize` / `unbindResize`），改为只委托 `W.Chart`，不再直接引用全局 `echarts`。
- **图表生命周期自管**：adapter 在 `renderWeightTrend` 时 `bind` `window.resize`、`dispose` 时 `unbind`，从结构上消除原 BUG-004 的全局监听泄漏（`grep` 确认全仓仅 `js/chart.js` 一处成对绑定）。

### 测试
- 新增 `tests/chart-seam.test.js`（6 项）：注入假 adapter 断言「有数据传参正确 / 无数据跳过 / 进详情页触发 dispose」，SVG 纯函数（多 / 单 / 空点）覆盖。
- 全套 `tests/run-all.js`：**125 项通过，0 失败**（含 `acceptance.test.js` 17 项零依赖 / 数据隔离 / 同源摘要验收）。

### 文档
- 纳入 v1.1 领域模型 `CONTEXT.md`、工程约定 `AGENTS.md`、架构文档 `docs/`（ADR-0001 领域简化、ADR-0002 图表缝、spec `chart-adapter-seam.md`）。
- 纳入图表 epic 工单 `.scratch/chart-adapter/issues/01`、`02`（均已 resolved）。

### 关联
- ADR-0002（图表 adapter 缝）、spec `docs/specs/chart-adapter-seam.md`、架构保养报告候选 #1。

---

## v1.1 — 领域简化版（基线）
- 按 ADR-0001 将 PRD v1.0 的「项目→任务」两级、「训练模板/打卡」模型简化为 v1.1 扁平模型（工作计划卡→工作内容、训练日程→训练部位+动作）。
- 6 个页面、4 个业务模块、首页聚合、localStorage 持久化、导入导出、主题色、深色模式全部落地。
- 6 个已知 Bug（BUG-001~006）全部修复，阶段测试 + 验收测试全绿。
