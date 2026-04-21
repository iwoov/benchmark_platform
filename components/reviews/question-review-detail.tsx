"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { App, Button, Checkbox, Input, Select, Space, Tag } from "antd";
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Languages,
    MessageSquare,
} from "lucide-react";
import { submitReviewAction } from "@/app/actions/reviews";
import { AiReviewStrategyRunner } from "@/components/reviews/ai-review-strategy-runner";
import { AiChatSidebar } from "@/components/reviews/ai-chat-sidebar";
import type { AiChatConfigView } from "@/lib/ai/chat-config";
import type { ResolvedReviewFieldPreference } from "@/lib/reviews/field-preferences";
import type {
    ReviewQuestionDetail,
    ReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";

const questionStatusMeta = {
    DRAFT: { label: "草稿", color: "default" },
    SUBMITTED: { label: "待审核", color: "processing" },
    UNDER_REVIEW: { label: "审核中", color: "gold" },
    APPROVED: { label: "已通过", color: "success" },
    REJECTED: { label: "已驳回", color: "error" },
} as const;

function formatJson(value: unknown) {
    return JSON.stringify(value, null, 2);
}

function getJsonDisplayValue(value: unknown): string | null {
    if (value == null) {
        return null;
    }

    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return value.length ? formatJson(value) : null;
        }

        return Object.keys(value).length ? formatJson(value) : null;
    }

    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    if (
        !(
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"))
        )
    ) {
        return null;
    }

    try {
        const parsed = JSON.parse(trimmed) as unknown;

        if (Array.isArray(parsed)) {
            return parsed.length ? formatJson(parsed) : null;
        }

        if (parsed && typeof parsed === "object") {
            return Object.keys(parsed).length ? formatJson(parsed) : null;
        }

        return null;
    } catch {
        return null;
    }
}

function renderRawFieldValue(value: unknown) {
    const jsonDisplayValue = getJsonDisplayValue(value);

    if (jsonDisplayValue) {
        return (
            <details className="detail-field-json">
                <summary className="detail-field-json-summary">
                    JSON 内容
                </summary>
                <pre className="strategy-json-block detail-field-json-block">
                    {jsonDisplayValue}
                </pre>
            </details>
        );
    }

    if (value == null || (typeof value === "string" && value.trim() === "")) {
        return "—";
    }

    if (typeof value === "object") {
        return formatJson(value);
    }

    return String(value);
}

/**
 * Normalize a filename for fuzzy matching.
 * Filesystems often replace characters like : with _ when saving,
 * so the imageMap key may differ from the raw field value.
 */
function normalizeForMatch(value: string) {
    return value.replace(/[^a-zA-Z0-9.\-]/g, "_").toLowerCase();
}

/** Strip .zip extension for comparison when one side has it and the other doesn't. */
function stripZipExt(value: string) {
    return value.replace(/\.zip$/i, "");
}

function lookupImageUrls(
    value: string,
    imageMap: Record<string, string[]>,
): string[] | null {
    // 1. Exact match
    const exact = imageMap[value];

    if (exact?.length) {
        return exact;
    }

    // 2. Normalized match (handles : vs _ and similar filesystem differences)
    const normalizedValue = normalizeForMatch(value);
    const normalizedValueNoZip = stripZipExt(normalizedValue);

    for (const [key, urls] of Object.entries(imageMap)) {
        if (!urls.length) continue;
        const normalizedKey = normalizeForMatch(key);
        if (normalizedKey === normalizedValue) {
            return urls;
        }
        // Also try matching with/without .zip extension
        if (stripZipExt(normalizedKey) === normalizedValueNoZip) {
            return urls;
        }
    }

    return null;
}

function renderImageField(value: unknown, imageMap: Record<string, string[]>) {
    const strValue = value == null ? "" : String(value).trim();

    if (!strValue) {
        return <span className="muted">—</span>;
    }

    const urls = lookupImageUrls(strValue, imageMap);

    if (!urls || !urls.length) {
        return (
            <div>
                <div
                    className="muted"
                    style={{ marginBottom: 4, fontSize: 12 }}
                >
                    {strValue}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                    (未找到匹配图片)
                </span>
            </div>
        );
    }

    return (
        <div>
            <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
                {strValue}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {urls.map((url) => (
                    <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={url}
                            alt={strValue}
                            style={{
                                maxWidth: 400,
                                maxHeight: 300,
                                borderRadius: 6,
                                border: "1px solid var(--color-border)",
                                objectFit: "contain",
                                background: "var(--color-surface-2, #f5f5f5)",
                            }}
                        />
                    </a>
                ))}
            </div>
        </div>
    );
}

