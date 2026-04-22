"use client";

import { useMemo, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Spin } from "antd";
import type {
    PlatformAdminProjectOption,
    SubjectStat,
} from "@/lib/dashboard/overview";

const PIE_HEIGHT = 280;
const COLUMN_HEIGHT = 320;
const COLUMN_MAX_WIDTH = 720;

const ALL_PROJECTS_VALUE = "__all__";

function ChartFallback({ height = PIE_HEIGHT }: { height?: number }) {
    return (
        <div
            style={{
                height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <Spin />
        </div>
    );
}

const Pie = dynamic(
    () => import("@ant-design/charts").then((mod) => mod.Pie),
    { ssr: false, loading: () => <ChartFallback /> },
);
const Column = dynamic(
    () => import("@ant-design/charts").then((mod) => mod.Column),
    { ssr: false, loading: () => <ChartFallback height={COLUMN_HEIGHT} /> },
);

function EmptyState({
    text,
    height = PIE_HEIGHT,
}: {
    text: string;
    height?: number;
}) {
    return (
        <div
            className="overview-empty-state"
            style={{
                minHeight: height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {text}
        </div>
    );
}

export function SubjectStatsPanel({
    projects,
    subjectStats,
    selectedProjectId,
}: {
    projects: PlatformAdminProjectOption[];
    subjectStats: SubjectStat[];
    selectedProjectId: string | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const passSlices = useMemo(
        () =>
            subjectStats
                .filter((row) => row.approved > 0)
                .map((row) => ({
                    subject: row.subject,
                    value: row.approved,
                    rate: row.passRate,
                })),
        [subjectStats],
    );

    const unreviewedSlices = useMemo(
        () =>
            subjectStats
                .filter((row) => row.unreviewed > 0)
                .map((row) => ({
                    subject: row.subject,
                    value: row.unreviewed,
                    rate: row.unreviewedRate,
                })),
        [subjectStats],
    );

    const columnData = useMemo(() => {
        const out: Array<{ subject: string; type: string; value: number }> = [];
        for (const row of subjectStats) {
            const reviewed = row.approved + row.rejected;
            out.push({ subject: row.subject, type: "已审核", value: reviewed });
            out.push({
                subject: row.subject,
                type: "未审核",
                value: row.unreviewed,
            });
            out.push({ subject: row.subject, type: "总数", value: row.total });
        }
        return out;
    }, [subjectStats]);

    const projectOptions = useMemo(
        () => [
            { label: "全部项目", value: ALL_PROJECTS_VALUE },
            ...projects.map((p) => ({
                label: `${p.name} (${p.code})`,
                value: p.id,
            })),
        ],
        [projects],
    );

    const handleChange = (value: string) => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        if (value === ALL_PROJECTS_VALUE) {
            params.delete("projectId");
        } else {
            params.set("projectId", value);
        }
        const qs = params.toString();
        const target = qs ? `${pathname}?${qs}` : pathname;
        startTransition(() => {
            router.replace(target, { scroll: false });
        });
    };

    const selectValue = selectedProjectId ?? ALL_PROJECTS_VALUE;
    const selectedProject = selectedProjectId
        ? projects.find((p) => p.id === selectedProjectId)
        : null;
    const scopeLabel = selectedProject
        ? `${selectedProject.name} (${selectedProject.code})`
        : "全部项目";

    const buildPieConfig = (
        data: Array<{ subject: string; value: number; rate: number }>,
    ) => ({
        data,
        angleField: "value",
        colorField: "subject",
        height: PIE_HEIGHT,
        radius: 0.9,
        innerRadius: 0.55,
        legend: {
            color: {
                position: "right" as const,
                rowPadding: 6,
            },
        },
        label: {
            text: "subject",
            position: "outside" as const,
            style: {
                fontSize: 12,
            },
        },
    });

    return (
        <section style={{ display: "grid", gap: 24 }}>
            <div className="content-surface">
                <div
                    className="section-head"
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: 16,
                        flexWrap: "wrap",
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.1 }}>
                            学科审核概览
                        </h2>
                        <div className="muted" style={{ marginTop: 8 }}>
                            选择项目查看该项目下各学科的审核分布；默认汇总所有项目。
                        </div>
                    </div>
                    <Select
                        style={{ minWidth: 260 }}
                        value={selectValue}
                        onChange={handleChange}
                        options={projectOptions}
                        loading={isPending}
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择项目"
                    />
                </div>
                <div
                    style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "var(--color-text-secondary, #888)",
                    }}
                >
                    当前范围：{scopeLabel}
                    {isPending ? "（加载中…）" : ""}
                </div>
            </div>

            <div className="overview-two-column">
                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}>
                                题目通过率
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                按学科展示已通过题目分布；扇区面积代表通过题目数。
                            </div>
                        </div>
                    </div>
                    {passSlices.length === 0 ? (
                        <EmptyState text="暂无通过的题目。" />
                    ) : (
                        <Pie {...buildPieConfig(passSlices)} />
                    )}
                </div>

                <div className="content-surface">
                    <div className="section-head">
                        <div>
                            <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}>
                                未审核率
                            </h2>
                            <div className="muted" style={{ marginTop: 8 }}>
                                按学科展示尚未人工审核的题目分布；扇区面积代表未审核题目数。
                            </div>
                        </div>
                    </div>
                    {unreviewedSlices.length === 0 ? (
                        <EmptyState text="暂无未审核题目。" />
                    ) : (
                        <Pie {...buildPieConfig(unreviewedSlices)} />
                    )}
                </div>
            </div>

            <div className="content-surface">
                <div className="section-head">
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}>
                            各学科审核数量
                        </h2>
                        <div className="muted" style={{ marginTop: 8 }}>
                            人工审核口径下，每个学科的已审核 / 未审核 / 总数对比。
                        </div>
                    </div>
                </div>
                {columnData.length === 0 ? (
                    <EmptyState text="暂无学科数据。" height={COLUMN_HEIGHT} />
                ) : (
                    <div style={{ maxWidth: COLUMN_MAX_WIDTH, margin: "0 auto", width: "100%" }}>
                        <Column
                            data={columnData}
                            xField="subject"
                            yField="value"
                            colorField="type"
                            group
                            height={COLUMN_HEIGHT}
                            style={{ maxWidth: 28 }}
                            axis={{
                                x: { labelAutoRotate: true },
                                y: { title: "题目数" },
                            }}
                            legend={{ color: { position: "top" } }}
                            label={{
                                text: "value",
                                textBaseline: "bottom",
                                position: "top",
                                style: {
                                    fontSize: 11,
                                    fill: "var(--color-text-secondary, #555)",
                                },
                            }}
                        />
                    </div>
                )}
            </div>
        </section>
    );
}
