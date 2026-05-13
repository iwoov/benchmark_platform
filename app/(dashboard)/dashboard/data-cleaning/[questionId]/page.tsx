import ReviewTaskDetailPage from "@/app/(dashboard)/dashboard/review-tasks/[questionId]/page";

export default function DataCleaningDetailPage(
    props: Parameters<typeof ReviewTaskDetailPage>[0],
) {
    return (
        <ReviewTaskDetailPage
            {...props}
            listPathBase="/admin/data-cleaning"
            initialRightTab="cleaning"
        />
    );
}
