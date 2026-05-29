import {
  classifyInvalidPayload,
  normalizeProviderError,
  parseOpenAIChatStreamChunk,
  type InvalidPayloadKind,
} from "./llmResponseParsers";
import type {
  LLMProviderProfile,
  LLMResponseParserFamily,
} from "./llmProviderProfiles";

const DEFAULT_LOG_PREVIEW_LIMIT = 1500;

export type LLMAttemptMode =
  | "non_stream_json"
  | "non_stream_plain"
  | "stream_plain";
export type LLMFinalAttemptMode = LLMAttemptMode | "rule_based_fallback";
export type LLMRetryReason =
  | "http_400"
  | "empty_content"
  | "thinking_400"
  | "stream_empty_content"
  | "invalid_payload"
  | "provider_error";
export type LLMAttemptErrorKind =
  | "http_error"
  | "provider_error"
  | "empty_content"
  | "invalid_payload";
export type LLMAttemptStatus = "success" | "fallback";

export interface LLMAttemptSummary {
  finalAttemptMode: LLMFinalAttemptMode;
  status: LLMAttemptStatus;
  retryCount: number;
  errorTrail: string[];
  textLength: number;
  reasoningOnly: boolean;
}

export interface LLMAttemptLogInput {
  providerProfileId: string;
  parserFamily: LLMResponseParserFamily;
  summary: LLMAttemptSummary;
  logPrefix: string;
}

export type LLMRetryContext<TContext extends string> = TContext;

export interface LLMFetchAttemptOptions {
  jsonMode: boolean;
  disableThinking: boolean;
  stream: boolean;
}

export interface LLMFetchAttemptInput {
  endpoint: string;
  apiKey: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  options: LLMFetchAttemptOptions;
}

export interface LLMFetchAttemptResult {
  ok: boolean;
  status: number;
  data?: unknown;
  errorText?: string;
  quotaOrRateLimit?: boolean;
  usedJsonMode: boolean;
  usedThinkingDisabled: boolean;
  stream: boolean;
}

export interface PayloadLogMetaOptions {
  usedJsonMode?: boolean;
  willRetryWithoutJsonMode?: boolean;
  usedThinkingDisabled?: boolean;
  stream?: boolean;
  retryReason?: LLMRetryReason;
}

export interface AssertNonEmptyContentMetaOptions {
  usedJsonMode: boolean;
  willRetryWithoutJsonMode: boolean;
  usedThinkingDisabled?: boolean;
  stream?: boolean;
  retryReason?: LLMRetryReason;
}

export interface BuildAttemptLogMetaOptions {
  usedJsonMode: boolean;
  usedThinkingDisabled: boolean;
  retryReason?: LLMRetryReason;
  errorKind?: LLMAttemptErrorKind;
  data?: unknown;
  extra?: Record<string, unknown>;
}

export interface BuildAttemptLogMetaInput<TContext extends string> {
  context: TContext;
  attemptMode: LLMAttemptMode;
  providerProfile: Pick<LLMProviderProfile, "id" | "responseParser">;
  normalizedBaseUrl: string;
  model: string;
  usedJsonMode: boolean;
  usedThinkingDisabled: boolean;
  retryReason?: LLMRetryReason;
  errorKind?: LLMAttemptErrorKind;
  data?: unknown;
  extra?: Record<string, unknown>;
}

export type BuildAttemptLogMeta<TContext extends string = string> = (
  context: TContext,
  attemptMode: LLMAttemptMode,
  options: BuildAttemptLogMetaOptions
) => Record<string, unknown>;

export interface AttemptState {
  errorTrail: string[];
  reasoningOnly: boolean;
}

export type AttemptErrorKind =
  | "http_error"
  | "provider_error"
  | "empty_content"
  | "invalid_payload"
  | "quota_or_rate_limit"
  | `invalid_payload:${InvalidPayloadKind}`;

export type LLMRetryFallbackErrorKind =
  | "empty_content"
  | "invalid_payload"
  | "provider_error";

