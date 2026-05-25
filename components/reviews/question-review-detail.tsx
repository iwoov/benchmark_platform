"use client";

import { useRouter } from "next/navigation";
import {
    useEffect,
    useRef,
    useState,
    useTransition,
    type CSSProperties,
    type ReactNode,
} from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button as UiButton, type ButtonProps } from "@/components/ui/button";
import {
    Input as UiInput,
    Select as UiSelect,
    Textarea,
} from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { AiChatConfigView } from "@/lib/ai/chat-config";
import type { AiBuiltInToolType } from "@/lib/ai/provider-catalog";
import type { AiReviewStrategyRetryStateView } from "@/lib/ai/review-strategy-batches";
import type { ResolvedReviewFieldPreference } from "@/lib/reviews/field-preferences";
import type {
    ReviewQuestionDetail,
    ReviewQuestionNavigation,
} from "@/lib/reviews/question-list-data";
import { REVIEW_COMMENT_MAX_LENGTH } from "@/lib/reviews/review-constraints";

type SelectOption = {
    value: string;
    label: ReactNode;
};

function Select({
    id,
    value,
    onChange,
    options,
}: {
    id?: string;
    value?: string;
    onChange?: (value: any) => void;
    options?: SelectOption[];
    size?: "small" | "middle" | "large";
}) {
    return (
        <UiSelect
            id={id}
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
        >
            {(options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </UiSelect>
    );
}

type LocalButtonProps = Omit<ButtonProps, "type" | "leftIcon" | "variant" | "size"> & {
    type?: "primary" | "default" | "text";
    icon?: ReactNode;
    size?: "small" | "middle" | "large";
};

function Button({
    type,
    icon,
    size,
    children,
    ...props
}: LocalButtonProps) {
    return (
        <UiButton
            {...props}
            variant={
                type === "primary"
                    ? "default"
                    : type === "text"
                      ? "ghost"
                      : "secondary"
            }
            size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
            leftIcon={icon}
        >
            {children}
        </UiButton>
    );
}

function Checkbox({
    checked,
    onChange,
    children,
}: {
    checked?: boolean;
    onChange?: (event: { target: { checked: boolean } }) => void;
    children: ReactNode;
}) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
                type="checkbox"
                checked={!!checked}
                onChange={(event) =>
                    onChange?.({ target: { checked: event.target.checked } })
                }
                className="h-4 w-4 rounded border-input accent-primary"
            />
            <span>{children}</span>
        </label>
    );
}

function Space({
    children,
    size = 8,
    wrap,
}: {
    children: ReactNode;
    size?: number;
    wrap?: boolean;
}) {
    return (
        <div
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: size,
                flexWrap: wrap ? "wrap" : "nowrap",
            }}
        >
            {children}
        </div>
    );
}

function Tag({
    children,
    color,
    style,
}: {
    children: ReactNode;
    color?: string;
    style?: CSSProperties;
}) {
    const variant =
        color === "success" || color === "green"
            ? "success"
            : color === "error"
              ? "destructive"
              : color === "gold" || color === "warning"
                ? "warning"
                : color === "blue" || color === "processing"
                  ? "info"
                  : "outline";

    return (
        <Badge variant={variant} size="sm" style={style}>
            {children}
        </Badge>
    );
}

function TextAreaAdapter({
    size: _size,
    showCount: _showCount,
    ...props
}: Omit<React.ComponentProps<typeof Textarea>, "size"> & {
    size?: "small" | "middle" | "large";
    showCount?: boolean;
}) {
    return <Textarea {...props} />;
}

const Input = Object.assign(UiInput, {
    TextArea: TextAreaAdapter,
});

function Collapse({
    items,
}: {
    className?: string;
    bordered?: boolean;
    items: Array<{
        key: string;
        label: ReactNode;
        children: ReactNode;
    }>;
}) {
    return (
        <div className="space-y-2">
            {items.map((item) => (
                <details
                    key={item.key}
                    className="rounded-md border border-border bg-card"
                >
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                        {item.label}
                    </summary>
                    <div className="border-t border-border px-3 py-3">
                        {item.children}
                    </div>
                </details>
            ))}
        </div>
    );
}

const questionStatusMeta = {
    DRAFT: { label: "草稿", color: "default" },
    SUBMITTED: { label: "待审核", color: "processing" },
    UNDER_REVIEW: { label: "审核中", color: "gold" },
    APPROVED: { label: "已通过", color: "success" },
    REJECTED: { label: "已驳回", color: "error" },
} as const;

const reviewStatusMeta = {
    NONE: { label: "未审核", color: "default" },
    PASS: { label: "通过", color: "success" },
    REJECT: { label: "驳回", color: "error" },
} as const;

