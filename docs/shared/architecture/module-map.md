# Module Map

本文件记录截至 2026-05-23 的 MoodNest 插件当前文件职责映射（file responsibility map）。

## 标签说明（tag legend）

- `app/bootstrap`
- `settings`
- `provider/LLM`
- `MoodNest domain`
- `speech/STT`
- `storage/archive`
- `UI shell`
- `widget`
- `reusable core candidate`
- `high coupling`

## 当前文件职责映射

| File | 当前职责 | Tags | 复用前景 |
| --- | --- | --- | --- |
| `main.ts` | 插件入口。加载 settings、创建核心 services、注册 commands、setting tab 和 ribbon button。 | `app/bootstrap` | MoodNest-specific shell |
| `src/settings.ts` | 默认设置、旧配置兼容、settings UI、provider profile 编辑、Whisper 资源控制。 | `settings`, `speech/STT`, `high coupling` | 混合职责；当前不适合直接复用 |
| `src/types.ts` | settings、chat、actions、archive、agent analysis、live support 的共享运行时类型。 | `MoodNest domain` | 混合；拆分后部分可成为 reusable core candidate |
| `src/types/opencc-js.d.ts` | `opencc-js` 的类型 shim。 | `reusable core candidate` | 可复用，当前相对独立 |
| `src/commands/registerCommands.ts` | 注册插件命令并拉起主 modal。 | `app/bootstrap`, `UI shell` | MoodNest-specific |
| `src/services/actionRecommendation.ts` | 基于用户文本和 risk level 生成右侧行动建议与回复提示。 | `MoodNest domain` | MoodNest-specific |
| `src/services/agentService.ts` | 主聊天编排。负责 rule/API provider 路由、本地优先策略、quick analysis 组装。 | `MoodNest domain`, `provider/LLM`, `high coupling` | MoodNest-specific orchestrator |
| `src/services/apiAgentProvider.ts` | API agent provider。内部包含 provider 能力判断、重试、解析、fallback 与 MoodNest 回复 shaping。 | `provider/LLM`, `MoodNest domain`, `high coupling` | 混合；复用前需要先隔离 |
| `src/services/archiveService.ts` | 将情绪归档和录音文件写入 vault。 | `storage/archive` | 主要是 MoodNest-specific |
| `src/services/asrService.ts` | STT 编排，统一 API STT 与 embedded local whisper.cpp fallback。 | `speech/STT` | 很强的 reusable core candidate |
| `src/services/folderService.ts` | 保证 vault 内嵌套文件夹存在。 | `storage/archive`, `reusable core candidate` | 可复用 |
| `src/services/groundingAssetResolver.ts` | 解析 grounding 资源路径、扫描目录、读取二进制、生成 resource URL。 | `reusable core candidate`, `speech/STT` | 可复用的资源层候选 |
| `src/services/llmProviderProfiles.ts` | provider 能力画像与 parser family 选择。 | `provider/LLM`, `reusable core candidate` | 可复用 |
| `src/services/llmResponseParsers.ts` | 解析 OpenAI-compatible 与通用 LLM 响应结构，包括 stream chunks。 | `provider/LLM`, `reusable core candidate` | 可复用 |
| `src/services/longTextIntakePolicy.ts` | 检测长文本、做分类、提取主线，并生成 MoodNest-specific 的回复与 action options。 | `MoodNest domain` | MoodNest-specific |
| `src/services/lowEnergyDecisionPolicy.ts` | 处理低能量决策支持，尤其是实习/求职方向收窄。 | `MoodNest domain` | MoodNest-specific |
| `src/services/moodnestSupportStrategy.ts` | support-strategy helper 的 re-export 层。 | `MoodNest domain` | 很薄的兼容包装层 |
| `src/services/ruleBasedAgentProvider.ts` | 规则版 agent 分析与 contain/clarify/ground 回复生成。 | `MoodNest domain` | MoodNest-specific 身份核心 |
| `src/services/speechService.ts` | 基于 `MediaRecorder` 的浏览器录音封装。 | `speech/STT`, `reusable core candidate` | 可复用 |
| `src/services/whisperCppAssetManager.ts` | 下载、删除、打开和检查本地 whisper.cpp 资源与模型。 | `speech/STT`, `reusable core candidate` | 桌面限定的可复用 core 候选 |
| `src/services/whisperCppManager.ts` | 运行本地 whisper.cpp CLI 转写任务。 | `speech/STT`, `reusable core candidate` | 桌面限定的可复用 core 候选 |
| `src/ui/actionPanelRegistry.ts` | 定义右侧行动面板的 action ids、presets、options、grounding 常量与 micro action 池。 | `UI shell`, `MoodNest domain` | MoodNest-specific |
| `src/ui/modals/EmotionLogModal.ts` | 主聊天 modal。持有 chat state、右侧面板 state、录音、转写、归档、UI 样式和 widget orchestration。 | `UI shell`, `speech/STT`, `storage/archive`, `MoodNest domain`, `high coupling` | 未拆解前不适合复用 |
| `src/ui/widgets/BreathingWidget.ts` | 呼吸练习 widget，可附带背景音。 | `widget` | 部分可作为 reusable core candidate |
| `src/ui/widgets/ListenWidget.ts` | 多模式声音 widget，覆盖 surrounding sound、local music、generated sound、online sound 与 preset 持久化。 | `widget`, `MoodNest domain`, `high coupling` | 当前不适合直接复用 |
| `src/ui/widgets/SeeFiveWidget.ts` | 基于本地图像与输入提示的视觉 grounding widget。 | `widget` | 较好的 reusable core candidate |
| `src/ui/widgets/TouchWidget.ts` | 触感 grounding widget。 | `widget` | 较好的 reusable core candidate |

