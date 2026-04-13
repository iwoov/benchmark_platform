import type { AiReasoningLevel } from "@/lib/ai/provider-catalog";
import {
    getAiModelRoutingConfig,
    type AiModelRoutingConfig,
    type AiResolvedRoute,
} from "@/lib/ai/routing";
import { logError, logInfo, logWarn } from "@/lib/logging/app-logger";

export type AiMessageRole = "system" | "user" | "assistant";

export type AiMessagePart =
    | {
          type: "text";
          text: string;
      }
    | {
          type: "file";
          fileUri: string;
          mimeType: string;
      }
    | {
          type: "image_base64";
          base64: string;
          mimeType: string;
      };

export type AiMessage = {
    role: AiMessageRole;
    content: string | AiMessagePart[];
};

export type AiInvocationRequest = {
    modelCode: string;
    messages: AiMessage[];
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    responseMimeType?: "application/json" | "text/plain";
};

export type AiInvocationSuccess = {
    ok: true;
    modelCode: string;
    protocol: AiModelRoutingConfig["protocol"];
    stream: false;
    reasoningLevel: AiReasoningLevel;
    route: {
        endpointId: string;
        endpointCode: string;
        endpointLabel: string;
        providerCode: string;
        providerName: string;
        baseUrl: string;
    };
    attemptStartedAt: number;
    text: string | null;
    raw: unknown;
};

export type AiStreamInvocationSuccess = {
    ok: true;
    modelCode: string;
    protocol: AiModelRoutingConfig["protocol"];
    stream: true;
    reasoningLevel: AiReasoningLevel;
    route: {
        endpointId: string;
        endpointCode: string;
        endpointLabel: string;
        providerCode: string;
        providerName: string;
        baseUrl: string;
    };
    attemptStartedAt: number;
    response: Response;
};

export type AiInvocationFailure = {
    ok: false;
    modelCode: string;
    protocol: AiModelRoutingConfig["protocol"] | null;
    stream: boolean;
    attempts: Array<{
        attempt: number;
        endpointCode: string;
        providerCode: string;
        error: string;
    }>;
    error: string;
};

export type AiInvocationResult =
    | AiInvocationSuccess
    | AiStreamInvocationSuccess
    | AiInvocationFailure;

type AttemptError = {
    attempt: number;
    endpointCode: string;
    providerCode: string;
    error: string;
};

