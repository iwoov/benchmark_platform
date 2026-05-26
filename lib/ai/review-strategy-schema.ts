import { z } from "zod";

export const aiReviewAiToolTypes = [
    "FIELD_CLEANING",
    "COMPREHENSIVE_CHECK",
    "QUESTION_COMPLETENESS_CHECK",
    "TEXT_QUALITY_CHECK",
    "TRANSLATE_TO_CHINESE",
    "AI_SOLVE_QUESTION",
    "ANSWER_MATCH_CHECK",
    "REASONING_COMPARE",
    "DIFFICULTY_EVALUATION",
    "REVIEW_SUMMARY",
] as const;

export const aiReviewRuleTypes = [
    "COUNT_THRESHOLD",
    "RATIO_THRESHOLD",
    "MAJORITY_VOTE",
] as const;

export const aiReviewRuleAggregates = [
    "COUNT_TRUE",
    "COUNT_FALSE",
    "TRUE_RATIO",
    "FALSE_RATIO",
] as const;

export const aiReviewComparisonOperators = [">", ">=", "<", "<=", "="] as const;

export const aiReviewOutcomeLabels = ["PASS", "REJECT", "FLAG"] as const;

export const aiReviewSeverityLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const aiReviewMatchLevels = [
    "EXACT",
    "SEMANTIC_MATCH",
    "PARTIAL_MATCH",
    "MISMATCH",
    "UNKNOWN",
] as const;
export const aiReviewRiskLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const aiReviewDifficultyLevels = ["EASY", "MEDIUM", "HARD"] as const;
export const aiReviewFieldCleaningChangeTypes = [
    "UNCHANGED",
    "TRIM",
    "FORMAT",
    "TYPO",
    "NORMALIZATION",
    "TRANSLATION",
    "OTHER",
] as const;

export const aiReviewToolLabels: Record<AiReviewAiToolType, string> = {
    FIELD_CLEANING: "字段数据清洗",
    COMPREHENSIVE_CHECK: "全面检查",
    QUESTION_COMPLETENESS_CHECK: "题目完整性检查",
    TEXT_QUALITY_CHECK: "文本质量检查",
    TRANSLATE_TO_CHINESE: "翻译为中文",
    AI_SOLVE_QUESTION: "模型作答",
    ANSWER_MATCH_CHECK: "答案正确性判断",
    REASONING_COMPARE: "解题过程比对",
    DIFFICULTY_EVALUATION: "难度评估",
    REVIEW_SUMMARY: "审核总结建议",
};

export const aiReviewRuleLabels: Record<AiReviewRuleType, string> = {
    COUNT_THRESHOLD: "次数阈值规则",
    RATIO_THRESHOLD: "比例阈值规则",
    MAJORITY_VOTE: "多数投票规则",
};

export const aiReviewAggregateLabels: Record<AiReviewRuleAggregate, string> = {
    COUNT_TRUE: "统计 true 次数",
    COUNT_FALSE: "统计 false 次数",
    TRUE_RATIO: "统计 true 比例",
    FALSE_RATIO: "统计 false 比例",
};

export const aiReviewOutcomeLabelMap: Record<AiReviewOutcomeLabel, string> = {
    PASS: "通过",
    REJECT: "驳回",
    FLAG: "命中规则",
};

