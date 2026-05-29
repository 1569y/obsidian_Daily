import type {
  AgentAnalysis,
  AgentReply,
  AgentResult,
  AgentPersona,
  AgentProviderType,
  RiskLevel,
  AgentMode,
  SceneTag,
  ChatTurn,
  LiveSupportResult,
} from "../types";
import { RuleBasedAgentProvider } from "./ruleBasedAgentProvider";
import {
  getProviderProfile,
  type LLMProviderProfile,
  type LLMResponseParserFamily,
} from "./llmProviderProfiles";
import {
  classifyInvalidPayload,
  normalizeProviderError,
  parseOpenAIChatStreamChunk,
  parseResponseByFamily,
  type InvalidPayloadKind,
} from "./llmResponseParsers";
import {
  attachAttemptSummary,
  buildAttemptLogMeta as buildAttemptLogMetaPure,
  buildResponsePreview,
  createAttemptState,
  extractProviderErrorMessage,
  fetchChatCompletionAttempt as fetchChatCompletionAttemptPure,
  formatInvalidPayloadErrorKind,
  getSafeEndpointPath,
  getInvalidPayloadKind,
  getParserFamily,
  getResponsePayloadCandidates,
  hasNullChoicesPayload,
  isAbortError,
  isReasoningOnlyStreamPayload,
  isQuotaOrRateLimitError,
  logNullChoicesPayloadIfNeeded,
  logProviderPayloadError,
  looksLikeProviderErrorText,
  normalizeChatCompletionsEndpoint,
  parseSseContent,
  parseStreamResponsePayload,
  pushAttemptError,
  retryChatCompletionWithoutJsonMode as retryChatCompletionWithoutJsonModePure,
  safeSerializeForLog,
  shouldTryStreamFallback,
  logAttemptSummary as logAttemptSummaryPure,
  truncateForLog,
  type AttemptErrorKind,
  type AttemptState,
  type LLMAttemptSummary,
  warnIfEndpointLooksIncomplete,
} from "./llmClient";
import {
  appendRecommendedActionHint,
  recommendSupportAction,
  shouldUseLocalFirstGentleClarify,
} from "./actionRecommendation";
import {
  resolveLowEnergyDecisionReply,
  shouldBlockOpenEndedDecisionQuestion,
} from "./lowEnergyDecisionPolicy";
import {
  resolveLongTextIntakeReply,
  shouldUseLocalFirstLongTextIntake,
} from "./longTextIntakePolicy";

interface ApiAgentProviderOptions {
  providerType?: AgentProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  persona: AgentPersona;
}

type ChatCompletionRequestKind = "analyze" | "replyTurn";
type ChatCompletionRetryReason =
  | "http_400"
  | "empty_content"
  | "thinking_400"
  | "stream_empty_content"
  | "invalid_payload"
  | "provider_error";

interface ChatCompletionAttemptOptions {
  jsonMode: boolean;
  disableThinking: boolean;
  stream: boolean;
}

interface ChatCompletionRequestResult {
  data: unknown;
  content: string;
  usedJsonMode: boolean;
  retriedWithoutJsonMode: boolean;
  usedThinkingDisabled: boolean;
  usedStreamFallback?: boolean;
  finalAttemptMode: "non_stream_json" | "non_stream_plain" | "stream_plain";
  retryCount: number;
  errorTrail: string[];
  reasoningOnly: boolean;
  retryReason?: ChatCompletionRetryReason;
}

interface ChatCompletionAttemptResult {
  ok: boolean;
  status: number;
  data?: unknown;
  errorText?: string;
  quotaOrRateLimit?: boolean;
  usedJsonMode: boolean;
  usedThinkingDisabled: boolean;
  stream: boolean;
}

export class ApiAgentProvider {
  private static readonly ANALYZE_TIMEOUT_MS = 30000;
  private static readonly REPLY_TIMEOUT_MS = 30000;
  private static readonly LIVE_HISTORY_LIMIT = 4;
  private static readonly ANALYZE_MAX_TOKENS = 1600;
  private static readonly REPLY_MAX_TOKENS = 800;
  private fallbackProvider: RuleBasedAgentProvider;
  private persona: AgentPersona;
  private providerProfile: LLMProviderProfile;
  private normalizedBaseUrl: string;

  constructor(private options: ApiAgentProviderOptions) {
    this.persona = options.persona;
    this.fallbackProvider = new RuleBasedAgentProvider(options.persona);
    this.normalizedBaseUrl = normalizeChatCompletionsEndpoint(options.baseUrl);
    this.providerProfile = getProviderProfile({
      providerType: options.providerType,
      baseUrl: this.normalizedBaseUrl,
      model: options.model,
    });
  }

  setPersona(persona: AgentPersona) {
    this.persona = persona;
    this.fallbackProvider.setPersona(persona);
  }

  async run(rawText: string): Promise<AgentResult> {
    const analysis = await this.analyze(rawText);
    const reply = await this.reply(rawText, analysis);
    return { analysis, reply };
  }