export interface LLMRetryRequestResult {
  data: unknown;
  content: string;
  usedJsonMode: boolean;
  retriedWithoutJsonMode: boolean;
  usedThinkingDisabled: boolean;
  usedStreamFallback?: boolean;
  finalAttemptMode: LLMAttemptMode;
  retryCount: number;
  errorTrail: string[];
  reasoningOnly: boolean;
  retryReason?: LLMRetryReason;
}

export interface LLMRetryWithoutJsonModeInput<TContext extends string> {
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
  context: LLMRetryContext<TContext>;
  retryReason: LLMRetryReason;
  disableThinking: boolean;
  attemptState: AttemptState;
}

export type LLMRetryWithStreamInput<TContext extends string> =
  LLMRetryWithoutJsonModeInput<TContext>;

export interface LLMRetryDependencies<TContext extends string> {
  fetchChatCompletionAttempt: (
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    options: LLMFetchAttemptOptions
  ) => Promise<LLMFetchAttemptResult>;
  extractProviderErrorMessage: (data: unknown) => string;
  getInvalidPayloadKind: (data: unknown) => InvalidPayloadKind | null;
  shouldTryStreamFallback: (
    errorKind: LLMRetryFallbackErrorKind
  ) => boolean;
  logProviderPayloadError: (
    data: unknown,
    context: LLMRetryContext<TContext>,
    providerError: string,
    buildAttemptLogMeta: BuildAttemptLogMeta<TContext>,
    meta?: PayloadLogMetaOptions
  ) => void;
  logNullChoicesPayloadIfNeeded: (
    data: unknown,
    context: LLMRetryContext<TContext>,
    buildAttemptLogMeta: BuildAttemptLogMeta<TContext>,
    meta?: PayloadLogMetaOptions
  ) => void;
  assertNonEmptyContent: (
    content: string,
    data: unknown,
    context: LLMRetryContext<TContext>,
    meta?: AssertNonEmptyContentMetaOptions,
    attemptState?: AttemptState
  ) => void;
  getMessageContent: (data: unknown) => string;
  buildAttemptLogMeta: BuildAttemptLogMeta<TContext>;
  pushAttemptError: (
    attemptState: AttemptState,
    errorKind: AttemptErrorKind
  ) => void;
  attachAttemptSummary: (
    error: Error,
    attemptState?: AttemptState
  ) => Error;
  retryChatCompletionWithStream: (
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    maxTokens: number,
    signal: AbortSignal,
    context: LLMRetryContext<TContext>,
    disableThinking: boolean,
    retryReason: LLMRetryReason,
    attemptState: AttemptState
  ) => Promise<LLMRetryRequestResult>;
}

export interface LLMRetryWithStreamDependencies<TContext extends string>
  extends Pick<
    LLMRetryDependencies<TContext>,
    | "fetchChatCompletionAttempt"
    | "extractProviderErrorMessage"
    | "logProviderPayloadError"
    | "assertNonEmptyContent"
    | "getMessageContent"
    | "buildAttemptLogMeta"
    | "pushAttemptError"
    | "attachAttemptSummary"
  > {
  isReasoningOnlyStreamPayload: (data: unknown) => boolean;
}

export function normalizeChatCompletionsEndpoint(baseUrl: string): string {
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
      "[ApiAgentProvider] éƒçŠ³ç¡¶ç‘™ï½†ç€½ baseUrlé”›å±¼ç¹šé£æ¬å¸«éŠç¡·ç´æ¶“å¶ˆåšœé”ã„¨Ë‰é?/chat/completionséŠ†?,",
      {
        baseUrl: trimmed,
        error,
      }
    );
    return trimmed;
  }
}

export function getSafeEndpointPath(normalizedBaseUrl: string): string {
  try {
    return new URL(normalizedBaseUrl).pathname || "/";
  } catch {
    const rawBaseUrl = normalizedBaseUrl.trim();
    const schemeIndex = rawBaseUrl.indexOf("://");
    if (schemeIndex === -1) {
      return rawBaseUrl;
    }

    const pathStart = rawBaseUrl.indexOf("/", schemeIndex + 3);
    return pathStart === -1 ? "/" : rawBaseUrl.slice(pathStart);
  }
}

