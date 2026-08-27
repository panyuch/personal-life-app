# 01: 设置结构迁移（数据层）

**What to build:** 让「数据与设置」的底层能持久化「界面风格」选择：设置结构新增 `theme` 字段（白名单 `brutal | editorial | neumorph | gradient | cyber`，默认 `brutal`），移除旧的 `themeColor` 主题色字段。旧数据打开时平滑迁移——主题色被丢弃、`theme` 缺失或非法时回落 `brutal`、`darkMode` 原样保留。用户侧：升级后其余数据不丢，只是不再有主题色。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 设置结构含 `nickname / theme / darkMode`，`theme` 默认 `brutal`，不再含 `themeColor`
- [x] `theme` 白名单校验：非法值回落 `brutal`
- [x] 旧数据迁移：含 `themeColor` 的旧结构打开不报错，主题色被丢弃、`theme` 回落 `brutal`、`darkMode` 保留
- [x] 备份导入/导出包含 `theme` 与 `darkMode`
- [x] 迁移相关测试更新并跑绿

> 来源：spec `theming`（设置结构迁移 + 数据模型决策）。

## Answer

T01 已落成。要点：

- `js/store.js` 新增 `THEMES` 白名单（`brutal | editorial | neumorph | gradient | cyber`）与 `normalizeTheme()`；`defaultData()` 的 settings 改为 `{ nickname, theme, darkMode }`（`theme` 默认 `brutal`）。
- `normalize()` 不再读取 `themeColor`（旧字段被丢弃）；`theme` 缺失或非法回落 `brutal`；`darkMode` 原样保留。
- 备份导入/导出走既有 `Store.export/import` 整体序列化，自动包含 `theme` 与 `darkMode`。
- 测试：`theming.test.js` 新增 5 项迁移用例（旧数据丢弃 themeColor / 缺 theme / 非法 theme / 合法保留 / 备份往返）；`phase0` / `phase1` / `acceptance` 旧断言同步更新。