function getTranslatableFieldValue(value: unknown) {
    if (value == null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    if (typeof value === "object") {
        return formatJson(value);
    }

    return String(value);
}

export function QuestionReviewDetail({
    question,
    canReview,
    listPath,
    navigation,
    fieldPreference,
    reviewStrategies,
    strategyRuns,
    chatConfigs,
}: {
    question: ReviewQuestionDetail;
    canReview: boolean;
    listPath: string;
    navigation: ReviewQuestionNavigation;
    fieldPreference: ResolvedReviewFieldPreference;
    chatConfigs?: AiChatConfigView[];
    reviewStrategies: Array<{
        id: string;
        name: string;
        code: string;
        description: string | null;
        stepCount: number;
        datasourceIds: string[];
    }>;
    strategyRuns: Array<{
        id: string;
        status: string;
        errorMessage: string | null;
        createdAt: string;
        finishedAt: string | null;
        strategy: {
            id: string;
            name: string;
            code: string;
        };
        triggeredByName: string;
        parsedResult: {
            version: 1;
            strategy: {
                id: string;
                code: string;
                name: string;
            };
            question: {
                id: string;
                title: string;
                projectName: string;
                projectCode: string;
                datasourceName: string;
            };
            status: "RUNNING" | "SUCCESS" | "FAILED";
            stepResults: Array<{
                stepId: string;
                stepName: string;
                stepKind: "AI_TOOL" | "RULE";
                stepType: string;
                status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
                summary: string;
                outcomeLabel?: string;
                items: Array<{
                    index: number;
                    status: "SUCCESS" | "FAILED";
                    sourceStepId?: string;
                    promptInput?: unknown;
                    requestMeta?: {
                        modelCode: string;
                        protocol?: string | null;
                        reasoningLevel?: string | null;
                        providerCode?: string | null;
                        providerName?: string | null;
                        endpointCode?: string | null;
                        endpointLabel?: string | null;
                        baseUrl?: string | null;
                    };
                    output?: unknown;
                    rawResponse?: unknown;
                    derived?: Record<string, unknown>;
                    error?: string;
                }>;
                metrics?: Record<string, unknown>;
                error?: string;
            }>;
            finalRecommendation: {
                decision?: "PASS" | "REJECT";
                riskLevel?: string;
                summary: string;
            } | null;
            reviewPersistence: {
                status: "SAVED" | "SKIPPED" | "FAILED";
                message: string;
                reviewId?: string;
                decision?: "PASS" | "REJECT";
                comment?: string;
                questionStatus?: "APPROVED" | "REJECTED";
            } | null;
        } | null;
    }>;
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [decision, setDecision] = useState<"PASS" | "REJECT">("PASS");
    const [comment, setComment] = useState("");
    const [useReuseAiComment, setUseReuseAiComment] = useState(true);
    const [chatOpen, setChatOpen] = useState(false);

    const latestAiComment = (() => {
        for (const run of strategyRuns) {
            const summary = run.parsedResult?.finalRecommendation?.summary;
            if (summary) return summary;
        }
        return null;
    })();
    const [fieldTranslations, setFieldTranslations] = useState<
        Record<
            string,
            {
                loading: boolean;
                translatedText?: string;
                displayedText?: string;
                sourceLanguage?: string | null;
            }
        >
    >(() => {
        const initial: Record<
            string,
            {
                loading: boolean;
                translatedText?: string;
                displayedText?: string;
                sourceLanguage?: string | null;
            }
        > = {};
        for (const [key, saved] of Object.entries(
            question.savedTranslations ?? {},
        )) {
            initial[key] = {
                loading: false,
                translatedText: saved.translatedText,
                displayedText: saved.translatedText,
                sourceLanguage: saved.sourceLanguage,
            };
        }
        return initial;
    });
    const [isSubmitting, startSubmitting] = useTransition();
    const abortControllersRef = useRef<Record<string, AbortController>>({});
    const detailBasePath = listPath.split("?")[0];
    const listQuery = listPath.includes("?")
        ? listPath.slice(listPath.indexOf("?"))
        : "";

    const orderedRawEntries = fieldPreference.detailVisibleFieldKeys.map(
        (key) => [key, question.rawRecord[key]] as const,
    );

    const rawFieldLabelMap = Object.fromEntries(
        fieldPreference.fieldCatalog.map((field) => [field.key, field.label]),
    );

    const imageFieldSet = new Set(question.imageFields ?? []);
    const imageMap = question.imageMap ?? {};

    useEffect(() => {
        const controllers = abortControllersRef.current;

        return () => {
            Object.values(controllers).forEach((controller) => {
                controller.abort();
            });
        };
    }, []);

    function submitReview() {
        const effectiveComment =
            useReuseAiComment && latestAiComment ? latestAiComment : comment;
        startSubmitting(async () => {
            const result = await submitReviewAction({
                questionId: question.id,
                decision,
                comment: effectiveComment,
            });

            if (result.error) {
                notification.error({
                    message: "审核提交失败",
                    description: result.error,
                    placement: "topRight",
                });
                return;
            }

            notification.success({
                message: "审核已提交",
                description: result.success,
                placement: "topRight",
            });
            router.refresh();
        });
    }

    function goToQuestion(questionId: string | null) {
        if (!questionId) {
            return;
        }

        router.push(`${detailBasePath}/${questionId}${listQuery}`);
    }

    function goBackToList() {
        router.push(listPath);
    }

    async function translateField(fieldKey: string, value: unknown) {
        const rawValue = getTranslatableFieldValue(value);

        if (!rawValue) {
            notification.warning({
                message: "没有可翻译内容",
                description: `字段 ${fieldKey} 当前为空，无法翻译。`,
                placement: "topRight",
            });
            return;
        }

        // Abort any existing translation for this field
        if (abortControllersRef.current[fieldKey]) {
            abortControllersRef.current[fieldKey].abort();
        }

        const controller = new AbortController();
        abortControllersRef.current[fieldKey] = controller;

        setFieldTranslations((current) => ({
            ...current,
            [fieldKey]: {
                loading: true,
                displayedText: "",
            },
        }));

        try {
            const response = await fetch("/api/ai/translate-field", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    questionId: question.id,
                    fieldKey,
                    value: rawValue,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(
                    errorData?.error ?? `请求失败 (${response.status})`,
                );
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("响应体为空");
            }

            const decoder = new TextDecoder();
            let accumulated = "";
            let sourceLanguage: string | null = null;

            while (true) {
                const { value: chunk, done } = await reader.read();
                if (done) break;

                const text = decoder.decode(chunk, { stream: true });
                const lines = text
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean);

                for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const jsonStr = line.slice(5).trim();
                    if (!jsonStr) continue;

                    try {
                        const event = JSON.parse(jsonStr) as {
                            delta?: string;
                            done?: boolean;
                            sourceLanguage?: string | null;
                            error?: string;
                        };

                        if (event.error) {
                            throw new Error(event.error);
                        }

                        if (event.delta) {
                            accumulated += event.delta;
                            setFieldTranslations((current) => ({
                                ...current,
                                [fieldKey]: {
                                    loading: true,
                                    displayedText: accumulated,
                                    sourceLanguage,
                                },
                            }));
                        }

                        if (event.done) {
                            sourceLanguage = event.sourceLanguage ?? null;
                        }
                    } catch (parseError) {
                        if (
                            parseError instanceof Error &&
                            parseError.message !== jsonStr
                        ) {
                            throw parseError;
                        }
                    }
                }
            }

            setFieldTranslations((current) => ({
                ...current,
                [fieldKey]: {
                    loading: false,
                    translatedText: accumulated,
                    displayedText: accumulated,
                    sourceLanguage,
                },
            }));
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                return;
            }

            notification.error({
                message: "翻译失败",
                description:
                    error instanceof Error ? error.message : "未知错误",
                placement: "topRight",
            });
            setFieldTranslations((current) => ({
                ...current,
                [fieldKey]: {
                    ...current[fieldKey],
                    loading: false,
                    displayedText: current[fieldKey]?.translatedText,
                },
            }));
        } finally {
            delete abortControllersRef.current[fieldKey];
        }
    }

    return (
        <div className="review-detail-fullscreen review-compact-scope">
            <div className="review-detail-topbar">
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <Space size={8} wrap>
                        <Button
                            icon={<ArrowLeft size={16} />}
                            size="middle"
                            onClick={goBackToList}
                        >
                            返回列表
                        </Button>
                        <Button
                            icon={<ChevronLeft size={16} />}
                            size="middle"
                            onClick={() =>
                                goToQuestion(navigation.previousQuestionId)
                            }
                            disabled={!navigation.previousQuestionId}
                        />
                        <Button
                            icon={<ChevronRight size={16} />}
                            size="middle"
                            onClick={() =>
                                goToQuestion(navigation.nextQuestionId)
                            }
                            disabled={!navigation.nextQuestionId}
                        />
                    </Space>
                    <h2 className="review-detail-title">{question.title}</h2>
                    <Space size={8} wrap>
                        <Tag color={questionStatusMeta[question.status].color}>
                            {questionStatusMeta[question.status].label}
                        </Tag>
                        <Tag>{question.externalRecordId}</Tag>
                        <Tag>{question.project.code}</Tag>
                        <Tag>{question.datasource.name}</Tag>
                        <span className="muted review-page-meta">
                            {new Date(question.updatedAt).toLocaleString(
                                "zh-CN",
                            )}
                        </span>
                    </Space>
                </div>
            </div>

            <div className="review-detail-body">
                <div className="review-detail-left">
                    <section className="content-surface review-content-surface">
                        <div
                            className="section-head"
                            style={{ marginBottom: 16 }}
                        >
                            <div>
                                <h3 className="review-section-title">
                                    原始字段
                                </h3>
                                <p className="muted review-page-copy">
                                    按字段设置中的顺序竖向展示，便于和原始 JSON
                                    / Excel 对照。
                                </p>
                            </div>
                        </div>

                        {orderedRawEntries.length ? (
                            <div className="detail-card-grid">
                                {orderedRawEntries.map(([key, value]) => {
                                    const translationState =
                                        fieldTranslations[key];
                                    const translatableValue =
                                        getTranslatableFieldValue(value);
                                    const isImageField = imageFieldSet.has(key);

                                    return (
                                        <div
                                            key={key}
                                            className="detail-field-card"
                                        >
                                            <div className="detail-field-head">
                                                <div className="detail-field-label">
                                                    {rawFieldLabelMap[key] ??
                                                        key}
                                                    {rawFieldLabelMap[key] &&
                                                    rawFieldLabelMap[key] !==
                                                        key ? (
                                                        <span
                                                            className="muted"
                                                            style={{
                                                                fontWeight: 400,
                                                                fontSize: 11,
                                                                marginLeft: 6,
                                                            }}
                                                        >
                                                            {key}
                                                        </span>
                                                    ) : null}
                                                    {isImageField ? (
                                                        <Tag
                                                            color="green"
                                                            style={{
                                                                marginLeft: 6,
                                                                fontSize: 11,
                                                            }}
                                                        >
                                                            图片
                                                        </Tag>
                                                    ) : null}
                                                </div>
                                                {!isImageField ? (
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={
                                                            <Languages
                                                                size={16}
                                                            />
                                                        }
                                                        loading={
                                                            translationState?.loading
                                                        }
                                                        disabled={
                                                            !translatableValue
                                                        }
                                                        onClick={() =>
                                                            translateField(
                                                                key,
                                                                value,
                                                            )
                                                        }
                                                    >
                                                        {translationState?.translatedText
                                                            ? "重新翻译"
                                                            : "翻译"}
                                                    </Button>
                                                ) : null}
                                            </div>
                                            <div className="detail-field-content">
                                                {isImageField
                                                    ? renderImageField(
                                                          value,
                                                          imageMap,
                                                      )
                                                    : renderRawFieldValue(
                                                          value,
                                                      )}
                                            </div>
                                            {translationState?.loading ||
                                            translationState?.displayedText ? (
                                                <div className="detail-field-translation">
                                                    <div className="detail-field-translation-label">
                                                        AI 翻译
                                                        {translationState.sourceLanguage
                                                            ? ` · ${translationState.sourceLanguage}`
                                                            : ""}
                                                    </div>
                                                    <div className="detail-field-translation-body">
                                                        {translationState.loading &&
                                                        !translationState.displayedText
                                                            ? "正在翻译..."
                                                            : translationState.displayedText}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="muted">
                                当前字段配置未启用任何详情字段。
                            </div>
                        )}
                    </section>
                </div>

                <div
                    className={`review-detail-right${chatOpen ? " review-detail-right-with-chat" : ""}`}
                >
                    <div className="review-detail-right-main">
                        {canReview ? (
                            <>
                                <section className="content-surface">
                                    <div
                                        className="section-head"
                                        style={{ marginBottom: 16 }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <h3
                                                style={{
                                                    margin: 0,
                                                    fontSize: 20,
                                                    lineHeight: 1.1,
                                                }}
                                            >
                                                AI 审核辅助
                                            </h3>
                                        </div>
                                        {chatConfigs?.length ? (
                                            <Button
                                                type={
                                                    chatOpen
                                                        ? "primary"
                                                        : "default"
                                                }
                                                icon={
                                                    <MessageSquare size={16} />
                                                }
                                                onClick={() =>
                                                    setChatOpen(!chatOpen)
                                                }
                                            >
                                                AI 对话
                                            </Button>
                                        ) : null}
                                    </div>
                                </section>
                                <AiReviewStrategyRunner
                                    questionId={question.id}
                                    strategies={reviewStrategies}
                                    runs={strategyRuns}
                                    hideHeader
                                />
                            </>
                        ) : null}

                        {canReview ? (
                            <section className="content-surface review-content-surface">
                                <div
                                    className="section-head"
                                    style={{ marginBottom: 16 }}
                                >
                                    <div>
                                        <h3 className="review-section-title">
                                            提交审核
                                        </h3>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gap: 16 }}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <label
                                            className="field-label"
                                            htmlFor="review-decision"
                                            style={{ marginBottom: 0, flexShrink: 0 }}
                                        >
                                            审核结论
                                        </label>
                                        <Select
                                            id="review-decision"
                                            value={decision}
                                            onChange={(value) =>
                                                setDecision(value)
                                            }
                                            options={[
                                                {
                                                    value: "PASS",
                                                    label: "通过",
                                                },
                                                {
                                                    value: "REJECT",
                                                    label: "驳回",
                                                },
                                            ]}
                                            size="middle"
                                        />
                                    </div>

                                    <div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <label
                                                className="field-label"
                                                htmlFor="review-comment"
                                                style={{ marginBottom: 0 }}
                                            >
                                                审核意见
                                            </label>
                                            {latestAiComment ? (
                                                <Checkbox
                                                    checked={useReuseAiComment}
                                                    onChange={(e) =>
                                                        setUseReuseAiComment(
                                                            e.target.checked,
                                                        )
                                                    }
                                                >
                                                    复用AI审核意见
                                                </Checkbox>
                                            ) : null}
                                        </div>
                                        <Input.TextArea
                                            id="review-comment"
                                            value={
                                                useReuseAiComment && latestAiComment
                                                    ? latestAiComment
                                                    : comment
                                            }
                                            onChange={(event) =>
                                                setComment(event.target.value)
                                            }
                                            disabled={
                                                useReuseAiComment &&
                                                !!latestAiComment
                                            }
                                            rows={6}
                                            placeholder="请输入审核意见、修改建议或驳回原因"
                                            size="middle"
                                        />
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "flex-end",
                                        }}
                                    >
                                        <Button
                                            type="primary"
                                            size="middle"
                                            onClick={submitReview}
                                            loading={isSubmitting}
                                        >
                                            提交审核
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        ) : null}
                    </div>

                    {chatOpen && chatConfigs?.length ? (
                        <div className="review-detail-chat-panel">
                            <AiChatSidebar
                                chatConfigs={chatConfigs}
                                rawRecord={question.rawRecord}
                                questionMeta={{
                                    title: question.title,
                                    content: question.content,
                                    answer: question.answer,
                                    analysis: question.analysis,
                                    questionType: question.questionType,
                                    difficulty: question.difficulty,
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
