import { z } from "zod";
import { auth } from "@/auth";
import { canUserReviewProject } from "@/lib/reviews/permissions";
import {
    createDataEvaluationModelRun,
    getDataEvaluationDetail,
    getDataEvaluationRunStates,
} from "@/lib/evaluations/data-evaluations";

const querySchema = z.object({
    questionId: z.string().trim().min(1, "缺少题目 ID"),
});

const createRunSchema = z.object({
    questionId: z.string().trim().min(1, "缺少题目 ID"),
    columnCode: z.string().trim().min(1, "缺少模型列编码"),
});

async function resolveEvaluationDetail(questionId: string) {
    const session = await auth();

    if (!session?.user) {
        return {
            response: Response.json(
                {
                    error: "请先登录后再操作数据评测任务。",
                },
                { status: 401 },
            ),
            session: null,
            data: null,
        };
    }

    const data = await getDataEvaluationDetail({
        questionId,
        viewer: {
            userId: session.user.id,
            platformRole: session.user.platformRole,
        },
    });

    if (!data) {
        return {
            response: Response.json(
                {
                    error: "题目不存在、未通过审核，或当前账号无权访问。",
                },
                { status: 404 },
            ),
            session,
            data: null,
        };
    }

    const canReview = await canUserReviewProject(
        session.user.id,
        session.user.platformRole,
        data.question.project.id,
    );

    if (!canReview) {
        return {
            response: Response.json(
                {
                    error: "你当前没有该项目的数据评测权限。",
                },
                { status: 403 },
            ),
            session,
            data: null,
        };
    }

    return {
        response: null,
        session,
        data,
    };
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
        questionId: url.searchParams.get("questionId"),
    });

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
    }

    const resolved = await resolveEvaluationDetail(parsed.data.questionId);

    if (resolved.response) {
        return resolved.response;
    }

    const runStates = await getDataEvaluationRunStates({
        questionId: resolved.data!.question.id,
        modelColumns: resolved.data!.modelColumns,
    });

    return Response.json({
        modelColumns: resolved.data!.modelColumns,
        results: resolved.data!.results,
        runStates,
    });
}

export async function POST(request: Request) {
    if (!process.env.DATABASE_URL) {
        return Response.json(
            {
                error: "当前未配置 DATABASE_URL，无法创建数据评测任务。",
            },
            { status: 500 },
        );
    }

    const payload = await request.json().catch(() => null);
    const parsed = createRunSchema.safeParse(payload);

    if (!parsed.success) {
        return Response.json(
            {
                error: parsed.error.issues[0]?.message ?? "请求参数不完整。",
            },
            { status: 400 },
        );
    }

    const resolved = await resolveEvaluationDetail(parsed.data.questionId);

    if (resolved.response) {
        return resolved.response;
    }

    const modelColumn = resolved.data!.modelColumns.find(
        (column) => column.code === parsed.data.columnCode,
    );

    if (!modelColumn) {
        return Response.json(
            {
                error: "当前题目没有匹配到该模型评测配置。",
            },
            { status: 404 },
        );
    }

    try {
        const batchRun = await createDataEvaluationModelRun({
            questionId: resolved.data!.question.id,
            modelColumn,
            createdById: resolved.session!.user.id,
        });
        const runStates = await getDataEvaluationRunStates({
            questionId: resolved.data!.question.id,
            modelColumns: resolved.data!.modelColumns,
        });

        return Response.json(
            {
                success: "数据评测任务已提交，后台 worker 会按配置执行。",
                batchRunId: batchRun.id,
                runStates,
            },
            { status: 202 },
        );
    } catch (error) {
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "创建数据评测任务失败。",
            },
            { status: 409 },
        );
    }
}