export const aiReviewDefaultPrompts: Record<AiReviewAiToolType, string> = {
    FIELD_CLEANING:
        "你现在是题目数据清洗助手。请逐字段清洗 selectedFields 中的每一个字段，目标是提升格式一致性、可读性和入库质量。允许修正：前后空白、多余换行、明显乱码、HTML/Markdown 噪音、全角半角不一致、标点空格、明显错别字、列表/选项编号格式。字段规则：如果字段名为 secondary，表示二级学科；若原值是中文，请翻译为对应的英文二级学科名称；若原值已是英文或无法可靠判断对应英文二级学科，请保持原值不变；该字段发生中英翻译时 changeType 使用 TRANSLATION。禁止改动：题意、答案事实、数值、公式含义、选项语义、解析推理结论；无法确定时保持原值不变。必须为每个输入字段返回一条 fieldResults 记录。输出要求：必须只返回一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。所有 cleanedValue 使用纯文本；如果字段原本是 JSON/数组/对象，请返回清洗后的 JSON 字符串。",
    COMPREHENSIVE_CHECK:
        "你现在是题目内容审校助手。你的任务不是独立解答题目，也不是根据你自己的解题结果判断题目对错，而是从审核视角检查题干、标准答案、解析文本本身是否存在质量问题。检查范围：1. 题干是否完整、清晰、无歧义；2. 是否存在漏条件、条件冲突、信息缺失、无法正常理解作答的问题；3. 标准答案是否明确，是否与题干或解析文本存在明显冲突；4. 解析是否完整，是否存在明显事实错误、逻辑跳步、推理断裂、公式误用、概念错误或结论前后不一致；5. 是否存在明显学科事实错误、常识性错误、错别字、病句、格式问题。边界规则：不要独立解题；不要因为 AI 可能答错就判题目有问题；只有题干/答案/解析文本本身出现明确矛盾或错误时才判定问题；若必须完整重做题才能判断，请在 summary 明确“无法在本步骤中确定”；多解或无法作答风险仅在题干文本已明显体现时指出；不要因 options 为空就判缺陷。输出要求：必须只返回一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。所有字符串字段必须是纯文本，禁止 LaTeX 与反斜杠数学命令（如 \\frac、\\sqrt、\\chi、\\sinh）；若需表达公式请用 ASCII 文本（如 sqrt(x), sinh(1), a/b）。",
    QUESTION_COMPLETENESS_CHECK:
        "请重点检查题干、答案、解析之间是否存在缺失、断裂或明显不完整的信息。",
    TEXT_QUALITY_CHECK:
        "请检查字段中的错别字、病句、歧义表达和格式问题，并给出简明修改建议。",
    TRANSLATE_TO_CHINESE:
        "请将输入内容忠实翻译为简体中文。如果输入包含 JSON、字段列表或其他半结构化内容，请保持原有结构、键名、编号和格式，只翻译自然语言内容。如果原文已经是中文，可直接返回原文。",
    AI_SOLVE_QUESTION:
        "请像正式答题一样独立完成作答。只基于 selectedFields 中给出的题目字段作答，不要读取标准答案字段；如果 selectedFields 中意外包含 answer 或 analysis，也不要把它们当成依据。必须只返回一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。answer、normalizedAnswer、reasoning 必须是纯文本，禁止 LaTeX 与任何反斜杠数学命令（如 \\frac、\\sqrt、\\int、\\chi）；如需表达公式请使用 ASCII 文本（例如 sqrt(a/b), integral_0^1 f(t) dt）。confidence 必须是 0 到 1 的数字，不要用字符串。",
    ANSWER_MATCH_CHECK:
        "请判断上游模型作答是否正确。请以 selectedFields 中的标准答案、解析和题干为依据，并结合 upstreamResult 中的模型答案与推理过程判断。必须只返回一个合法 JSON 对象，不要输出 Markdown、代码块或额外解释。isCorrect 表示模型答案是否可判定为正确；matchLevel 表示模型答案与标准答案的匹配程度；difference 只在存在差异或无法确认时填写。",
    REASONING_COMPARE:
        "请比较标准解析与模型推理过程是否一致，指出标准解析缺失或不充分的地方。",
    DIFFICULTY_EVALUATION:
        "请结合题目、答案和推理过程评估难度等级，并说明依据。",
    REVIEW_SUMMARY: `你现在是题目审核总结助手。请根据前面所有步骤的结构化结果，给出最终审核建议。

请重点综合以下信息：
1. 全面检查是否发现严重问题
2. AI 独立解题的结果是否稳定正确
3. 是否存在题干歧义、答案冲突、解析不足、知识性错误、多解风险等问题

判定原则：
1. 如果全面检查发现高严重度问题，优先判定为 REJECT
2. 如果题目存在知识性错误、逻辑性错误、答案明显冲突，可判定为 REJECT
3. 如果题目主体可用，但存在表达、解析、格式、完整性问题，判定为 REJECT
4. 如果全面检查无明显问题，且 AI 解题结果满足规则要求，可判定为 PASS
5. 不要替人工做过度推断，但要给出明确建议

要求：
- 必须只返回一个 JSON 对象
- 不要输出 Markdown
- 不要输出额外解释

返回格式：
{
  "recommendedDecision": "PASS|REJECT",
  "riskLevel": "LOW|MEDIUM|HIGH",
  "summary": "一句话总结最终建议",
  "keyIssues": [
    "关键问题1",
    "关键问题2"
  ]
}`,
};

