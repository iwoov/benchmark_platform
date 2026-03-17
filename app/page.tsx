import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getHomePathByRole } from "@/lib/auth/navigation";

export default async function HomePage() {
  const session = await auth();

  redirect(session ? getHomePathByRole(session.user.platformRole) : "/login");
}
