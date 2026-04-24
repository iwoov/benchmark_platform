import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { invokeAiModel } from "@/lib/ai/invoke";

const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
});

const requestSchema = z.object({
    chatConfigId: z.string().trim().min(1, "缺少对话配置 ID"),
    messages: z.array(messageSchema).min(1, "至少需要一条消息"),
    /** Pre-built context from the client (preset field values). */
    context: z.string().optional(),
    /** Optional model override (must be one of the config's allowed models). */
    modelCode: z.string().optional(),
    useBuiltInTools: z.boolean().optional(),
});

function readOpenAiStreamDelta(raw: any): {
    delta: string;
    thinking: string;
    contentSnapshot: string;
    thinkingSnapshot: string;
    error: string;
} {
    const delta = raw?.choices?.[0]?.delta?.content;
    const reasoning =
        raw?.choices?.[0]?.delta?.reasoning_content ??
        raw?.choices?.[0]?.delta?.reasoning ??
        "";
    return {
        delta: typeof delta === "string" ? delta : "",
        thinking: typeof reasoning === "string" ? reasoning : "",
        contentSnapshot: "",
        thinkingSnapshot: "",
        error: "",
    };
}

function readOpenAiResponsesStreamDelta(raw: any): {
    delta: string;
    thinking: string;
    contentSnapshot: string;
    thinkingSnapshot: string;
    error: string;
} {
    if (
        raw?.type === "response.output_text.delta" &&
        typeof raw.delta === "string"
    ) {
        return {
            delta: raw.delta,
            thinking: "",
            contentSnapshot: "",
            thinkingSnapshot: "",
            error: "",
        };
    }

    if (
        (raw?.type === "response.reasoning_text.delta" ||
            raw?.type === "response.reasoning_summary_text.delta") &&
        typeof raw.delta === "string"
    ) {
        return {
            delta: "",
            thinking: raw.delta,
            contentSnapshot: "",
            thinkingSnapshot: "",
            error: "",
        };
    }

    if (
        (raw?.type === "response.reasoning_text.done" ||
            raw?.type === "response.reasoning_summary_text.done") &&
        typeof raw.text === "string"
    ) {
        return {
            delta: "",
            thinking: "",
            contentSnapshot: "",
            thinkingSnapshot: raw.text,
            error: "",
        };
    }

    if (raw?.type === "error" && typeof raw.message === "string") {
        return {
            delta: "",
            thinking: "",
            contentSnapshot: "",
            thinkingSnapshot: "",
            error: raw.message,
        };
    }

    if (
        raw?.type === "response.failed" &&
        raw?.response?.error &&
        typeof raw.response.error.message === "string"
    ) {
        return {
            delta: "",
            thinking: "",
            contentSnapshot: "",
            thinkingSnapshot: "",
            error: raw.response.error.message,
        };
    }

    if (raw?.type === "response.output_item.done" && raw?.item) {
        if (raw.item.type === "reasoning" && Array.isArray(raw.item.summary)) {
            const thinking = raw.item.summary
                .map((part: unknown) => {
                    if (
                        part &&
                        typeof part === "object" &&
                        "text" in part &&
                        typeof part.text === "string"
                    ) {
                        return part.text;
                    }

                    return "";
                })
                .filter(Boolean)
                .join("");

            if (thinking) {
                return {
                    delta: "",
                    thinking: "",
                    contentSnapshot: "",
                    thinkingSnapshot: thinking,
                    error: "",
                };
            }
        }

        if (raw.item.type === "message" && Array.isArray(raw.item.content)) {
            const delta = raw.item.content
                .map((part: unknown) => {
                    if (
                        part &&
                        typeof part === "object" &&
                        "type" in part &&
                        part.type === "output_text" &&
                        "text" in part &&
                        typeof part.text === "string"
                    ) {
                        return part.text;
                    }

                    return "";
                })
                .filter(Boolean)
                .join("");

            if (delta) {
                return {
                    delta: "",
                    thinking: "",
                    contentSnapshot: delta,
                    thinkingSnapshot: "",
                    error: "",
                };
            }
        }
    }

    const completedResponse =
        raw?.type === "response.completed" && raw?.response
            ? raw.response
            : raw;

    if (typeof completedResponse?.output_text === "string") {
        return {
            delta: "",
            thinking: "",
            contentSnapshot: completedResponse.output_text,
            thinkingSnapshot: "",
            error: "",
        };
    }

    if (Array.isArray(completedResponse?.output)) {
        const delta = completedResponse.output
            .map((item: unknown) => {
                if (
                    item &&
                    typeof item === "object" &&
                    "content" in item &&
                    Array.isArray(item.content)
                ) {
                    return item.content
                        .map((part: unknown) => {
                            if (
                                part &&
                                typeof part === "object" &&
                                "type" in part &&
                                part.type === "output_text" &&
                                "text" in part &&
                                typeof part.text === "string"
                            ) {
                                return part.text;
                            }

                            return "";
                        })
                        .join("");
                }

                return "";
            })
            .filter(Boolean)
            .join("");

        if (delta) {
            return {
                delta: "",
                thinking: "",
                contentSnapshot: delta,
                thinkingSnapshot: "",
                error: "",
            };
        }
    }

    return {
        delta: "",
        thinking: "",
        contentSnapshot: "",
        thinkingSnapshot: "",
        error: "",
    };
}

