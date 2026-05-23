import type { AgentProviderType } from "../types";

export type ProviderKind =
  | "openai_compatible"
  | "gemini_native"
  | "anthropic_native"
  | "custom";

export type LLMResponseParserFamily =
  | "openai_chat"
  | "gemini"
  | "anthropic"
  | "auto";

export type LLMPreferredMode = "non_stream" | "stream";
export type LLMFallbackMode = "non_stream_plain" | "stream_plain";

export interface LLMProviderProfile {
  id: string;
  displayName: string;
  kind: ProviderKind;
  endpoint: string;
  supportsNonStreaming: boolean;
  supportsStreaming: boolean;
  supportsJsonObject: boolean;
  supportsJsonSchema: boolean;
  supportsThinkingControl: boolean;
  preferredMode: LLMPreferredMode;
  fallbackModes: LLMFallbackMode[];
  responseParser: LLMResponseParserFamily;
}

interface ProviderProfileInput {
  providerType?: AgentProviderType;
  baseUrl: string;
  model: string;
}

export function getProviderProfile(
  input: ProviderProfileInput
): LLMProviderProfile {
  const providerType = input.providerType ?? "openai_compatible";
  const endpoint = input.baseUrl.trim();
  const model = input.model.trim();

  if (providerType === "openai_compatible") {
    return {
      id: "openai-compatible",
      displayName: "OpenAI-compatible",
      kind: "openai_compatible",
      endpoint,
      supportsNonStreaming: true,
      supportsStreaming: true,
      supportsJsonObject: true,
      supportsJsonSchema: false,
      supportsThinkingControl: /deepseek|glm|zhipu/i.test(model) || /deepseek|glm|zhipu/i.test(endpoint),
      preferredMode: "non_stream",
      fallbackModes: ["non_stream_plain", "stream_plain"],
      responseParser: "openai_chat",
    };
  }

  return {
    id: "custom-auto",
    displayName: "Custom",
    kind: "custom",
    endpoint,
    supportsNonStreaming: true,
    supportsStreaming: true,
    supportsJsonObject: false,
    supportsJsonSchema: false,
    supportsThinkingControl: false,
    preferredMode: "non_stream",
    fallbackModes: ["non_stream_plain", "stream_plain"],
    responseParser: "auto",
  };
}
