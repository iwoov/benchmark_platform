import { auth } from "@/auth";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  redirect(getHomePathByRole(session.user.platformRole));
}