export const aiReviewMetricOptionsByToolType: Record<
    AiReviewAiToolType,
    Array<{ value: string; label: string }>
> = {
    FIELD_CLEANING: [
        { value: "changedFieldCount", label: "修改字段数" },
        { value: "cleanedFieldCount", label: "清洗字段数" },
    ],
    COMPREHENSIVE_CHECK: [
        { value: "passed", label: "是否通过" },
        { value: "issueCount", label: "问题数" },
    ],
    QUESTION_COMPLETENESS_CHECK: [{ value: "passed", label: "是否通过" }],
    TEXT_QUALITY_CHECK: [{ value: "passed", label: "是否通过" }],
    TRANSLATE_TO_CHINESE: [],
    AI_SOLVE_QUESTION: [
        { value: "normalizedAnswer", label: "标准化答案" },
        { value: "confidence", label: "置信度" },
        { value: "isCorrect", label: "是否答对" },
    ],
    ANSWER_MATCH_CHECK: [
        { value: "isCorrect", label: "是否正确" },
        { value: "isConsistent", label: "是否一致" },
        { value: "matchLevel", label: "匹配等级" },
    ],
    REASONING_COMPARE: [
        { value: "isConsistent", label: "推理是否一致" },
        { value: "riskLevel", label: "风险等级" },
    ],
    DIFFICULTY_EVALUATION: [
        { value: "difficultyLevel", label: "难度等级" },
        { value: "score", label: "难度分值" },
    ],
    REVIEW_SUMMARY: [
        { value: "recommendedDecision", label: "建议结论" },
        { value: "riskLevel", label: "风险等级" },
    ],
};

const strategyStepBaseSchema = z.object({
    id: z
        .string()
        .trim()
        .min(1, "步骤 ID 不能为空")
        .max(64, "步骤 ID 不能超过 64 个字符"),
    name: z
        .string()
        .trim()
        .min(2, "步骤名称至少 2 个字符")
        .max(80, "步骤名称不能超过 80 个字符"),
    enabled: z.boolean(),
});

const optionalSourceStepSchema = z
    .string()
    .trim()
    .max(64, "依赖步骤 ID 不能超过 64 个字符")
    .optional()
    .transform((value) => value || undefined);

export const aiToolStepSchema = strategyStepBaseSchema.extend({
    kind: z.literal("AI_TOOL"),
    toolType: z.enum(aiReviewAiToolTypes),
    modelCode: z.string().trim().max(100, "模型编码不能超过 100 个字符").default(""),
    modelCodes: z
        .array(
            z
                .string()
                .trim()
                .min(1, "模型编码不能为空")
                .max(100, "模型编码不能超过 100 个字符"),
        )
        .default([]),
    fieldKeys: z
        .array(
            z
                .string()
                .trim()
                .min(1, "字段名不能为空")
                .max(100, "字段名不能超过 100 个字符"),
        )
        .default([]),
    promptTemplate: z
        .string()
        .trim()
        .min(2, "提示词至少 2 个字符")
        .max(12000, "提示词不能超过 12000 个字符"),
    runCount: z
        .number()
        .int("执行次数必须是整数")
        .min(1, "执行次数至少 1")
        .max(10, "执行次数不能超过 10"),
    sourceStepId: optionalSourceStepSchema,
});

const ruleStepBaseSchema = strategyStepBaseSchema.extend({
    kind: z.literal("RULE"),
    sourceStepId: z.string().trim().min(1, "请选择来源步骤"),
    metric: z
        .string()
        .trim()
        .min(1, "请选择统计指标")
        .max(64, "统计指标不能超过 64 个字符"),
    operator: z.enum(aiReviewComparisonOperators),
    threshold: z
        .number()
        .min(0, "阈值不能小于 0")
        .max(1000, "阈值不能超过 1000"),
    outcomeLabel: z.enum(aiReviewOutcomeLabels),
    summaryTemplate: z
        .string()
        .trim()
        .max(300, "摘要模板不能超过 300 个字符")
        .optional()
        .transform((value) => value || undefined),
});

