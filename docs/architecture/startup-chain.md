# Startup Chain

本文件记录从 `main.ts` 开始的当前插件启动链路（startup chain）。

## 主启动流程

`main.ts` 当前在 `onload()` 中执行以下步骤：

1. 记录 `"MoodNest loaded"` 日志。
2. 通过 `loadSettings()` 加载持久化设置。
3. 创建 `ArchiveService`。
4. 创建 `AgentService`。
5. 创建 `AsrService`。
6. 注册 settings tab。
7. 注册 commands。
8. 注册一个 ribbon button，用来打开 `EmotionLogModal`。

## `main.ts` 的直接导入（direct imports）

`main.ts` 直接导入：

- `src/settings.ts`
- `src/types.ts`
- `src/commands/registerCommands.ts`
- `src/services/archiveService.ts`
- `src/services/agentService.ts`
- `src/services/asrService.ts`
- `src/ui/modals/EmotionLogModal.ts`

## 启动时被间接拉入的导入（indirect imports）

以下文件不一定会在启动瞬间全部执行，但它们都通过静态路径（static path）从启动入口可达，因此属于当前 bundled startup graph：

- `src/settings.ts` -> `src/services/whisperCppAssetManager.ts`
- `src/commands/registerCommands.ts` -> `src/ui/modals/EmotionLogModal.ts`
- `src/services/archiveService.ts` -> `src/services/folderService.ts`
- `src/services/agentService.ts` -> `src/services/ruleBasedAgentProvider.ts`
- `src/services/agentService.ts` -> `src/services/apiAgentProvider.ts`
- `src/services/agentService.ts` -> `src/services/actionRecommendation.ts`
- `src/services/agentService.ts` -> `src/services/lowEnergyDecisionPolicy.ts`
- `src/services/agentService.ts` -> `src/services/longTextIntakePolicy.ts`
- `src/services/apiAgentProvider.ts` -> `src/services/llmProviderProfiles.ts`
- `src/services/apiAgentProvider.ts` -> `src/services/llmResponseParsers.ts`
- `src/services/asrService.ts` -> `src/services/whisperCppManager.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/services/speechService.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/ui/actionPanelRegistry.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/ui/widgets/BreathingWidget.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/ui/widgets/ListenWidget.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/ui/widgets/SeeFiveWidget.ts`
- `src/ui/modals/EmotionLogModal.ts` -> `src/ui/widgets/TouchWidget.ts`
- Widgets -> `src/services/groundingAssetResolver.ts`

## 启动时会被加载的文件

以下文件位于当前启动路径中，会在单一插件 bundle 的启动阶段被加载进来：

- `main.ts`
- `src/settings.ts`
- `src/types.ts`
- `src/commands/registerCommands.ts`
- `src/services/archiveService.ts`
- `src/services/folderService.ts`
- `src/services/agentService.ts`
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/apiAgentProvider.ts`
- `src/services/actionRecommendation.ts`
- `src/services/lowEnergyDecisionPolicy.ts`
- `src/services/longTextIntakePolicy.ts`
- `src/services/llmProviderProfiles.ts`
- `src/services/llmResponseParsers.ts`
- `src/services/asrService.ts`
- `src/services/whisperCppManager.ts`
- `src/ui/modals/EmotionLogModal.ts`
- `src/ui/actionPanelRegistry.ts`
- `src/ui/widgets/BreathingWidget.ts`
- `src/ui/widgets/ListenWidget.ts`
- `src/ui/widgets/SeeFiveWidget.ts`
- `src/ui/widgets/TouchWidget.ts`
- `src/services/groundingAssetResolver.ts`

说明：

- 这里的“启动时被加载”指的是它们会随着单一插件入口被静态打包（statically bundled）并进入加载/解析范围。
- 这不代表每一条代码路径都会在 `onload()` 里立刻执行。

## 主要在用户动作后才执行的文件

以下文件虽然较早进入 bundle，但其主要行为会在用户触发后才执行：

- `src/ui/modals/EmotionLogModal.ts`
  Trigger:
  点击 ribbon 或 command 打开 modal。
- `src/ui/widgets/BreathingWidget.ts`
  Trigger:
  右侧出现 breathing action 并被使用。
- `src/ui/widgets/ListenWidget.ts`
  Trigger:
  右侧出现 listening action 并被使用。
- `src/ui/widgets/SeeFiveWidget.ts`
  Trigger:
  右侧出现 visual grounding action 并被使用。
- `src/ui/widgets/TouchWidget.ts`
  Trigger:
  右侧出现 touch grounding action 并被使用。
- `src/services/groundingAssetResolver.ts`
  Trigger:
  widget 资源扫描与媒体加载。
- `src/services/whisperCppAssetManager.ts`
  Trigger:
  打开 settings page，或点击资源相关操作按钮。
- `src/services/whisperCppManager.ts`
  Trigger:
  执行 embedded local transcription。

## Startup Risks

## 1. `EmotionLogModal.ts` 的静态导入（static import）

`main.ts` 静态导入了 `src/ui/modals/EmotionLogModal.ts`。

影响：

- 主 modal 及其所有静态依赖都会进入 startup bundle。
- 这意味着即使用户还没有打开聊天 UI，widget 代码、action panel 代码和 grounding asset helper 也已经进入 `main.js`。

## 2. 静态图中的 ASR / Whisper 链路

`main.ts` 在启动时创建 `AsrService`，而 `AsrService` 又静态导入 `src/services/whisperCppManager.ts`。

影响：

- 即使用户从未录音，桌面特定逻辑也已经进入 startup bundle。
- 由于 `manifest.json` 当前仍写着 `isDesktopOnly: false`，这会放大兼容性风险。

## 3. grounding asset 扫描发生在 modal/widget 使用时

grounding assets 不会在插件启动时扫描。
它们是在 modal 打开后、widget 初始化时才开始扫描。

影响：

- 这比在 `onload()` 中扫描更安全。
- 但如果 asset 目录很大、或者用户配置了层级很深的绝对路径，modal 首次打开仍可能变慢。

## 4. Modal 会异步触发 ASR 初始化

`EmotionLogModal.onOpen()` 中调用了：

- `void this.plugin.asrService.init();`

影响：

- modal 打开时不会等待 ASR 完全 ready。
- 这样可以避免 UI 阻塞，但 embedded-local 初始化错误也可能以异步形式暴露出来。

## 5. `main.ts` 启动阶段没有网络请求

当前 `main.ts` 启动过程中没有直接网络请求。

网络行为被推迟到了后续运行时动作：

- API chat requests
- STT API requests
- settings page 触发的 Whisper 资源下载

这是当前较好的边界，后续应尽量保持。

## 安全解读

当前 startup chain 是可工作的，但结构上已经比较宽：

- plugin shell 本身较小
- 静态依赖图较大
- 由于构建是单入口且采用 static imports，很多用户触发型行为也会较早进入 bundle

对于当前可运行 MVP 来说，这仍然可接受；但对未来 `NestHub` 扩展来说，它会提升维护与模块化风险。
