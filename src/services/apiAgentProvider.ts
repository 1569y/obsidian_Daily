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

interface AttemptState {
  errorTrail: string[];
  reasoningOnly: boolean;
}

type AttemptErrorKind =
  | "http_error"
  | "provider_error"
  | "empty_content"
  | "invalid_payload"
  | "quota_or_rate_limit"
  | `invalid_payload:${InvalidPayloadKind}`;

export class ApiAgentProvider {
  private static readonly LOG_PREVIEW_LIMIT = 1500;
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
    this.normalizedBaseUrl = this.normalizeChatCompletionsEndpoint(options.baseUrl);
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
      if (this.isAbortError(error)) {
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
      if (this.isAbortError(error)) {
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
            replyTextPreview: this.truncateForLog(extractedReplyText),
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
    return parseResponseByFamily(data, this.getParserFamily()).text;
  }

  private async requestChatCompletionJson(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: ChatCompletionRequestKind
  ): Promise<ChatCompletionRequestResult> {
    this.warnIfEndpointLooksIncomplete(context);

    const attemptState = this.createAttemptState();
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
          this.pushAttemptError(attemptState, "quota_or_rate_limit");
          throw this.attachAttemptSummary(
            new Error(
              `API 请求失败: ${firstAttempt.status} - ${firstAttempt.errorText ?? ""}`
            ),
            attemptState
          );
        }

        if (firstAttempt.status === 400) {
          this.pushAttemptError(attemptState, "http_error");
          console.debug(
            `[ApiAgentProvider:${context}] JSON mode 请求返回 400，尝试去掉 response_format 重试。`,
            this.buildAttemptLogMeta(context, "non_stream_json", {
              usedJsonMode: true,
              usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
              retryReason: "http_400",
              errorKind: "http_error",
              extra: {
                status: firstAttempt.status,
                errorPreview: this.truncateForLog(firstAttempt.errorText ?? ""),
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
      const firstProviderError = this.extractProviderErrorMessage(firstData);
      if (firstProviderError) {
        this.pushAttemptError(attemptState, "provider_error");
        this.logProviderPayloadError(firstData, context, firstProviderError, {
          usedJsonMode: true,
          willRetryWithoutJsonMode: false,
          usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
          stream: false,
          retryReason: "provider_error",
        });
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

      const invalidPayloadKind = this.getInvalidPayloadKind(firstData);
      this.pushAttemptError(
        attemptState,
        invalidPayloadKind
          ? this.formatInvalidPayloadErrorKind(invalidPayloadKind)
          : "empty_content"
      );
      this.logNullChoicesPayloadIfNeeded(firstData, context, {
        usedJsonMode: true,
        willRetryWithoutJsonMode: true,
        usedThinkingDisabled: firstAttempt.usedThinkingDisabled,
        stream: false,
        retryReason: invalidPayloadKind ? "invalid_payload" : "empty_content",
      });

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
        this.pushAttemptError(attemptState, "quota_or_rate_limit");
        throw this.attachAttemptSummary(
          new Error(
            `API 请求失败: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
          ),
          attemptState
        );
      }

      if (retryAttempt.status === 400 && disableThinking) {
        this.pushAttemptError(attemptState, "http_error");
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
              errorPreview: this.truncateForLog(retryAttempt.errorText ?? ""),
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

      throw this.attachAttemptSummary(
        new Error(
          `API 请求失败: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
        ),
        attemptState
      );
    }

    const retryData = retryAttempt.data;
    const retryProviderError = this.extractProviderErrorMessage(retryData);
    if (retryProviderError) {
      this.pushAttemptError(attemptState, "provider_error");
      this.logProviderPayloadError(retryData, context, retryProviderError, {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
        stream: false,
        retryReason,
      });
      if (this.shouldTryStreamFallback("provider_error")) {
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
      throw this.attachAttemptSummary(
        new Error(`API 返回错误内容: ${retryProviderError}`),
        attemptState
      );
    }

    const retryContent = this.getMessageContent(retryData);
    const invalidPayloadKind = this.getInvalidPayloadKind(retryData);
    if (retryContent.trim().length === 0 && this.shouldTryStreamFallback(invalidPayloadKind ? "invalid_payload" : "empty_content")) {
      this.pushAttemptError(
        attemptState,
        invalidPayloadKind
          ? this.formatInvalidPayloadErrorKind(invalidPayloadKind)
          : "empty_content"
      );
      this.logNullChoicesPayloadIfNeeded(retryData, context, {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
        stream: false,
        retryReason: invalidPayloadKind ? "invalid_payload" : retryReason,
      });

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
        this.pushAttemptError(attemptState, "quota_or_rate_limit");
        throw this.attachAttemptSummary(
          new Error(
            `API stream 请求失败: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
          ),
          attemptState
        );
      }

      if (streamAttempt.status === 400 && disableThinking) {
        this.pushAttemptError(attemptState, "http_error");
        console.debug(
          `[ApiAgentProvider:${context}] stream fallback 返回 400，尝试去掉 thinking 参数后再次拉取 stream。`,
          this.buildAttemptLogMeta(context, "stream_plain", {
            usedJsonMode: false,
            usedThinkingDisabled: true,
            retryReason: "thinking_400",
            errorKind: "http_error",
            extra: {
              status: streamAttempt.status,
              errorPreview: this.truncateForLog(streamAttempt.errorText ?? ""),
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

      throw this.attachAttemptSummary(
        new Error(
          `API stream 请求失败: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
        ),
        attemptState
      );
    }

    const streamData = streamAttempt.data;
    const streamProviderError = this.extractProviderErrorMessage(streamData);
    if (streamProviderError) {
      this.pushAttemptError(attemptState, "provider_error");
      this.logProviderPayloadError(streamData, context, streamProviderError, {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
        stream: true,
        retryReason,
      });
      throw this.attachAttemptSummary(
        new Error(`API stream 返回错误内容: ${streamProviderError}`),
        attemptState
      );
    }

    const streamContent = this.getMessageContent(streamData);
    attemptState.reasoningOnly = this.isReasoningOnlyStreamPayload(streamData);
    if (streamContent.trim().length === 0) {
      this.pushAttemptError(attemptState, "empty_content");
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

    const response = await fetch(this.normalizedBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify(body),
    });

    const rawText = await response.text();

    if (!response.ok) {
      const quotaOrRateLimit = this.isQuotaOrRateLimitError(response.status, rawText);
      if (quotaOrRateLimit) {
        console.warn("API 额度不足或限流，已停止 API 尝试并回退规则版。", {
          status: response.status,
          endpoint: this.normalizedBaseUrl,
          bodyPreview: this.truncateForLog(rawText),
        });
      }

      return {
        ok: false,
        status: response.status,
        errorText: rawText,
        quotaOrRateLimit,
        usedJsonMode: options.jsonMode,
        usedThinkingDisabled: options.disableThinking,
        stream: options.stream,
      };
    }

    try {
      const data = options.stream
        ? this.parseStreamResponsePayload(rawText)
        : rawText.trim().length > 0
          ? (JSON.parse(rawText) as unknown)
          : {};

      return {
        ok: true,
        status: response.status,
        data,
        usedJsonMode: options.jsonMode,
        usedThinkingDisabled: options.disableThinking,
        stream: options.stream,
      };
    } catch (error) {
      console.error("[ApiAgentProvider] API 返回了无法解析的 JSON。", {
        usedJsonMode: options.jsonMode,
        usedThinkingDisabled: options.disableThinking,
        stream: options.stream,
        endpointPath: this.getSafeEndpointPath(),
        responsePreview: this.truncateForLog(rawText),
        error,
      });
      throw error;
    }
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
          errorPreview: this.truncateForLog(errorText),
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
          rawContentPreview: this.truncateForLog(rawContent),
          cleanedContentPreview: this.truncateForLog(cleaned),
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

    const providerError = this.extractProviderErrorMessage(data);
    if (providerError) {
      this.logProviderPayloadError(data, context, providerError, meta);
      throw this.attachAttemptSummary(
        new Error(`provider error from API response: ${providerError}`),
        attemptState
      );
    }

    const preview = this.buildResponsePreview(data);
    this.logNullChoicesPayloadIfNeeded(data, context, meta);

    console.error(
      `[ApiAgentProvider:${context}] 未提取到可解析内容，准备回退规则版。`,
      this.buildAttemptLogMeta(
        context,
        meta?.stream ? "stream_plain" : meta?.usedJsonMode ? "non_stream_json" : "non_stream_plain",
        {
          usedJsonMode: meta?.usedJsonMode ?? true,
          usedThinkingDisabled: meta?.usedThinkingDisabled ?? false,
          retryReason: meta?.retryReason,
          errorKind: this.getInvalidPayloadKind(data) ? "invalid_payload" : "empty_content",
          extra: {
            willRetryWithoutJsonMode: meta?.willRetryWithoutJsonMode ?? false,
            ...preview,
          },
        }
      )
    );
    console.debug("[MoodNest API empty responsePreview]", preview.responsePreview);

    throw this.attachAttemptSummary(
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
        rawContentPreview: this.truncateForLog(rawContent),
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

  private extractTextFromContentValue(value: unknown, depth = 0): string {
    if (depth > 4) {
      return "";
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const collected: string[] = [];

      for (const item of value) {
        const extracted = this.extractTextFromContentValue(item, depth + 1);
        if (extracted) {
          collected.push(extracted);
        }
      }

      return collected.join("\n").trim();
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const typedValue = value as Record<string, unknown>;

    if (typeof typedValue.value === "string" && typedValue.value.trim().length > 0) {
      return typedValue.value.trim();
    }

    if (typeof typedValue.text === "string" && typedValue.text.trim().length > 0) {
      return typedValue.text.trim();
    }

    const nestedText = typedValue.text;
    if (nestedText && typeof nestedText === "object") {
      const extractedNestedText = this.extractTextFromContentValue(
        nestedText,
        depth + 1
      );
      if (extractedNestedText) {
        return extractedNestedText;
      }
    }

    const nestedContent = typedValue.content;
    if (nestedContent !== undefined) {
      const extractedContent = this.extractTextFromContentValue(
        nestedContent,
        depth + 1
      );
      if (extractedContent) {
        return extractedContent;
      }
    }

    const nestedParts = typedValue.parts;
    if (nestedParts !== undefined) {
      const extractedParts = this.extractTextFromContentValue(
        nestedParts,
        depth + 1
      );
      if (extractedParts) {
        return extractedParts;
      }
    }

    const nestedData = typedValue.data;
    if (nestedData !== undefined) {
      const extractedData = this.extractTextFromContentValue(
        nestedData,
        depth + 1
      );
      if (extractedData) {
        return extractedData;
      }
    }

    return "";
  }

  private getResponsePayloadCandidates(
    data: unknown
  ): Array<Record<string, unknown>> {
    if (!data || typeof data !== "object") {
      return [];
    }

    const responseData = data as Record<string, unknown>;
    const candidates: Array<Record<string, unknown>> = [responseData];

    const nestedKeys = ["data", "response", "result", "message", "reply", "answer"];
    for (const key of nestedKeys) {
      const nested = responseData[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        candidates.push(nested as Record<string, unknown>);
      }
    }

    return candidates;
  }

  private extractMessageContentFromPayload(
    payload: Record<string, unknown>
  ): string {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const choice0 =
      choices.length > 0 && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as Record<string, unknown>)
        : null;

    if (choice0) {
      const message =
        choice0.message && typeof choice0.message === "object"
          ? (choice0.message as Record<string, unknown>)
          : null;
      const delta =
        choice0.delta && typeof choice0.delta === "object"
          ? (choice0.delta as Record<string, unknown>)
          : null;

      const messageText = this.extractTextFromContentValue(message?.content);
      if (messageText) {
        return messageText;
      }

      const choiceText = choice0.text;
      if (typeof choiceText === "string" && choiceText.trim().length > 0) {
        return choiceText.trim();
      }

      const deltaText = this.extractTextFromContentValue(delta?.content);
      if (deltaText) {
        return deltaText;
      }
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const candidate0 =
      candidates.length > 0 && candidates[0] && typeof candidates[0] === "object"
        ? (candidates[0] as Record<string, unknown>)
        : null;

    const candidateText = this.extractTextFromContentValue(candidate0?.content);
    if (candidateText) {
      return candidateText;
    }

    const outputText = payload.output_text;
    if (typeof outputText === "string" && outputText.trim().length > 0) {
      return outputText.trim();
    }

    const directFieldKeys = ["content", "text", "message", "reply", "result", "answer"];
    for (const key of directFieldKeys) {
      const extracted = this.extractTextFromContentValue(payload[key]);
      if (extracted) {
        return extracted;
      }
    }

    const output = Array.isArray(payload.output) ? payload.output : [];
    if (output.length > 0) {
      const output0 =
        output[0] && typeof output[0] === "object"
          ? (output[0] as Record<string, unknown>)
          : null;

      const outputTextContent = this.extractTextFromContentValue(output0?.content);
      if (outputTextContent) {
        return outputTextContent;
      }
    }

    return "";
  }

  private buildResponsePreview(data: unknown): {
    topLevelKeys: string[];
    nestedPayloadKeys: string[][];
    primaryPayloadKeys: string[];
    choicesType: string;
    choice0Keys: string[];
    candidate0Keys: string[];
    messageKeys: string[];
    deltaKeys: string[];
    outputType: string;
    outputKeys: string[];
    output0Keys: string[];
    messageContentType: string;
    messageContentPreview: string;
    reasoningContentType: string;
    reasoningContentPreview: string;
    choiceTextType: string;
    choiceTextPreview: string;
    responsePreview: string;
  } {
    const responseData =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const payloadCandidates = this.getResponsePayloadCandidates(responseData);
    const primaryPayload =
      payloadCandidates.find(
        (payload) =>
          Array.isArray(payload.choices) ||
          Array.isArray(payload.output) ||
          Array.isArray(payload.candidates) ||
          payload.output_text !== undefined ||
          payload.content !== undefined
      ) ?? payloadCandidates[0] ?? {};
    const choices = Array.isArray(primaryPayload.choices) ? primaryPayload.choices : [];
    const choice0 =
      choices.length > 0 && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as Record<string, unknown>)
        : {};
    const candidates = Array.isArray(primaryPayload.candidates)
      ? primaryPayload.candidates
      : [];
    const candidate0 =
      candidates.length > 0 && candidates[0] && typeof candidates[0] === "object"
        ? (candidates[0] as Record<string, unknown>)
        : {};
    const message =
      choice0.message && typeof choice0.message === "object"
        ? (choice0.message as Record<string, unknown>)
        : {};
    const delta =
      choice0.delta && typeof choice0.delta === "object"
        ? (choice0.delta as Record<string, unknown>)
        : {};
    const messageContent = message.content;
    const reasoningContent = message.reasoning_content;
    const choiceText = choice0.text;
    const output = primaryPayload.output;
    const output0 =
      Array.isArray(output) &&
      output.length > 0 &&
      output[0] &&
      typeof output[0] === "object"
        ? (output[0] as Record<string, unknown>)
        : {};

    return {
      topLevelKeys: Object.keys(responseData),
      nestedPayloadKeys: payloadCandidates.map((payload) => Object.keys(payload)),
      primaryPayloadKeys: Object.keys(primaryPayload),
      choicesType:
        primaryPayload.choices === null
          ? "null"
          : Array.isArray(primaryPayload.choices)
            ? "array"
            : typeof primaryPayload.choices,
      choice0Keys: Object.keys(choice0),
      candidate0Keys: Object.keys(candidate0),
      messageKeys: Object.keys(message),
      deltaKeys: Object.keys(delta),
      outputType: Array.isArray(output) ? "array" : typeof output,
      outputKeys:
        output && typeof output === "object" && !Array.isArray(output)
          ? Object.keys(output as Record<string, unknown>)
          : [],
      output0Keys: Object.keys(output0),
      messageContentType: Array.isArray(messageContent)
        ? "array"
        : typeof messageContent,
      messageContentPreview: this.truncateForLog(
        this.safeSerializeForLog(messageContent)
      ),
      reasoningContentType: Array.isArray(reasoningContent)
        ? "array"
        : typeof reasoningContent,
      reasoningContentPreview: this.truncateForLog(
        this.safeSerializeForLog(reasoningContent)
      ),
      choiceTextType: typeof choiceText,
      choiceTextPreview: this.truncateForLog(this.safeSerializeForLog(choiceText)),
      responsePreview: this.truncateForLog(this.safeSerializeForLog(data)),
    };
  }

  private extractProviderErrorMessage(data: unknown): string {
    for (const payload of this.getResponsePayloadCandidates(data)) {
      const message = normalizeProviderError(payload);
      if (message) {
        return message;
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

  private truncateForLog(value: string): string {
    const text =
      typeof value === "string" ? value : this.safeSerializeForLog(value);

    if (text.length <= ApiAgentProvider.LOG_PREVIEW_LIMIT) {
      return text;
    }

    return `${text.slice(0, ApiAgentProvider.LOG_PREVIEW_LIMIT)}...(truncated)`;
  }

  private safeSerializeForLog(value: unknown): string {
    try {
      const serialized = JSON.stringify(this.sanitizeForLog(value));
      if (typeof serialized === "string") {
        return serialized;
      }

      return String(value);
    } catch {
      return "[unserializable response]";
    }
  }

  private sanitizeForLog(
    value: unknown,
    seen: WeakSet<object> = new WeakSet<object>()
  ): unknown {
    if (typeof value === "string") {
      return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForLog(item, seen));
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/authorization|api[_-]?key|token/i.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }

      sanitized[key] = this.sanitizeForLog(item, seen);
    }

    return sanitized;
  }

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

  private looksLikeProviderErrorText(text: string): boolean {
    return /error|invalid|unauthorized|forbidden|quota|rate limit|not found|denied|failed|exception|超时|错误|失败|无效|额度|限制|拒绝/i.test(
      text
    );
  }

  private extractProviderErrorMessageFromPayload(
    payload: Record<string, unknown>
  ): string {
    if (payload.error !== undefined) {
      const errorText = this.extractErrorText(payload.error);
      if (errorText) {
        return errorText;
      }
    }

    const messageText = this.extractErrorText(payload.message);
    const codeValue = payload.code;
    const codeText =
      typeof codeValue === "string" || typeof codeValue === "number"
        ? String(codeValue)
        : "";
    const hasNonSuccessCode =
      codeText.length > 0 && !["0", "200", "ok", "success"].includes(codeText.toLowerCase());

    if (hasNonSuccessCode && messageText) {
      return `${codeText}: ${messageText}`;
    }

    if (payload.success === false && messageText) {
      return messageText;
    }

    const hasStructuredContentShape =
      Array.isArray(payload.choices) ||
      Array.isArray(payload.output) ||
      Array.isArray(payload.candidates) ||
      payload.output_text !== undefined ||
      payload.content !== undefined ||
      payload.text !== undefined ||
      payload.reply !== undefined ||
      payload.result !== undefined ||
      payload.answer !== undefined;

    if (!hasStructuredContentShape && messageText && this.looksLikeProviderErrorText(messageText)) {
      return messageText;
    }

    return "";
  }

  private extractErrorText(value: unknown): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const typedValue = value as Record<string, unknown>;
    const preferredFields = [
      typedValue.message,
      typedValue.error,
      typedValue.detail,
      typedValue.type,
      typedValue.code,
    ];

    for (const field of preferredFields) {
      const extracted = this.extractTextFromContentValue(field);
      if (extracted && this.looksLikeProviderErrorText(extracted)) {
        return extracted;
      }
    }

    const genericExtracted = this.extractTextFromContentValue(value);
    return this.looksLikeProviderErrorText(genericExtracted) ? genericExtracted : "";
  }

  private logProviderPayloadError(
    data: unknown,
    context: ChatCompletionRequestKind,
    providerError: string,
    meta?: {
      usedJsonMode?: boolean;
      willRetryWithoutJsonMode?: boolean;
      usedThinkingDisabled?: boolean;
      stream?: boolean;
      retryReason?: ChatCompletionRetryReason;
    }
  ): void {
    console.debug(
      `[ApiAgentProvider:${context}] 检测到 provider error payload，准备回退规则版。`,
      this.buildAttemptLogMeta(
        context,
        meta?.stream ? "stream_plain" : meta?.usedJsonMode ? "non_stream_json" : "non_stream_plain",
        {
          usedJsonMode: meta?.usedJsonMode ?? true,
          usedThinkingDisabled: meta?.usedThinkingDisabled ?? false,
          retryReason: meta?.retryReason,
          errorKind: "provider_error",
          data,
          extra: {
            willRetryWithoutJsonMode: meta?.willRetryWithoutJsonMode ?? false,
            providerError,
          },
        }
      )
    );
  }

  private parseStreamResponsePayload(rawText: string): unknown {
    const { content, reasoningOnly } = this.parseSseContent(rawText);
    if (!content) {
      return {
        choices: null,
        stream: true,
        reasoningOnly,
        rawPreview: this.truncateForLog(rawText),
      };
    }

    return {
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      stream: true,
      reasoningOnly,
    };
  }

  private parseSseContent(rawText: string): { content: string; reasoningOnly: boolean } {
    const lines = rawText.split(/\r?\n/);
    let finalContent = "";
    let sawReasoning = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      try {
        const chunk = JSON.parse(payload) as Record<string, unknown>;
        const parsedChunk = parseOpenAIChatStreamChunk(chunk);

        if (parsedChunk.contentDelta.trim().length > 0) {
          finalContent += parsedChunk.contentDelta;
        }

        if (parsedChunk.reasoningDelta.trim().length > 0) {
          sawReasoning = true;
        }
      } catch {
        continue;
      }
    }

    const trimmedContent = finalContent.trim();
    return {
      content: trimmedContent,
      reasoningOnly: sawReasoning && trimmedContent.length === 0,
    };
  }

  private getSafeEndpointPath(): string {
    try {
      return new URL(this.normalizedBaseUrl).pathname || "/";
    } catch {
      const rawBaseUrl = this.normalizedBaseUrl.trim();
      const schemeIndex = rawBaseUrl.indexOf("://");
      if (schemeIndex === -1) {
        return rawBaseUrl;
      }

      const pathStart = rawBaseUrl.indexOf("/", schemeIndex + 3);
      return pathStart === -1 ? "/" : rawBaseUrl.slice(pathStart);
    }
  }

  private warnIfEndpointLooksIncomplete(context: ChatCompletionRequestKind): void {
    const endpointPath = this.getSafeEndpointPath();
    if (/\/chat\/completions\/?$/i.test(endpointPath)) {
      return;
    }

    console.debug(
      `[ApiAgentProvider:${context}] 当前 baseUrl 看起来不是完整的 /chat/completions endpoint。当前 fetch 实现需要完整 endpoint。`,
      {
        endpointPath,
        model: this.options.model,
      }
    );
  }

  private normalizeChatCompletionsEndpoint(baseUrl: string): string {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      if (/\/chat\/completions\/?$/i.test(parsed.pathname)) {
        return parsed.toString();
      }

      if (/\/v1\/?$/i.test(parsed.pathname)) {
        parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/chat/completions`;
        return parsed.toString();
      }

      return parsed.toString();
    } catch (error) {
      console.warn(
        "[ApiAgentProvider] 无法解析 baseUrl，保留原值，不自动补全 /chat/completions。",
        {
          baseUrl: trimmed,
          error,
        }
      );
      return trimmed;
    }
  }

  private formatInvalidPayloadErrorKind(
    kind: InvalidPayloadKind
  ): `invalid_payload:${InvalidPayloadKind}` {
    return `invalid_payload:${kind}`;
  }

  private isQuotaOrRateLimitError(status: number, bodyText: string): boolean {
    if (status === 429) {
      return true;
    }

    const normalizedBody = bodyText.toLowerCase();
    return (
      normalizedBody.includes("insufficient_quota") ||
      normalizedBody.includes("rate_limit") ||
      normalizedBody.includes("too many requests") ||
      normalizedBody.includes("you exceeded your current quota") ||
      normalizedBody.includes("allocated quota exceeded") ||
      normalizedBody.includes("token-limit") ||
      normalizedBody.includes("quota")
    );
  }

  private hasNullChoicesPayload(data: unknown): boolean {
    return this.getResponsePayloadCandidates(data).some(
      (payload) => payload.choices === null
    );
  }

  private logNullChoicesPayloadIfNeeded(
    data: unknown,
    context: ChatCompletionRequestKind,
    meta?: {
      usedJsonMode?: boolean;
      willRetryWithoutJsonMode?: boolean;
      usedThinkingDisabled?: boolean;
      stream?: boolean;
      retryReason?: ChatCompletionRetryReason;
    }
  ): void {
    if (!this.hasNullChoicesPayload(data)) {
      return;
    }

    console.debug(
      `[ApiAgentProvider:${context}] provider returned choices:null; this is an invalid/empty chat completion payload, not a parser miss.`,
      this.buildAttemptLogMeta(
        context,
        meta?.stream ? "stream_plain" : meta?.usedJsonMode ? "non_stream_json" : "non_stream_plain",
        {
          usedJsonMode: meta?.usedJsonMode ?? true,
          usedThinkingDisabled: meta?.usedThinkingDisabled ?? false,
          retryReason: meta?.retryReason,
          errorKind: "invalid_payload",
          extra: {
            invalidPayloadMessage:
              "invalid OpenAI-compatible payload: choices is null",
          },
        }
      )
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

  private getParserFamily(): LLMResponseParserFamily {
    return this.providerProfile.responseParser;
  }

  private getInvalidPayloadKind(data: unknown): InvalidPayloadKind | null {
    return classifyInvalidPayload(data, this.getParserFamily());
  }

  private shouldTryStreamFallback(
    errorKind: "empty_content" | "invalid_payload" | "provider_error"
  ): boolean {
    if (!this.providerProfile.supportsStreaming) {
      return false;
    }

    return errorKind === "empty_content" || errorKind === "invalid_payload" || errorKind === "provider_error";
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
    return {
      requestKind: context,
      providerProfileId: this.providerProfile.id,
      parserFamily: this.getParserFamily(),
      attemptMode,
      endpointPath: this.getSafeEndpointPath(),
      model: this.options.model,
      usedJsonMode: options.usedJsonMode,
      usedThinkingDisabled: options.usedThinkingDisabled,
      errorKind: options.errorKind,
      retryReason: options.retryReason,
      ...(options.data ? this.buildResponsePreview(options.data) : {}),
      ...(options.extra ?? {}),
    };
  }

  private createAttemptState(): AttemptState {
    return {
      errorTrail: [],
      reasoningOnly: false,
    };
  }

  private pushAttemptError(
    attemptState: AttemptState,
    errorKind: AttemptErrorKind
  ): void {
    attemptState.errorTrail.push(errorKind);
  }

  private attachAttemptSummary(error: Error, attemptState?: AttemptState): Error {
    if (!attemptState) {
      return error;
    }

    const enrichedError = error as Error & {
      moodNestAttemptSummary?: {
        retryCount: number;
        errorTrail: string[];
        reasoningOnly: boolean;
      };
    };

    enrichedError.moodNestAttemptSummary = {
      retryCount: attemptState.errorTrail.length,
      errorTrail: [...attemptState.errorTrail],
      reasoningOnly: attemptState.reasoningOnly,
    };

    return enrichedError;
  }

  private logAttemptSummary(summary: {
    finalAttemptMode: "non_stream_json" | "non_stream_plain" | "stream_plain" | "rule_based_fallback";
    status: "success" | "fallback";
    retryCount: number;
    errorTrail: string[];
    textLength: number;
    reasoningOnly: boolean;
  }): void {
    const trail = summary.errorTrail.length > 0 ? summary.errorTrail.join(">") : "none";
    const message = `[MoodNest LLM attempt summary] provider=${this.providerProfile.id} parser=${this.getParserFamily()} final=${summary.finalAttemptMode} status=${summary.status} retries=${summary.retryCount} errorTrail=${trail} textLength=${summary.textLength} reasoningOnly=${summary.reasoningOnly}`;
    if (summary.status === "fallback") {
      console.warn(message);
      return;
    }

    console.debug(message);
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

  private isReasoningOnlyStreamPayload(data: unknown): boolean {
    const payloads = this.getResponsePayloadCandidates(data);
    for (const payload of payloads) {
      if (!payload || typeof payload !== "object") {
        continue;
      }

      const reasoningOnly = payload.reasoningOnly;
      if (typeof reasoningOnly === "boolean") {
        return reasoningOnly;
      }
    }

    return false;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError";
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
