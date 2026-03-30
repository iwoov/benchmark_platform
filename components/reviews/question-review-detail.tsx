"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { App, Button, Input, Select, Space, Tag } from "antd";
import { ArrowLeft, ChevronLeft, ChevronRight, Languages } from "lucide-react";
import { translateReviewFieldAction } from "@/app/actions/review-field-translation";
import { submitReviewAction } from "@/app/actions/reviews";
import { AiReviewStrategyRunner } from "@/components/reviews/ai-review-strategy-runner";
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
    reviewStrategies,
    strategyRuns,
}: {
    question: ReviewQuestionDetail;
    canReview: boolean;
    listPath: string;
    navigation: ReviewQuestionNavigation;
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
                decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
                riskLevel?: string;
                summary: string;
            } | null;
            reviewPersistence: {
                status: "SAVED" | "SKIPPED" | "FAILED";
                message: string;
                reviewId?: string;
                decision?: "PASS" | "NEEDS_REVISION" | "REJECT";
                comment?: string;
                questionStatus?: "APPROVED" | "REJECTED";
            } | null;
        } | null;
    }>;
}) {
    const router = useRouter();
    const { notification } = App.useApp();
    const [decision, setDecision] = useState<
        "PASS" | "REJECT" | "NEEDS_REVISION"
    >("PASS");
    const [comment, setComment] = useState("");
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
    >({});
    const [isSubmitting, startSubmitting] = useTransition();
    const translationTimersRef = useRef<Record<string, number>>({});
    const detailBasePath = listPath.split("?")[0];
    const listQuery = listPath.includes("?")
        ? listPath.slice(listPath.indexOf("?"))
        : "";

    const orderedRawEntries = (
        question.rawFieldOrder.length
            ? question.rawFieldOrder
            : Object.keys(question.rawRecord)
    ).map((key) => [key, question.rawRecord[key]] as const);

    useEffect(() => {
        const timers = translationTimersRef.current;

        return () => {
            Object.values(timers).forEach((timerId) => {
                window.clearTimeout(timerId);
            });
        };
    }, []);

    function submitReview() {
        startSubmitting(async () => {
            const result = await submitReviewAction({
                questionId: question.id,
                decision,
                comment,
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

    function streamTranslatedText(
        fieldKey: string,
        fullText: string,
        sourceLanguage?: string | null,
    ) {
        const characters = Array.from(fullText);
        const chunkSize =
            characters.length > 360 ? 10 : characters.length > 180 ? 6 : 3;

        const tick = (index: number) => {
            setFieldTranslations((current) => ({
                ...current,
                [fieldKey]: {
                    loading: false,
                    translatedText: fullText,
                    displayedText: characters.slice(0, index).join(""),
                    sourceLanguage,
                },
            }));

            if (index >= characters.length) {
                delete translationTimersRef.current[fieldKey];
                return;
            }

            translationTimersRef.current[fieldKey] = window.setTimeout(
                () => tick(Math.min(index + chunkSize, characters.length)),
                18,
            );
        };

        tick(0);
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

        setFieldTranslations((current) => ({
            ...current,
            [fieldKey]: {
                ...current[fieldKey],
                loading: true,
                displayedText: "",
            },
        }));

        if (translationTimersRef.current[fieldKey]) {
            window.clearTimeout(translationTimersRef.current[fieldKey]);
            delete translationTimersRef.current[fieldKey];
        }

        const result = await translateReviewFieldAction({
            questionId: question.id,
            fieldKey,
            value: rawValue,
        });

        if (result.error) {
            notification.error({
                message: "翻译失败",
                description: result.error,
                placement: "topRight",
            });
            setFieldTranslations((current) => ({
                ...current,
                [fieldKey]: {
                    ...current[fieldKey],
                    loading: false,
                    displayedText: undefined,
                },
            }));
            return;
        }

        streamTranslatedText(
            fieldKey,
            result.translatedText ?? "",
            result.sourceLanguage,
        );
    }

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <section className="content-surface">
                <div className="section-head">
                    <div>
                        <Space size={8} style={{ marginBottom: 14 }} wrap>
                            <Button
                                icon={<ArrowLeft size={16} />}
                                onClick={goBackToList}
                            >
                                返回列表
                            </Button>
                            <Button
                                icon={<ChevronLeft size={16} />}
                                onClick={() =>
                                    goToQuestion(navigation.previousQuestionId)
                                }
                                disabled={!navigation.previousQuestionId}
                            />
                            <Button
                                icon={<ChevronRight size={16} />}
                                onClick={() =>
                                    goToQuestion(navigation.nextQuestionId)
                                }
                                disabled={!navigation.nextQuestionId}
                            />
                        </Space>
                        <h2
                            style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}
                        >
                            {question.title}
                        </h2>
                    </div>
                    <Space size={8} wrap>
                        <Tag color={questionStatusMeta[question.status].color}>
                            {questionStatusMeta[question.status].label}
                        </Tag>
                        <Tag>{question.project.code}</Tag>
                        <Tag>{question.datasource.name}</Tag>
                    </Space>
                </div>

                <div className="detail-meta-grid">
                    <div className="detail-meta-card">
                        <div className="detail-meta-label">外部记录 ID</div>
                        <div className="detail-meta-value">
                            {question.externalRecordId}
                        </div>
                    </div>
                    <div className="detail-meta-card">
                        <div className="detail-meta-label">项目</div>
                        <div className="detail-meta-value">
                            {question.project.name} ({question.project.code})
                        </div>
                    </div>
                    <div className="detail-meta-card">
                        <div className="detail-meta-label">数据源</div>
                        <div className="detail-meta-value">
                            {question.datasource.name}
                        </div>
                    </div>
                    <div className="detail-meta-card">
                        <div className="detail-meta-label">更新时间</div>
                        <div className="detail-meta-value">
                            {new Date(question.updatedAt).toLocaleString(
                                "zh-CN",
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="content-surface">
                <div className="section-head" style={{ marginBottom: 16 }}>
                    <div>
                        <h3
                            style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}
                        >
                            原始字段
                        </h3>
                        <p
                            className="muted"
                            style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                        >
                            按导入时的字段顺序竖向展示，便于和原始 JSON / Excel
                            对照。
                        </p>
                    </div>
                </div>

                {orderedRawEntries.length ? (
                    <div className="detail-card-grid">
                        {orderedRawEntries.map(([key, value]) => {
                            const translationState = fieldTranslations[key];
                            const translatableValue =
                                getTranslatableFieldValue(value);

                            return (
                                <div key={key} className="detail-field-card">
                                    <div className="detail-field-head">
                                        <div className="detail-field-label">
                                            {key}
                                        </div>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<Languages size={16} />}
                                            loading={translationState?.loading}
                                            disabled={!translatableValue}
                                            onClick={() =>
                                                translateField(key, value)
                                            }
                                        >
                                            翻译
                                        </Button>
                                    </div>
                                    <div className="detail-field-content">
                                        {renderRawFieldValue(value)}
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
                    <div className="muted">当前题目没有原始字段可展示。</div>
                )}
            </section>

            {canReview ? (
                <AiReviewStrategyRunner
                    questionId={question.id}
                    strategies={reviewStrategies}
                    runs={strategyRuns}
                />
            ) : null}

            {canReview ? (
                <section className="content-surface">
                    <div className="section-head" style={{ marginBottom: 16 }}>
                        <div>
                            <h3
                                style={{
                                    margin: 0,
                                    fontSize: 20,
                                    lineHeight: 1.1,
                                }}
                            >
                                提交审核
                            </h3>
                            <p
                                className="muted"
                                style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                            >
                                在详情页直接填写审核意见并提交结论。
                            </p>
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 16 }}>
                        <div>
                            <label
                                className="field-label"
                                htmlFor="review-decision"
                            >
                                审核结论
                            </label>
                            <Select
                                id="review-decision"
                                value={decision}
                                onChange={(value) => setDecision(value)}
                                options={[
                                    { value: "PASS", label: "通过" },
                                    {
                                        value: "NEEDS_REVISION",
                                        label: "退回修改",
                                    },
                                    { value: "REJECT", label: "驳回" },
                                ]}
                                size="large"
                            />
                        </div>

                        <div>
                            <label
                                className="field-label"
                                htmlFor="review-comment"
                            >
                                审核意见
                            </label>
                            <Input.TextArea
                                id="review-comment"
                                value={comment}
                                onChange={(event) =>
                                    setComment(event.target.value)
                                }
                                rows={6}
                                placeholder="请输入审核意见、修改建议或驳回原因"
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
    );
}
