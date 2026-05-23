# PROJECT_INDEX

本文件是当前仓库的高层项目索引（project index）。

## 产品命名

- 当前插件：`MoodNest`
- 未来系统名：`NestHub`
- 情绪助手：`MoodNest`
- 未来日常助手：`DayNest`

当前事实：

- 这个仓库当前实现的是 `MoodNest` 插件
- 代码库目前还没有拆成 NestHub core + assistant modules 的结构
- `DayNest` 目前还不存在对应的源码模块

## 当前源码地图（source map）

顶层入口：

- `main.ts`
  当前插件的 bootstrap 与注册入口

主要目录：

- `src/commands/`
  命令注册
- `src/services/`
  混合目录，当前同时包含 provider 逻辑、MoodNest domain 逻辑、storage helper、speech/STT runtime，以及其他基础设施 helper
- `src/ui/`
  主 modal、action registry，以及右侧面板 widgets
- `src/types.ts`
  共享运行时类型
- `src/settings.ts`
  settings schema、normalization 与 settings UI

当前重要中心文件：

- `src/ui/modals/EmotionLogModal.ts`
  主用户交互壳层（UI shell）
- `src/services/agentService.ts`
  MoodNest 的编排中心（orchestration center）
- `src/services/ruleBasedAgentProvider.ts`
  规则版 MoodNest 身份核心
- `src/services/apiAgentProvider.ts`
  API provider 接入与 fallback shaping
- `src/services/asrService.ts`
  STT 编排入口
- `src/services/archiveService.ts`
  归档写入

## 当前架构现状

当前结构是可工作的，但已经出现明显混合：

- plugin shell 关注点和 feature 关注点靠得较近
- `src/services/` 已经不再是一个边界清晰的单层目录
- 部分高耦合文件同时承担了多种职责

对于当前可运行的插件来说，这仍然是可接受的；但对于未来向 `NestHub` 扩展，这还不是最终应有的结构形态。

## Do-Not-Break Rules

除非任务明确要求，否则不要破坏或静默改变以下行为：

- MoodNest live chat 主流程
- contain / clarify / ground 的回复节奏
- rule-based fallback 行为
- API fallback 行为
- provider profile 行为
- settings 持久化行为
- archive note 生成行为
- STT API 与 local fallback 行为

以下内容如无明确任务，不要修改：

- provider type 行为
- provider base URL 处理方式
- model 选择行为
- API key 处理方式
- `manifest.json`
- build config
- fallback 逻辑

## 高风险文件

以下文件应视为“只有在专门任务中才允许修改”的高风险文件：

- `src/ui/modals/EmotionLogModal.ts`
- `src/ui/widgets/ListenWidget.ts`
- `src/services/apiAgentProvider.ts`
- `src/settings.ts`
- `src/services/agentService.ts`

## 任何非小改动前

请先阅读：

- `PROJECT_INDEX.md`
- `CONTRIBUTING_AI.md`
- `KNOWN_ISSUES.md`
- `docs/architecture/module-map.md`
- `docs/architecture/startup-chain.md`
- `docs/architecture/bundle-risk.md`
- `docs/architecture/safe-refactor-plan.md`

然后确认：

- 目标文件属于哪个层（layer）
- 这次改动是 MoodNest-specific，还是未来的 reusable core 工作
- 任务是否触碰到当前高耦合中心（high-coupling center）

## 当前优先级

当前优先级仍然是：

- 保持 `MoodNest` 作为情绪助手的主身份
- 降低未来维护风险
- 为 `NestHub` 模块化做谨慎准备

当前不应优先做的事：

- 快速的大爆炸式重构（big-bang refactor）
- 直接把 `DayNest` 逻辑塞进现有混合文件
- 一次性通过大规模文件移动来“清理架构”
