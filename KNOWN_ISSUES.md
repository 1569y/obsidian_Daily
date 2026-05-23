# KNOWN_ISSUES

本文件记录只读审计（read-only audit）中识别出的当前架构与维护风险。

## Current Known Issues

- `src/services/` 目录过宽。
  它当前把 provider 逻辑、MoodNest domain 逻辑、speech/STT runtime、storage helper，以及可复用基础设施候选混在了同一个目录中。

- `src/ui/modals/EmotionLogModal.ts` 是一个 God Object。
  它当前同时承担了 UI shell、状态管理、agent 调用、录音、转写、归档、widget 编排以及本地样式注入。

- `src/ui/widgets/ListenWidget.ts` 高耦合。
  它当前把多种声音模式、运行时资源处理、生成声音逻辑、在线播放与 preset 持久化都放在一个 widget 中。

- `src/services/apiAgentProvider.ts` 混合了多种职责。
  它当前同时处理 provider transport、重试、payload parsing、provider compatibility、fallback 行为以及 MoodNest-specific 的 reply shaping。

- `src/settings.ts` 高耦合。
  它当前同时承担 settings schema、settings normalization、legacy migration、settings UI、provider profile 管理，以及 Whisper asset 操作。

- 存在 ASR / Whisper 的桌面兼容性风险。
  仓库中包含面向桌面的 whisper.cpp runtime 和 asset-management 逻辑，这些逻辑假定可以访问桌面文件系统与进程能力。

- `manifest.json` 当前将 `isDesktopOnly` 设为 `false`，但静态依赖图中已经存在桌面特定逻辑。
  这会带来兼容性和维护风险，尤其是在非桌面环境下。

- grounding asset 逻辑较宽，并依赖扫描（scan-based）。
  当用户配置的目录很大或层级很深时，widget 打开时的行为可能变慢或更难预测。

- 启动依赖图（startup graph）较宽。
  当前插件入口通过静态导入（static import）把 modal、widgets、provider 代码以及 STT 相关代码一并拉进单一 bundle。

- 可能存在未使用依赖的噪音（unused dependency noise）。
  当前审计发现以下依赖可能在运行时未被使用：
  `@huggingface/transformers`
  `opencc-js`

## 这些问题不意味着什么

这些问题并不等于插件已经损坏。

它们意味着：

- 当前结构已经超出了干净 MVP 的规模
- 如果继续保持隐式边界，未来做模块化扩展的风险会更高
- 不应直接把 `NestHub` 和 `DayNest` 叠加到当前混合边界之上

## 当前优先级

当前优先级是在不破坏现有可用插件的前提下，降低未来维护风险。

这意味着：

- 先补文档
- 一次只隔离一条边界
- 避免 big-bang refactor
