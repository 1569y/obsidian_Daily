import type { InvalidPayloadKind } from "./llmResponseParsers";

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