function readAnthropicStreamDelta(raw: any): {
    delta: string;
    thinking: string;
    contentSnapshot: string;
    thinkingSnapshot: string;
    error: string;
} {
    if (raw?.type === "content_block_delta" && raw?.delta) {
        if (
            raw.delta.type === "thinking_delta" &&
            typeof raw.delta.thinking === "string"
        ) {
            return {
                delta: "",
                thinking: raw.delta.thinking,
                contentSnapshot: "",
                thinkingSnapshot: "",
                error: "",
            };
        }
        if (typeof raw.delta.text === "string") {
            return {
                delta: raw.delta.text,
                thinking: "",
                contentSnapshot: "",
                thinkingSnapshot: "",
                error: "",
            };
        }
    }
    return {
        delta: "",
        thinking: "",
        contentSnapshot: "",
        thinkingSnapshot: "",
        error: "",
    };
}

function readGeminiStreamDelta(raw: any): {
    delta: string;
    thinking: string;
    contentSnapshot: string;
    thinkingSnapshot: string;
    error: string;
} {
    const parts = raw?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
        return {
            delta: "",
            thinking: "",
            contentSnapshot: "",
            thinkingSnapshot: "",
            error: "",
        };
    }
    let delta = "";
    let thinking = "";
    for (const p of parts) {
        if (p && typeof p.text === "string") {
            if (p.thought === true) {
                thinking += p.text;
            } else {
                delta += p.text;
            }
        }
    }
    return {
        delta,
        thinking,
        contentSnapshot: "",
        thinkingSnapshot: "",
        error: "",
    };
}

function extractDelta(
    protocol: string,
    raw: unknown,
): {
    delta: string;
    thinking: string;
    contentSnapshot: string;
    thinkingSnapshot: string;
    error: string;
} {
    switch (protocol) {
        case "OPENAI_COMPATIBLE":
            return readOpenAiStreamDelta(raw);
        case "OPENAI_RESPONSES":
            return readOpenAiResponsesStreamDelta(raw);
        case "ANTHROPIC_COMPATIBLE":
            return readAnthropicStreamDelta(raw);
        case "GEMINI_COMPATIBLE":
            return readGeminiStreamDelta(raw);
        default:
            return {
                delta: "",
                thinking: "",
                contentSnapshot: "",
                thinkingSnapshot: "",
                error: "",
            };
    }
}