## 高耦合文件（high-coupling files）

以下文件在没有专门重构任务前，应视为中心且脆弱：

| File | 为什么属于 high coupling |
| --- | --- |
| `src/ui/modals/EmotionLogModal.ts` | 同时组合了 UI layout、状态机、agent 调用、归档、录音、STT、widget orchestration 和本地 style 注入。 |
| `src/ui/widgets/ListenWidget.ts` | 在一个 widget 中组合了多种声音体验、asset handling、generated audio、online playback 和 preset 持久化。 |
| `src/services/apiAgentProvider.ts` | 混合了 transport、provider compatibility、重试、解析、fallback 与 MoodNest-specific reply policy。 |
| `src/settings.ts` | 混合了 settings schema、migration、settings UI、provider 管理与 Whisper 资源操作。 |
| `src/services/agentService.ts` | 是 rule-based 逻辑、API 逻辑与本地优先 MoodNest support policy 之间的中央路由层。 |

## 目录级观察

- `src/services/` 当前是一个混合目录，而不是边界清晰的 service layer。
- 它同时包含了可复用基础设施、provider 代码、speech/STT runtime，以及高度 MoodNest-specific 的 domain policy。
- `src/ui/` 里同时存在 shell-level UI 和可潜在复用的 widgets。
- `src/types.ts` 当前是一个 catch-all 类型文件；随着 NestHub 扩展，它会越来越难维护。

## 当前边界提醒

在加入 `DayNest` 之前，最安全的第一步是概念性拆分，而不是结构性大搬迁：

- 保持 `main.ts` 作为 plugin shell。
- 将 `src/services/agentService.ts` 与 `src/services/ruleBasedAgentProvider.ts` 视为当前 MoodNest domain 入口。
- 将 `src/services/asrService.ts`、`src/services/whisperCpp*`、`src/services/llm*` 和 `src/services/folderService.ts` 视为未来 core 提取候选。
- 将 `src/ui/modals/EmotionLogModal.ts` 与 `src/ui/widgets/ListenWidget.ts` 视为“没有明确范围就不要重构”的文件。
