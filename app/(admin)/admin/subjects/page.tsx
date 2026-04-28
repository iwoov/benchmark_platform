import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SubjectManagementConsole } from "@/components/dashboard/subject-management-console";
import { getHomePathByRole } from "@/lib/auth/navigation";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function normalizePrimaryValue(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

export default async function AdminSubjectsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!isSuperAdminRole(session.user.platformRole)) {
        redirect(getHomePathByRole(session.user.platformRole));
    }

    const [subjects, primaryValueRows] = process.env.DATABASE_URL
        ? await Promise.all([
              prisma.subject.findMany({
                  orderBy: {
                      name: "asc",
                  },
                  select: {
                      id: true,
                      name: true,
                      description: true,
                      updatedAt: true,
                      primaryValues: {
                          orderBy: {
                              value: "asc",
                          },
                          select: {
                              value: true,
                          },
                      },
                      _count: {
                          select: {
                              userAssignments: true,
                          },
                      },
                  },
              }),
              prisma.$queryRaw<Array<{ value: string }>>`
                  SELECT DISTINCT NULLIF(TRIM(q.metadata->'rawRecord'->>'primary'), '') AS value
                  FROM "Question" q
                  WHERE NULLIF(TRIM(q.metadata->'rawRecord'->>'primary'), '') IS NOT NULL
                  ORDER BY value ASC
              `,
          ])
        : [[], []];

    const availablePrimaryValues = primaryValueRows.map((row) => row.value);
    const mappedPrimaryValues = new Set(
        subjects.flatMap((subject) =>
            subject.primaryValues.map((item) =>
                normalizePrimaryValue(item.value),
            ),
        ),
    );
    const unmappedPrimaryValues = Array.from(
        new Map(
            availablePrimaryValues
                .map((value) => normalizePrimaryValue(value))
                .filter((value) => Boolean(value))
                .filter((value) => !mappedPrimaryValues.has(value))
                .map((value) => [value, value]),
        ).values(),
    );

    return (
        <SubjectManagementConsole
            availablePrimaryValues={availablePrimaryValues}
            unmappedPrimaryValues={unmappedPrimaryValues}
            subjects={subjects.map((subject) => ({
                id: subject.id,
                name: subject.name,
                description: subject.description,
                primaryValues: subject.primaryValues.map((item) => item.value),
                userCount: subject._count.userAssignments,
                updatedAt: subject.updatedAt.toLocaleString("zh-CN"),
            }))}
        />
    );
}