export const countThresholdRuleStepSchema = ruleStepBaseSchema.extend({
    ruleType: z.literal("COUNT_THRESHOLD"),
    aggregate: z.enum(["COUNT_TRUE", "COUNT_FALSE"]),
});

export const ratioThresholdRuleStepSchema = ruleStepBaseSchema.extend({
    ruleType: z.literal("RATIO_THRESHOLD"),
    aggregate: z.enum(["TRUE_RATIO", "FALSE_RATIO"]),
});

export const majorityVoteRuleStepSchema = strategyStepBaseSchema.extend({
    kind: z.literal("RULE"),
    ruleType: z.literal("MAJORITY_VOTE"),
    sourceStepId: z.string().trim().min(1, "请选择来源步骤"),
    metric: z
        .string()
        .trim()
        .min(1, "请选择投票指标")
        .max(64, "投票指标不能超过 64 个字符"),
    minimumVotes: z
        .number()
        .int("最少票数必须是整数")
        .min(1, "最少票数至少 1")
        .max(20, "最少票数不能超过 20"),
    outcomeLabel: z.enum(aiReviewOutcomeLabels),
    summaryTemplate: z
        .string()
        .trim()
        .max(300, "摘要模板不能超过 300 个字符")
        .optional()
        .transform((value) => value || undefined),
});

export const aiReviewStrategyStepSchema = z.union([
    aiToolStepSchema,
    countThresholdRuleStepSchema,
    ratioThresholdRuleStepSchema,
    majorityVoteRuleStepSchema,
]);

export const aiReviewStrategyDefinitionSchema = z.object({
    version: z.literal(1),
    steps: z
        .array(aiReviewStrategyStepSchema)
        .min(1, "请至少配置一个步骤")
        .superRefine((steps, context) => {
            const ids = new Set<string>();

            for (const step of steps) {
                if (ids.has(step.id)) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `步骤 ID 重复：${step.id}`,
                    });
                    continue;
                }

                ids.add(step.id);
            }

            for (const step of steps) {
                if ("sourceStepId" in step && step.sourceStepId) {
                    if (!ids.has(step.sourceStepId)) {
                        context.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `步骤 ${step.name} 引用了不存在的来源步骤`,
                        });
                    }
                }

                if (
                    step.kind === "AI_TOOL" &&
                    !step.modelCode &&
                    !step.modelCodes.length
                ) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `步骤 ${step.name} 请选择模型`,
                    });
                }

                if (
                    step.kind === "AI_TOOL" &&
                    step.toolType !== "REVIEW_SUMMARY" &&
                    !step.fieldKeys.length
                ) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `步骤 ${step.name} 请至少选择一个字段`,
                    });
                }
            }
        }),
});

export const aiReviewStrategyPersistedSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "策略名称至少 2 个字符")
        .max(80, "策略名称不能超过 80 个字符"),
    code: z
        .string()
        .trim()
        .min(2, "策略编码至少 2 个字符")
        .max(80, "策略编码不能超过 80 个字符")
        .regex(/^[a-zA-Z0-9_-]+$/, "策略编码仅支持字母、数字、下划线和短横线"),
    description: z
        .string()
        .trim()
        .max(300, "策略描述不能超过 300 个字符")
        .optional()
        .transform((value) => value || undefined),
    enabled: z.boolean(),
    projectIds: z.array(z.string().trim().min(1)).default([]),
    datasourceIds: z.array(z.string().trim().min(1)).default([]),
    definition: aiReviewStrategyDefinitionSchema,
});

export const completenessOutputSchema = z.object({
    passed: z.boolean(),
    summary: z.string().min(1),
    missingFields: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
});

export const comprehensiveCheckOutputSchema = z.object({
    passed: z.boolean(),
    summary: z.string().min(1),
    issues: z
        .array(
            z.object({
                category: z.string().min(1),
                severity: z.enum(aiReviewSeverityLevels),
                field: z.string().min(1),
                title: z.string().min(1),
                detail: z.string().min(1),
            }),
        )
        .default([]),
    warnings: z.array(z.string()).default([]),
    suggestions: z.array(z.string()).default([]),
});

