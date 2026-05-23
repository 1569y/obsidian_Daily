// agentService.ts
import type {
  ActionCardContext,
  AgentResult,
  MoodNestSettings,
  ChatTurn,
  LiveSupportResult,
  AgentReply,
  AgentProviderProfile,
} from "../types";
import { RuleBasedAgentProvider } from "./ruleBasedAgentProvider";
import { ApiAgentProvider } from "./apiAgentProvider";
import {
  appendRecommendedActionHint,
  recommendSupportAction,
} from "./actionRecommendation";
import { resolveLowEnergyDecisionReply } from "./lowEnergyDecisionPolicy";
import {
  resolveLongTextActionReply,
  resolveLongTextIntakeReply,
} from "./longTextIntakePolicy";

export class AgentService {
  private ruleProvider: RuleBasedAgentProvider;
  private apiProvider: ApiAgentProvider | null = null;

  constructor(private settings: MoodNestSettings) {
    this.ruleProvider = new RuleBasedAgentProvider(settings.agentPersona);
    this.refreshProviders();
  }

  updateSettings(settings: MoodNestSettings) {
    this.settings = settings;
    this.refreshProviders();
  }

  private refreshProviders() {
    this.ruleProvider.setPersona(this.settings.agentPersona);

    const activeProfile = this.getUsableActiveProfile();

    if (this.settings.agentTier === "api" && activeProfile) {
      this.apiProvider = new ApiAgentProvider({
        providerType: activeProfile.providerType,
        baseUrl: activeProfile.baseUrl,
        apiKey: activeProfile.apiKey,
        model: activeProfile.model,
        persona: this.settings.agentPersona,
      });
    } else {
      this.apiProvider = null;
    }
  }

  private getUsableActiveProfile(): AgentProviderProfile | null {
    const profile = this.settings.agentProfiles.find(
      (item) => item.id === this.settings.activeAgentProfileId
    );

    if (!profile || !profile.enabled) {
      return null;
    }

    if (!profile.baseUrl.trim() || !profile.apiKey.trim() || !profile.model.trim()) {
      return null;
    }

    return profile;
  }

  async run(rawText: string): Promise<AgentResult> {
    if (this.settings.agentTier === "api" && this.apiProvider) {
      return this.apiProvider.run(rawText);
    }

    return this.ruleProvider.run(rawText);
  }

  async replyTurn(
    userMessage: string,
    history: ChatTurn[]
  ): Promise<LiveSupportResult> {
    if (this.settings.agentTier === "api" && this.apiProvider) {
      return this.apiProvider.replyTurn(userMessage, history);
    }

    // 分析层：看最近几轮上下文，帮助 quickAnalysis 更稳
    const contextText = this.buildRuleBasedContext(userMessage, history);
    const analysis = await this.ruleProvider.analyze(contextText);
    const currentActionContext = this.extractCurrentActionContext(history, userMessage);
    const actionContextReply = currentActionContext
      ? this.resolveActionContextReply(currentActionContext)
      : null;
    const longTextIntake = resolveLongTextIntakeReply(userMessage, {
      riskLevel: analysis.riskLevel,
    });
    const decisionReply = resolveLowEnergyDecisionReply(contextText, {
      riskLevel: analysis.riskLevel,
    });

    // 回复层：只根据“当前这句”来决定动作
    const reply = actionContextReply
      ? {
          mode: "organize" as const,
          message: actionContextReply,
        }
      : longTextIntake
      ? {
          mode: "organize" as const,
          message: longTextIntake.reply,
        }
      : decisionReply
      ? {
          mode: "organize" as const,
          message: decisionReply,
        }
      : await this.ruleProvider.reply(userMessage, analysis);

    const fallbackNextStep =
      analysis.copingDirection.length > 0
        ? analysis.copingDirection[0] ?? ""
        : "";
    const recommendedAction = recommendSupportAction(
      userMessage,
      analysis.riskLevel
    );

    return {
      replyText: appendRecommendedActionHint(
        this.buildRuleBasedLiveReplyText(reply),
        recommendedAction,
        analysis.riskLevel
      ),
      recommendedAction,
      quickAnalysis: {
        corePain: analysis.supportFocus || "用户此刻有明显情绪压力",
        currentNeed: analysis.responseGoal || "先被接住，再慢慢理清",
        nextStep:
          fallbackNextStep || "先不用急着做很多，只先把最难受的点留住",
        emotions: analysis.emotions,
        intensity: analysis.intensity,
        recommendedMode: analysis.recommendedMode,
        riskLevel: analysis.riskLevel,
      },
    };
  }

  /**
   * 规则版不做复杂多轮记忆，但至少带最近几轮用户内容，
   * 避免 quickAnalysis 每一轮都像重新开始。
   */
  private buildRuleBasedContext(
    userMessage: string,
    history: ChatTurn[]
  ): string {
    const recentUserTurns = history
      .filter((item) => item.role === "user")
      .slice(-3)
      .map((item) => this.formatUserTurnForContext(item))
      .filter((text) => text.length > 0);

    const merged = [...recentUserTurns, userMessage.trim()].filter(Boolean);

    // 去重，避免同一句被分析两次
    const deduped = merged.filter(
      (text, index, arr) => arr.findIndex((x) => x === text) === index
    );

    return deduped.join("\n");
  }

  private formatUserTurnForContext(turn: ChatTurn): string {
    const baseContent =
      turn.source === "local_action" && turn.hiddenContext?.trim()
        ? ""
        : turn.content.trim();
    const parts = [baseContent];
    if (turn.hiddenContext?.trim() && !turn.actionContext) {
      parts.push(turn.hiddenContext.trim());
    }

    return parts.filter((part) => part.length > 0).join("\n");
  }

  private extractCurrentActionContext(
    history: ChatTurn[],
    userMessage: string
  ): ActionCardContext | null {
    const matchedTurn = [...history]
      .reverse()
      .find(
        (turn) =>
          turn.role === "user" &&
          turn.content.trim() === userMessage.trim() &&
          !!turn.actionContext
      );

    return matchedTurn?.actionContext ?? null;
  }

  private resolveActionContextReply(
    actionContext: ActionCardContext
  ): string | null {
    if (actionContext.actionId === "long_text_intake") {
      return resolveLongTextActionReply(actionContext);
    }

    return null;
  }

  private buildRuleBasedLiveReplyText(reply: AgentReply): string {
    const message = reply.message.trim();
    const followUp = reply.followUpPrompt?.trim();

    if (reply.mode !== "clarify" || !followUp) {
      return message;
    }

    if (message.includes(followUp)) {
      return message;
    }

    return `${message}\n\n${followUp}`;
  }
}
