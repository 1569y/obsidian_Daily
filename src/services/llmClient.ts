import {
  classifyInvalidPayload,
  normalizeProviderError,
  type InvalidPayloadKind,
} from "./llmResponseParsers";
import type {
  LLMProviderProfile,
  LLMResponseParserFamily,
} from "./llmProviderProfiles";

const DEFAULT_LOG_PREVIEW_LIMIT = 1500;

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