export const textQualityOutputSchema = z.object({
    passed: z.boolean(),
    severity: z.enum(aiReviewSeverityLevels),
    summary: z.string().min(1),
    issues: z
        .array(
            z.object({
                field: z.string().min(1),
                type: z.string().min(1),
                content: z.string().min(1),
            }),
        )
        .default([]),
    suggestions: z.array(z.string()).default([]),
});

export const translateToChineseOutputSchema = z.object({
    translatedText: z.string().min(1),
    summary: z.string().min(1),
    sourceLanguage: z.string().nullable().default(null),
});

export const aiSolveOutputSchema = z.object({
    answer: z.string().min(1),
    normalizedAnswer: z.string().min(1),
    reasoning: z.string().min(1),
    confidence: z.number().min(0).max(1),
});

export const answerMatchOutputSchema = z.object({
    matchLevel: z.enum(aiReviewMatchLevels),
    isCorrect: z.boolean(),
    isConsistent: z.boolean().optional(),
    summary: z.string().min(1),
    difference: z.string().nullable(),
});

export const reasoningCompareOutputSchema = z.object({
    isConsistent: z.boolean(),
    summary: z.string().min(1),
    missingPoints: z.array(z.string()).default([]),
    riskLevel: z.enum(aiReviewRiskLevels),
});

export const difficultyEvaluationOutputSchema = z.object({
    difficultyLevel: z.enum(aiReviewDifficultyLevels),
    score: z.number().min(1).max(5),
    summary: z.string().min(1),
    evidence: z.array(z.string()).default([]),
});

export const reviewSummaryOutputSchema = z.object({
    recommendedDecision: z.enum(["PASS", "REJECT"]),
    riskLevel: z.enum(aiReviewRiskLevels),
    summary: z.string().min(1),
    keyIssues: z.array(z.string()).default([]),
});

export const fieldCleaningOutputSchema = z.object({
    summary: z.string().min(1),
    fieldResults: z
        .array(
            z.object({
                fieldKey: z.string().min(1),
                originalValue: z.string().nullable(),
                cleanedValue: z.string().nullable(),
                changed: z.boolean(),
                changeType: z.enum(aiReviewFieldCleaningChangeTypes),
                reason: z.string().min(1),
                confidence: z.number().min(0).max(1).optional(),
                issues: z.array(z.string()).default([]),
            }),
        )
        .default([]),
    warnings: z.array(z.string()).default([]),
});

export const aiReviewOutputSchemas = {
    FIELD_CLEANING: fieldCleaningOutputSchema,
    COMPREHENSIVE_CHECK: comprehensiveCheckOutputSchema,
    QUESTION_COMPLETENESS_CHECK: completenessOutputSchema,
    TEXT_QUALITY_CHECK: textQualityOutputSchema,
    TRANSLATE_TO_CHINESE: translateToChineseOutputSchema,
    AI_SOLVE_QUESTION: aiSolveOutputSchema,
    ANSWER_MATCH_CHECK: answerMatchOutputSchema,
    REASONING_COMPARE: reasoningCompareOutputSchema,
    DIFFICULTY_EVALUATION: difficultyEvaluationOutputSchema,
    REVIEW_SUMMARY: reviewSummaryOutputSchema,
} satisfies Record<AiReviewAiToolType, z.ZodType>;

export type AiReviewAiToolType = (typeof aiReviewAiToolTypes)[number];
export type AiReviewRuleType = (typeof aiReviewRuleTypes)[number];
export type AiReviewRuleAggregate = (typeof aiReviewRuleAggregates)[number];
export type AiReviewComparisonOperator =
    (typeof aiReviewComparisonOperators)[number];
export type AiReviewOutcomeLabel = (typeof aiReviewOutcomeLabels)[number];
export type AiReviewFieldCleaningChangeType =
    (typeof aiReviewFieldCleaningChangeTypes)[number];
export type AiReviewStrategyDefinition = z.infer<
    typeof aiReviewStrategyDefinitionSchema
>;
export type AiReviewStrategyStep = z.infer<typeof aiReviewStrategyStepSchema>;
export type AiReviewAiToolStep = z.infer<typeof aiToolStepSchema>;
export type AiReviewRuleStep =
    | z.infer<typeof countThresholdRuleStepSchema>
    | z.infer<typeof ratioThresholdRuleStepSchema>
    | z.infer<typeof majorityVoteRuleStepSchema>;