function trimTrailingSlash(value: string) {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getReasoningEffort(reasoningLevel: AiReasoningLevel) {
    switch (reasoningLevel) {
        case "LOW":
            return "low";
        case "MEDIUM":
            return "medium";
        case "HIGH":
            return "high";
        default:
            return null;
    }
}

function getReasoningBudget(reasoningLevel: AiReasoningLevel) {
    switch (reasoningLevel) {
        case "LOW":
            return 1024;
        case "MEDIUM":
            return 4096;
        case "HIGH":
            return 8192;
        default:
            return null;
    }
}

function getGeminiThinkingLevel(reasoningLevel: AiReasoningLevel) {
    switch (reasoningLevel) {
        case "LOW":
            return "low";
        case "MEDIUM":
            return "medium";
        case "HIGH":
            return "high";
        default:
            return null;
    }
}

function normalizeParts(content: AiMessage["content"]): AiMessagePart[] {
    if (typeof content === "string") {
        return [
            {
                type: "text",
                text: content,
            },
        ];
    }

    return content;
}

function getPlainText(content: AiMessage["content"]) {
    return normalizeParts(content)
        .map((part) => {
            if (part.type === "text") return part.text;
            if (part.type === "image_base64") return `[image:${part.mimeType}]`;
            return `[file:${part.mimeType}] ${part.fileUri}`;
        })
        .join("\n");
}

function splitSystemMessages(messages: AiMessage[]) {
    const systemTexts = messages
        .filter((message) => message.role === "system")
        .map((message) => getPlainText(message.content))
        .filter(Boolean);

    return {
        systemText: systemTexts.length ? systemTexts.join("\n\n") : null,
        conversation: messages.filter((message) => message.role !== "system"),
    };
}

function buildOpenAiPayload(
    input: AiInvocationRequest,
    config: AiModelRoutingConfig,
    stream: boolean,
) {
    const reasoningEffort = getReasoningEffort(config.reasoningLevel);
    const maxTokens = input.maxTokens ?? config.maxTokensDefault ?? undefined;
    const temperature =
        input.temperature ?? config.temperatureDefault ?? undefined;

    return {
        model: config.modelCode,
        messages: input.messages.map((message) => ({
            role: message.role,
            content:
                typeof message.content === "string"
                    ? message.content
                    : message.content.map((part) => {
                          if (part.type === "text") {
                              return { type: "text", text: part.text };
                          }

                          if (part.type === "image_base64") {
                              return {
                                  type: "image_url",
                                  image_url: {
                                      url: `data:${part.mimeType};base64,${part.base64}`,
                                  },
                              };
                          }

                          return {
                              type: "text",
                              text: `[file:${part.mimeType}] ${part.fileUri}`,
                          };
                      }),
        })),
        ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        stream,
    };
}

function buildAnthropicPayload(
    input: AiInvocationRequest,
    config: AiModelRoutingConfig,
    stream: boolean,
) {
    const { systemText, conversation } = splitSystemMessages(input.messages);
    const reasoningBudget = getReasoningBudget(config.reasoningLevel);
    const resolvedMaxTokens =
        input.maxTokens ?? config.maxTokensDefault ?? 2048;
    const maxTokens = Math.max(resolvedMaxTokens, (reasoningBudget ?? 0) + 256);

    return {
        model: config.modelCode,
        max_tokens: maxTokens,
        messages: conversation.map((message) => ({
            role: message.role,
            content:
                typeof message.content === "string"
                    ? message.content
                    : message.content.map((part) => {
                          if (part.type === "text") {
                              return { type: "text", text: part.text };
                          }

                          if (part.type === "image_base64") {
                              return {
                                  type: "image",
                                  source: {
                                      type: "base64",
                                      media_type: part.mimeType,
                                      data: part.base64,
                                  },
                              };
                          }

                          return {
                              type: "text",
                              text: `[file:${part.mimeType}] ${part.fileUri}`,
                          };
                      }),
        })),
        ...(systemText ? { system: systemText } : {}),
        ...(reasoningBudget
            ? {
                  thinking: {
                      type: "enabled",
                      budget_tokens: reasoningBudget,
                  },
              }
            : {}),
        stream,
    };
}

function buildGeminiPayload(
    input: AiInvocationRequest,
    config: AiModelRoutingConfig,
) {
    const { systemText, conversation } = splitSystemMessages(input.messages);
    const thinkingLevel = getGeminiThinkingLevel(config.reasoningLevel);
    const temperature =
        input.temperature ?? config.temperatureDefault ?? undefined;
    const maxTokens = input.maxTokens ?? config.maxTokensDefault ?? undefined;

    return {
        ...(systemText
            ? {
                  systemInstruction: {
                      parts: [{ text: systemText }],
                  },
              }
            : {}),
        contents: conversation.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: normalizeParts(message.content).map((part) => {
                if (part.type === "text") {
                    return { text: part.text };
                }

                if (part.type === "image_base64") {
                    return {
                        inlineData: {
                            mimeType: part.mimeType,
                            data: part.base64,
                        },
                    };
                }

                return {
                    fileData: {
                        fileUri: part.fileUri,
                        mimeType: part.mimeType,
                    },
                };
            }),
        })),
        generationConfig: {
            responseModalities: ["TEXT"],
            ...(input.responseMimeType
                ? { responseMimeType: input.responseMimeType }
                : {}),
            ...(typeof temperature === "number" ? { temperature } : {}),
            ...(typeof maxTokens === "number"
                ? { maxOutputTokens: maxTokens }
                : {}),
            ...(thinkingLevel
                ? {
                      thinkingConfig: {
                          thinkingLevel,
                          includeThoughts: true,
                      },
                  }
                : {}),
        },
    };
}

function buildRequest(
    route: AiResolvedRoute,
    input: AiInvocationRequest,
    config: AiModelRoutingConfig,
    stream: boolean,
) {
    const baseUrl = trimTrailingSlash(route.baseUrl);

    switch (config.protocol) {
        case "OPENAI_COMPATIBLE":
            return {
                url: `${baseUrl}/chat/completions`,
                body: buildOpenAiPayload(input, config, stream),
            };
        case "GEMINI_COMPATIBLE":
            return {
                url: stream
                    ? `${baseUrl}/models/${encodeURIComponent(config.modelCode)}:streamGenerateContent?alt=sse`
                    : `${baseUrl}/models/${encodeURIComponent(config.modelCode)}:generateContent`,
                body: buildGeminiPayload(input, config),
            };
        case "ANTHROPIC_COMPATIBLE":
            return {
                url: `${baseUrl}/messages`,
                body: buildAnthropicPayload(input, config, stream),
            };
    }
}