function parseJsonSafely(input: string) {
    try {
        return JSON.parse(input) as unknown;
    } catch {
        return null;
    }
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return Response.json(
            { error: "请先登录后再使用 AI 对话。" },
            { status: 401 },
        );
    }

    const payload = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
        return Response.json(
            { error: parsed.error.issues[0]?.message ?? "请求参数不合法。" },
            { status: 400 },
        );
    }

    const {
        chatConfigId,
        messages,
        context,
        modelCode: modelOverride,
        useBuiltInTools,
    } = parsed.data;

    const chatConfig = await prisma.aiChatConfig.findUnique({
        where: { id: chatConfigId },
    });

    if (!chatConfig || !chatConfig.enabled) {
        return Response.json(
            { error: "对话配置不存在或已禁用。" },
            { status: 404 },
        );
    }

    // Build system message
    const systemParts: string[] = [];
    if (chatConfig.systemPrompt) {
        systemParts.push(chatConfig.systemPrompt);
    }
    if (context) {
        systemParts.push("");
        systemParts.push("以下是当前题目的相关字段信息：");
        systemParts.push(context);
    }

    const aiMessages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
    }> = [];

    if (systemParts.length) {
        aiMessages.push({ role: "system", content: systemParts.join("\n") });
    }

    for (const msg of messages) {
        aiMessages.push({ role: msg.role, content: msg.content });
    }

    // Determine which model to use
    const allowedModels: string[] = Array.isArray(chatConfig.modelCodes)
        ? (chatConfig.modelCodes as string[])
        : [chatConfig.modelCode];
    const effectiveModel =
        modelOverride && allowedModels.includes(modelOverride)
            ? modelOverride
            : (allowedModels[0] ?? chatConfig.modelCode);

    const result = await invokeAiModel({
        modelCode: effectiveModel,
        stream: true,
        enableBuiltInTools: useBuiltInTools,
        messages: aiMessages,
    });

    if (!result.ok) {
        return Response.json({ error: result.error }, { status: 502 });
    }

    if (!result.stream) {
        const text = result.text?.trim() ?? "";
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                if (text) {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ delta: text })}\n\n`,
                        ),
                    );
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ done: true })}\n\n`,
                        ),
                    );
                } else {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ error: "AI 返回了空内容" })}\n\n`,
                        ),
                    );
                }
                controller.close();
            },
        });

        return new Response(body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    }

    const protocol = result.protocol;
    const upstreamBody = result.response.body;

    if (!upstreamBody) {
        return Response.json(
            { error: "AI 模型返回了空响应。" },
            { status: 502 },
        );
    }

    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const enqueueStreamPayload = (
        controller: ReadableStreamDefaultController<Uint8Array>,
        payload: Record<string, string | boolean>,
    ) => {
        controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
    };

    const stream = new ReadableStream({
        async pull(controller) {
            try {
                let buffer = "";

                while (true) {
                    const { value, done } = await reader.read();

                    if (done) {
                        const trailing = buffer.trim();

                        if (trailing) {
                            const dataPart = trailing.startsWith("data:")
                                ? trailing.slice(5).trim()
                                : trailing;
                            const jsonParsed = parseJsonSafely(dataPart);

                            if (jsonParsed !== null) {
                                const {
                                    delta,
                                    thinking,
                                    contentSnapshot,
                                    thinkingSnapshot,
                                    error,
                                } = extractDelta(protocol, jsonParsed);

                                if (thinking) {
                                    enqueueStreamPayload(controller, {
                                        thinking,
                                    });
                                }

                                if (thinkingSnapshot) {
                                    enqueueStreamPayload(controller, {
                                        thinkingSnapshot,
                                    });
                                }

                                if (delta) {
                                    enqueueStreamPayload(controller, {
                                        delta,
                                    });
                                }

                                if (contentSnapshot) {
                                    enqueueStreamPayload(controller, {
                                        contentSnapshot,
                                    });
                                }

                                if (error) {
                                    enqueueStreamPayload(controller, {
                                        error,
                                    });
                                }
                            }
                        }

                        enqueueStreamPayload(controller, { done: true });
                        controller.close();
                        return;
                    }

                    if (!value || value.length === 0) continue;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        const trimmedLine = line.trim();

                        if (!trimmedLine) {
                            continue;
                        }

                        const dataPart = trimmedLine.startsWith("data:")
                            ? trimmedLine.slice(5).trim()
                            : trimmedLine;

                        if (!dataPart || dataPart === "[DONE]") continue;

                        const jsonParsed = parseJsonSafely(dataPart);
                        if (jsonParsed === null) continue;

                        const {
                            delta,
                            thinking,
                            contentSnapshot,
                            thinkingSnapshot,
                            error,
                        } = extractDelta(protocol, jsonParsed);

                        if (thinking) {
                            enqueueStreamPayload(controller, {
                                thinking,
                            });
                        }

                        if (thinkingSnapshot) {
                            enqueueStreamPayload(controller, {
                                thinkingSnapshot,
                            });
                        }

                        if (delta) {
                            enqueueStreamPayload(controller, {
                                delta,
                            });
                        }

                        if (contentSnapshot) {
                            enqueueStreamPayload(controller, {
                                contentSnapshot,
                            });
                        }

                        if (error) {
                            enqueueStreamPayload(controller, {
                                error,
                            });
                        }
                    }
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "流式读取失败";
                enqueueStreamPayload(controller, { error: message });
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
