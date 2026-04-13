import { auth } from "@/auth";
import { WorkspaceOverview } from "@/components/dashboard/workspace-overview";
import { getWorkspaceOverview } from "@/lib/dashboard/overview";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage() {
    const session = await auth();
    const overview = session?.user
        ? await getWorkspaceOverview(session.user.id)
        : {
              availableRoles: [],
              defaultRole: "AUTHOR" as const,
              author: null,
              reviewer: null,
          };

    return <WorkspaceOverview data={overview} />;
}
