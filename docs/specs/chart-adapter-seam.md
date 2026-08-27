# Spec: 图表渲染 adapter 缝（候选 #1）

> 来源：`improve-codebase-architecture` → 候选 #1（Strong）→ Grilling 第 1–2 轮收敛 → ADR-0002。
> 状态：spec 已定稿，待拆票进入实现（写代码前仍需一次明确 go-ahead）。
> 范围：本 spec 只描述设计与拆分，**不含 app 业务代码改动**。

## 背景与问题

`index.html:9` 直接 vendored 了约 1MB 的 `js/vendor/echarts.min.js`，但《开发计划》明令"图表零依赖、原生 SVG 手绘"。全仓搜证：ECharts 仅在 `js/fitness.js` 的 `renderChart` 使用（体重趋势折线），其余模块零图表。

具体摩擦（用 codebase-design 词汇）：
- **seam 缺失**：`fitness.js` 内含约 70 行图表 plumbing（`getThemeColor`/`isDark`/`hexToRgba`/`renderChart`/`disposeChart`/`onResize`/`bindResize`/`unbindResize`），直接依赖全局 `W.echarts`，把"取主题色 / hex→rgba / 暗色轴色 / resize 重绘"全耦合进健身 module。
- **depth 过浅 + locality 差**：图表逻辑散在 fitness，业务与绘图混杂。
- **leverage 低**：换实现 / 去依赖需改 fitness 内部。
- **测试为零**：`renderChart` 因 `W.echarts` 在 Node 下恒为 `undefined`，在测试基座中零覆盖。
- **BUG-004 根区**：`chart` 是 module 级可变单例，`resize` 用 `W.addEventListener('resize')` + 全局守卫 `__fitResizeBound` 手动配对，监听器泄漏隐患仍在。

## 目标

把"画体重趋势图"抽成一条 **adapter 缝**，让 fitness 只传数据、不认识绘图细节；最终移除 vendored ECharts，回归零依赖。

## 非目标 / 范围外

- 不重开 ADR-0001（v1.1 领域简化）。
- 不处理候选 #4（视图生命周期 seam）——本 adapter 自管生命周期，不与之耦合。
- 不新增其他图表类型（本期只覆盖体重趋势折线）；接口预留扩展。

## 设计

### 新增 `js/chart.js`（IIFE，挂全局 `W.Chart`）

接口契约（稳定，跨 T1/T2 不变）：
```js
W.Chart = {
  // dom: 容器元素；data: { dates: string[], weights: number[] }
  renderWeightTrend: function (dom, data) { /* ... */ },
  dispose: function () { /* 解绑 resize、销毁实例 */ }
};
```
- **主题 / 暗色**：由 adapter 内部自己读（`getThemeColor`/`isDark` 逻辑从 fitness 迁入），fitness 只传 `dates`/`weights`。
- **生命周期与 resize**：adapter 自管——`renderWeightTrend` 时 bind `window.resize`（重绘），`dispose` 时 unbind 并销毁实例。这从结构上消除 BUG-004 的全局监听泄漏。

### `fitness.js` 变动
- 删除全部图表 plumbing（约 70 行）：`getThemeColor`/`isDark`/`hexToRgba`/`renderChart`/`disposeChart`/`onResize`/`bindResize`/`unbindResize`。
- `renderChart(dom)` → `W.Chart.renderWeightTrend(dom, { dates: dates, weights: weights })`。
- `disposeChart()` → `W.Chart.dispose()`。
- `trendData()` 保留在 fitness：只负责把 `Store.data.fitness.body` 排序成 `dates`/`weights` 数组（数据准备与绘图分离）。

### `index.html` 变动
- T1：在 `ui.js` 之后、`router.js` 之前插入 `<script src="js/chart.js"></script>`。
- T2：删除 `<script src="js/vendor/echarts.min.js"></script>`（第 9 行）。

## 实施拆分

### T1（Strong 快赢 · 抽缝 + 补测试，暂保留 ECharts）
1. 新建 `js/chart.js`，实现 `W.Chart`（T1 内部用 ECharts）。
2. `fitness.js` 删除图表 plumbing，改调 `W.Chart.*`。
3. `index.html` 插入 `chart.js` 加载。
4. 新增测试：注入假 `W.Chart`，断言
   - 有数据时 fitness 调 `renderWeightTrend` 且传入 `dates`/`weights` 正确；
   - 无数据时跳过（不调用）；
   - 离开详情页（`renderDetail`）时调 `dispose`。
5. 验收：控制台无致命报错；体重图照常渲染；测试覆盖 chart 调用路径。

### T2（收尾 · 回归零依赖）
1. `js/chart.js` 新增原生 SVG 实现（折线 + 数据点 + 简单网格/坐标轴），由 `renderWeightTrend` 调用，移除 ECharts 依赖。
2. 删除 `js/vendor/echarts.min.js` 与 `index.html:9` 的 script 标签。
3. 验收：双击 `file://` 打开，体重趋势图仍以原生 SVG 渲染；仓库不再含 echarts。

## 测试策略
- 主收益在 seam：fitness 测试注入假 `W.Chart` 断言传参与调用时机，无需真实 echarts / 完整 DOM。
- T2 的 SVG 实现若需 DOM 断言，优先抽一个"纯函数：数据 → SVG 字符串"再测，避免 jsdom 依赖。

## 验收标准（总）
- [ ] `fitness.js` 不再直接引用 `W.echarts`；图表逻辑集中在 `js/chart.js`。
- [ ] 体重趋势图在 Chrome/Edge 双击 `file://` 正常渲染（T1 用 ECharts，T2 用 SVG）。
- [ ] 新增测试通过，chart 调用路径有覆盖。
- [ ] T2 完成后仓库无 `echarts.min.js`，`index.html` 无对应 script 标签。
- [ ] BUG-004 类全局监听泄漏消除（resize 由 adapter 在 dispose 时干净解绑）。

## 风险与回退
- T1 低风险（保留 ECharts）。T2 若 SVG 效果不达预期，可暂回退保留 ECharts 实现（缝已存在，回退成本低）——这正是两步法的价值。
- 不触碰业务数据模型，无数据迁移风险。

## 关联文档
- `docs/adr/0002-chart-adapter-seam.md`（本决策）
- `docs/adr/0001-v1.1-domain-simplifications.md`（不重开）
- `C:\Users\pyc\AppData\Local\Temp\architecture-review-20260827-222024.html`（保养报告候选 #1）