export function warnIfEndpointLooksIncomplete(
  context: string,
  normalizedBaseUrl: string,
  model: string
): void {
  const endpointPath = getSafeEndpointPath(normalizedBaseUrl);
  if (/\/chat\/completions\/?$/i.test(endpointPath)) {
    return;
  }

  console.debug(
    `[ApiAgentProvider:${context}] è¤°æ’³å¢  baseUrl éªå¬­æ£é‰ãƒ¤ç¬‰é„îˆšç•¬éå¯¸æ®‘ /chat/completions endpointéŠ†å‚šç¶‹é“?fetch ç€¹ç‚µå¹‡é—‡â‚¬ç‘•ä½¸ç•¬é?endpointéŠ†ä¿™,`,
    {
      endpointPath,
      model,
    }
  );
}

export function truncateForLog(
  value: string,
  limit = DEFAULT_LOG_PREVIEW_LIMIT
): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}...(truncated)`;
}

export function safeSerializeForLog(value: unknown): string {
  try {
    const serialized = JSON.stringify(sanitizeForLog(value));
    if (typeof serialized === "string") {
      return serialized;
    }

    return String(value);
  } catch {
    return "[unserializable response]";
  }
}

export function sanitizeForLog(
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
    return value.map((item) => sanitizeForLog(item, seen));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/authorization|api[_-]?key|token/i.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizeForLog(item, seen);
  }

  return sanitized;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function isQuotaOrRateLimitError(
  status: number,
  bodyText: string
): boolean {
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

export function looksLikeProviderErrorText(text: string): boolean {
  return /error|invalid|unauthorized|forbidden|quota|rate limit|not found|denied|failed|exception|ç“’å‘®æ¤‚|é–¿æ¬’î‡¤|æ¾¶è¾«è§¦|éƒçŠ³æ™¥|æ£°æ¿†å®³|é—„æ„¬åŸ—|éŽ·æŽ”ç²·/i.test(
    text
  );
}

export function formatInvalidPayloadErrorKind(
  kind: InvalidPayloadKind
): `invalid_payload:${InvalidPayloadKind}` {
  return `invalid_payload:${kind}`;
}


export async function fetchChatCompletionAttempt(
  input: LLMFetchAttemptInput
): Promise<LLMFetchAttemptResult> {
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify(input.body),
  });

  const rawText = await response.text();

  if (!response.ok) {
    const quotaOrRateLimit = isQuotaOrRateLimitError(response.status, rawText);
    if (quotaOrRateLimit) {
      console.warn(
        "API quota or rate-limit detected; stop API attempt and fall back.",
        {
          status: response.status,
          endpoint: input.endpoint,
          bodyPreview: truncateForLog(rawText),
        }
      );
    }

    return {
      ok: false,
      status: response.status,
      errorText: rawText,
      quotaOrRateLimit,
      usedJsonMode: input.options.jsonMode,
      usedThinkingDisabled: input.options.disableThinking,
      stream: input.options.stream,
    };
  }

  try {
    const data = input.options.stream
      ? parseStreamResponsePayload(rawText)
      : rawText.trim().length > 0
        ? (JSON.parse(rawText) as unknown)
        : {};

    return {
      ok: true,
      status: response.status,
      data,
      usedJsonMode: input.options.jsonMode,
      usedThinkingDisabled: input.options.disableThinking,
      stream: input.options.stream,
    };
  } catch (error) {
    console.error("[ApiAgentProvider] API returned invalid JSON payload.", {
      usedJsonMode: input.options.jsonMode,
      usedThinkingDisabled: input.options.disableThinking,
      stream: input.options.stream,
      endpointPath: getSafeEndpointPath(input.endpoint),
      responsePreview: truncateForLog(rawText),
      error,
    });
    throw error;
  }
}


export async function retryChatCompletionWithoutJsonMode<TContext extends string>(
  input: LLMRetryWithoutJsonModeInput<TContext>,
  dependencies: LLMRetryDependencies<TContext>
): Promise<LLMRetryRequestResult> {
  const retryAttempt = await dependencies.fetchChatCompletionAttempt(
    input.messages,
    input.temperature,
    input.maxTokens,
    input.signal,
    {
      jsonMode: false,
      disableThinking: input.disableThinking,
      stream: false,
    }
  );

  if (!retryAttempt.ok) {
    if (retryAttempt.quotaOrRateLimit) {
      dependencies.pushAttemptError(input.attemptState, "quota_or_rate_limit");
      throw dependencies.attachAttemptSummary(
        new Error(
          `API 璇锋眰澶辫触: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
        ),
        input.attemptState
      );
    }

    if (retryAttempt.status === 400 && input.disableThinking) {
      dependencies.pushAttemptError(input.attemptState, "http_error");
      console.debug(
        `[ApiAgentProvider:${input.context}] non-stream plain retry returned 400; retrying without thinking parameter.`,
        dependencies.buildAttemptLogMeta(input.context, "non_stream_plain", {
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

      return retryChatCompletionWithoutJsonMode(
        {
          ...input,
          retryReason: "thinking_400",
          disableThinking: false,
        },
        dependencies
      );
    }

    throw dependencies.attachAttemptSummary(
      new Error(
        `API 璇锋眰澶辫触: ${retryAttempt.status} - ${retryAttempt.errorText ?? ""}`
      ),
      input.attemptState
    );
  }

  const retryData = retryAttempt.data;
  const retryProviderError =
    retryData === undefined
      ? ""
      : dependencies.extractProviderErrorMessage(retryData);
  if (retryProviderError) {
    dependencies.pushAttemptError(input.attemptState, "provider_error");
    dependencies.logProviderPayloadError(
      retryData,
      input.context,
      retryProviderError,
      dependencies.buildAttemptLogMeta,
      {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
        stream: false,
        retryReason: input.retryReason,
      }
    );
    if (dependencies.shouldTryStreamFallback("provider_error")) {
      return dependencies.retryChatCompletionWithStream(
        input.messages,
        input.temperature,
        input.maxTokens,
        input.signal,
        input.context,
        retryAttempt.usedThinkingDisabled,
        "provider_error",
        input.attemptState
      );
    }
    throw dependencies.attachAttemptSummary(
      new Error(`API 杩斿洖閿欒鍐呭: ${retryProviderError}`),
      input.attemptState
    );
  }

  const retryContent = dependencies.getMessageContent(retryData);
  const invalidPayloadKind =
    retryData === undefined
      ? null
      : dependencies.getInvalidPayloadKind(retryData);
  if (
    retryContent.trim().length === 0 &&
    dependencies.shouldTryStreamFallback(
      invalidPayloadKind ? "invalid_payload" : "empty_content"
    )
  ) {
    dependencies.pushAttemptError(
      input.attemptState,
      invalidPayloadKind
        ? formatInvalidPayloadErrorKind(invalidPayloadKind)
        : "empty_content"
    );
    dependencies.logNullChoicesPayloadIfNeeded(
      retryData,
      input.context,
      dependencies.buildAttemptLogMeta,
      {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
        stream: false,
        retryReason: invalidPayloadKind ? "invalid_payload" : input.retryReason,
      }
    );

    return dependencies.retryChatCompletionWithStream(
      input.messages,
      input.temperature,
      input.maxTokens,
      input.signal,
      input.context,
      retryAttempt.usedThinkingDisabled,
      invalidPayloadKind ? "invalid_payload" : input.retryReason,
      input.attemptState
    );
  }

  dependencies.assertNonEmptyContent(
    retryContent,
    retryData,
    input.context,
    {
      usedJsonMode: false,
      willRetryWithoutJsonMode: false,
      usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
      stream: false,
      retryReason: input.retryReason,
    },
    input.attemptState
  );

  return {
    data: retryData,
    content: retryContent,
    usedJsonMode: false,
    retriedWithoutJsonMode: true,
    usedThinkingDisabled: retryAttempt.usedThinkingDisabled,
    finalAttemptMode: "non_stream_plain",
    retryCount: input.attemptState.errorTrail.length,
    errorTrail: [...input.attemptState.errorTrail],
    reasoningOnly: input.attemptState.reasoningOnly,
    retryReason: input.retryReason,
  };
}

export async function retryChatCompletionWithStream<TContext extends string>(
  input: LLMRetryWithStreamInput<TContext>,
  dependencies: LLMRetryWithStreamDependencies<TContext>
): Promise<LLMRetryRequestResult> {
  console.debug(
    `[ApiAgentProvider:${input.context}] non-stream fallback retrying with stream.`,
    dependencies.buildAttemptLogMeta(input.context, "stream_plain", {
      usedJsonMode: false,
      usedThinkingDisabled: input.disableThinking,
      retryReason: input.retryReason,
      errorKind:
        input.retryReason === "provider_error"
          ? "provider_error"
          : input.retryReason === "invalid_payload"
            ? "invalid_payload"
            : "empty_content",
    })
  );

  const streamAttempt = await dependencies.fetchChatCompletionAttempt(
    input.messages,
    input.temperature,
    input.maxTokens,
    input.signal,
    {
      jsonMode: false,
      disableThinking: input.disableThinking,
      stream: true,
    }
  );

  if (!streamAttempt.ok) {
    if (streamAttempt.quotaOrRateLimit) {
      dependencies.pushAttemptError(input.attemptState, "quota_or_rate_limit");
      throw dependencies.attachAttemptSummary(
        new Error(
          `API stream 璇锋眰澶辫触: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
        ),
        input.attemptState
      );
    }

    if (streamAttempt.status === 400 && input.disableThinking) {
      dependencies.pushAttemptError(input.attemptState, "http_error");
      console.debug(
        `[ApiAgentProvider:${input.context}] stream fallback returned 400; retrying without thinking parameter.`,
        dependencies.buildAttemptLogMeta(input.context, "stream_plain", {
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

      return retryChatCompletionWithStream(
        {
          ...input,
          disableThinking: false,
          retryReason: "thinking_400",
        },
        dependencies
      );
    }

    throw dependencies.attachAttemptSummary(
      new Error(
        `API stream 璇锋眰澶辫触: ${streamAttempt.status} - ${streamAttempt.errorText ?? ""}`
      ),
      input.attemptState
    );
  }

  const streamData = streamAttempt.data;
  const streamProviderError =
    streamData === undefined
      ? ""
      : dependencies.extractProviderErrorMessage(streamData);
  if (streamProviderError) {
    dependencies.pushAttemptError(input.attemptState, "provider_error");
    dependencies.logProviderPayloadError(
      streamData,
      input.context,
      streamProviderError,
      dependencies.buildAttemptLogMeta,
      {
        usedJsonMode: false,
        willRetryWithoutJsonMode: false,
        usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
        stream: true,
        retryReason: input.retryReason,
      }
    );
    throw dependencies.attachAttemptSummary(
      new Error(`API stream 杩斿洖閿欒鍐呭: ${streamProviderError}`),
      input.attemptState
    );
  }

  const streamContent = dependencies.getMessageContent(streamData);
  input.attemptState.reasoningOnly =
    dependencies.isReasoningOnlyStreamPayload(streamData);
  if (streamContent.trim().length === 0) {
    dependencies.pushAttemptError(input.attemptState, "empty_content");
  }

  dependencies.assertNonEmptyContent(
    streamContent,
    streamData,
    input.context,
    {
      usedJsonMode: false,
      willRetryWithoutJsonMode: false,
      usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
      stream: true,
      retryReason: "stream_empty_content",
    },
    input.attemptState
  );

  return {
    data: streamData,
    content: streamContent,
    usedJsonMode: false,
    retriedWithoutJsonMode: true,
    usedThinkingDisabled: streamAttempt.usedThinkingDisabled,
    usedStreamFallback: true,
    finalAttemptMode: "stream_plain",
    retryCount: input.attemptState.errorTrail.length,
    errorTrail: [...input.attemptState.errorTrail],
    reasoningOnly: input.attemptState.reasoningOnly,
    retryReason: "stream_empty_content",
  };
}

export function createAttemptState(): AttemptState {
  return {
    errorTrail: [],
    reasoningOnly: false,
  };
}

export function pushAttemptError(
  attemptState: AttemptState,
  errorKind: AttemptErrorKind
): void {
  attemptState.errorTrail.push(errorKind);
}

export function attachAttemptSummary(
  error: Error,
  attemptState?: AttemptState
): Error {
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

export function extractTextFromContentValue(value: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const collected: string[] = [];

    for (const item of value) {
      const extracted = extractTextFromContentValue(item, depth + 1);
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
    const extractedNestedText = extractTextFromContentValue(nestedText, depth + 1);
    if (extractedNestedText) {
      return extractedNestedText;
    }
  }

  const nestedContent = typedValue.content;
  if (nestedContent !== undefined) {
    const extractedContent = extractTextFromContentValue(nestedContent, depth + 1);
    if (extractedContent) {
      return extractedContent;
    }
  }

  const nestedParts = typedValue.parts;
  if (nestedParts !== undefined) {
    const extractedParts = extractTextFromContentValue(nestedParts, depth + 1);
    if (extractedParts) {
      return extractedParts;
    }
  }

  const nestedData = typedValue.data;
  if (nestedData !== undefined) {
    const extractedData = extractTextFromContentValue(nestedData, depth + 1);
    if (extractedData) {
      return extractedData;
    }
  }

  return "";
}

export function getResponsePayloadCandidates(
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

export function extractMessageContentFromPayload(
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

    const messageText = extractTextFromContentValue(message?.content);
    if (messageText) {
      return messageText;
    }

    const choiceText = choice0.text;
    if (typeof choiceText === "string" && choiceText.trim().length > 0) {
      return choiceText.trim();
    }

    const deltaText = extractTextFromContentValue(delta?.content);
    if (deltaText) {
      return deltaText;
    }
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate0 =
    candidates.length > 0 && candidates[0] && typeof candidates[0] === "object"
      ? (candidates[0] as Record<string, unknown>)
      : null;

  const candidateText = extractTextFromContentValue(candidate0?.content);
  if (candidateText) {
    return candidateText;
  }

  const outputText = payload.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText.trim();
  }

  const directFieldKeys = ["content", "text", "message", "reply", "result", "answer"];
  for (const key of directFieldKeys) {
    const extracted = extractTextFromContentValue(payload[key]);
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

    const outputTextContent = extractTextFromContentValue(output0?.content);
    if (outputTextContent) {
      return outputTextContent;
    }
  }

  return "";
}

export function extractErrorText(value: unknown): string {
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
    const extracted = extractTextFromContentValue(field);
    if (extracted && looksLikeProviderErrorText(extracted)) {
      return extracted;
    }
  }

  const genericExtracted = extractTextFromContentValue(value);
  return looksLikeProviderErrorText(genericExtracted) ? genericExtracted : "";
}

export function extractProviderErrorMessageFromPayload(
  payload: Record<string, unknown>
): string {
  if (payload.error !== undefined) {
    const errorText = extractErrorText(payload.error);
    if (errorText) {
      return errorText;
    }
  }

  const messageText = extractErrorText(payload.message);
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

  if (!hasStructuredContentShape && messageText && looksLikeProviderErrorText(messageText)) {
    return messageText;
  }

  return "";
}

export function extractProviderErrorMessage(data: unknown): string {
  for (const payload of getResponsePayloadCandidates(data)) {
    const message = normalizeProviderError(payload);
    if (message) {
      return message;
    }
  }

  return "";
}

export function buildResponsePreview(data: unknown): {
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
  const payloadCandidates = getResponsePayloadCandidates(responseData);
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
    messageContentPreview: truncateForLog(safeSerializeForLog(messageContent)),
    reasoningContentType: Array.isArray(reasoningContent)
      ? "array"
      : typeof reasoningContent,
    reasoningContentPreview: truncateForLog(safeSerializeForLog(reasoningContent)),
    choiceTextType: typeof choiceText,
    choiceTextPreview: truncateForLog(safeSerializeForLog(choiceText)),
    responsePreview: truncateForLog(safeSerializeForLog(data)),
  };
}

export function buildAttemptLogMeta<TContext extends string>(
  input: BuildAttemptLogMetaInput<TContext>
): Record<string, unknown> {
  return {
    requestKind: input.context,
    providerProfileId: input.providerProfile.id,
    parserFamily: getParserFamily(input.providerProfile),
    attemptMode: input.attemptMode,
    endpointPath: getSafeEndpointPath(input.normalizedBaseUrl),
    model: input.model,
    usedJsonMode: input.usedJsonMode,
    usedThinkingDisabled: input.usedThinkingDisabled,
    errorKind: input.errorKind,
    retryReason: input.retryReason,
    ...(input.data ? buildResponsePreview(input.data) : {}),
    ...(input.extra ?? {}),
  };
}

export function logAttemptSummary(input: LLMAttemptLogInput): void {
  const trail =
    input.summary.errorTrail.length > 0
      ? input.summary.errorTrail.join(">")
      : "none";
  const message = `${input.logPrefix} provider=${input.providerProfileId} parser=${input.parserFamily} final=${input.summary.finalAttemptMode} status=${input.summary.status} retries=${input.summary.retryCount} errorTrail=${trail} textLength=${input.summary.textLength} reasoningOnly=${input.summary.reasoningOnly}`;
  if (input.summary.status === "fallback") {
    console.warn(message);
    return;
  }

  console.debug(message);
}

export function getParserFamily(
  providerProfile: Pick<LLMProviderProfile, "responseParser">
): LLMResponseParserFamily {
  return providerProfile.responseParser;
}

export function getInvalidPayloadKind(
  data: unknown,
  providerProfile: Pick<LLMProviderProfile, "responseParser">
): InvalidPayloadKind | null {
  return classifyInvalidPayload(data, getParserFamily(providerProfile));
}

export function shouldTryStreamFallback(
  providerProfile: Pick<LLMProviderProfile, "supportsStreaming">,
  errorKind: "empty_content" | "invalid_payload" | "provider_error"
): boolean {
  if (!providerProfile.supportsStreaming) {
    return false;
  }

  return (
    errorKind === "empty_content" ||
    errorKind === "invalid_payload" ||
    errorKind === "provider_error"
  );
}

export function hasNullChoicesPayload(data: unknown): boolean {
  return getResponsePayloadCandidates(data).some(
    (payload) => payload.choices === null
  );
}

export function isReasoningOnlyStreamPayload(data: unknown): boolean {
  const payloads = getResponsePayloadCandidates(data);
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

export function parseSseContent(rawText: string): {
  content: string;
  reasoningOnly: boolean;
} {
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

export function parseStreamResponsePayload(rawText: string): unknown {
  const { content, reasoningOnly } = parseSseContent(rawText);
  if (!content) {
    return {
      choices: null,
      stream: true,
      reasoningOnly,
      rawPreview: truncateForLog(rawText),
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

export function logProviderPayloadError<TContext extends string>(
  data: unknown,
  context: TContext,
  providerError: string,
  buildAttemptLogMeta: BuildAttemptLogMeta<TContext>,
  meta?: PayloadLogMetaOptions
): void {
  console.debug(
    `[ApiAgentProvider:${context}] 妫€娴嬪埌 provider error payload锛屽噯澶囧洖閫€瑙勫垯鐗堛€俙,
    `,
    buildAttemptLogMeta(
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

export function logNullChoicesPayloadIfNeeded<TContext extends string>(
  data: unknown,
  context: TContext,
  buildAttemptLogMeta: BuildAttemptLogMeta<TContext>,
  meta?: PayloadLogMetaOptions
): void {
  if (!hasNullChoicesPayload(data)) {
    return;
  }

  console.debug(
    `[ApiAgentProvider:${context}] provider returned choices:null; this is an invalid/empty chat completion payload, not a parser miss.`,
    buildAttemptLogMeta(
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
