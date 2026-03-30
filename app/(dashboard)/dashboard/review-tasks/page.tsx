import { prisma } from "@/lib/db/prisma";
import { ReviewQuestionList } from "@/components/workspace/review-question-list";
import { getReviewQuestionListData } from "@/lib/reviews/question-list-data";
import { getReviewQuestionListAiStrategies } from "@/lib/ai/review-strategies";

export const dynamic = "force-dynamic";

export default async function ReviewTasksPage() {
    const projects = process.env.DATABASE_URL
        ? await prisma.project.findMany({
              where: {
                  status: "ACTIVE",
              },
              orderBy: {
                  createdAt: "desc",
              },
              select: {
                  id: true,
                  name: true,
                  code: true,
              },
          })
        : [];

    const [questions, reviewStrategies] = projects.length
        ? await Promise.all([
              getReviewQuestionListData(),
              getReviewQuestionListAiStrategies(
                  projects.map((project) => project.id),
              ),
          ])
        : [[], []];

    return (
        <ReviewQuestionList
            canReview
            scopeLabel="全部项目"
            projects={projects}
            questions={questions}
            reviewStrategies={reviewStrategies}
        />
    );
}
