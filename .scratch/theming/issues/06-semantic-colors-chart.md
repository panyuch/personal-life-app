# 06: 部位色主题化 + 图表明暗自适应 + 回归

**What to build:** 让"数据相关颜色"也随皮肤自适应——训练部位色（胸/肩/背/腿/有氧）按风格主题化（5 套各一套，暗色版沿用同风格并微调亮度保证暗底可读）；体重趋势图在暗色风格 / 深色模式下坐标轴与线条仍清晰可读（明暗判断 = 皮肤为暗色 或 深色开启，主色读取当前皮肤 accent）。用户侧：各风格下部位信息与图表都协调清晰。收尾跑全套测试回归。

**Blocked by:** 04（其余 4 套皮肤）

**Status:** resolved

- [x] 训练部位色在 5 套风格下各自协调可读（暗色版沿用 + 亮度微调）
- [x] 图表明暗判断随「皮肤为暗色 或 深色开启」自适应
- [x] 图表主色随当前皮肤 accent 变化，替换写死的主题色
- [x] 更新既有断言 + 新增主题切换（含每套暗色版）用例
- [x] 全套测试（含新增）回归绿

> 来源：spec `theming`（语义色主题化 + 图表适配 + 测试决策）。

## Answer

T06 已落成。要点：

- 部位色主题化：`assets/themes.css` 每套皮肤定义 `--part-chest / --part-shoulder / --part-back / --part-leg / --part-cardio`（5 套亮色 + 4 套暗色各一套，暗色版沿用同风格并提亮保证暗底可读）；`js/fitness.js` 新增 `getPartColor(part)`（优先读 CSS 变量，Node/降级环境回落兜底色表），`detail-part` 改用它。
- 图表适配：`js/chart.js` 主色改读 `--accent`（当前皮肤 accent）；明暗判断改为「`data-theme="dark"` 或 `data-skin="cyber"`（恒暗）」。
- 测试：`theming.test.js` 新增 7 项（部位色 CSS 变量 / 兜底、图表 cyber 暗色 / 深色暗色 / 亮色 / 主色随 accent）；全套 `tests/run-all.js` 143 项通过，0 失败。

theming epic（01–06）至此全部完成，无遗留代码债务。
