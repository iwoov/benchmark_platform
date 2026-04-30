"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Select, Switch, Tag } from "antd";
import {
    ChevronDown,
    ChevronRight,
    MessageSquare,
    Send,
    Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AiChatConfigView } from "@/lib/ai/chat-config";
import { aiBuiltInToolLabels } from "@/lib/ai/provider-catalog";

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    thinking?: string;
    phase?: "waiting" | "thinking" | "responding" | "done";
};

type ChatStreamEvent = {
    delta?: string;
    thinking?: string;
    contentSnapshot?: string;
    thinkingSnapshot?: string;
    error?: string;
    done?: boolean;
};

const fieldLabelMap: Record<string, string> = {
    title: "标题",
    content: "题干",
    answer: "答案",
    analysis: "解析",
    questionType: "题型",
    difficulty: "难度",
    rawRecord: "原始记录",
    manualReviewComment: "人工审核意见",
    aiReviewComment: "AI 审核意见",
};

function getFieldLabel(field: string) {
    return fieldLabelMap[field] ?? field;
}

function buildContextString(
    presetFields: string[],
    rawRecord: Record<string, string>,
    questionMeta: {
        title: string;
        content: string;
        answer?: string | null;
        analysis?: string | null;
        questionType?: string | null;
        difficulty?: string | null;
    },
    reviewContext?: {
        manualReviewComment?: string | null;
        aiReviewComment?: string | null;
    },
): string {
    const lines: string[] = [];

    const systemFieldMap: Record<string, string | null | undefined> = {
        title: questionMeta.title,
        content: questionMeta.content,
        answer: questionMeta.answer,
        analysis: questionMeta.analysis,
        questionType: questionMeta.questionType,
        difficulty: questionMeta.difficulty,
        manualReviewComment: reviewContext?.manualReviewComment,
        aiReviewComment: reviewContext?.aiReviewComment,
    };

    for (const field of presetFields) {
        if (field in systemFieldMap) {
            const val = systemFieldMap[field];
            if (val) {
                lines.push(`[${field}]\n${val}`);
            }
        } else if (field === "rawRecord") {
            lines.push(`[rawRecord]\n${JSON.stringify(rawRecord, null, 2)}`);
        } else if (field in rawRecord) {
            lines.push(`[${field}]\n${rawRecord[field]}`);
        }
    }

    return lines.join("\n\n");
}

let messageIdCounter = 0;
function nextMessageId() {
    return `msg-${++messageIdCounter}-${Date.now()}`;
}

function WaitingTimer() {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds((s) => s + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="ai-chat-waiting">
            <span className="ai-chat-waiting-dot" />
            <span>等待回复... {seconds}s</span>
        </div>
    );
}

function ThinkingBlock({
    thinking,
    isThinking,
}: {
    thinking: string;
    isThinking: boolean;
}) {
    const [manualToggle, setManualToggle] = useState<boolean | null>(null);

    // Auto-expand while thinking, auto-collapse when done
    const expanded = manualToggle ?? isThinking;

    if (!thinking) return null;

    return (
        <div className="ai-chat-thinking-block">
            <button
                className="ai-chat-thinking-toggle"
                onClick={() => setManualToggle(!expanded)}
                type="button"
            >
                {expanded ? (
                    <ChevronDown size={14} />
                ) : (
                    <ChevronRight size={14} />
                )}
                <span>思考过程{isThinking ? "..." : ""}</span>
            </button>
            {expanded && (
                <div className="ai-chat-thinking-content">
                    <MarkdownContent content={thinking} />
                </div>
            )}
        </div>
    );
}

function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="ai-chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
    );
}

