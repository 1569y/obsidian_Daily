# Bundle Risk

本文件记录当前 MoodNest 插件的打包体积风险（bundle risk）与打包形态风险。

## 当前构建形态

插件当前由 `esbuild.config.mjs` 构建，关键特征是：

- 单一入口：`main.ts`
- `bundle: true`
- 单一输出文件：`main.js`
- 没有配置 code splitting
- 没有配置基于 `dynamic import` 的 chunk 策略

这意味着当前插件会产出一个单体运行时入口（single bundled runtime entry）。

## 单入口打包风险（single-entry bundle risk）

由于当前构建采用单入口、单输出：

- 所有从 `main.ts` 出发可静态到达的模块，都会被打进 `main.js`
- 即使某些代码只会在用户交互后才真正运行，也仍会被提前打包
- 加载与解析成本会集中在同一个插件文件中

当前已经处于静态图中的典型例子：

- `src/ui/modals/EmotionLogModal.ts`
- `src/ui/widgets/ListenWidget.ts`
- `src/services/apiAgentProvider.ts`
- `src/services/whisperCppManager.ts`
- `src/services/groundingAssetResolver.ts`

## 静态导入（static import）与 `main.js`

当前可以使用这样一个经验规则：

- 如果某个文件从 `main.ts` 直接或间接以静态方式导入，那么它就属于 `main.js` 的组成部分
- 不论它的代码路径是立即执行，还是只在用户点击后执行，这一点都不变

典型例子：

- `main.ts` 静态导入 `src/ui/modals/EmotionLogModal.ts`
- `EmotionLogModal.ts` 静态导入多个 widgets
- widgets 又静态导入 grounding asset helpers

结果：

- 这些模块现在都会被打进 `main.js`
- 用户动作只会延后执行（execution），不会延后被打包（inclusion）

## 关于动态导入（dynamic import）的说明

动态导入（dynamic import）本身并不会自动降低打包体积。

只有在以下前提成立时，它才真正有助于减小主包：

- 启用了 code splitting
- 或目标模块被 external 掉
- 或构建策略明确保留了独立 chunks / assets

在当前单入口构建下：

- 仅仅把某个模块改成 `import()` 并不足以保证体积下降
- 真正的收益通常来自“按需加载（lazy loading） + chunking”或“按需加载 + external strategy”的组合

## 什么属于 `main.js` 体积风险

以下这类文件会增加 `main.js` 风险：

- 文件本身体积大
- 处于静态依赖图中
- JavaScript / TypeScript 逻辑密集

当前典型文件：

- `src/ui/modals/EmotionLogModal.ts`
- `src/ui/widgets/ListenWidget.ts`
- `src/services/apiAgentProvider.ts`
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/longTextIntakePolicy.ts`
- `src/services/lowEnergyDecisionPolicy.ts`

这里主要是源码体积、解析成本和维护成本风险，并不是二进制资源风险。

## 什么不属于 `main.js` 体积风险

`vendor/whispercpp` 主要不是 `main.js` 打包问题。

它属于外部资源风险（external asset risk）：

- 发布包体积会变大
- 跨平台桌面二进制会增加分发复杂度
- 本地模型文件可能较大

当前仓库中的例子：

- `vendor/whispercpp/bin/win32-x64/*`
- `vendor/whispercpp/models/ggml-base.bin`

这些文件不会被打进 `main.js`，但它们仍会影响发布体积与兼容性。

同理，以下目录也属于运行时资源，而不是 `main.js` 代码体积驱动项：

- `Assets/Grounding/see/*`
- `Assets/Grounding/listen/*`

## 未使用依赖信号（unused dependency signals）

当前有两个依赖看起来值得怀疑：

- `@huggingface/transformers`
- `opencc-js`

审计结论：

- `@huggingface/transformers` 存在于 `package.json`，但在当前源码审计中未发现其运行时导入
- `opencc-js` 有类型声明文件 `src/types/opencc-js.d.ts`，但当前源码审计中未发现其运行时导入

这为什么重要：

- 未使用依赖会制造维护噪音
- 它们可能误导后续架构判断
- 它们也可能意味着项目里曾有试验性方向，但目前已不是实际运行时需求

当前应将其视为依赖卫生（dependency hygiene）风险，而不是已确认的主包体积风险。

## 实际总结

当前 bundle risk 主要来自：

- 单入口构建
- 范围过宽的 static imports
- 大型高耦合文件过早进入 bundle

当前发布/分发风险主要来自：

- 外部 Whisper 二进制与模型资源
- 插件未标记 desktop-only，但内部存在桌面导向资源逻辑

这两类风险彼此相关，但不是同一个问题；后续重构时应继续分开处理。
