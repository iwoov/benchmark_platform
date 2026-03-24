import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CreateProjectForm } from "@/components/dashboard/create-project-form";
import { ProjectMembersManager } from "@/components/dashboard/project-members-manager";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
    type ProjectWithRelations = Prisma.ProjectGetPayload<{
        include: {
            members: {
                include: {
                    user: {
                        select: {
                            id: true;
                            username: true;
                            name: true;
                            email: true;
                            status: true;
                        };
                    };
                };
            };
            datasources: true;
        };
    }>;

    let projects: ProjectWithRelations[] = [];
    let users: Array<{
        id: string;
        username: string | null;
        name: string;
        email: string | null;
        status: "ACTIVE" | "INACTIVE";
    }> = [];

    if (process.env.DATABASE_URL) {
        projects = await prisma.project.findMany({
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                name: true,
                                email: true,
                                status: true,
                            },
                        },
                    },
                },
                datasources: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        users = await prisma.user.findMany({
            where: {
                status: "ACTIVE",
                platformRole: "USER",
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                status: true,
            },
        });
    }

    return (
        <section className="content-surface">
            <div className="section-head">
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                        项目管理
                    </h2>
                    <p
                        className="muted"
                        style={{ margin: "10px 0 0", lineHeight: 1.7 }}
                    >
                        平台管理员统一负责项目成员分配与数据接入。项目内只保留出题用户和审核用户两类协作角色。
                    </p>
                </div>
                <CreateProjectForm />
            </div>

            <ProjectMembersManager
                projects={projects.map((project) => ({
                    id: project.id,
                    name: project.name,
                    code: project.code,
                    status: project.status,
                    datasourcesCount: project.datasources.length,
                    members: project.members.map((member) => ({
                        id: member.id,
                        role: member.role,
                        joinedAt: member.joinedAt.toLocaleString("zh-CN"),
                        user: {
                            id: member.user.id,
                            username: member.user.username,
                            name: member.user.name,
                            email: member.user.email,
                            status: member.user.status,
                        },
                    })),
                }))}
                users={users}
            />
        </section>
    );
}
