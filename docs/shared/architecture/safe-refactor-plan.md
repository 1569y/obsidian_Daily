---
status: partially-superseded
scope: shared-safe-refactor-plan
last-reviewed-checkpoint: docs-4b-3b
supersedes: []
superseded-by: []
---

# Safe Refactor Plan

本计划刻意采用分阶段、可回退（reversible）、非破坏式的方式推进。

每个阶段都必须遵守：

- 不做 big-bang refactor
- 每个阶段都必须可以独立测试
- 每个阶段都必须可以独立回退
- 保留当前 fallback 行为
- 保留当前 provider settings 行为
- 保留当前 MoodNest 对话身份

## Stage 1: Docs Only

目标：

- 在动代码之前，先建立稳定的架构基线

工作内容：

- 新增 `PROJECT_INDEX.md`
- 新增 `CONTRIBUTING_AI.md`
- 新增 `KNOWN_ISSUES.md`
- 新增 `docs/architecture/*`

为什么这个阶段安全：

- 不改变运行时行为
- 不改源码

如何测试：

- 确认文件存在
- 确认文档与当前仓库结构一致

如何回退：

- 只删除新增文档文件即可

## Stage 2: Isolate Provider Layer

目标：

- 将通用 LLM transport / parsing 关注点，与 MoodNest-specific reply behavior 分开

目标区域：

- `src/services/apiAgentProvider.ts`
- `src/services/llmProviderProfiles.ts`
- `src/services/llmResponseParsers.ts`

工作方向：

- 提取 provider transport helper
- 提取 retry / parsing 逻辑
- 暂时保留上层的 MoodNest-specific reply policy

为什么这个阶段安全：

- 不要求修改 UI
- 不要求修改 archive
- 不要求改 settings schema

如何测试：

- rule-based mode 仍然可用
- API mode 仍然可用
- invalid payload fallback 仍然可用
- retry 行为最终结果保持一致

如何回退：

- 保持接口不变，恢复旧版 provider orchestration 文件

## Stage 3: Isolate Speech / ASR / Whisper Lazy Module

目标：

- 缩小 startup graph 的宽度，并隔离桌面敏感的 STT runtime 代码

目标区域：

- `src/services/asrService.ts`
- `src/services/whisperCppManager.ts`
- `src/services/whisperCppAssetManager.ts`
- 打开 modal 时触发 ASR 初始化的路径

工作方向：

- 定义 speech/STT 边界
- 将 embedded-local runtime wiring 推迟到真正需要时再加载
- 保持 API STT 与 local fallback 行为不变

为什么这个阶段安全：

- speech 很重要，但它不是当前产品身份的最中心部分
- 可以在不改 MoodNest 对话逻辑的前提下完成隔离

如何测试：

- 纯文本聊天仍然可用
- 录音仍然可用
- API STT 仍然可用
- embedded local STT 在桌面端仍然可用
- 本地资源缺失时仍以可控方式失败

如何回退：

- 恢复旧的 eager ASR 链路，而不改 chat / agent 代码

## Stage 4: Isolate MoodNest Domain Module

目标：

- 让 MoodNest-specific 的支持逻辑边界显式化，并收拢到自包含模块中

目标区域：

- `src/services/agentService.ts`
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/actionRecommendation.ts`
- `src/services/lowEnergyDecisionPolicy.ts`
- `src/services/longTextIntakePolicy.ts`
- `src/ui/actionPanelRegistry.ts`

工作方向：

- 将 MoodNest domain policy 文件集中组织
- 定义 analysis、reply shaping、action recommendation 的清晰入口
- 减少跨文件重复的 action options 和 wording

为什么这个阶段安全：

- 它会在 NestHub 扩展前先改善边界
- 还不需要真正引入 `DayNest`

如何测试：

- rule-based live chat 仍保持 contain / clarify / ground
- recommended actions 仍正确出现
- quick analysis 仍与现有行为一致
- archive 输出保持不变

如何回退：

- 将模块边界重新折回当前的 `services/` 结构

## Stage 5: Create NestHub Core Interfaces

目标：

- 在不过早迁移产品行为的前提下，引入可复用的系统级契约（core interfaces）

候选接口：

- chat orchestrator
- assistant module
- archive writer
- speech transcriber
- grounding asset source
- provider client

为什么这个阶段安全：

- 可以围绕现有实现增加接口层
- `MoodNest` 仍然可以作为第一个具体实现模块

如何测试：

- `MoodNest` 通过 adapter bindings 启动后，行为仍与当前一致
- 不出现 provider/fallback 回归
- 不出现 archive path 回归

如何回退：

- 保留实现，移除新增抽象层即可

## Stage 6: Add DayNest Without Breaking MoodNest

目标：

- 在未来的 NestHub 系统中，将 `DayNest` 作为第二个 assistant module 引入

开始前提：

- provider 与 STT 边界已经足够清晰
- MoodNest domain 已经足够分离，不会继续共享文件漂移
- plugin shell 已经可以承载多个 assistant identity

工作方向：

- 保持 `MoodNest` 作为 emotion assistant
- 新增 `DayNest` 作为 daily assistant
- 复用 core interfaces，而不是直接复用 MoodNest-specific policy 文件

为什么这个阶段安全：

- 它只会在架构边界更清晰之后才发生
- 它避免把 `DayNest` 行为提前混进现有 MoodNest 文件

如何测试：

- MoodNest 现有流程保持不变
- DayNest 可以通过明确入口接入
- 共享 core services 对两个 assistant 都表现一致

如何回退：

- 移除或禁用 DayNest 注册，但保留 core 和 MoodNest module

## 本计划刻意避免的事情

- 不做全目录重写
- 不把大规模 rename 作为第一步
- 不在没有专门任务时直接重构 `src/ui/modals/EmotionLogModal.ts`
- 不在同一大批次里同时重构 `src/services/apiAgentProvider.ts` 和 `src/services/agentService.ts`
- 不把 build-config 重写作为第一个架构步骤

最安全的路径是：

- 先降低歧义
- 再一次沿一条边界降低耦合
