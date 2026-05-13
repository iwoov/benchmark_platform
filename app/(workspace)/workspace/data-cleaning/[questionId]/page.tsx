import WorkspaceReviewDetailPage from "@/app/(workspace)/workspace/reviews/[questionId]/page";

export default function WorkspaceDataCleaningDetailPage(
    props: Parameters<typeof WorkspaceReviewDetailPage>[0],
) {
    return (
        <WorkspaceReviewDetailPage
            {...props}
            listPathBase="/workspace/data-cleaning"
            initialRightTab="cleaning"
        />
    );
}
