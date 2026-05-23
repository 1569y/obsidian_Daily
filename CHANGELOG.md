# Changelog

所有值得记录的项目级变更都应写入本文件。

## Unreleased

### Added

- 新增架构基线文档：
  - `docs/architecture/module-map.md`
  - `docs/architecture/startup-chain.md`
  - `docs/architecture/bundle-risk.md`
  - `docs/architecture/safe-refactor-plan.md`
- 新增项目协作与维护文档：
  - `PROJECT_INDEX.md`
  - `CONTRIBUTING_AI.md`
  - `KNOWN_ISSUES.md`

### Fixed

- 减少 `EmotionLogModal` 打开时的 ASR 初始化稳定性风险：为 `this.plugin.asrService.init()` 增加最小错误兜底，避免 whisper.cpp 资源缺失或初始化失败时出现未处理 Promise 错误。

### Notes

- 本次 Changelog 记录建立了一个面向未来 NestHub 模块化工作的文档基线。
- 本次更新为纯文档更新，没有修改任何 TypeScript 源码文件。