function buildHeaders(
    route: AiResolvedRoute,
    protocol: AiModelRoutingConfig["protocol"],
    stream: boolean,
): Record<string, string> {
    const apiKey = route.apiKey ?? "";

    if (
        protocol === "GEMINI_COMPATIBLE" &&
        route.providerCode === "modelrouter"
    ) {
        return {
            "Content-Type": "application/json",
            "x-goog-api-key": `Bearer ${apiKey}`,
            ...(stream ? { Accept: "text/event-stream" } : {}),
        };
    }

    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(stream ? { Accept: "text/event-stream" } : {}),
    };
}

async function parseErrorResponse(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    try {
        if (contentType.includes("application/json")) {
            return JSON.stringify(await response.json());
        }

        return await response.text();
    } catch {
        return `${response.status} ${response.statusText}`;
    }
}

function readOpenAiText(raw: any) {
    const content = raw?.choices?.[0]?.message?.content;

    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((item: unknown) => {
                if (typeof item === "string") {
                    return item;
                }

                if (
                    item &&
                    typeof item === "object" &&
                    "text" in item &&
                    typeof item.text === "string"
                ) {
                    return item.text;
                }

                return "";
            })
            .filter(Boolean)
            .join("");
    }

    return null;
}

function readAnthropicText(raw: any) {
    if (typeof raw?.completion === "string") {
        return raw.completion;
    }

    if (Array.isArray(raw?.content)) {
        return raw.content
            .map((item: unknown) => {
                if (
                    item &&
                    typeof item === "object" &&
                    "text" in item &&
                    typeof item.text === "string"
                ) {
                    return item.text;
                }

                return "";
            })
            .filter(Boolean)
            .join("");
    }

    return null;
}

function readGeminiText(raw: any, includeThoughts = false) {
    const parts = raw?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts)) {
        return null;
    }

    const text = parts
        .map((part: unknown) => {
            if (
                part &&
                typeof part === "object" &&
                "text" in part &&
                typeof part.text === "string"
            ) {
                if (
                    !includeThoughts &&
                    "thought" in part &&
                    part.thought === true
                ) {
                    return "";
                }

                return part.text;
            }

            return "";
        })
        .filter(Boolean)
        .join("");

    return text || null;
}

function extractText(protocol: AiModelRoutingConfig["protocol"], raw: unknown) {
    switch (protocol) {
        case "OPENAI_COMPATIBLE":
            return readOpenAiText(raw);
        case "ANTHROPIC_COMPATIBLE":
            return readAnthropicText(raw);
        case "GEMINI_COMPATIBLE":
            return readGeminiText(raw);
    }
}

function parseJsonSafely(input: string) {
    try {
        return JSON.parse(input) as unknown;
    } catch {
        return null;
    }
}

function readOpenAiStreamDelta(raw: any) {
    const delta = raw?.choices?.[0]?.delta?.content;
    if (typeof delta === "string") {
        return delta;
    }
    if (Array.isArray(delta)) {
        return delta
            .map((item: unknown) => {
                if (typeof item === "string") {
                    return item;
                }
                if (
                    item &&
                    typeof item === "object" &&
                    "text" in item &&
                    typeof item.text === "string"
                ) {
                    return item.text;
                }
                return "";
            })
            .join("");
    }

    return readOpenAiText(raw) ?? "";
}

function readAnthropicStreamDelta(raw: any) {
    if (
        raw?.type === "content_block_delta" &&
        raw?.delta &&
        typeof raw.delta.text === "string"
    ) {
        return raw.delta.text;
    }

    if (
        raw?.type === "message_delta" &&
        raw?.delta &&
        typeof raw.delta.text === "string"
    ) {
        return raw.delta.text;
    }

    return readAnthropicText(raw) ?? "";
}

function readGeminiStreamDelta(raw: any) {
    return readGeminiText(raw, false) ?? "";
}

function extractStreamDeltaText(
    protocol: AiModelRoutingConfig["protocol"],
    raw: unknown,
) {
    switch (protocol) {
        case "OPENAI_COMPATIBLE":
            return readOpenAiStreamDelta(raw);
        case "ANTHROPIC_COMPATIBLE":
            return readAnthropicStreamDelta(raw);
        case "GEMINI_COMPATIBLE":
            return readGeminiStreamDelta(raw);
    }
}