  async analyze(rawText: string): Promise<AgentAnalysis> {
    try {
      const prompt = `
你是一个中文情绪支持插件的分析器。请根据用户输入，输出严格 JSON，不要输出额外解释，不要输出 markdown 代码块。

重要要求：
1. 所有字段内容必须使用简体中文。
2. 不要输出英文，不要中英混写。
3. emotions、triggers、people、needs、sceneTags、copingDirection 中的每一项都必须是中文短语。
4. summary 必须是一句自然、简洁的中文总结。
5. supportFocus 必须用中文说明“这次最该先接住什么”。
6. responseGoal 必须用中文说明“这次回复最重要的目标是什么”。
7. copingDirection 必须给出 1-3 个温和、现实的支持方向，用中文短语表达。
8. recommendedMode 只能是 "comfort"、"clarify"、"organize" 三者之一。
9. riskLevel 只能是 "low"、"medium"、"high" 三者之一。
10. 不要诊断，不要使用临床标签，不要夸大风险。
11. 不要输出分析步骤、编号列表、思维过程或额外说明。

字段要求：
- emotions: string[]
- intensity: number (1-10)
- triggers: string[]
- people: string[]
- needs: string[]
- riskLevel: "low" | "medium" | "high"
- recommendedMode: "comfort" | "clarify" | "organize"
- summary: string
- sceneTags: string[]
- supportFocus: string
- responseGoal: string
- copingDirection: string[]

用户输入：
${rawText}
`;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        ApiAgentProvider.ANALYZE_TIMEOUT_MS
      );

      let requestResult: ChatCompletionRequestResult;
      try {
        requestResult = await this.requestChatCompletionJson(
          [
            {
              role: "system",
              content:
                "你是一个情绪分析器，只输出 JSON 对象，不要输出 markdown，不要输出解释，不要输出代码块标记。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          0.2,
          ApiAgentProvider.ANALYZE_MAX_TOKENS,
          controller.signal,
          "analyze"
        );
      } finally {
        window.clearTimeout(timeoutId);
      }

      this.logAttemptSummary({
        finalAttemptMode: requestResult.finalAttemptMode,
        status: "success",
        retryCount: requestResult.retryCount,
        errorTrail: requestResult.errorTrail,
        textLength: requestResult.content.trim().length,
        reasoningOnly: requestResult.reasoningOnly,
      });

      const { content } = requestResult;
      const cleaned = this.extractJson(content);
      this.assertNonEmptyJsonCandidate(cleaned, content, "analyze");
      const parsed = this.safeParseJson<Partial<AgentAnalysis>>(
        cleaned,
        content,
        "analyze"
      );

      return {
        emotions: this.asStringArray(parsed.emotions),
        intensity: this.normalizeIntensity(parsed.intensity),
        triggers: this.asStringArray(parsed.triggers),
        people: this.asStringArray(parsed.people),
        needs: this.asStringArray(parsed.needs),
        riskLevel: this.normalizeRiskLevel(parsed.riskLevel),
        recommendedMode: this.normalizeMode(parsed.recommendedMode),
        summary: this.safeText(parsed.summary, "已完成初步分析。"),
        sceneTags: this.asSceneTags(parsed.sceneTags),
        supportFocus: this.safeText(
          parsed.supportFocus,
          "先接住用户此刻最明显的情绪波动"
        ),
        responseGoal: this.safeText(
          parsed.responseGoal,
          "先提供温和、低刺激、不过度说教的支持"
        ),
        copingDirection: this.asStringArray(parsed.copingDirection),
      };
    } catch (error) {
      if (isAbortError(error)) {
        console.warn("[ApiAgentProvider:analyze] API 分析请求超时，回退规则版。", {
          timeoutMs: ApiAgentProvider.ANALYZE_TIMEOUT_MS,
        });
      } else {
        this.logFallbackAttemptSummary(error);
        console.warn("API 分析失败，回退规则版：", error);
      }
      return this.fallbackProvider.analyze(rawText);
    }
  }

  /**
   * 最终整理阶段的回复
   * 保留 run() 所需接口
   */
  async reply(rawText: string, analysis: AgentAnalysis): Promise<AgentReply> {
    return this.fallbackProvider.reply(rawText, analysis);
  }

  /**
   * 实时一轮对话：用户说一句，AI 回一句
   */
  async replyTurn(
    userMessage: string,
    history: ChatTurn[]
  ): Promise<LiveSupportResult> {
    const fallbackContext = this.buildFallbackContext(userMessage, history);
    const localAnalysis = await this.fallbackProvider.analyze(fallbackContext);
    const recommendedAction = recommendSupportAction(
      fallbackContext,
      localAnalysis.riskLevel
    );

    const decisionReply = resolveLowEnergyDecisionReply(fallbackContext, {
      riskLevel: localAnalysis.riskLevel,
    });
    const longTextIntake = resolveLongTextIntakeReply(fallbackContext, {
      riskLevel: localAnalysis.riskLevel,
    });

    if (localAnalysis.riskLevel === "high") {
      const safeReply = await this.fallbackProvider.reply(userMessage, localAnalysis);
      return this.createLiveSupportResultSafe(safeReply.message, localAnalysis);
    }

    if (
      shouldUseLocalFirstLongTextIntake(fallbackContext, {
        riskLevel: localAnalysis.riskLevel,
      }) &&
      longTextIntake
    ) {
      console.debug("[MoodNest] local-first long_text_intake, skip API", {
        kind: longTextIntake.kind,
        riskLevel: localAnalysis.riskLevel,
      });

      return {
        replyText: appendRecommendedActionHint(
          longTextIntake.reply,
          recommendedAction,
          localAnalysis.riskLevel
        ),
        recommendedAction,
        quickAnalysis: {
          corePain:
            longTextIntake.mainThreads[0] ??
            this.safeText(localAnalysis.supportFocus, "用户此刻有明显情绪压力"),
          currentNeed: "先接住长文本，再缩成几条可继续的主线",
          nextStep:
            longTextIntake.suggestedActions[0]?.label ??
            localAnalysis.copingDirection[0] ??
            "先选一个最接近的入口",
          emotions: localAnalysis.emotions,
          intensity: localAnalysis.intensity,
          recommendedMode: "organize",
          riskLevel: localAnalysis.riskLevel,
        },
      };
    }

    if (
      shouldUseLocalFirstGentleClarify(fallbackContext, {
        riskLevel: localAnalysis.riskLevel,
      })
    ) {
      console.debug("[MoodNest] local-first gentle_clarify, skip API", {
        riskLevel: localAnalysis.riskLevel,
      });

      const localReply = await this.fallbackProvider.reply(userMessage, localAnalysis);
      return {
        replyText: appendRecommendedActionHint(
          localReply.message,
          recommendedAction,
          localAnalysis.riskLevel
        ),
        recommendedAction,
        quickAnalysis: {
          corePain: this.safeText(
            localAnalysis.supportFocus,
            "用户此刻有明显情绪压力"
          ),
          currentNeed: this.safeText(
            localAnalysis.responseGoal,
            "先被接住，再慢慢理清"
          ),
          nextStep:
            localAnalysis.copingDirection[0] ??
            "先不用急着做很多，只先把最难受的点留住",
          emotions: localAnalysis.emotions,
          intensity: localAnalysis.intensity,
          recommendedMode: localAnalysis.recommendedMode,
          riskLevel: localAnalysis.riskLevel,
        },
      };
    }

    if (decisionReply) {
      return {
        replyText: appendRecommendedActionHint(
          decisionReply,
          recommendedAction,
          localAnalysis.riskLevel
        ),
        recommendedAction,
        quickAnalysis: {
          corePain: this.safeText(
            localAnalysis.supportFocus,
            "用户此刻有明显情绪压力"
          ),
          currentNeed: this.safeText(
            localAnalysis.responseGoal,
            "先被接住，再慢慢理清"
          ),
          nextStep:
            localAnalysis.copingDirection[0] ??
            "先不用急着做很多，只先把最难受的点留住",
          emotions: localAnalysis.emotions,
          intensity: localAnalysis.intensity,
          recommendedMode: "organize",
          riskLevel: localAnalysis.riskLevel,
        },
      };
    }

    let apiContent = "";
    let cleanedContent = "";

    try {
      const recentHistory = history.slice(-ApiAgentProvider.LIVE_HISTORY_LIMIT);

      const historyText = recentHistory
        .map((item) => {
          const content = this.formatTurnContentForHistory(item);
          if (!content) {
            return "";
          }

          return `${item.role === "user" ? "用户" : "MoodNest"}：${content}`;
        })
        .filter((item) => item.length > 0)
        .join("\n");

      const prompt = `
你是一个中文情绪支持型对话助手。你的任务不是分析一大堆标签，而是对用户刚刚这句话，给出一句真正“能接住人”的回应。

你的回复目标：
1. 先接住用户此刻最强烈的情绪，不要空泛重复“你很难受”。
2. 尽量点出用户这句话背后最核心、最刺痛的点。
3. 回复控制在 1-3 句话内，短一些，避免像报告。
4. 最多只做一件事：
   - 要么点出核心；
   - 要么问一个很轻的问题；
   - 要么给一个很小、很现实的下一步。
5. 不要连续问很多问题。
6. 不要说教，不要诊断，不要夸大风险。
7. 不要使用模板腔，不要过度客套。
8. 所有输出必须是简体中文。
9. 不要输出分析步骤、标题、项目符号、编号列表或思维过程。

低能量决策辅助规则：
1. 当用户同时表现出低能量/混乱/焦虑和选择困难/实习求职/职业方向困扰时，不要继续问开放式空白题。
2. 不要问“你想做什么方向”“你有哪些技能”“你最喜欢哪个”。
3. 先接住情绪，复述当前卡点，再根据用户已经透露的专业、行业、经历或目标岗位，主动给 3-6 个相关候选项，让用户只做划掉/保留/不确定。
4. 如果用户已经明确排除某个方向，把它放进“不优先”，不要再把它拿回来比较。
5. 如果用户背景未知，不要强行列 AI 或技术岗位，应先给职业大类选项，例如：技术、产品、设计交互、运营、商科金融、内容传媒、教育服务、硬件工程、还不确定。
6. 不要直接替用户决定职业，不要说“你适合做某某”。
7. 可以说“我们先把这些放进候选池，再慢慢划掉”。
8. 最后一轮只问一个低负担问题，不要一次列太多。

请输出严格 JSON，不要输出 markdown，不要输出解释。

JSON 结构：
{
  "replyText": "1-3句的中文回复",
  "quickAnalysis": {
    "corePain": "一句中文，说明当前最刺痛的点",
    "currentNeed": "一句中文，说明此刻最需要的东西",
    "nextStep": "一句中文，给一个很小的下一步",
    "emotions": ["中文短语"],
    "intensity": 1-10,
    "recommendedMode": "comfort" | "clarify" | "organize",
    "riskLevel": "low" | "medium" | "high"
  }
}

最近对话：
${historyText}

用户刚刚这句话：
${userMessage}
`;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        ApiAgentProvider.REPLY_TIMEOUT_MS
      );

      let requestResult: ChatCompletionRequestResult;
      try {
        requestResult = await this.requestChatCompletionJson(
          [
            {
              role: "system",
              content:
                "你是一个中文情绪支持对话助手。只输出单个 JSON 对象；不要输出 markdown，不要输出解释，不要输出分析步骤，不要输出编号列表，不要输出思维过程，也不要在 JSON 前后添加任何文字。你的回复要短、准、有人味，先接住，再轻轻聚焦。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          0.2,
          ApiAgentProvider.REPLY_MAX_TOKENS,
          controller.signal,
          "replyTurn"
        );
      } finally {
        window.clearTimeout(timeoutId);
      }

      this.logAttemptSummary({
        finalAttemptMode: requestResult.finalAttemptMode,
        status: "success",
        retryCount: requestResult.retryCount,
        errorTrail: requestResult.errorTrail,
        textLength: requestResult.content.trim().length,
        reasoningOnly: requestResult.reasoningOnly,
      });

      const { content } = requestResult;
      apiContent = content;
      const cleaned = this.extractJson(content);
      cleanedContent = cleaned;
      this.assertNonEmptyJsonCandidate(cleaned, content, "replyTurn");
      const parsed = this.safeParseJson<{
        replyText?: unknown;
        quickAnalysis?: {
          corePain?: unknown;
          currentNeed?: unknown;
          nextStep?: unknown;
          emotions?: unknown;
          intensity?: unknown;
          recommendedMode?: unknown;
          riskLevel?: unknown;
        };
      }>(cleaned, content, "replyTurn");

      const shouldUseLocalVagueQuickAnalysis =
        this.isVagueEmotionExpression(userMessage);

      const safeReplyText = this.safeText(
        parsed.replyText,
        "我先替你抓住现在最难受的一点：你不是单纯在慌，而是一下子觉得自己没有支点了。"
      );
      const guardedReplyText =
        shouldBlockOpenEndedDecisionQuestion(fallbackContext, {
          riskLevel: localAnalysis.riskLevel,
        }) && this.containsOpenEndedDecisionQuestion(safeReplyText)
          ? decisionReply ?? safeReplyText
          : safeReplyText;

      return {
        replyText: appendRecommendedActionHint(
          guardedReplyText,
          recommendedAction,
          localAnalysis.riskLevel
        ),
        recommendedAction,
        quickAnalysis: {
          corePain: shouldUseLocalVagueQuickAnalysis
            ? this.safeText(localAnalysis.supportFocus, "原因暂不明确的烦躁/堵住")
            : this.safeText(
                parsed.quickAnalysis?.corePain,
                "用户此刻最痛的是突然失去支撑感和方向感"
              ),
          currentNeed: shouldUseLocalVagueQuickAnalysis
            ? this.safeText(localAnalysis.responseGoal, "不急着找原因，先被接住")
            : this.safeText(
                parsed.quickAnalysis?.currentNeed,
                "先被接住，再慢慢把最压的那一点收窄"
              ),
          nextStep: shouldUseLocalVagueQuickAnalysis
            ? this.safeText(
                localAnalysis.copingDirection[0],
                "可以先描述身体感受或最近压力，不强迫解释"
              )
            : this.safeText(
                parsed.quickAnalysis?.nextStep,
                "先只抓住眼前最压你的那一件，不急着处理全部"
              ),
          emotions: this.asStringArray(parsed.quickAnalysis?.emotions),
          intensity: this.normalizeIntensity(parsed.quickAnalysis?.intensity),
          recommendedMode: shouldUseLocalVagueQuickAnalysis
            ? localAnalysis.recommendedMode
            : this.normalizeMode(parsed.quickAnalysis?.recommendedMode),
          riskLevel: shouldUseLocalVagueQuickAnalysis
            ? localAnalysis.riskLevel
            : this.normalizeRiskLevel(parsed.quickAnalysis?.riskLevel),
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        console.warn("[ApiAgentProvider:replyTurn] API 对话请求超时，回退规则版。", {
          timeoutMs: ApiAgentProvider.REPLY_TIMEOUT_MS,
        });
      } else {
        this.logFallbackAttemptSummary(error);
        console.warn("API 对话回复失败，回退规则版：", error);
      }

      // fallback：分析和回复都尽量看上下文，避免退回泛泛安慰
      const reply = await this.fallbackProvider.reply(fallbackContext, localAnalysis);
      /*
        ? `${historyContext}\n\n用户刚刚这句话：${userMessage}`
        : userMessage;
      */
      const extractedReplyText = this.extractReplyTextPrefix(
        cleanedContent || apiContent
      );

      if (extractedReplyText) {
        console.warn(
          "[ApiAgentProvider:replyTurn] 使用截断 JSON 中提取到的 replyText 前缀作为降级回复。",
          {
            replyTextPreview: truncateForLog(extractedReplyText),
          }
        );
      }

      const analysis = localAnalysis;
      const fallbackNextStep =
        analysis.copingDirection.length > 0
          ? analysis.copingDirection[0] ?? ""
          : "";

      return {
        replyText: appendRecommendedActionHint(
          extractedReplyText || reply.message,
          recommendedAction,
          analysis.riskLevel
        ),
        recommendedAction,
        quickAnalysis: {
          corePain: this.safeText(
            analysis.supportFocus,
            "用户此刻有明显情绪压力"
          ),
          currentNeed: this.safeText(
            analysis.responseGoal,
            "先被接住，再慢慢理清"
          ),
          nextStep:
            fallbackNextStep || "先不用急着做很多，只先把最难受的点留住",
          emotions: analysis.emotions,
          intensity: analysis.intensity,
          recommendedMode: analysis.recommendedMode,
          riskLevel: analysis.riskLevel,
        },
      };
    }
  }

  private buildFallbackContext(
    userMessage: string,
    history: ChatTurn[]
  ): string {
    const trimmedUserMessage = userMessage.trim();
    const currentUserLine = trimmedUserMessage ? `用户：${trimmedUserMessage}` : "";
    const recentUserTurns = history
      .slice(-ApiAgentProvider.LIVE_HISTORY_LIMIT)
      .filter((item) => item.role === "user")
      .map((item) => this.formatUserTurnForContext(item))
      .filter((content) => content.length > 0 && `用户：${content}` !== currentUserLine)
      .map((content) => `用户：${content}`);

    const sections: string[] = [];

    if (recentUserTurns.length > 0) {
      sections.push(`【上下文，仅供理解】\n${recentUserTurns.join("\n")}`);
    }

    if (trimmedUserMessage) {
      sections.push(`【用户当前输入】\n${trimmedUserMessage}`);
    }

    return sections.join("\n\n");

    /*
    const recentTurns = history
      .slice(-ApiAgentProvider.LIVE_HISTORY_LIMIT)
      .map((item) => {
        const content = item.content.trim();
        if (!content) {
          return "";
        }

        return `${item.role === "user" ? "用户" : "MoodNest"}：${content}`;
      })
      .filter((text) => text.length > 0);

    const currentUserLine = userMessage.trim()
      ? `用户：${userMessage.trim()}`
      : "";
    const merged = [...recentTurns, currentUserLine].filter(Boolean);

    const deduped = merged.filter(
      (text, index, arr) => text && arr.indexOf(text) === index
    );

    return deduped.join("\n");
    */
  }

  private getMessageContent(data: unknown): string {
    return parseResponseByFamily(data, getParserFamily(this.providerProfile)).text;
  }

  private async requestChatCompletionJson(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: ChatCompletionRequestKind
  ): Promise<ChatCompletionRequestResult> {
    warnIfEndpointLooksIncomplete(
      context,
      this.normalizedBaseUrl,
      this.options.model
    );

    const attemptState = createAttemptState();
    const preferDisableThinking = this.shouldDisableThinking();
    const canUseJsonMode = this.providerProfile.supportsJsonObject;

    if (canUseJsonMode) {
      const firstAttempt = await this.fetchChatCompletionAttempt(
        messages,
        temperature,
        maxTokens,
        signal,
        {
          jsonMode: true,
          disableThinking: preferDisableThinking,
          stream: false,
        }
      );

      if (!firstAttempt.ok) {
        if (firstAttempt.quotaOrRateLimit) {
          pushAttemptError(attemptState, "quota_or_rate_limit");
          throw attachAttemptSummary(
            new Error(
              `API 请求失败: ${firstAttempt.status} - ${firstAttempt.errorText ?? ""}`
            ),
            attemptState
          );
        }

        if (firstAttempt.status === 400) {
          pushAttemptError(attemptState, "http_error");
          console.debug(
            `[ApiAgentProvider:${context}] JSON mode 请求返回 400，尝试去掉 response_format 重试。`,
            this.buildAttemptLogMeta(context, "non_stream_json", {
              usedJsonMode: true,
              usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
              retryReason: "http_400",
              errorKind: "http_error",
              extra: {
                status: firstAttempt.status,
                errorPreview: truncateForLog(firstAttempt.errorText ?? ""),
              },
            })
          );

          return this.retryChatCompletionWithoutJsonMode(
            messages,
            temperature,
            maxTokens,
            signal,
            context,
            "http_400",
            false,
            attemptState
          );
        }

        throw new Error(
          `API 请求失败: ${firstAttempt.status} - ${firstAttempt.errorText ?? ""}`
        );
      }

      const firstData = firstAttempt.data;
      const firstProviderError = extractProviderErrorMessage(firstData);
      if (firstProviderError) {
        pushAttemptError(attemptState, "provider_error");
        logProviderPayloadError(
          firstData,
          context,
          firstProviderError,
          (context, attemptMode, options) =>
            this.buildAttemptLogMeta(context, attemptMode, options),
          {
            usedJsonMode: true,
            willRetryWithoutJsonMode: false,
            usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
            stream: false,
            retryReason: "provider_error",
          }
        );
        return this.retryChatCompletionWithoutJsonMode(
          messages,
          temperature,
          maxTokens,
          signal,
          context,
          "provider_error",
          preferDisableThinking,
          attemptState
        );
      }

      const firstContent = this.getMessageContent(firstData);
      if (firstContent.trim().length > 0) {
        return {
          data: firstData,
          content: firstContent,
          usedJsonMode: true,
          retriedWithoutJsonMode: false,
          usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
          finalAttemptMode: "non_stream_json",
          retryCount: attemptState.errorTrail.length,
          errorTrail: [...attemptState.errorTrail],
          reasoningOnly: attemptState.reasoningOnly,
        };
      }

      const invalidPayloadKind = getInvalidPayloadKind(firstData, this.providerProfile);
      pushAttemptError(
        attemptState,
        invalidPayloadKind
          ? formatInvalidPayloadErrorKind(invalidPayloadKind)
          : "empty_content"
      );
      logNullChoicesPayloadIfNeeded(
        firstData,
        context,
        (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        {
          usedJsonMode: true,
          willRetryWithoutJsonMode: true,
          usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
          stream: false,
          retryReason: invalidPayloadKind ? "invalid_payload" : "empty_content",
        }
      );

      console.debug(
        `[ApiAgentProvider:${context}] JSON mode 返回 200 但未提取到内容，尝试去掉 response_format 重试。`,
        this.buildAttemptLogMeta(context, "non_stream_json", {
          usedJsonMode: true,
          usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
          retryReason: invalidPayloadKind ? "invalid_payload" : "empty_content",
          errorKind: invalidPayloadKind ? "invalid_payload" : "empty_content",
          data: firstData,
          extra: {
            invalidPayloadKind: invalidPayloadKind ?? undefined,
          },
        })
      );

      return this.retryChatCompletionWithoutJsonMode(
        messages,
        temperature,
        maxTokens,
        signal,
        context,
        invalidPayloadKind ? "invalid_payload" : "empty_content",
        preferDisableThinking,
        attemptState
      );
    }

    return this.retryChatCompletionWithoutJsonMode(
      messages,
      temperature,
      maxTokens,
      signal,
      context,
      "empty_content",
      preferDisableThinking,
      attemptState
    );
  }

  private async retryChatCompletionWithoutJsonMode(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: ChatCompletionRequestKind,
    retryReason: ChatCompletionRetryReason,
    disableThinking: boolean,
    attemptState: AttemptState
  ): Promise<ChatCompletionRequestResult> {
    return retryChatCompletionWithoutJsonModePure(
      {
        messages,
        temperature,
        maxTokens,
        signal,
        context,
        retryReason,
        disableThinking,
        attemptState,
      },
      {
        fetchChatCompletionAttempt: (
          messages,
          temperature,
          maxTokens,
          signal,
          options
        ) =>
          this.fetchChatCompletionAttempt(
            messages,
            temperature,
            maxTokens,
            signal,
            options
          ),
        extractProviderErrorMessage: (data) =>
          extractProviderErrorMessage(data),
        getInvalidPayloadKind: (data) =>
          getInvalidPayloadKind(data, this.providerProfile),
        shouldTryStreamFallback: (errorKind) =>
          shouldTryStreamFallback(this.providerProfile, errorKind),
        logProviderPayloadError: (
          data,
          context,
          providerError,
          buildAttemptLogMeta,
          meta
        ) =>
          logProviderPayloadError(
            data,
            context,
            providerError,
            buildAttemptLogMeta,
            meta
          ),
        logNullChoicesPayloadIfNeeded: (
          data,
          context,
          buildAttemptLogMeta,
          meta
        ) =>
          logNullChoicesPayloadIfNeeded(
            data,
            context,
            buildAttemptLogMeta,
            meta
          ),
        assertNonEmptyContent: (
          content,
          data,
          context,
          meta,
          attemptState
        ) =>
          this.assertNonEmptyContent(content, data, context, meta, attemptState),
        getMessageContent: (data) => this.getMessageContent(data),
        buildAttemptLogMeta: (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        pushAttemptError: (attemptState, errorKind) =>
          pushAttemptError(attemptState, errorKind),
        attachAttemptSummary: (error, attemptState) =>
          attachAttemptSummary(error, attemptState),
        retryChatCompletionWithStream: (
          messages,
          temperature,
          maxTokens,
          signal,
          context,
          disableThinking,
          retryReason,
          attemptState
        ) =>
          this.retryChatCompletionWithStream(
            messages,
            temperature,
            maxTokens,
            signal,
            context,
            disableThinking,
            retryReason,
            attemptState
          ),
      }
    );
  }

  /*
    const retryAttempt = await this.fetchChatCompletionAttempt(
      messages,
      temperature,
      maxTokens,
      signal,
      {
        jsonMode: false,
        disableThinking,
        stream: false,
      }
    );

    if (!retryAttempt.ok) {
      if (retryAttempt.quotaOrRateLimit) {
        pushAttemptError(attemptState, "quota_or_rate_limit");
        throw attachAttemptSummary(
          new Error(
            `API 请求失败: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
          ),
          attemptState
        );
      }

      if (retryAttempt.status === 400 && disableThinking) {
        pushAttemptError(attemptState, "http_error");
        console.debug(
          `[ApiAgentProvider:${context}] 去掉 response_format 后仍返回 400，尝试去掉 thinking 参数重试。`,
          this.buildAttemptLogMeta(context, "non_stream_plain", {
            usedJsonMode: false,
            usedThinkingDisabled: true,
            retryReason: "thinking_400",
            errorKind: "http_error",
            extra: {
              willRetryWithoutJsonMode: false,
              status: retryAttempt.status,
              errorPreview: truncateForLog(retryAttempt.errorText ?? ""),
            },
          })
        );

        return this.retryChatCompletionWithoutJsonMode(
          messages,
          temperature,
          maxTokens,
          signal,
          context,
          "thinking_400",
          false,
          attemptState
        );
      }

      throw attachAttemptSummary(
        new Error(
          `API 请求失败: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
        ),
        attemptState
      );
    }

    const retryData = retryAttempt.data;
    const retryProviderError = extractProviderErrorMessage(retryData);
    if (retryProviderError) {
      pushAttemptError(attemptState, "provider_error");
      logProviderPayloadError(
        retryData,
        context,
        retryProviderError,
        (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        {
          usedJsonMode: false,
          willRetryWithoutJsonMode: false,
          usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
          stream: false,
          retryReason,
        }
      );
      if (shouldTryStreamFallback(this.providerProfile, "provider_error")) {
        return this.retryChatCompletionWithStream(
          messages,
          temperature,
          maxTokens,
          signal,
          context,
          retryAttempt.usedThinkingDisabled,
          "provider_error",
          attemptState
        );
      }
      throw attachAttemptSummary(
        new Error(`API 返回错误内容: ${retryProviderError}`),
        attemptState
      );
    }

    const retryContent = this.getMessageContent(retryData);
    const invalidPayloadKind = getInvalidPayloadKind(retryData, this.providerProfile);
    if (retryContent.trim().length === 0 && shouldTryStreamFallback(this.providerProfile, invalidPayloadKind ? "invalid_payload" : "empty_content")) {
      pushAttemptError(
        attemptState,
        invalidPayloadKind
          ? formatInvalidPayloadErrorKind(invalidPayloadKind)
          : "empty_content"
      );
      logNullChoicesPayloadIfNeeded(
        retryData,
        context,
        (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        {
          usedJsonMode: false,
          willRetryWithoutJsonMode: false,
          usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
          stream: false,
          retryReason: invalidPayloadKind ? "invalid_payload" : retryReason,
        }
      );

      return this.retryChatCompletionWithStream(
        messages,
        temperature,
        maxTokens,
        signal,
        context,
        retryAttempt.usedThinkingDisabled,
        invalidPayloadKind ? "invalid_payload" : retryReason,
        attemptState
      );
    }

    this.assertNonEmptyContent(retryContent, retryData, context, {
      usedJsonMode: false,
      willRetryWithoutJsonMode: false,
      usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
      stream: false,
      retryReason,
    }, attemptState);

    return {
      data: retryData,
      content: retryContent,
      usedJsonMode: false,
      retriedWithoutJsonMode: true,
      usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
      finalAttemptMode: "non_stream_plain",
      retryCount: attemptState.errorTrail.length,
      errorTrail: [...attemptState.errorTrail],
      reasoningOnly: attemptState.reasoningOnly,
      retryReason,
    };
  }
  */

  private async retryChatCompletionWithStream(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: ChatCompletionRequestKind,
    disableThinking: boolean,
    retryReason: ChatCompletionRetryReason,
    attemptState: AttemptState
  ): Promise<ChatCompletionRequestResult> {
    console.debug(
      `[ApiAgentProvider:${context}] non-stream 返回可重试错误，尝试 stream fallback。`,
      this.buildAttemptLogMeta(context, "stream_plain", {
        usedJsonMode: false,
        usedThinkingDisabled: disableThinking,
        retryReason,
        errorKind: retryReason === "provider_error" ? "provider_error" : retryReason === "invalid_payload" ? "invalid_payload" : "empty_content",
      })
    );

    const streamAttempt = await this.fetchChatCompletionAttempt(
      messages,
      temperature,
      maxTokens,
      signal,
      {
        jsonMode: false,
        disableThinking,
        stream: true,
      }
    );

    if (!streamAttempt.ok) {
      if (streamAttempt.quotaOrRateLimit) {
        pushAttemptError(attemptState, "quota_or_rate_limit");
        throw attachAttemptSummary(
          new Error(
            `API stream 请求失败: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
          ),
          attemptState
        );
      }

      if (streamAttempt.status === 400 && disableThinking) {
        pushAttemptError(attemptState, "http_error");
        console.debug(
          `[ApiAgentProvider:${context}] stream fallback 返回 400，尝试去掉 thinking 参数后再次拉取 stream。`,
          this.buildAttemptLogMeta(context, "stream_plain", {
            usedJsonMode: false,
            usedThinkingDisabled: true,
            retryReason: "thinking_400",
            errorKind: "http_error",
            extra: {
              status: streamAttempt.status,
              errorPreview: truncateForLog(streamAttempt.errorText ?? ""),
            },
          })
        );

        return this.retryChatCompletionWithStream(
          messages,
          temperature,
          maxTokens,
          signal,
          context,
          false,
          "thinking_400",
          attemptState
        );
      }

      throw attachAttemptSummary(
        new Error(
          `API stream 请求失败: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
        ),
        attemptState
      );
    }

    const streamData = streamAttempt.data;
    const streamProviderError = extractProviderErrorMessage(streamData);
    if (streamProviderError) {
      pushAttemptError(attemptState, "provider_error");
      logProviderPayloadError(
        streamData,
        context,
        streamProviderError,
        (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        {
          usedJsonMode: false,
          willRetryWithoutJsonMode: false,
          usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
          stream: true,
          retryReason,
        }
      );
      throw attachAttemptSummary(
        new Error(`API stream 返回错误内容: ${streamProviderError}`),
        attemptState
      );
    }

    const streamContent = this.getMessageContent(streamData);
    attemptState.reasoningOnly = isReasoningOnlyStreamPayload(streamData);
    if (streamContent.trim().length === 0) {
      pushAttemptError(attemptState, "empty_content");
    }
    this.assertNonEmptyContent(streamContent, streamData, context, {
      usedJsonMode: false,
      willRetryWithoutJsonMode: false,
      usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
      stream: true,
      retryReason: "stream_empty_content",
    }, attemptState);

    return {
      data: streamData,
      content: streamContent,
      usedJsonMode: false,
      retriedWithoutJsonMode: true,
      usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
      usedStreamFallback: true,
      finalAttemptMode: "stream_plain",
      retryCount: attemptState.errorTrail.length,
      errorTrail: [...attemptState.errorTrail],
      reasoningOnly: attemptState.reasoningOnly,
      retryReason: "stream_empty_content",
    };
  }


  private async fetchChatCompletionAttempt(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    options: ChatCompletionAttemptOptions
  ): Promise<ChatCompletionAttemptResult> {
    const body = this.buildChatCompletionBody(messages, temperature, maxTokens, {
      jsonMode: options.jsonMode,
      disableThinking: options.disableThinking,
      stream: options.stream,
    });

    return fetchChatCompletionAttemptPure({
      endpoint: this.normalizedBaseUrl,
      apiKey: this.options.apiKey,
      body,
      signal,
      options,
    });
  }

  /*
  private async sendChatCompletionRequest(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: "analyze" | "replyTurn"
  ): Promise<Response> {
    const response = await fetch(this.options.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify(
        this.buildChatCompletionBody(messages, temperature, maxTokens, {
          jsonMode: true,
        })
      ),
    });

    if (response.ok) {
      return response;
    }

    if (response.status === 400) {
      const errorText = await response.text();

      console.warn(
        `[ApiAgentProvider:${context}] JSON mode 请求返回 400，尝试不带 response_format 重试。`,
        {
          status: response.status,
          errorPreview: truncateForLog(errorText),
        }
      );

      const retryResponse = await fetch(this.options.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        signal,
        body: JSON.stringify(
          this.buildChatCompletionBody(messages, temperature, maxTokens)
        ),
      });

      if (retryResponse.ok) {
        return retryResponse;
      }

      const retryErrorText = await retryResponse.text();
      throw new Error(
        `API 请求失败: ${retryResponse.status} - ${retryErrorText}`
      );
    }

    const errorText = await response.text();
    throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
  }

  */

  private extractJson(content: string): string {
    const trimmed = content.trim();

    if (!trimmed) {
      return "";
    }

    const withoutFence = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const extractedObject = this.extractCompleteJsonObject(withoutFence);
    if (extractedObject) {
      return extractedObject;
    }

    // 如果内容本身就是从 "{" 开始但没有闭合，保留原文给后续保守降级使用。
    if (withoutFence.startsWith("{")) {
      return withoutFence;
    }

    return "";
  }

  private safeParseJson<T>(
    cleaned: string,
    rawContent: string,
    context: "analyze" | "replyTurn"
  ): T {
    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      console.error(
        `[ApiAgentProvider:${context}] JSON 解析失败，准备回退规则版。`,
        {
          rawContentPreview: truncateForLog(rawContent),
          cleanedContentPreview: truncateForLog(cleaned),
          error,
        }
      );
      throw error;
    }
  }

  private assertNonEmptyContent(
    content: string,
    data: unknown,
    context: ChatCompletionRequestKind,
    meta?: {
      usedJsonMode: boolean;
      willRetryWithoutJsonMode: boolean;
      usedThinkingDisabled?: boolean;
      stream?: boolean;
      retryReason?: ChatCompletionRetryReason;
    },
    attemptState?: AttemptState
  ): void {
    if (content.trim().length > 0) {
      return;
    }

    const providerError = extractProviderErrorMessage(data);
    if (providerError) {
      logProviderPayloadError(
        data,
        context,
        providerError,
        (context, attemptMode, options) =>
          this.buildAttemptLogMeta(context, attemptMode, options),
        meta
      );
      throw attachAttemptSummary(
        new Error(`provider error from API response: ${providerError}`),
        attemptState
      );
    }

    const preview = buildResponsePreview(data);
    logNullChoicesPayloadIfNeeded(
      data,
      context,
      (context, attemptMode, options) =>
        this.buildAttemptLogMeta(context, attemptMode, options),
      meta
    );

    console.error(
      `[ApiAgentProvider:${context}] 未提取到可解析内容，准备回退规则版。`,
      this.buildAttemptLogMeta(
        context,
        meta?.stream ? "stream_plain" : meta?.usedJsonMode ? "non_stream_json" : "non_stream_plain",
        {
          usedJsonMode: meta?.usedJsonMode ?? true,
          usedThinkingDisabled: meta?.usedThinkingDisabled ?? false,
          retryReason: meta?.retryReason,
          errorKind: getInvalidPayloadKind(data, this.providerProfile) ? "invalid_payload" : "empty_content",
          extra: {
            willRetryWithoutJsonMode: meta?.willRetryWithoutJsonMode ?? false,
            ...preview,
          },
        }
      )
    );
    console.debug("[MoodNest API empty responsePreview]", preview.responsePreview);

    throw attachAttemptSummary(
      new Error("empty content from API response"),
      attemptState
    );
  }

  private assertNonEmptyJsonCandidate(
    cleaned: string,
    rawContent: string,
    context: "analyze" | "replyTurn"
  ): void {
    if (cleaned.trim().length > 0) {
      return;
    }

    console.error(
      `[ApiAgentProvider:${context}] 未提取到完整 JSON 对象，准备回退规则版。`,
      {
        rawContentPreview: truncateForLog(rawContent),
      }
    );

    throw new Error("empty json candidate after extraction");
  }

  private extractReplyTextPrefix(content: string): string {
    const text = content.trim();
    if (!text.startsWith("{") || !text.includes('"replyText"')) {
      return "";
    }

    const keyIndex = text.indexOf('"replyText"');
    const colonIndex = text.indexOf(":", keyIndex);
    if (colonIndex === -1) {
      return "";
    }

    const openingQuoteIndex = text.indexOf('"', colonIndex + 1);
    if (openingQuoteIndex === -1) {
      return "";
    }

    let extracted = "";
    let escaped = false;

    for (let index = openingQuoteIndex + 1; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        if (char === "n") {
          extracted += "\n";
        } else if (char === "t") {
          extracted += "\t";
        } else if (char === '"' || char === "\\" || char === "/") {
          extracted += char;
        } else {
          extracted += char;
        }
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        break;
      }

      extracted += char;
    }

    const normalized = extracted.trim().replace(/[\\\s]+$/, "").trim();
    return normalized.length > 0 ? normalized : "";
  }

  private extractCompleteJsonObject(content: string): string {
    let startIndex = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];

      if (startIndex === -1) {
        if (char === "{") {
          startIndex = index;
          depth = 1;
        }
        continue;
      }

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return content.slice(startIndex, index + 1).trim();
        }
      }
    }

    return "";
  }

  private createLiveSupportResultSafe(
    replyText: string,
    analysis: AgentAnalysis
  ): LiveSupportResult {
    const fallbackNextStep =
      analysis.copingDirection.length > 0 ? analysis.copingDirection[0] ?? "" : "";
    const recommendedAction = recommendSupportAction("", analysis.riskLevel);

    return {
      replyText,
      recommendedAction,
      quickAnalysis: {
        corePain: this.safeText(analysis.supportFocus, "用户此刻有明显情绪压力"),
        currentNeed: this.safeText(analysis.responseGoal, "先被接住，再慢慢理清"),
        nextStep:
          fallbackNextStep || "先不用急着做很多，只要先把最难受的点留住",
        emotions: analysis.emotions,
        intensity: analysis.intensity,
        recommendedMode: analysis.recommendedMode,
        riskLevel: analysis.riskLevel,
      },
    };
  }

  private formatUserTurnForContext(turn: ChatTurn): string {
    const baseContent =
      turn.source === "local_action" && turn.hiddenContext?.trim()
        ? ""
        : turn.content.trim();
    const parts = [baseContent];
    if (turn.hiddenContext?.trim()) {
      parts.push(turn.hiddenContext.trim());
    }

    return parts.filter((part) => part.length > 0).join("\n");
  }

  private formatTurnContentForHistory(turn: ChatTurn): string {
    if (turn.role === "assistant" && turn.source === "local_action") {
      return "";
    }

    return this.formatUserTurnForContext(turn);
  }

  /*
  private createLiveSupportResult(
    replyText: string,
    analysis: AgentAnalysis
  ): LiveSupportResult {
    const fallbackNextStep =
      analysis.copingDirection.length > 0 ? analysis.copingDirection[0] ?? "" : "";

    return {
      replyText,
      quickAnalysis: {
        corePain: this.safeText(
          analysis.supportFocus,
          "鐢ㄦ埛姝ゅ埢鏈夋槑鏄炬儏缁帇鍔?
        ),
        currentNeed: this.safeText(
          analysis.responseGoal,
          "鍏堣鎺ヤ綇锛屽啀鎱㈡參鐞嗘竻"
        ),
        nextStep:
          fallbackNextStep || "鍏堜笉鐢ㄦ€ョ潃鍋氬緢澶氫紝鍙厛鎶婃渶闅惧彈鐨勭偣鐣欎綇",
        emotions: analysis.emotions,
        intensity: analysis.intensity,
        recommendedMode: analysis.recommendedMode,
        riskLevel: analysis.riskLevel,
      },
    };
  }

  */

  private isVagueEmotionExpression(text: string): boolean {
    return (
      /有点烦|有些烦|心里堵|堵得慌|有点难受|说不上来|说不出来|说不上|不知道为什么/.test(
        text
      ) &&
      !/实习|找工作|求职|岗位|投递|简历|面试|offer|秋招|春招|方向|职业|算法|AI产品|AI应用开发|技术顾问|数据工程/.test(
        text
      )
    );
  }

  private containsOpenEndedDecisionQuestion(text: string): boolean {
    return /你想做什么方向|你有哪些技能|你最喜欢哪个|你更适合什么|你想选什么方向/.test(
      text
    );
  }


  private buildChatCompletionBody(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    options?: { jsonMode?: boolean; disableThinking?: boolean; stream?: boolean }
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages,
      stream: options?.stream ?? false,
      temperature,
      max_tokens: maxTokens,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    if (options?.disableThinking) {
      body.thinking = { type: "disabled" };
    }

    return body;
  }

  private shouldDisableThinking(): boolean {
    return this.providerProfile.supportsThinkingControl;
  }

  private buildAttemptLogMeta(
    context: ChatCompletionRequestKind,
    attemptMode: "non_stream_json" | "non_stream_plain" | "stream_plain",
    options: {
      usedJsonMode: boolean;
      usedThinkingDisabled: boolean;
      retryReason?: ChatCompletionRetryReason;
      errorKind?: "http_error" | "provider_error" | "empty_content" | "invalid_payload";
      data?: unknown;
      extra?: Record<string, unknown>;
    }
  ): Record<string, unknown> {
    return buildAttemptLogMetaPure({
      context,
      attemptMode,
      providerProfile: this.providerProfile,
      normalizedBaseUrl: this.normalizedBaseUrl,
      model: this.options.model,
      usedJsonMode: options.usedJsonMode,
      usedThinkingDisabled: options.usedThinkingDisabled,
      retryReason: options.retryReason,
      errorKind: options.errorKind,
      data: options.data,
      extra: options.extra,
    });
  }

  private logAttemptSummary(summary: LLMAttemptSummary): void {
    logAttemptSummaryPure({
      providerProfileId: this.providerProfile.id,
      parserFamily: getParserFamily(this.providerProfile),
      summary,
      logPrefix: "[MoodNest LLM attempt summary]",
    });
  }

  private logFallbackAttemptSummary(error: unknown): void {
    const enrichedError = error as
      | (Error & {
          moodNestAttemptSummary?: {
            retryCount: number;
            errorTrail: string[];
            reasoningOnly: boolean;
          };
        })
      | undefined;

    const retryCount = enrichedError?.moodNestAttemptSummary?.retryCount ?? 0;
    const errorTrail = enrichedError?.moodNestAttemptSummary?.errorTrail ?? [];
    const reasoningOnly = enrichedError?.moodNestAttemptSummary?.reasoningOnly ?? false;

    this.logAttemptSummary({
      finalAttemptMode: "rule_based_fallback",
      status: "fallback",
      retryCount,
      errorTrail,
      textLength: 0,
      reasoningOnly,
    });
  }

  private safeText(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : fallback;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0
    );
  }

  private normalizeIntensity(value: unknown): number {
    return typeof value === "number"
      ? Math.max(1, Math.min(10, Math.round(value)))
      : 5;
  }

  private normalizeRiskLevel(value: unknown): RiskLevel {
    return value === "medium" || value === "high" ? value : "low";
  }

  private normalizeMode(value: unknown): AgentMode {
    return value === "comfort" || value === "organize" ? value : "clarify";
  }

  private asSceneTags(value: unknown): SceneTag[] {
    if (!Array.isArray(value)) return [];

    const valid: SceneTag[] = [
      "family-pressure",
      "comparison",
      "negation",
      "work-feedback",
      "relationship-conflict",
      "self-doubt",
      "burnout",
      "study-pressure",
      "fatigue",
    ];

    return value.filter(
      (item): item is SceneTag =>
        typeof item === "string" && valid.includes(item as SceneTag)
    );
  }
}
