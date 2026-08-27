# 变更日志 (CHANGELOG)

## v1.2 — 多风格界面皮肤 + 深色模式（2026-08-28）

### 改动
- **新增「界面风格」体系**：5 套可切换皮肤（野兽派 / 编辑杂志风 / 新拟物派 / 现代渐变风 / 赛博朋克风），独立样式文件 `assets/themes.css`，外壳在业务样式之后加载。每套亮色风格附专属暗色版（深色开关为全局布尔，切风格不重置明/暗）；赛博朋克恒暗、深色开关对其无额外效果。
- **数据模型**：设置结构由 `{ nickname, themeColor, darkMode }` 改为 `{ nickname, theme, darkMode }`。旧数据打开时 `themeColor` 被丢弃、`theme` 缺失或非法回落默认 `brutal`、`darkMode` 保留；备份导入/导出自动包含 `theme` 与 `darkMode`。
- **主题引擎**：`applyTheme()` 成为唯一「设置 → 渲染」转换点，`theme` → `body[data-skin]`、`darkMode` → `body[data-theme="dark"]`，不再写主题色 CSS 变量。
- **变量统一**：全仓主题色变量 `--theme-color` → `--accent`（旧引用清零）；删除 styles.css 原全局深色变量块，暗色改由各皮肤负责。
- **设置界面**：删除主题色色块与取色器，新增「界面风格」选择器（5 张缩略图卡片，恒亮色版、当前高亮、点击即时换肤 + toast「已切换至 X」+ 自动保存）；新增 `setTheme()` 设置函数（白名单校验）。
- **语义色**：训练部位色（胸/肩/背/腿/有氧）按 5 套皮肤各一套主题化（CSS 变量 `--part-*`），暗色版沿用同风格并提亮保证可读。
- **图表适配**：体重趋势图主色随当前皮肤 `--accent`；明暗判断 = 「深色开启 或 皮肤为暗色（cyber）」。

### 测试
- 新增 `tests/theming.test.js`（17 项）：设置结构迁移（themeColor 丢弃 / 缺 theme / 非法 theme / 合法保留 / 备份往返）、applyTheme 映射、setTheme 白名单与持久化、风格选择器渲染、部位色 CSS 变量与兜底、图表 cyber 恒暗 / 深色 / 亮色 / 主色随 accent。
- 更新 `phase0` / `phase1` / `acceptance` 中依赖旧主题色的断言与 mock。
- 全套 `tests/run-all.js`：**143 项通过，0 失败**。

### 文档
- theming epic 工单 `.scratch/theming/issues/01`–`06` 全部 resolved；spec `.scratch/theming/spec.md` 标记完成。
- `CONTEXT.md` 术语表新增「界面风格（Skin）」「风格键（theme key）」词条。

### 迁移提示
- 老使用者升级后主题色丢失、外观变为默认野兽派（符合「不保留原版」决策）；其余数据不受影响。

### 关联
- theming spec `.scratch/theming/spec.md`（来源：throwaway 原型 + grilling 4 轮收敛）。

---

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
