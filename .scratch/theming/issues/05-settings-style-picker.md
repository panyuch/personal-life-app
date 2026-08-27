# 05: 设置界面「界面风格」选择器

**What to build:** 在「数据与设置」新增「界面风格」选择器：5 张缩略图卡片（风格名 + 微缩配色/质感预览，恒显示亮色版、单选、当前高亮），点击即时整套换肤并 toast「已切换至 X」；删除主题色色块与取色器；深色开关保留为独立开关（切换风格时明/暗状态保持不变）。用户侧：在设置页点卡片即可切换皮肤并持久化。

**Blocked by:** 04（其余 4 套皮肤）

**Status:** resolved

- [x] 设置页展示 5 张缩略图卡片，当前风格高亮
- [x] 点击卡片即时切换全 App 皮肤并持久化
- [x] 切换后出现 toast「已切换至 X」
- [x] 主题色色块与取色器已删除
- [x] 深色开关保留为独立开关，切换风格时明/暗状态保持
- [x] 新增 `setTheme` 设置函数及其测试，跑绿

> 来源：spec `theming`（设置界面 + 选择器形态 / 反馈决策）。

## Answer

T05 已落成。要点：

- `js/settings.js`：删除 `PRESET_COLORS` / `setThemeColor` / 色块 / 取色器；新增 `SKINS` 清单（5 套风格名 + 恒亮色版缩略图内联样式）与 `setTheme(key)`（白名单校验，非法键忽略；合法则写库 + 持久化 + `applyTheme`）。
- 设置页「基础设置」新增「界面风格」卡片：5 张缩略图（`.skin-card`，当前高亮、恒显亮色版），点击即时换肤 + toast「已切换至 风格名」+ 重渲染；深色开关保留为独立开关。
- `assets/styles.css` 新增 `.skin-grid / .skin-card / .skin-thumb / .skin-name` 基础样式。
- 测试：`phase1` 的 setTheme 用例（保存 + 持久化 + 应用 + 白名单）、build 用例（5 卡片 + 高亮 + 无主题色控件）；`theming.test.js` 增补 setTheme 与选择器渲染用例。
