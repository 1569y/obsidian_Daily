# CONTRIBUTING_AI

本文件定义了面向 AI 贡献者的仓库级规则。

## Read First

在进行任何非小改动前，必须先阅读：

1. `PROJECT_INDEX.md`
2. `KNOWN_ISSUES.md`
3. `docs/architecture/module-map.md`
4. `docs/architecture/startup-chain.md`
5. `docs/architecture/bundle-risk.md`
6. `docs/architecture/safe-refactor-plan.md`

如果任务与 MoodNest 对话体验相关，还应额外阅读：

- `docs/dialogue-tone-guide.md`

## Hard Constraints

AI 不得：

- 修改无关模块
- 绕过 fallback 行为
- 修改 provider 选择行为
- 修改 provider base URL 行为
- 修改 model 选择行为
- 修改 API key 处理方式
- 修改 `manifest.json`
- 修改 build config
- 在没有专门任务的情况下重构 `src/ui/modals/EmotionLogModal.ts`
- 在没有专门任务的情况下重构 `src/services/apiAgentProvider.ts`

AI 还必须避免：

- 在没有明确要求的情况下同时更改多个架构层
- 从“只做文档”的任务越界到源码改动
- 以“只是整理代码”为名，实质静默改变行为

## 范围纪律（scope discipline）

当任务目标明确指向某一块时：

- 只停留在该范围内
- 不要顺手改写附近文件
- 不要顺手清理无关风格或结构

示例：

- 如果任务是 agent 逻辑，不要顺手重写 STT
- 如果任务是 settings，不要顺手重构 modal
- 如果任务是右侧面板 UI，不要修改 archive format

## 高耦合文件

以下文件需要特别严格的范围控制：

- `src/ui/modals/EmotionLogModal.ts`
- `src/ui/widgets/ListenWidget.ts`
- `src/services/apiAgentProvider.ts`
- `src/settings.ts`
- `src/services/agentService.ts`

如果任务必须触碰这些文件：

- 说明为什么必须改
- 采用最小安全改动
- 避免连带编辑

## Fallback Protection

当前 fallback 行为属于产品契约的一部分。

AI 不得：

- 绕过 rule-based fallback
- 删除 API fallback
- 隐式改变 fallback routing
- 引入只对 provider 生效、但让 MoodNest 失去安全降级能力的行为

## 必须包含的变更报告

每次完成改动后，必须报告：

- 修改了哪些文件
- 为什么改
- 跑了哪些测试
- 有哪些风险
- 如何手动验证

如果没有运行测试，必须明确说明。

如果无法进行手动验证，也必须明确说明。

## 推荐工作方式

对于非小任务，建议按以下顺序工作：

1. 先检查相关文件
2. 先总结当前行为
3. 先说明最小安全计划
4. 只做任务要求的改动
5. 最后报告验证结果和剩余风险

## 当前架构意图

在 `NestHub` 还没有成为真实模块系统之前：

- 将 `MoodNest` 视为当前活动产品
- 将 `NestHub` 视为未来架构方向
- 不要把推测性的 `DayNest` 逻辑混入 MoodNest-specific 文件

## Documentation Rule

如果任务属于 architecture、audit 或 contributor-guidance：

- 优先新增或更新文档
- 不要把文档任务当成源码重构的借口