export function AiChatSidebar({
    chatConfigs,
    rawRecord,
    questionMeta,
    reviewContext,
}: {
    chatConfigs: AiChatConfigView[];
    rawRecord: Record<string, string>;
    questionMeta: {
        title: string;
        content: string;
        answer?: string | null;
        analysis?: string | null;
        questionType?: string | null;
        difficulty?: string | null;
    };
    reviewContext?: {
        manualReviewComment?: string | null;
        aiReviewComment?: string | null;
    };
}) {
    const [selectedConfigId, setSelectedConfigId] = useState<string>(
        chatConfigs[0]?.id ?? "",
    );
    const [selectedModelCode, setSelectedModelCode] = useState<string>("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [useBuiltInTools, setUseBuiltInTools] = useState(false);
    const [activePresetFields, setActivePresetFields] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const selectedConfig = chatConfigs.find((c) => c.id === selectedConfigId);
    const selectedModelBuiltInTools =
        (selectedConfig?.modelBuiltInTools?.[selectedModelCode] ??
            selectedConfig?.modelBuiltInTools?.[selectedConfig?.modelCode ?? ""] ??
            []) || [];
    const selectedModelSupportsBuiltInTools =
        selectedModelBuiltInTools.length > 0;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        setMessages([]);
        const config = chatConfigs.find((c) => c.id === selectedConfigId);
        setSelectedModelCode(config?.modelCodes[0] ?? "");
        setActivePresetFields(config?.presetFields ?? []);
    }, [selectedConfigId, chatConfigs]);

    useEffect(() => {
        setUseBuiltInTools(false);
    }, [selectedConfigId, selectedModelCode]);

    function clearMessages() {
        if (isStreaming) {
            abortControllerRef.current?.abort();
            setIsStreaming(false);
        }
        setMessages([]);
    }

    async function sendMessage() {
        const text = inputValue.trim();
        if (!text || !selectedConfig || isStreaming) return;

        const userMsg: ChatMessage = {
            id: nextMessageId(),
            role: "user",
            content: text,
        };

        const assistantMsgId = nextMessageId();
        const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            thinking: "",
            phase: "waiting",
        };

        const nextMessages = [...messages, userMsg];
        setMessages([...nextMessages, assistantMsg]);
        setInputValue("");
        setIsStreaming(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;
        let accumulated = "";
        let accumulatedThinking = "";
        let sawAnyPayload = false;
        let sawDoneEvent = false;
        let sawErrorEvent = false;
        let requestFailed = false;
        let requestAborted = false;
        const applyStreamEvent = (parsed: ChatStreamEvent) => {
            if (parsed.done) {
                sawDoneEvent = true;
            }

            let nextPhase: ChatMessage["phase"] | null = null;

            if (typeof parsed.thinkingSnapshot === "string") {
                accumulatedThinking = parsed.thinkingSnapshot;
                sawAnyPayload = true;
                nextPhase = "thinking";
            }

            if (parsed.thinking) {
                accumulatedThinking += parsed.thinking;
                sawAnyPayload = true;
                nextPhase = "thinking";
            }

            if (typeof parsed.contentSnapshot === "string") {
                accumulated = parsed.contentSnapshot;
                sawAnyPayload = true;
                nextPhase = "responding";
            }

            if (parsed.delta) {
                accumulated += parsed.delta;
                sawAnyPayload = true;
                nextPhase = "responding";
            }

            if (parsed.error) {
                sawErrorEvent = true;
                accumulated += `\n[错误] ${parsed.error}`;
                nextPhase = "done";
            }

            if (!nextPhase) {
                return;
            }

            const contentSnapshot = accumulated;
            const thinkingSnapshot = accumulatedThinking;
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantMsgId
                        ? {
                              ...m,
                              content: contentSnapshot,
                              thinking: thinkingSnapshot,
                              phase: nextPhase,
                          }
                        : m,
                ),
            );
        };

        try {
            const context = buildContextString(
                activePresetFields,
                rawRecord,
                questionMeta,
                reviewContext,
            );

            const response = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chatConfigId: selectedConfig.id,
                    modelCode: selectedModelCode || undefined,
                    useBuiltInTools:
                        selectedModelSupportsBuiltInTools && useBuiltInTools,
                    messages: nextMessages.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    context: context || undefined,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => null);
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? {
                                  ...m,
                                  content:
                                      error?.error ??
                                      `请求失败 (${response.status})`,
                              }
                            : m,
                    ),
                );
                setIsStreaming(false);
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? { ...m, content: "无法读取响应流。" }
                            : m,
                    ),
                );
                setIsStreaming(false);
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    const trailingLines = buffer.split(/\r?\n/).filter(Boolean);

                    for (const line of trailingLines) {
                        if (!line.startsWith("data:")) continue;
                        const dataPart = line.slice(5).trim();
                        if (!dataPart || dataPart === "[DONE]") continue;

                        try {
                            applyStreamEvent(JSON.parse(dataPart));
                        } catch {
                            // ignore parse errors
                        }
                    }

                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const dataPart = line.slice(5).trim();
                    if (!dataPart || dataPart === "[DONE]") continue;

                    try {
                        applyStreamEvent(JSON.parse(dataPart));
                    } catch {
                        // ignore parse errors
                    }
                }
            }
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                requestAborted = true;
            } else {
                requestFailed = true;
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? {
                                  ...m,
                                  content:
                                      m.content ||
                                      `请求异常：${(error as Error).message}`,
                              }
                            : m,
                    ),
                );
            }
        } finally {
            if (
                !accumulated &&
                !accumulatedThinking &&
                !sawAnyPayload &&
                !sawErrorEvent &&
                !requestFailed &&
                !requestAborted &&
                sawDoneEvent
            ) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? {
                                  ...m,
                                  content: "AI 未返回可展示内容。",
                                  phase: "done",
                              }
                            : m,
                    ),
                );
            }

            if (
                !accumulated &&
                !accumulatedThinking &&
                !sawAnyPayload &&
                !sawErrorEvent &&
                !requestFailed &&
                !requestAborted &&
                !sawDoneEvent
            ) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? {
                                  ...m,
                                  content: "流式响应在返回内容前中断了。",
                                  phase: "done",
                              }
                            : m,
                    ),
                );
            }

            setMessages((prev) =>
                prev.map((m) =>
                    m.id === assistantMsgId
                        ? {
                              ...m,
                              phase: "done",
                          }
                        : m,
                ),
            );
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    if (!chatConfigs.length) {
        return null;
    }

    return (
        <div className="ai-chat-sidebar">
            <div className="ai-chat-sidebar-header">
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <MessageSquare size={18} />
                    <strong>AI 对话</strong>
                </div>
            </div>

            <div className="ai-chat-sidebar-config">
                <Select
                    value={selectedConfigId || undefined}
                    onChange={(value) => setSelectedConfigId(value)}
                    options={chatConfigs.map((c) => ({
                        value: c.id,
                        label: c.name,
                    }))}
                    placeholder="选择对话配置"
                    size="small"
                    style={{ flex: 1 }}
                />
                {selectedConfig && selectedConfig.modelCodes.length > 1 ? (
                    <Select
                        value={selectedModelCode || undefined}
                        onChange={(value) => setSelectedModelCode(value)}
                        options={selectedConfig.modelCodes.map((code) => ({
                            value: code,
                            label: code,
                        }))}
                        placeholder="模型"
                        size="small"
                        style={{ flex: 1 }}
                    />
                ) : null}
                <Button
                    type="text"
                    size="small"
                    icon={<Trash2 size={14} />}
                    onClick={clearMessages}
                    disabled={!messages.length && !isStreaming}
                    title="清空对话"
                />
            </div>

            {selectedModelSupportsBuiltInTools ? (
                <div className="workspace-tip" style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Switch
                            size="small"
                            checked={useBuiltInTools}
                            onChange={setUseBuiltInTools}
                            disabled={isStreaming}
                        />
                        <span style={{ fontWeight: 600 }}>本次对话启用工具</span>
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                        当前模型支持：
                        {selectedModelBuiltInTools.map((tool) => (
                            <Tag
                                key={tool}
                                color="gold"
                                style={{ marginInlineStart: 6 }}
                            >
                                {aiBuiltInToolLabels[tool]}
                            </Tag>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="ai-chat-messages">
                {!messages.length && (
                    <div className="ai-chat-empty">
                        <MessageSquare
                            size={32}
                            className="ai-chat-empty-icon"
                        />
                        <p>
                            向 AI
                            提问关于当前题目的问题，预设字段会自动作为上下文发送。
                        </p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`ai-chat-message ai-chat-message-${msg.role}`}
                    >
                        <div className="ai-chat-message-role">
                            {msg.role === "user" ? "你" : "AI"}
                        </div>
                        {msg.role === "assistant" && msg.phase === "waiting" ? (
                            <WaitingTimer />
                        ) : null}
                        {msg.role === "assistant" && msg.thinking ? (
                            <ThinkingBlock
                                thinking={msg.thinking}
                                isThinking={msg.phase === "thinking"}
                            />
                        ) : null}
                        {msg.role === "user" ? (
                            <div className="ai-chat-message-content">
                                {msg.content}
                            </div>
                        ) : msg.content ? (
                            <div className="ai-chat-message-content">
                                <MarkdownContent content={msg.content} />
                            </div>
                        ) : null}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {selectedConfig ? (
                <div
                    style={{
                        padding: "8px 0 6px",
                        borderTop: "1px solid var(--color-border-light)",
                    }}
                >
                    <div
                        className="muted"
                        style={{ fontSize: 12, marginBottom: 6 }}
                    >
                        当前默认携带字段
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                        }}
                    >
                        {activePresetFields.length ? (
                            activePresetFields.map((field) => (
                                <Tag
                                    key={field}
                                    closable={!isStreaming}
                                    onClose={(event) => {
                                        event.preventDefault();
                                        setActivePresetFields((current) =>
                                            current.filter(
                                                (item) => item !== field,
                                            ),
                                        );
                                    }}
                                >
                                    {getFieldLabel(field)}
                                </Tag>
                            ))
                        ) : (
                            <span className="muted" style={{ fontSize: 12 }}>
                                当前没有携带默认字段。
                            </span>
                        )}
                    </div>
                </div>
            ) : null}

            <div className="ai-chat-input-area">
                <Input.TextArea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                    autoSize={{ minRows: 1, maxRows: 10 }}
                    disabled={isStreaming || !selectedConfig}
                    size="small"
                />
                <Button
                    type="primary"
                    size="small"
                    icon={<Send size={14} />}
                    onClick={sendMessage}
                    disabled={
                        !inputValue.trim() || isStreaming || !selectedConfig
                    }
                />
            </div>
        </div>
    );
}