const revisionBaseFieldLabelMap = {
    title: "题目标题",
    content: "题干",
    answer: "答案",
    analysis: "解析",
    questionType: "题型",
    difficulty: "难度",
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

function coerceToPrimitiveArray(value: unknown): string[] | null {
    const tryFromArray = (arr: unknown[]): string[] | null => {
        if (!arr.length) {
            return null;
        }
        const out: string[] = [];
        for (const item of arr) {
            if (item == null) continue;
            if (
                typeof item === "string" ||
                typeof item === "number" ||
                typeof item === "boolean"
            ) {
                const text = String(item).trim();
                if (text) out.push(text);
                continue;
            }
            // any non-primitive entry → bail out, let caller fall back
            return null;
        }
        return out.length ? out : null;
    };

    if (Array.isArray(value)) {
        return tryFromArray(value);
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (Array.isArray(parsed)) {
                    return tryFromArray(parsed);
                }
            } catch {
                /* fall through */
            }
        }
    }

    return null;
}

function renderOptionsList(items: string[]) {
    return (
        <ul className="detail-field-options">
            {items.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
            ))}
        </ul>
    );
}

function renderRawFieldValue(value: unknown, key?: string) {
    if (key && key.toLowerCase() === "options") {
        const items = coerceToPrimitiveArray(value);
        if (items && items.length) {
            return renderOptionsList(items);
        }
    }

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

/** Strip archive extension for comparison when one side has it and the other doesn't. */
function stripArchiveExt(value: string) {
    return value.replace(/\.(zip|rar)$/i, "");
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
    const normalizedValueNoArchive = stripArchiveExt(normalizedValue);

    for (const [key, urls] of Object.entries(imageMap)) {
        if (!urls.length) continue;
        const normalizedKey = normalizeForMatch(key);
        if (normalizedKey === normalizedValue) {
            return urls;
        }
        // Also try matching with/without archive extension
        if (stripArchiveExt(normalizedKey) === normalizedValueNoArchive) {
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

function getRevisionDiffLabel(
    fieldKey: string,
    fallbackLabel: string,
    rawFieldLabelMap: Record<string, string>,
) {
    if (fieldKey.startsWith("raw:")) {
        const rawFieldKey = fieldKey.slice(4);
        return rawFieldLabelMap[rawFieldKey] ?? rawFieldKey;
    }

    return (
        revisionBaseFieldLabelMap[
            fieldKey as keyof typeof revisionBaseFieldLabelMap
        ] ?? fallbackLabel
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

function formatReviewResponseDate(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
        return trimmed;
    }

    return date.toLocaleDateString("zh-CN");
}

type CleaningFieldResultView = {
    fieldKey: string;
    originalValue: string | null;
    cleanedValue: string | null;
    changed: boolean;
    changeType: string;
    reason: string;
    confidence: number | undefined;
    issues: string[];
};

const cleanedQuestionIdFieldKey = "cleaned_question_id";
const questionIdFieldKeys = [
    "question_id",
    "questionId",
    "questionID",
    "Question ID",
    "Question_ID",
    "题目ID",
    "题目id",
    "题目编号",
    "试题编号",
];

function normalizeRawFieldKey(value: string) {
    return value
        .toLowerCase()
        .replace(/[\s_\-()[\]{}<>./\\:：，,;；'"`~!@#$%^&*+=|?！？]/g, "");
}

function trimStringToNull(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }

    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
}

function findRawQuestionId(rawRecord: Record<string, unknown>) {
    for (const key of questionIdFieldKeys) {
        const value = trimStringToNull(rawRecord[key]);
        if (value) {
            return value;
        }
    }

    const normalizedQuestionIdKeys = new Set(
        questionIdFieldKeys.map((key) => normalizeRawFieldKey(key)),
    );

    for (const [key, rawValue] of Object.entries(rawRecord)) {
        if (!normalizedQuestionIdKeys.has(normalizeRawFieldKey(key))) {
            continue;
        }

        const value = trimStringToNull(rawValue);
        if (value) {
            return value;
        }
    }

    return null;
}

function buildLocalCleaningFieldResults(rawRecord: Record<string, string>) {
    const cleanedQuestionId = trimStringToNull(
        rawRecord[cleanedQuestionIdFieldKey],
    );
    const originalQuestionId = findRawQuestionId(rawRecord);

    if (!cleanedQuestionId || !originalQuestionId) {
        return [] as CleaningFieldResultView[];
    }

    return [
        {
            fieldKey: cleanedQuestionIdFieldKey,
            originalValue: originalQuestionId,
            cleanedValue: cleanedQuestionId,
            changed: originalQuestionId !== cleanedQuestionId,
            changeType: "NORMALIZATION",
            reason: "本地规则生成 cleaned_question_id，未调用模型。",
            confidence: 1,
            issues: [],
        },
    ] satisfies CleaningFieldResultView[];
}

function runHasCleaningStep(run: {
    parsedResult: {
        stepResults: Array<{
            stepKind: "AI_TOOL" | "RULE";
            stepType: string;
        }>;
    } | null;
}) {
    return (
        run.parsedResult?.stepResults.some(
            (step) =>
                step.stepKind === "AI_TOOL" &&
                step.stepType === "FIELD_CLEANING",
        ) ?? false
    );
}

function runHasReviewStep(run: {
    parsedResult: {
        stepResults: Array<{
            stepKind: "AI_TOOL" | "RULE";
            stepType: string;
        }>;
    } | null;
}) {
    return (
        run.parsedResult?.stepResults.some(
            (step) =>
                step.stepType !== "FIELD_CLEANING" &&
                (step.stepKind === "AI_TOOL" || step.stepKind === "RULE"),
        ) ?? false
    );
}

function readCleaningFieldResults(output: unknown) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
        return [] as CleaningFieldResultView[];
    }

    const fieldResults = (output as Record<string, unknown>).fieldResults;
    if (!Array.isArray(fieldResults)) {
        return [] as CleaningFieldResultView[];
    }

    return fieldResults
        .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                return null;
            }

            const record = item as Record<string, unknown>;
            if (typeof record.fieldKey !== "string" || !record.fieldKey) {
                return null;
            }

            return {
                fieldKey: record.fieldKey,
                originalValue:
                    typeof record.originalValue === "string"
                        ? record.originalValue
                        : record.originalValue == null
                          ? null
                          : String(record.originalValue),
                cleanedValue:
                    typeof record.cleanedValue === "string"
                        ? record.cleanedValue
                        : record.cleanedValue == null
                          ? null
                          : String(record.cleanedValue),
                changed: record.changed === true,
                changeType:
                    typeof record.changeType === "string"
                        ? record.changeType
                        : "OTHER",
                reason:
                    typeof record.reason === "string"
                        ? record.reason
                        : "已完成字段清洗。",
                confidence:
                    typeof record.confidence === "number"
                        ? record.confidence
                        : undefined,
                issues: Array.isArray(record.issues)
                    ? record.issues
                          .map((issue) =>
                              typeof issue === "string" ? issue : String(issue),
                          )
                          .filter(Boolean)
                    : [],
            };
        })
        .filter(
            (item): item is CleaningFieldResultView => Boolean(item),
        );
}

export function QuestionReviewDetail({
    question,
    canReview,
    listPath,
    navigation,
    initialRightTab = "quality",
    fieldPreference,
    reviewStrategies,
    strategyRuns,
    retryStates,
    chatConfigs,
}: {
    question: ReviewQuestionDetail;
    canReview: boolean;
    listPath: string;
    navigation: ReviewQuestionNavigation;
    initialRightTab?: "quality" | "cleaning";
    fieldPreference: ResolvedReviewFieldPreference;
    chatConfigs?: AiChatConfigView[];
    reviewStrategies: Array<{
        id: string;
        name: string;
        code: string;
        description: string | null;
        stepCount: number;
        datasourceIds: string[];
        builtInTools: AiBuiltInToolType[];
        toolTypes: string[];
        hasCleaningStep: boolean;
        hasReviewStep: boolean;
    }>;
    retryStates: AiReviewStrategyRetryStateView[];
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
    const toast = useToast();
    const manualReview = question.manualReview;
    const latestAiComment = (() => {
        for (const run of strategyRuns) {
            const summary = run.parsedResult?.finalRecommendation?.summary;
            if (summary) return summary;
        }
        return null;
    })();
    const [decision, setDecision] = useState<"PASS" | "REJECT">(
        manualReview?.decision ?? "PASS",
    );
    const [comment, setComment] = useState(manualReview?.comment ?? "");
    const [useReuseAiComment, setUseReuseAiComment] = useState(
        !manualReview && Boolean(latestAiComment),
    );
    const [chatOpen, setChatOpen] = useState(false);
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
    const [isNavigatingList, startNavigatingList] = useTransition();
    const abortControllersRef = useRef<Record<string, AbortController>>({});
    const detailBasePath = listPath.split("?")[0];
    const listQuery = listPath.includes("?")
        ? listPath.slice(listPath.indexOf("?"))
        : "";

    const orderedRawEntries = fieldPreference.detailVisibleFieldKeys.map(
        (key) => [key, question.rawRecord[key]] as const,
    );

    const rawFieldLabelMap: Record<string, string> = {
        ...Object.fromEntries(
            fieldPreference.fieldCatalog.map((field) => [
                field.key,
                field.label,
            ]),
        ),
        [cleanedQuestionIdFieldKey]: "清洗后 question_id",
    };
    const revisionDiffEntries = question.diffFromPrevious.map((entry) => ({
        ...entry,
        resolvedLabel: getRevisionDiffLabel(
            entry.fieldKey,
            entry.label,
            rawFieldLabelMap,
        ),
    }));

    const imageFieldSet = new Set(question.imageFields ?? []);
    const imageMap = question.imageMap ?? {};
    const cleaningStrategies = reviewStrategies.filter(
        (strategy) => strategy.hasCleaningStep,
    );
    const reviewOnlyStrategies = reviewStrategies.filter(
        (strategy) => strategy.hasReviewStep,
    );
    const cleaningRuns = strategyRuns.filter((run) => runHasCleaningStep(run));
    const reviewOnlyRuns = strategyRuns.filter((run) => runHasReviewStep(run));
    const latestCleaningByField = (() => {
        const results = new Map<string, CleaningFieldResultView>();

        for (const fieldResult of buildLocalCleaningFieldResults(
            question.rawRecord,
        )) {
            results.set(fieldResult.fieldKey, fieldResult);
        }

        for (const run of cleaningRuns) {
            for (const step of run.parsedResult?.stepResults ?? []) {
                if (
                    step.stepKind !== "AI_TOOL" ||
                    step.stepType !== "FIELD_CLEANING" ||
                    step.status !== "SUCCESS"
                ) {
                    continue;
                }

                for (const item of step.items) {
                    if (item.status !== "SUCCESS") {
                        continue;
                    }

                    for (const fieldResult of readCleaningFieldResults(
                        item.output,
                    )) {
                        if (!results.has(fieldResult.fieldKey)) {
                            results.set(fieldResult.fieldKey, fieldResult);
                        }
                    }
                }
            }
        }

        return results;
    })();
    const latestCleaningEntries = (() => {
        const visibleFieldKeys = new Set(fieldPreference.detailVisibleFieldKeys);
        const ordered = fieldPreference.detailVisibleFieldKeys
            .map((key) => latestCleaningByField.get(key))
            .filter(
                (item): item is CleaningFieldResultView => Boolean(item),
            );
        const remaining = [...latestCleaningByField.values()].filter(
            (item) => !visibleFieldKeys.has(item.fieldKey),
        );

        return [...ordered, ...remaining];
    })();
    const showChatPanel =
        initialRightTab === "quality" &&
        chatOpen &&
        Boolean(chatConfigs?.length);
    const isCleaningDetail = initialRightTab === "cleaning";

    useEffect(() => {
        const controllers = abortControllersRef.current;

        return () => {
            Object.values(controllers).forEach((controller) => {
                controller.abort();
            });
        };
    }, []);

    useEffect(() => {
        setDecision(manualReview?.decision ?? "PASS");
        setComment(manualReview?.comment ?? "");
        setUseReuseAiComment(!manualReview && Boolean(latestAiComment));
    }, [question.id, manualReview, latestAiComment]);

    function submitReview() {
        const effectiveComment =
            useReuseAiComment && latestAiComment ? latestAiComment : comment;
        const normalizedComment = effectiveComment.trim();

        if (normalizedComment.length < 2) {
            toast.error({
                title: "审核提交失败",
                description: "审核意见至少 2 个字符。",
            });
            return;
        }

        if (normalizedComment.length > REVIEW_COMMENT_MAX_LENGTH) {
            toast.error({
                title: "审核提交失败",
                description: `审核意见不能超过 ${REVIEW_COMMENT_MAX_LENGTH} 个字符。`,
            });
            return;
        }

        startSubmitting(async () => {
            try {
                const result = await submitReviewAction({
                    questionId: question.id,
                    decision,
                    comment: normalizedComment,
                });

                if (result.error) {
                    toast.error({
                        title: "审核提交失败",
                        description: result.error,
                    });
                    return;
                }

                toast.success({
                    title: "审核已提交",
                    description: result.success,
                });
                router.refresh();
            } catch (error) {
                toast.error({
                    title: "审核提交失败",
                    description:
                        error instanceof Error
                            ? error.message
                            : "保存审核意见时发生未知错误。",
                });
            }
        });
    }

    function goToQuestion(questionId: string | null) {
        if (!questionId) {
            return;
        }

        router.push(`${detailBasePath}/${questionId}${listQuery}`);
    }

    function goBackToList() {
        startNavigatingList(() => {
            router.push(listPath);
        });
    }

    async function translateField(fieldKey: string, value: unknown) {
        const rawValue = getTranslatableFieldValue(value);

        if (!rawValue) {
            toast.warning({
                title: "没有可翻译内容",
                description: `字段 ${fieldKey} 当前为空，无法翻译。`,
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

            toast.error({
                title: "翻译失败",
                description:
                    error instanceof Error ? error.message : "未知错误",
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
                            loading={isNavigatingList}
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
                        <Tag color={question.isLatestRevision ? "blue" : "default"}>
                            V{question.revisionNo}
                            {question.isLatestRevision ? " · 最新版" : " · 历史版"}
                        </Tag>
                        {question.businessQuestionKey ? (
                            <Tag>{question.businessQuestionKey}</Tag>
                        ) : null}
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
                    {question.businessQuestionKey ||
                    question.previousRevision ||
                    !question.isLatestRevision ? (
                        <section className="content-surface review-content-surface">
                            <div
                                className="section-head"
                                style={{ marginBottom: 16 }}
                            >
                                <div>
                                    <h3 className="review-section-title">
                                        修订关系
                                    </h3>
                                    <p className="muted review-page-copy">
                                        当前题目已纳入同题版本链，可回看上一版并对比本次修订内容。
                                    </p>
                                </div>
                                <Space size={8} wrap>
                                    {question.previousRevision ? (
                                        <Button
                                            size="middle"
                                            onClick={() =>
                                                goToQuestion(
                                                    question.previousRevision?.id ??
                                                        null,
                                                )
                                            }
                                        >
                                            查看上一版
                                        </Button>
                                    ) : null}
                                    {!question.isLatestRevision &&
                                    question.latestRevision &&
                                    question.latestRevision.id !== question.id ? (
                                        <Button
                                            size="middle"
                                            onClick={() =>
                                                goToQuestion(
                                                    question.latestRevision?.id ??
                                                        null,
                                                )
                                            }
                                        >
                                            查看最新版
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>

                            <div className="revision-panel">
                                <div className="revision-summary-row">
                                    <div className="revision-version-card revision-version-card-current">
                                        <div className="revision-card-head">
                                            <span className="revision-card-kicker">
                                                当前版本
                                            </span>
                                            <Tag color="blue">
                                                V{question.revisionNo}
                                            </Tag>
                                        </div>
                                        <div className="revision-card-title">
                                            {question.title}
                                        </div>
                                        <div className="revision-card-meta">
                                            <Tag
                                                color={
                                                    question.isLatestRevision
                                                        ? "success"
                                                        : "default"
                                                }
                                            >
                                                {question.isLatestRevision
                                                    ? "最新版"
                                                    : "历史版"}
                                            </Tag>
                                            <Tag
                                                color={
                                                    questionStatusMeta[
                                                        question.status
                                                    ].color
                                                }
                                            >
                                                {
                                                    questionStatusMeta[
                                                        question.status
                                                    ].label
                                                }
                                            </Tag>
                                            <span className="muted">
                                                {question.datasource.name}
                                            </span>
                                        </div>
                                    </div>

                                    {question.previousRevision ? (
                                        <div className="revision-version-card">
                                            <div className="revision-card-head">
                                                <span className="revision-card-kicker">
                                                    上一版
                                                </span>
                                                <Tag color="gold">
                                                    V
                                                    {
                                                        question.previousRevision
                                                            .revisionNo
                                                    }
                                                </Tag>
                                            </div>
                                            <div className="revision-card-title">
                                                {question.previousRevision.title}
                                            </div>
                                            <div className="revision-card-meta">
                                                <Tag
                                                    color={
                                                        questionStatusMeta[
                                                            question
                                                                .previousRevision
                                                                .status
                                                        ].color
                                                    }
                                                >
                                                    {
                                                        questionStatusMeta[
                                                            question
                                                                .previousRevision
                                                                .status
                                                        ].label
                                                    }
                                                </Tag>
                                                <Tag
                                                    color={
                                                        reviewStatusMeta[
                                                            question
                                                                .previousRevision
                                                                .manualReview
                                                                ?.decision ??
                                                                "NONE"
                                                        ].color
                                                    }
                                                >
                                                    人工：
                                                    {
                                                        reviewStatusMeta[
                                                            question
                                                                .previousRevision
                                                                .manualReview
                                                                ?.decision ??
                                                                "NONE"
                                                        ].label
                                                    }
                                                </Tag>
                                                <span className="muted">
                                                    {
                                                        question.previousRevision
                                                            .datasource.name
                                                    }
                                                </span>
                                            </div>
                                            {question.previousRevision.manualReview
                                                ?.comment ? (
                                                <div className="revision-card-note">
                                                    {
                                                        question.previousRevision
                                                            .manualReview.comment
                                                    }
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="revision-version-card revision-version-card-empty">
                                            <div className="revision-card-head">
                                                <span className="revision-card-kicker">
                                                    上一版
                                                </span>
                                                <Tag>无</Tag>
                                            </div>
                                            <div className="muted">
                                                当前题目暂无可对比的上一版本。
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="revision-key-row">
                                    {question.businessQuestionKey ? (
                                        <div>
                                            <span className="revision-key-label">
                                                业务题目 ID
                                            </span>
                                            <Tag>{question.businessQuestionKey}</Tag>
                                        </div>
                                    ) : null}
                                    <div>
                                        <span className="revision-key-label">
                                            当前记录
                                        </span>
                                        <Tag>{question.externalRecordId}</Tag>
                                    </div>
                                    {question.previousRevision ? (
                                        <div>
                                            <span className="revision-key-label">
                                                上一版记录
                                            </span>
                                            <Tag>
                                                {
                                                    question.previousRevision
                                                        .externalRecordId
                                                }
                                            </Tag>
                                        </div>
                                    ) : null}
                                </div>

                                {question.previousRevision ? (
                                    <Collapse
                                        className="revision-diff-collapse"
                                        bordered={false}
                                        items={[
                                            {
                                                key: "revision-diff",
                                                label: (
                                                    <Space size={8} wrap>
                                                        <span>
                                                            与上一版差异
                                                        </span>
                                                        <Tag
                                                            color={
                                                                revisionDiffEntries.length
                                                                    ? "processing"
                                                                    : "default"
                                                            }
                                                        >
                                                            {
                                                                revisionDiffEntries.length
                                                            }{" "}
                                                            处
                                                        </Tag>
                                                    </Space>
                                                ),
                                                children:
                                                    revisionDiffEntries.length ? (
                                                        <div className="detail-card-grid">
                                                            {revisionDiffEntries.map(
                                                                (entry) => (
                                                                    <div
                                                                        key={
                                                                            entry.fieldKey
                                                                        }
                                                                        className="detail-field-card revision-diff-card"
                                                                    >
                                                                        <div
                                                                            className="detail-field-head"
                                                                            style={{
                                                                                marginBottom: 12,
                                                                            }}
                                                                        >
                                                                            <div className="detail-field-label">
                                                                                {
                                                                                    entry.resolvedLabel
                                                                                }
                                                                                {entry.kind ===
                                                                                "raw" ? (
                                                                                    <span className="revision-raw-key">
                                                                                        {entry.fieldKey.slice(
                                                                                            4,
                                                                                        )}
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                        <div className="revision-diff-values">
                                                                            <div>
                                                                                <div className="revision-diff-label">
                                                                                    上一版
                                                                                </div>
                                                                                <div className="detail-field-value">
                                                                                    {renderRawFieldValue(
                                                                                        entry.previousValue,
                                                                                        entry.kind ===
                                                                                            "raw"
                                                                                            ? entry.fieldKey.slice(
                                                                                                  4,
                                                                                              )
                                                                                            : undefined,
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="revision-diff-label">
                                                                                    当前版本
                                                                                </div>
                                                                                <div className="detail-field-value">
                                                                                    {renderRawFieldValue(
                                                                                        entry.currentValue,
                                                                                        entry.kind ===
                                                                                            "raw"
                                                                                            ? entry.fieldKey.slice(
                                                                                                  4,
                                                                                              )
                                                                                            : undefined,
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="revision-empty-state">
                                                            已关联上一版，但当前未识别出审核字段变化。
                                                        </div>
                                                    ),
                                            },
                                        ]}
                                    />
                                ) : null}
                            </div>
                        </section>
                    ) : null}

                    {question.reviewResponses.length ? (
                        <section className="content-surface review-content-surface">
                            <div
                                className="section-head"
                                style={{ marginBottom: 16 }}
                            >
                                <div>
                                    <h3 className="review-section-title">
                                        修订回复
                                    </h3>
                                    <p className="muted review-page-copy">
                                        展示导入数据中的 review_responses，便于核对题目修订反馈和处理说明。
                                    </p>
                                </div>
                                <Tag color="processing">
                                    {question.reviewResponses.length} 条
                                </Tag>
                            </div>

                            <div className="detail-card-grid">
                                {question.reviewResponses.map(
                                    (response, index) => (
                                        <div
                                            key={`${response.source}-${response.reviewDate}-${index}`}
                                            className="detail-field-card review-response-card"
                                        >
                                            <div className="review-response-head">
                                                <div className="detail-field-label">
                                                    回复 {index + 1}
                                                </div>
                                                <Space size={6} wrap>
                                                    {response.agreementWithRejection ? (
                                                        <Tag
                                                            color={
                                                                response.agreementWithRejection.toLowerCase() ===
                                                                "agree"
                                                                    ? "success"
                                                                    : "gold"
                                                            }
                                                        >
                                                            {
                                                                response.agreementWithRejection
                                                            }
                                                        </Tag>
                                                    ) : null}
                                                    {response.reviewDate ? (
                                                        <Tag>
                                                            {formatReviewResponseDate(
                                                                response.reviewDate,
                                                            )}
                                                        </Tag>
                                                    ) : null}
                                                </Space>
                                            </div>

                                            {response.source ? (
                                                <div className="review-response-source">
                                                    {response.source}
                                                </div>
                                            ) : null}

                                            <div className="review-response-grid">
                                                {response.teamLeadComment ? (
                                                    <div>
                                                        <div className="review-response-label">
                                                            Team Lead Comment
                                                        </div>
                                                        <div className="detail-field-content">
                                                            {
                                                                response.teamLeadComment
                                                            }
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {response.otherNotesChangesMade ? (
                                                    <div>
                                                        <div className="review-response-label">
                                                            Other Notes /
                                                            Changes Made
                                                        </div>
                                                        <div className="detail-field-content">
                                                            {
                                                                response.otherNotesChangesMade
                                                            }
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </section>
                    ) : null}

                    <section className="content-surface review-content-surface">
                        <div
                            className="section-head"
                            style={{ marginBottom: 16 }}
                        >
                            <div>
                                <h3 className="review-section-title">
                                    {isCleaningDetail
                                        ? "清洗字段对比"
                                        : "原始字段"}
                                </h3>
                                <p className="muted review-page-copy">
                                    {isCleaningDetail
                                        ? "按字段展示清洗前与清洗后的内容，便于直接核对变化。"
                                        : "按字段设置中的顺序竖向展示，便于和原始 JSON / Excel 对照。"}
                                </p>
                            </div>
                        </div>

                        {isCleaningDetail ? (
                            latestCleaningEntries.length ? (
                                <div className="detail-card-grid">
                                    {latestCleaningEntries.map((entry) => (
                                        <div
                                            key={entry.fieldKey}
                                            className="detail-field-card"
                                        >
                                            <div className="detail-field-head">
                                                <div className="detail-field-label">
                                                    {rawFieldLabelMap[
                                                        entry.fieldKey
                                                    ] ?? entry.fieldKey}
                                                    {rawFieldLabelMap[
                                                        entry.fieldKey
                                                    ] &&
                                                    rawFieldLabelMap[
                                                        entry.fieldKey
                                                    ] !== entry.fieldKey ? (
                                                        <span
                                                            className="muted"
                                                            style={{
                                                                fontWeight: 400,
                                                                fontSize: 11,
                                                                marginLeft: 6,
                                                            }}
                                                        >
                                                            {entry.fieldKey}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <Tag
                                                    color={
                                                        entry.changed
                                                            ? "gold"
                                                            : "success"
                                                    }
                                                >
                                                    {entry.changed
                                                        ? "已修改"
                                                        : "未修改"}
                                                </Tag>
                                            </div>

                                            <div
                                                className="revision-diff-values"
                                                style={{ marginTop: 12 }}
                                            >
                                                <div>
                                                    <div className="revision-diff-label detail-field-label">
                                                        清洗前
                                                    </div>
                                                    <div className="detail-field-content">
                                                        {renderRawFieldValue(
                                                            entry.originalValue,
                                                            entry.fieldKey,
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="revision-diff-label detail-field-label">
                                                        清洗后
                                                    </div>
                                                    <div className="detail-field-content">
                                                        {renderRawFieldValue(
                                                            entry.cleanedValue,
                                                            entry.fieldKey,
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {entry.reason ||
                                            typeof entry.confidence ===
                                                "number" ? (
                                                <div
                                                    className="muted"
                                                    style={{
                                                        marginTop: 10,
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    {entry.reason}
                                                    {typeof entry.confidence ===
                                                    "number"
                                                        ? `${entry.reason ? " · " : ""}置信度 ${(
                                                              entry.confidence *
                                                              100
                                                          ).toFixed(0)}%`
                                                        : ""}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="muted">
                                    当前题目还没有清洗字段结果。运行数据清洗策略后，这里会展示清洗前和清洗后的字段对比。
                                </div>
                            )
                        ) : orderedRawEntries.length ? (
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
                                                          key,
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
                    className={`review-detail-right${showChatPanel ? " review-detail-right-with-chat" : ""}`}
                >
                    <div className="review-detail-right-main">
                        {canReview ? (
                            initialRightTab === "quality" ? (
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 16,
                                    }}
                                >
                                    {chatConfigs?.length ? (
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "flex-end",
                                            }}
                                        >
                                            <Button
                                                type={
                                                    chatOpen
                                                        ? "primary"
                                                        : "default"
                                                }
                                                icon={<MessageSquare size={16} />}
                                                onClick={() =>
                                                    setChatOpen(!chatOpen)
                                                }
                                            >
                                                AI 对话
                                            </Button>
                                        </div>
                                    ) : null}

                                    {reviewOnlyStrategies.length ||
                                    reviewOnlyRuns.length ? (
                                        <AiReviewStrategyRunner
                                            questionId={question.id}
                                            strategies={reviewOnlyStrategies}
                                            runs={reviewOnlyRuns}
                                            retryStates={retryStates}
                                            hideHeader
                                        />
                                    ) : null}

                                    <section className="content-surface review-content-surface">
                                        <div
                                            className="section-head"
                                            style={{
                                                marginBottom: 16,
                                            }}
                                        >
                                            <div>
                                                <h3 className="review-section-title">
                                                    提交审核
                                                </h3>
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gap: 16,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "grid",
                                                    gap: 8,
                                                    padding:
                                                        "12px 14px",
                                                    border: "1px solid var(--color-border)",
                                                    borderRadius: 8,
                                                    background:
                                                        "var(--color-surface-2, #f8fafc)",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display:
                                                            "flex",
                                                        alignItems:
                                                            "center",
                                                        gap: 8,
                                                        flexWrap:
                                                            "wrap",
                                                    }}
                                                >
                                                    <span className="field-label">
                                                        当前人工审核
                                                    </span>
                                                    <Tag
                                                        color={
                                                            reviewStatusMeta[
                                                                question
                                                                    .manualReview
                                                                    ?.decision ??
                                                                    "NONE"
                                                            ].color
                                                        }
                                                    >
                                                        {
                                                            reviewStatusMeta[
                                                                question
                                                                    .manualReview
                                                                    ?.decision ??
                                                                    "NONE"
                                                            ].label
                                                        }
                                                    </Tag>
                                                </div>
                                                {question.manualReview ? (
                                                    <div className="muted">
                                                        {question
                                                            .manualReview
                                                            .reviewerName
                                                            ? `${question.manualReview.reviewerName} · `
                                                            : ""}
                                                        {new Date(
                                                            question.manualReview.updatedAt,
                                                        ).toLocaleString(
                                                            "zh-CN",
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="muted">
                                                        当前暂无人工审核结果。
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems:
                                                        "center",
                                                    gap: 8,
                                                }}
                                            >
                                                <label
                                                    className="field-label"
                                                    htmlFor="review-decision"
                                                    style={{
                                                        marginBottom: 0,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    审核结论
                                                </label>
                                                <Select
                                                    id="review-decision"
                                                    value={decision}
                                                    onChange={(
                                                        value,
                                                    ) =>
                                                        setDecision(
                                                            value,
                                                        )
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
                                                        display:
                                                            "flex",
                                                        alignItems:
                                                            "center",
                                                        gap: 8,
                                                        marginBottom: 6,
                                                    }}
                                                >
                                                    <label
                                                        className="field-label"
                                                        htmlFor="review-comment"
                                                        style={{
                                                            marginBottom: 0,
                                                        }}
                                                    >
                                                        审核意见
                                                    </label>
                                                    {latestAiComment ? (
                                                        <Checkbox
                                                            checked={
                                                                useReuseAiComment
                                                            }
                                                            onChange={(
                                                                e,
                                                            ) =>
                                                                setUseReuseAiComment(
                                                                    e
                                                                        .target
                                                                        .checked,
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
                                                        useReuseAiComment &&
                                                        latestAiComment
                                                            ? latestAiComment
                                                            : comment
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        setComment(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                    }
                                                    disabled={
                                                        useReuseAiComment &&
                                                        !!latestAiComment
                                                    }
                                                    rows={6}
                                                    maxLength={
                                                        REVIEW_COMMENT_MAX_LENGTH
                                                    }
                                                    showCount
                                                    placeholder="请输入审核意见、修改建议或驳回原因"
                                                    size="middle"
                                                />
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "flex-end",
                                                }}
                                            >
                                                <Button
                                                    type="primary"
                                                    size="middle"
                                                    onClick={
                                                        submitReview
                                                    }
                                                    loading={
                                                        isSubmitting
                                                    }
                                                >
                                                    提交审核
                                                </Button>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        display: "grid",
                                        gap: 16,
                                    }}
                                >
                                    {cleaningStrategies.length ||
                                    cleaningRuns.length ? (
                                        <AiReviewStrategyRunner
                                            questionId={question.id}
                                            strategies={
                                                cleaningStrategies
                                            }
                                            runs={cleaningRuns}
                                            retryStates={
                                                retryStates
                                            }
                                            mode="cleaning"
                                            hideHeader
                                        />
                                    ) : null}
                                </div>
                            )
                        ) : null}
                    </div>

                    {showChatPanel ? (
                        <div className="review-detail-chat-panel">
                            <AiChatSidebar
                                chatConfigs={chatConfigs ?? []}
                                rawRecord={question.rawRecord}
                                questionMeta={{
                                    title: question.title,
                                    content: question.content,
                                    answer: question.answer,
                                    analysis: question.analysis,
                                    questionType: question.questionType,
                                    difficulty: question.difficulty,
                                }}
                                reviewContext={{
                                    manualReviewComment:
                                        question.manualReview?.comment ?? null,
                                    aiReviewComment:
                                        question.aiReview?.comment ?? null,
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
