# 02: 主题引擎改造（applyTheme → data-skin / data-theme）

**What to build:** 把主题引擎的 `applyTheme()` 改成唯一的「设置 → 渲染」转换点：据 `theme`（风格键）与 `darkMode` 在 `<body>` 上写 `data-skin` 与 `data-theme="dark"`，不再写主题色变量。用户侧：内部状态能被正确映射为可被皮肤样式命中的 body 属性。

**Blocked by:** 01（设置结构迁移）

**Status:** resolved

- [x] `applyTheme` 把 `theme` 映射为 `body` 的 `data-skin`（风格键）
- [x] `applyTheme` 把 `darkMode` 映射为 `data-theme="dark"`（关时移除该属性）
- [x] 不再写入主题色变量
- [x] 更新相关 mock 与既有断言，测试跑绿

> 来源：spec `theming`（主题引擎 + 状态模型决策）。

## Answer

T02 已落成。要点：

- `js/ui.js` 的 `applyTheme()` 成为唯一「设置 → 渲染」转换点：`theme` → `body[data-skin]`（非法键回落 `brutal`），`darkMode` → `body[data-theme="dark"]`（关时移除）；不再写 `--theme-color` CSS 变量。
- `tests/harness.js` 的 document mock 增加 `data-skin` 记录（`_skin`），移除 `--theme-color` 写入钩子。
- 测试：`phase0` 的 applyTheme 用例改为断言 `data-skin` / `data-theme`；`theming.test.js` 新增 3 项引擎用例（skin 映射 / 深色开关 / 不再写主题色变量）。
