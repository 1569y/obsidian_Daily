export interface MoodNestSettings {
  rootFolder: string;
  dailyFolder: string;
  useExternalAI: boolean;
  groundingAudioFolder?: string;
  groundingImageFolder?: string;
  musicVolume?: number;
  generatedSoundVolume?: number;
  enableOnlineSound?: boolean;
  trustedOnlineSoundUrls?: string[];
  generatedSoundPresets?: GeneratedSoundPreset[];

  agentTier: AgentTier;
  agentPersona: AgentPersona;

  agentProfiles: AgentProviderProfile[];
  activeAgentProfileId: string;

  sttTier: SttTier;
  sttApiBaseUrl: string;
  sttApiKey: string;
  sttApiModel: string;

  sttEmbeddedModel: EmbeddedSttModel;
}

export interface EmotionEntry {
  id: string;
  createdAt: string;
  rawText: string;
  archivePath: string;
}

export type AgentTier = "rule_based" | "api";
export type SttTier = "embedded_local" | "api";
export type AgentProviderType = "openai_compatible";

export type EmbeddedSttModel = "tiny" | "base" | "small";

export interface AgentProviderProfile {
  id: string;
  name: string;
  providerType: AgentProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export type AgentPersona =
  | "gentle_companion"
  | "calm_organizer"
  | "balanced_supporter";

export type AgentMode = "comfort" | "clarify" | "organize";

export type RiskLevel = "low" | "medium" | "high";

export interface RecommendedAction {
  id: string;
  type:
    | "breathing"
    | "sound"
    | "grounding"
    | "thirty_minute_replay"
    | "gentle_clarify"
    | "long_text_intake"
    | "internship_requirement_overload"
    | "micro_action_deck"
    | "none";
  title: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface ActionCompletionLog {
  actionId: string;
  actionType: RecommendedAction["type"];
  actionLabel: string;
  completedAt: string;
  source: "action_panel";
  gentlePoints?: number;
}

export interface GeneratedSoundPreset {
  id?: string;
  name: string;
  keywordInput?: string;
  createdAt?: string;
  preset: string;
  resolvedPreset?: string;
  displayLabel?: string;
  helperText?: string;
  seed?: number;
  keywords?: string[];
  duration: number;
}

export interface SuggestedActionArchiveItem {
  label: string;
  kind?: "support_action" | "task";
  status: "suggested" | "selected" | "completed" | "dismissed";
  addToJournal?: boolean;
}

export type SceneTag =
  | "family-pressure"
  | "comparison"
  | "negation"
  | "work-feedback"
  | "relationship-conflict"
  | "self-doubt"
  | "burnout"
  | "study-pressure"
  | "fatigue";

export interface AgentAnalysis {
  emotions: string[];
  intensity: number;
  triggers: string[];
  people: string[];
  needs: string[];
  riskLevel: RiskLevel;
  recommendedMode: AgentMode;
  summary: string;
  sceneTags: SceneTag[];

  supportFocus: string;
  responseGoal: string;
  copingDirection: string[];
}

export interface AgentReply {
  mode: AgentMode;
  message: string;
  followUpPrompt?: string;
}

export interface AgentResult {
  analysis: AgentAnalysis;
  reply: AgentReply;
}

export interface ActionCardContext {
  actionId:
    | "gentle_clarify"
    | "long_text_intake"
    | "internship_requirement_overload";
  optionId: string;
  sourceMessageId?: string;
  sourceTextSnapshot?: string;
  kind?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  hiddenContext?: string;
  actionContext?: ActionCardContext;
  source?: "chat" | "local_action";
}

export interface LiveSupportResult {
  replyText: string;
  recommendedAction: RecommendedAction;
  quickAnalysis: {
    corePain: string;
    currentNeed: string;
    nextStep: string;
    emotions: string[];
    intensity: number;
    recommendedMode: AgentMode;
    riskLevel: RiskLevel;
  };
}
