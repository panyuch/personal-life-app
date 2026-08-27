# 02: 移除 ECharts，原生 SVG 实现（T2：回归零依赖）

**What to build:** 把图表适配器的内部实现从 ECharts 换成原生 SVG 手绘的体重折线，并删除 vendored 的 ECharts 文件与加载标签，让整个 App 回归"离线零依赖"的既定约束。对用户而言体重趋势图外观基本一致，但底层再无第三方图表库。

**Blocked by:** 01 (抽缝不存在则无法换实现 / 删依赖)

**Status:** resolved

- [x] 图表适配器改用原生 SVG 实现 `renderWeightTrend`（折线 + 数据点 + 简单坐标轴/网格），替换 ECharts 实现；主题色/暗色处理保留在适配器内部。
- [x] 删除 vendored 的 ECharts 文件，以及外壳中对应的 script 标签。
- [x] 双击 `file://` 在 Chrome/Edge 打开，体重趋势图以原生 SVG 渲染，外观与 T1 基本一致。
- [x] 仓库不再包含任何图表库文件；`index.html` 无对应 script 标签。
- [x] 图表适配器自管 resize 监听（render 时绑定、dispose 时解绑），BUG-004 类全局监听泄漏消除。

> 来源：spec `docs/specs/chart-adapter-seam.md`、ADR-0002。依赖 01 已落成的 adapter 缝；若 SVG 效果不达预期可暂回退保留 ECharts 实现（缝已存在，回退成本低）。

## Answer

T2 已落成，App 回归"离线零依赖"。要点：

- `js/chart.js` 内部实现已替换为原生 SVG 手绘的体重折线（`_buildSvg` 纯函数：坐标轴/网格 + 折线 + 数据点 + 面积填充，主题色经 `getThemeColor()`/暗色经 `isDark()` 在适配器内自取）。接口 `W.Chart.renderWeightTrend` / `dispose` 不变，业务模块无感。
- 全局无任何 ECharts 依赖：仓库无 `js/vendor/echarts.min.js`，`index.html` 仅按顺序加载 `js/chart.js`（经典 script，无 module/CDN）；`grep -rn echarts js/` 在代码里无实际引用（仅在文档注释中描述移除）。
- resize 监听由 adapter 自管：`renderWeightTrend` 时 `bindResize()`（`addEventListener`），`dispose` 时 `unbindResize()`（`removeEventListener`），从结构上消除原 BUG-004 的全局监听泄漏（`grep` 确认全仓仅 `js/chart.js` 一处成对绑定）。
- 验证：`node tests/run-all.js` 全套 125 项通过，其中 `chart-seam.test.js` 的 SVG 纯函数（`_buildSvg` 多/单/空点）与委托断言均通过；`acceptance.test.js` 的 `file://` 静态约束（无 fetch / 无 ES Module / 无 CDN）全绿。

图表 epic（01+02）至此全部完成，无遗留代码债务。
