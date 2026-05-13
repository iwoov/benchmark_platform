import WorkspaceReviewsPage from "@/app/(workspace)/workspace/reviews/page";

export default function WorkspaceDataCleaningPage(
    props: Parameters<typeof WorkspaceReviewsPage>[0],
) {
    return (
        <WorkspaceReviewsPage
            {...props}
            mode="cleaning"
            listPath="/workspace/data-cleaning"
        />
    );
}