export type AiReviewStrategyPersistedInput = z.infer<
    typeof aiReviewStrategyPersistedSchema
>;

export type AiReviewToolOutputMap = {
    FIELD_CLEANING: z.infer<typeof fieldCleaningOutputSchema>;
    COMPREHENSIVE_CHECK: z.infer<typeof comprehensiveCheckOutputSchema>;
    QUESTION_COMPLETENESS_CHECK: z.infer<typeof completenessOutputSchema>;
    TEXT_QUALITY_CHECK: z.infer<typeof textQualityOutputSchema>;
    TRANSLATE_TO_CHINESE: z.infer<typeof translateToChineseOutputSchema>;
    AI_SOLVE_QUESTION: z.infer<typeof aiSolveOutputSchema>;
    ANSWER_MATCH_CHECK: z.infer<typeof answerMatchOutputSchema>;
    REASONING_COMPARE: z.infer<typeof reasoningCompareOutputSchema>;
    DIFFICULTY_EVALUATION: z.infer<typeof difficultyEvaluationOutputSchema>;
    REVIEW_SUMMARY: z.infer<typeof reviewSummaryOutputSchema>;
};

export function getAiToolStepModelCodes(
    step: Pick<AiReviewAiToolStep, "modelCode" | "modelCodes">,
) {
    const codes = step.modelCodes.length ? step.modelCodes : [step.modelCode];

    return [...new Set(codes.filter(Boolean))];
}

export function createDefaultAiToolStep(
    type: AiReviewAiToolType = "TEXT_QUALITY_CHECK",
): AiReviewAiToolStep {
    const defaultFieldKeys =
        type === "FIELD_CLEANING"
            ? ["secondary"]
            : type === "AI_SOLVE_QUESTION"
              ? ["title", "content", "questionType"]
              : type === "ANSWER_MATCH_CHECK"
                ? ["title", "content", "answer", "analysis"]
                : [];

    return {
        id: `step_${Math.random().toString(36).slice(2, 8)}`,
        name: aiReviewToolLabels[type],
        enabled: true,
        kind: "AI_TOOL",
        toolType: type,
        modelCode: "",
        modelCodes: [],
        fieldKeys: defaultFieldKeys,
        promptTemplate: aiReviewDefaultPrompts[type],
        runCount: 1,
        sourceStepId: undefined,
    };
}

export function createDefaultRuleStep(
    type: AiReviewRuleType = "COUNT_THRESHOLD",
): AiReviewRuleStep {
    if (type === "RATIO_THRESHOLD") {
        return {
            id: `step_${Math.random().toString(36).slice(2, 8)}`,
            name: aiReviewRuleLabels[type],
            enabled: true,
            kind: "RULE",
            ruleType: type,
            sourceStepId: "",
            metric: "isCorrect",
            aggregate: "FALSE_RATIO",
            operator: ">=",
            threshold: 0.6,
            outcomeLabel: "FLAG",
            summaryTemplate: "命中比例阈值规则",
        };
    }

    if (type === "MAJORITY_VOTE") {
        return {
            id: `step_${Math.random().toString(36).slice(2, 8)}`,
            name: aiReviewRuleLabels[type],
            enabled: true,
            kind: "RULE",
            ruleType: type,
            sourceStepId: "",
            metric: "normalizedAnswer",
            minimumVotes: 2,
            outcomeLabel: "FLAG",
            summaryTemplate: "多数投票完成",
        };
    }

    return {
        id: `step_${Math.random().toString(36).slice(2, 8)}`,
        name: aiReviewRuleLabels[type],
        enabled: true,
        kind: "RULE",
        ruleType: type,
        sourceStepId: "",
        metric: "isCorrect",
        aggregate: "COUNT_FALSE",
        operator: ">=",
        threshold: 3,
        outcomeLabel: "FLAG",
        summaryTemplate: "命中次数阈值规则",
    };
}

export function getMetricOptionsForStepType(
    toolType?: AiReviewAiToolType | null,
) {
    if (!toolType) {
        return [];
    }

    return aiReviewMetricOptionsByToolType[toolType] ?? [];
}
