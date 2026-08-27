# 个人生活 App — 领域模型（v1.1）

只给自己用的本机浏览器应用，把当天待办、工作、健身、饮食与个人备忘集中管理；数据存于浏览器 `localStorage`，离线、不登录、不上云。本文档是术语表（glossary），记录领域现状，不含实现细节。与 PRD v1.0 的分叉见 `docs/adr/0001-v1.1-domain-simplifications.md`。

## Language

### 通用 / App 级
**首页总览（Home）**：聚合各模块关键摘要的入口页，仅做"看"与轻操作（勾今日待办、记备忘）。
_Avoid_：仪表盘、Dashboard

**备忘（Memo）**：全局随手记条目 `{text, done}`，不按日期，独立于各业务模块。
_Avoid_：笔记、Note

**数据与设置（Settings）**：负责备份恢复、昵称/主题设置、清空全部数据的模块。
_Avoid_：设置页

### 今日计划
**今日计划（Today Plan）**：按日期的通用待办，记录与工作/健身/饮食无关的随手杂事；与三个专项模块数据隔离。
_Avoid_：待办、Todo

**今日待办项（Today Item）**：今日计划中的单条 `{date, text, done}`。

### 工作计划
**工作计划卡（Work Plan）**：工作计划模块的一张卡片，代表一个工作计划，含标题与若干"工作内容"。
_Avoid_：项目、Project（PRD v1.0 旧术语，已被扁平化取代）

**工作内容（Work Content）**：计划卡内的清单项 `{text, done}`，仅文本与完成态，无优先级、截止日或状态流转。
_Avoid_：任务、Task（PRD v1.0 旧术语）

### 健身计划
**训练日程（Training Schedule）**：以日期为键的训练安排；某天安排一个"训练部位"及 5 个固定动作。
_Avoid_：周训练计划（PRD §9 预留，未实现）

**训练部位（Body Part）**：胸 / 肩 / 背 / 腿 / 有氧 五选一，决定当天动作清单。
_Avoid_：训练模板（PRD v1.0 旧术语）

**训练动作（Exercise）**：训练部位下的一个动作 `{name, done}`，固定 5 个，可勾选完成。
_Avoid_：组次/次数(sets/reps)、打卡项（PRD v1.0 旧术语）

**身体数据（Body Metric）**：一次体重/体脂记录 `{date, weight, bodyFat?}`。
_Avoid_：体重记录

### 饮食计划
**食材（Food）**：食材库一条 `{name, per100g:{kcal,protein,carb,fat}}`，营养以每 100g 为基准。
_Avoid_：食物、Food item（PRD v1.0 旧术语，旧为整份绝对值）

**餐次（Meal）**：早餐 / 午餐 / 晚餐 / 加餐 四个固定餐次，不可增删。
_Avoid_：餐、meal 类型

**饮食记录条目（Diet Entry）**：某餐"吃了什么" `{foodId?, name, grams, nutrition:{kcal,protein,carb,fat}}`；营养由食材每 100g × 克数折算。
_Avoid_：食物项（PRD v1.0 旧术语）

**饮水（Water）**：当天饮水量 `waterMl`，独立于餐次。
_Avoid_：喝水记录

**当日汇总（Daily Summary）**：某天所有餐次记录条目的营养合计（热量 + 蛋白/碳水/脂肪 + 供能比）。
_Avoid_：营养汇总

### v1.1 不属本域（已明确排除，详见 ADR-0001）
- **每日目标热量（targetKcal）**：PRD §5.4/§9 标注"待确认"，v1.1 未实现。
- **训练模板 / 打卡（组次重）**：PRD §5.3 概念，v1.1 被"训练部位 + 动作"月历模型取代。
- **项目 → 任务 两级结构（含优先级/状态/截止日）**：PRD §5.2 概念，v1.1 被"计划卡 → 工作内容"扁平模型取代。
- **周训练计划总览**：PRD §9 预留，未实现。