export async function resolveAiInvocationText(
    result: AiInvocationSuccess | AiStreamInvocationSuccess,
): Promise<{
    text: string | null;
    raw: unknown;
}> {
    if (!result.stream) {
        return {
            text: result.text,
            raw: result.raw,
        };
    }

    const contentType = result.response.headers.get("content-type") ?? "";
    const startedAt = result.attemptStartedAt;
    let rawText = "";

    if (result.response.body) {
        const reader = result.response.body.getReader();
        const decoder = new TextDecoder();
        let firstChunkAt: number | null = null;
        let chunkCount = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }

            if (!value || value.length === 0) {
                continue;
            }

            if (firstChunkAt === null) {
                firstChunkAt = Date.now();
                logInfo("ai.invoke.first_chunk", {
                    modelCode: result.modelCode,
                    protocol: result.protocol,
                    stream: true,
                    providerCode: result.route.providerCode,
                    endpointCode: result.route.endpointCode,
                    ttftMs: firstChunkAt - startedAt,
                });
            }

            rawText += decoder.decode(value, { stream: true });
            chunkCount += 1;
        }

        rawText += decoder.decode();

        logInfo("ai.invoke.stream_completed", {
            modelCode: result.modelCode,
            protocol: result.protocol,
            stream: true,
            providerCode: result.route.providerCode,
            endpointCode: result.route.endpointCode,
            durationMs: Date.now() - startedAt,
            ttftMs: firstChunkAt === null ? null : firstChunkAt - startedAt,
            chunkCount,
            bytes: rawText.length,
        });
    } else {
        rawText = await result.response.text();
    }

    if (!rawText.trim()) {
        return {
            text: null,
            raw: { stream: true, chunks: [] },
        };
    }

    const parsedDirect = parseJsonSafely(rawText);
    if (parsedDirect !== null) {
        if (Array.isArray(parsedDirect)) {
            const text = parsedDirect
                .map(
                    (chunk) =>
                        extractStreamDeltaText(result.protocol, chunk) ?? "",
                )
                .join("");

            return {
                text: text || null,
                raw: parsedDirect,
            };
        }

        return {
            text: extractText(result.protocol, parsedDirect),
            raw: parsedDirect,
        };
    }

    const lines = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const chunks: unknown[] = [];
    let text = "";

    for (const line of lines) {
        const dataPart = line.startsWith("data:") ? line.slice(5).trim() : line;

        if (!dataPart || dataPart === "[DONE]") {
            continue;
        }

        const chunk = parseJsonSafely(dataPart);
        if (chunk === null) {
            continue;
        }

        chunks.push(chunk);
        text += extractStreamDeltaText(result.protocol, chunk) ?? "";
    }

    if (!chunks.length && !contentType.includes("event-stream")) {
        return {
            text: rawText.trim() || null,
            raw: { stream: true, rawText },
        };
    }

    return {
        text: text || null,
        raw: { stream: true, chunks },
    };
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }

        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function summarizeAttempts(attempts: AttemptError[]) {
    return attempts
        .map(
            (attempt) =>
                `${attempt.providerCode}/${attempt.endpointCode}#${attempt.attempt}: ${attempt.error}`,
        )
        .join(" | ");
}

