# 03: 变量统一 --accent + 野兽派首套皮肤（亮+暗）+ 外壳加载

**What to build:** 落地第一套皮肤——野兽派（亮色 cream 底 + 粗黑边 + 橙 accent + 硬阴影 + 零圆角；暗色版「沥青黑 + 荧光橙」），并把全仓主题色变量统一为 `--accent`，由外壳加载独立的主题样式文件。用户侧：**首个端到端可见切片**——默认打开即野兽派亮色，开深色变沥青黑 + 荧光橙。

**Blocked by:** 02（主题引擎改造）

**Status:** resolved

- [x] 新增独立主题样式文件并由外壳加载（不影响既有业务样式）
- [x] 野兽派亮色渲染正确：cream 底、粗黑边、橙 accent、硬阴影、零圆角
- [x] 野兽派暗色渲染正确：沥青黑底 + 荧光橙（深色开启时）
- [x] 全仓主题色变量统一为 `--accent`，旧主题色变量引用清零（宽重构：本票内一次收口）
- [x] 默认风格（野兽派）在 App 核心组件（首页卡片 / 侧边栏 / 顶栏 / 按钮）上视觉正确

> 来源：spec `theming`（皮肤实现 + 变量统一 + 视觉方向：野兽派 = 沥青黑 + 荧光橙）。

## Answer

T03 已落成。要点：

- 新增 `assets/themes.css`（独立皮肤文件，与业务样式分离），`index.html` 在 `styles.css` 之后加载。
- 野兽派 `body[data-skin="brutal"]`：cream 底 + 3px 粗黑边 + 橙 `#ff4d00` accent + `7px 7px 0` 硬阴影 + 零圆角 + 等宽字体；暗色 `body[data-skin="brutal"][data-theme="dark"]`：沥青黑底 + 荧光橙。
- `assets/styles.css` 全仓 `--theme-color` → `--accent`（`:root` 兜底值保留），删除原 `body[data-theme="dark"]` 全局暗色变量块（暗色改由各皮肤负责）；`.cal-part` 硬编码深色改为 `var(--text)` 保证暗色可读。
- `grep` 确认 js/ 与 css 中旧主题色变量引用清零（仅文档注释描述移除）。
