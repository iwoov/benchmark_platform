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
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function readOpenAiStreamDelta(raw: any): { delta: string; thinking: string } {
    const delta = raw?.choices?.[0]?.delta?.content;
    const reasoning =
        raw?.choices?.[0]?.delta?.reasoning_content ??
        raw?.choices?.[0]?.delta?.reasoning ??
        "";
    return {
        delta: typeof delta === "string" ? delta : "",
        thinking: typeof reasoning === "string" ? reasoning : "",
    };
}

function readAnthropicStreamDelta(raw: any): {
    delta: string;
    thinking: string;
} {
    if (raw?.type === "content_block_delta" && raw?.delta) {
        if (
            raw.delta.type === "thinking_delta" &&
            typeof raw.delta.thinking === "string"
        ) {
            return { delta: "", thinking: raw.delta.thinking };
        }
        if (typeof raw.delta.text === "string") {
            return { delta: raw.delta.text, thinking: "" };
        }
    }
    return { delta: "", thinking: "" };
}

function readGeminiStreamDelta(raw: any): { delta: string; thinking: string } {
    const parts = raw?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return { delta: "", thinking: "" };
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
    return { delta, thinking };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function extractDelta(
    protocol: string,
    raw: unknown,
): { delta: string; thinking: string } {
    switch (protocol) {
        case "OPENAI_COMPATIBLE":
            return readOpenAiStreamDelta(raw);
        case "ANTHROPIC_COMPATIBLE":
            return readAnthropicStreamDelta(raw);
        case "GEMINI_COMPATIBLE":
            return readGeminiStreamDelta(raw);
        default:
            return { delta: "", thinking: "" };
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

    const stream = new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    const { value, done } = await reader.read();

                    if (done) {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ done: true })}\n\n`,
                            ),
                        );
                        controller.close();
                        return;
                    }

                    if (!value || value.length === 0) continue;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean);

                    for (const line of lines) {
                        const dataPart = line.startsWith("data:")
                            ? line.slice(5).trim()
                            : line;

                        if (!dataPart || dataPart === "[DONE]") continue;

                        const jsonParsed = parseJsonSafely(dataPart);
                        if (jsonParsed === null) continue;

                        const { delta, thinking } = extractDelta(
                            protocol,
                            jsonParsed,
                        );

                        if (thinking) {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({ thinking })}\n\n`,
                                ),
                            );
                        }

                        if (delta) {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({ delta })}\n\n`,
                                ),
                            );
                        }
                    }
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "流式读取失败";
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ error: message })}\n\n`,
                    ),
                );
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