export async function invokeAiModel(
    input: AiInvocationRequest,
): Promise<AiInvocationResult> {
    const startedAt = Date.now();
    const config = await getAiModelRoutingConfig(input.modelCode);

    if (!config) {
        logWarn("ai.invoke.config_missing", {
            modelCode: input.modelCode,
            stream: Boolean(input.stream),
        });
        return {
            ok: false,
            modelCode: input.modelCode,
            protocol: null,
            stream: Boolean(input.stream),
            attempts: [],
            error: `未找到模型配置：${input.modelCode}`,
        };
    }

    const routes = config.routes.filter((route) => Boolean(route.apiKey));
    const stream = input.stream ?? config.streamDefault;
    const candidateRoutes = config.allowFallback ? routes : routes.slice(0, 1);
    const attemptsPerRoute = Math.max(1, config.maxRetries + 1);
    const attempts: AttemptError[] = [];

    if (!candidateRoutes.length) {
        logWarn("ai.invoke.no_routes", {
            modelCode: input.modelCode,
            protocol: config.protocol,
            stream,
        });
        return {
            ok: false,
            modelCode: input.modelCode,
            protocol: config.protocol,
            stream,
            attempts,
            error: `模型 ${input.modelCode} 没有可调用路由，请先配置 API Key。`,
        };
    }

    for (const route of candidateRoutes) {
        for (
            let routeAttempt = 1;
            routeAttempt <= attemptsPerRoute;
            routeAttempt += 1
        ) {
            const request = buildRequest(route, input, config, stream);
            const routeStartAt = Date.now();
            const requestTimeoutMs = Math.min(route.timeoutMs, 120000);

            logInfo("ai.invoke.attempt_started", {
                modelCode: input.modelCode,
                protocol: config.protocol,
                stream,
                providerCode: route.providerCode,
                endpointCode: route.endpointCode,
                attempt: routeAttempt,
                url: request.url,
                timeoutMs: requestTimeoutMs,
            });

            try {
                const response = await fetchWithTimeout(
                    request.url,
                    {
                        method: "POST",
                        headers: buildHeaders(route, config.protocol, stream),
                        body: JSON.stringify(request.body),
                    },
                    requestTimeoutMs,
                );

                if (!response.ok) {
                    const responseError = await parseErrorResponse(response);
                    attempts.push({
                        attempt: routeAttempt,
                        endpointCode: route.endpointCode,
                        providerCode: route.providerCode,
                        error: responseError,
                    });
                    logWarn("ai.invoke.attempt_failed_http", {
                        modelCode: input.modelCode,
                        protocol: config.protocol,
                        stream,
                        providerCode: route.providerCode,
                        endpointCode: route.endpointCode,
                        attempt: routeAttempt,
                        status: response.status,
                        statusText: response.statusText,
                        timeoutMs: requestTimeoutMs,
                        durationMs: Date.now() - routeStartAt,
                        error: responseError,
                    });
                    continue;
                }

                if (stream) {
                    logInfo("ai.invoke.success", {
                        modelCode: input.modelCode,
                        protocol: config.protocol,
                        stream,
                        providerCode: route.providerCode,
                        endpointCode: route.endpointCode,
                        attempt: routeAttempt,
                        durationMs: Date.now() - routeStartAt,
                        totalDurationMs: Date.now() - startedAt,
                    });
                    return {
                        ok: true,
                        modelCode: input.modelCode,
                        protocol: config.protocol,
                        stream: true,
                        reasoningLevel: config.reasoningLevel,
                        route: {
                            endpointId: route.endpointId,
                            endpointCode: route.endpointCode,
                            endpointLabel: route.endpointLabel,
                            providerCode: route.providerCode,
                            providerName: route.providerName,
                            baseUrl: route.baseUrl,
                        },
                        attemptStartedAt: routeStartAt,
                        response,
                    };
                }

                const raw = await response.json();
                const text = extractText(config.protocol, raw);

                logInfo("ai.invoke.success", {
                    modelCode: input.modelCode,
                    protocol: config.protocol,
                    stream,
                    providerCode: route.providerCode,
                    endpointCode: route.endpointCode,
                    attempt: routeAttempt,
                    durationMs: Date.now() - routeStartAt,
                    totalDurationMs: Date.now() - startedAt,
                    hasText: Boolean(text),
                    textLength: text?.length ?? 0,
                });

                return {
                    ok: true,
                    modelCode: input.modelCode,
                    protocol: config.protocol,
                    stream: false,
                    reasoningLevel: config.reasoningLevel,
                    route: {
                        endpointId: route.endpointId,
                        endpointCode: route.endpointCode,
                        endpointLabel: route.endpointLabel,
                        providerCode: route.providerCode,
                        providerName: route.providerName,
                        baseUrl: route.baseUrl,
                    },
                    attemptStartedAt: routeStartAt,
                    text,
                    raw,
                };
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "未知请求错误";

                attempts.push({
                    attempt: routeAttempt,
                    endpointCode: route.endpointCode,
                    providerCode: route.providerCode,
                    error: message,
                });
                logError("ai.invoke.attempt_failed_exception", {
                    modelCode: input.modelCode,
                    protocol: config.protocol,
                    stream,
                    providerCode: route.providerCode,
                    endpointCode: route.endpointCode,
                    attempt: routeAttempt,
                    timeoutMs: requestTimeoutMs,
                    durationMs: Date.now() - routeStartAt,
                    error: message,
                });
            }
        }
    }

    logError("ai.invoke.failed_all_attempts", {
        modelCode: input.modelCode,
        protocol: config.protocol,
        stream,
        totalDurationMs: Date.now() - startedAt,
        attempts: attempts.map((attempt) => ({
            attempt: attempt.attempt,
            providerCode: attempt.providerCode,
            endpointCode: attempt.endpointCode,
        })),
    });

    return {
        ok: false,
        modelCode: input.modelCode,
        protocol: config.protocol,
        stream,
        attempts,
        error: `模型 ${input.modelCode} 调用失败，已尝试全部路由及其重试次数：${summarizeAttempts(
            attempts,
        )}`,
    };
}
