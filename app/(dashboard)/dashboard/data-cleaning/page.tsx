import ReviewTasksPage from "@/app/(dashboard)/dashboard/review-tasks/page";

export default function DataCleaningPage(
    props: Parameters<typeof ReviewTasksPage>[0],
) {
    return (
        <ReviewTasksPage
            {...props}
            mode="cleaning"
            listPath="/admin/data-cleaning"
        />
    );
}
