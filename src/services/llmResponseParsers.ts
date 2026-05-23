import type { LLMResponseParserFamily } from "./llmProviderProfiles";

export type InvalidPayloadKind =
  | "choices_null"
  | "choices_empty"
  | "missing_content"
  | "missing_candidates"
  | "missing_anthropic_content";

export interface ParsedTextResult {
  text: string;
  invalidPayloadKind: InvalidPayloadKind | null;
}

export interface ParsedStreamChunkResult {
  contentDelta: string;
  reasoningDelta: string;
  invalidPayloadKind: InvalidPayloadKind | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractText(value: unknown, depth = 0): string {
  if (depth > 5) {
    return "";
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractText(item, depth + 1))
      .filter((item) => item.length > 0);
    return parts.join("\n").trim();
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const preferredFields = [
    record.text,
    record.value,
    record.content,
    record.parts,
    record.data,
  ];

  for (const field of preferredFields) {
    const extracted = extractText(field, depth + 1);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

export function parseOpenAIChatResponse(raw: unknown): ParsedTextResult {
  const payload = asRecord(raw);
  if (!payload) {
    return { text: "", invalidPayloadKind: "missing_content" };
  }

  if (payload.choices === null) {
    return { text: "", invalidPayloadKind: "choices_null" };
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  if (choices.length === 0) {
    return { text: "", invalidPayloadKind: "choices_empty" };
  }

  const choice0 = asRecord(choices[0]);
  if (!choice0) {
    return { text: "", invalidPayloadKind: "missing_content" };
  }

  const message = asRecord(choice0.message);
  const messageText = extractText(message?.content);
  if (messageText) {
    return { text: messageText, invalidPayloadKind: null };
  }

  const choiceText = extractText(choice0.text);
  if (choiceText) {
    return { text: choiceText, invalidPayloadKind: null };
  }

  return { text: "", invalidPayloadKind: "missing_content" };
}

export function parseOpenAIChatStreamChunk(raw: unknown): ParsedStreamChunkResult {
  const payload = asRecord(raw);
  if (!payload) {
    return {
      contentDelta: "",
      reasoningDelta: "",
      invalidPayloadKind: "missing_content",
    };
  }

  if (payload.choices === null) {
    return {
      contentDelta: "",
      reasoningDelta: "",
      invalidPayloadKind: "choices_null",
    };
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  if (choices.length === 0) {
    return {
      contentDelta: "",
      reasoningDelta: "",
      invalidPayloadKind: "choices_empty",
    };
  }

  const choice0 = asRecord(choices[0]);
  const delta = asRecord(choice0?.delta);
  if (!delta) {
    return {
      contentDelta: "",
      reasoningDelta: "",
      invalidPayloadKind: "missing_content",
    };
  }

  return {
    contentDelta: typeof delta.content === "string" ? delta.content : "",
    reasoningDelta:
      typeof delta.reasoning_content === "string" ? delta.reasoning_content : "",
    invalidPayloadKind: null,
  };
}

export function parseGeminiResponse(raw: unknown): ParsedTextResult {
  const payload = asRecord(raw);
  if (!payload) {
    return { text: "", invalidPayloadKind: "missing_candidates" };
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length === 0) {
    return { text: "", invalidPayloadKind: "missing_candidates" };
  }

  const candidate0 = asRecord(candidates[0]);
  const text = extractText(candidate0?.content);

  return {
    text,
    invalidPayloadKind: text ? null : "missing_content",
  };
}

export function parseAnthropicResponse(raw: unknown): ParsedTextResult {
  const payload = asRecord(raw);
  if (!payload) {
    return { text: "", invalidPayloadKind: "missing_anthropic_content" };
  }

  const text = extractText(payload.content);
  return {
    text,
    invalidPayloadKind: text ? null : "missing_anthropic_content",
  };
}

export function parseGenericResponse(raw: unknown): ParsedTextResult {
  const payload = asRecord(raw);
  if (!payload) {
    return { text: "", invalidPayloadKind: "missing_content" };
  }

  const fallbackFields = [
    payload.content,
    payload.text,
    payload.reply,
    payload.answer,
    asRecord(payload.data)?.content,
    asRecord(payload.data)?.text,
  ];

  for (const field of fallbackFields) {
    const text = extractText(field);
    if (text) {
      return { text, invalidPayloadKind: null };
    }
  }

  return { text: "", invalidPayloadKind: "missing_content" };
}

export function parseResponseByFamily(
  raw: unknown,
  family: LLMResponseParserFamily
): ParsedTextResult {
  if (family === "openai_chat") {
    const primary = parseOpenAIChatResponse(raw);
    if (primary.text || primary.invalidPayloadKind === "choices_null" || primary.invalidPayloadKind === "choices_empty") {
      return primary;
    }

    const generic = parseGenericResponse(raw);
    return generic.text ? generic : primary;
  }

  if (family === "gemini") {
    const primary = parseGeminiResponse(raw);
    if (primary.text) {
      return primary;
    }
    return parseGenericResponse(raw);
  }

  if (family === "anthropic") {
    const primary = parseAnthropicResponse(raw);
    if (primary.text) {
      return primary;
    }
    return parseGenericResponse(raw);
  }

  const generic = parseGenericResponse(raw);
  if (generic.text) {
    return generic;
  }

  return parseOpenAIChatResponse(raw);
}

export function classifyInvalidPayload(
  raw: unknown,
  family: LLMResponseParserFamily
): InvalidPayloadKind | null {
  return parseResponseByFamily(raw, family).invalidPayloadKind;
}

export function normalizeProviderError(raw: unknown): string {
  const payload = asRecord(raw);
  if (!payload) {
    return "";
  }

  const errorValue = payload.error;
  const messageValue = payload.message;
  const codeValue = payload.code;

  const errorText = extractText(errorValue);
  if (errorText) {
    return errorText;
  }

  const messageText = extractText(messageValue);
  if (
    messageText &&
    /error|invalid|unauthorized|forbidden|quota|rate limit|not found|denied|failed|exception|超时|错误|失败|无效|额度|限制|拒绝/i.test(
      messageText
    )
  ) {
    if (typeof codeValue === "string" || typeof codeValue === "number") {
      return `${String(codeValue)}: ${messageText}`;
    }
    return messageText;
  }

  return "";
}
