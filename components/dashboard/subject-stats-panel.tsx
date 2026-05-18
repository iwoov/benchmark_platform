"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HelpCircle } from "lucide-react";
import type {
    PlatformAdminProjectOption,
    SubjectStat,
} from "@/lib/dashboard/overview";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const ALL_PROJECTS_VALUE = "__all__";

const CHART_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-6)",
];

type Slice = { subject: string; value: number; rate: number };

function DonutChart({ slices, height = 280 }: { slices: Slice[]; height?: number }) {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) {
        return (
            <div
                className="flex items-center justify-center text-sm text-muted-foreground"
                style={{ height }}
            >
                暂无数据
            </div>
        );
    }
    const radius = 90;
    const strokeWidth = 32;
    const cx = 120;
    const cy = 120;
    const c = 2 * Math.PI * radius;

    let offset = 0;
    return (
        <div className="flex items-center justify-center gap-6" style={{ minHeight: height }}>
            <svg viewBox="0 0 240 240" width={240} height={240} aria-hidden>
                <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke="var(--color-muted)"
                    strokeWidth={strokeWidth}
                />
                {slices.map((slice, idx) => {
                    const length = (slice.value / total) * c;
                    const dasharray = `${length} ${c - length}`;
                    const dashoffset = -offset;
                    offset += length;
                    return (
                        <circle
                            key={slice.subject}
                            cx={cx}
                            cy={cy}
                            r={radius}
                            fill="none"
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            strokeWidth={strokeWidth}
                            strokeDasharray={dasharray}
                            strokeDashoffset={dashoffset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                        >
                            <title>{`${slice.subject}: ${slice.value}`}</title>
                        </circle>
                    );
                })}
                <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    className="fill-foreground"
                    style={{ fontSize: 22, fontWeight: 700 }}
                >
                    {total.toLocaleString()}
                </text>
                <text
                    x={cx}
                    y={cy + 18}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 11 }}
                >
                    总计
                </text>
            </svg>
            <ul className="space-y-1.5 text-sm">
                {slices.map((slice, idx) => (
                    <li key={slice.subject} className="flex items-center gap-2">
                        <span
                            className="h-3 w-3 rounded-sm"
                            style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="font-medium text-foreground">{slice.subject}</span>
                        <span className="text-muted-foreground">{slice.value}</span>
                        <span className="text-xs text-muted-foreground">
                            ({((slice.value / total) * 100).toFixed(1)}%)
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type GroupBar = { subject: string; reviewed: number; unreviewed: number; total: number };

function GroupedBarChart({ data, height = 360 }: { data: GroupBar[]; height?: number }) {
    if (!data.length) {
        return (
            <div
                className="flex items-center justify-center text-sm text-muted-foreground"
                style={{ height }}
            >
                暂无数据
            </div>
        );
    }
    const max = Math.max(...data.flatMap((d) => [d.reviewed, d.unreviewed]), 1);
    const chartHeight = Math.max(220, height - 92);
    const tickValues = [max, Math.round(max * 0.5), 0];

    return (
        <div className="space-y-4" style={{ minHeight: height }}>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-chart-1" style={{ background: CHART_COLORS[0] }} />
                    已审核
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm" style={{ background: CHART_COLORS[3] }} />
                    未审核
                </span>
            </div>
            <div className="overflow-x-auto">
                <div
                    className="grid"
                    style={{
                        gridTemplateColumns: "44px 1fr",
                        minWidth: Math.max(500, data.length * 72 + 44),
                    }}
                >
                    <div
                        className="relative pr-2 text-right font-mono text-[11px] text-muted-foreground"
                        style={{ height: chartHeight }}
                    >
                        {tickValues.map((value, index) => (
                            <div
                                key={`${value}-${index}`}
                                className="absolute right-2"
                                style={{
                                    top: `${index * 50}%`,
                                    transform:
                                        index === tickValues.length - 1
                                            ? "translateY(-100%)"
                                            : index === 0
                                              ? "translateY(0)"
                                              : "translateY(-50%)",
                                }}
                            >
                                {value.toLocaleString()}
                            </div>
                        ))}
                    </div>
                    <div
                        className="relative"
                        style={{ height: chartHeight }}
                    >
                        <div className="absolute inset-0 grid grid-rows-2 border-b border-l border-border/70">
                            <div className="border-b border-dashed border-border/70" />
                            <div />
                        </div>
                        <div className="relative z-10 flex h-full items-end gap-3 px-3">
                            {data.map((row) => (
                                <div
                                    key={row.subject}
                                    className="flex h-full min-w-[56px] flex-1 items-end justify-center gap-1.5"
                                >
                                    {[
                                        {
                                            key: "reviewed",
                                            label: "已审核",
                                            value: row.reviewed,
                                            color: CHART_COLORS[0],
                                        },
                                        {
                                            key: "unreviewed",
                                            label: "未审核",
                                            value: row.unreviewed,
                                            color: CHART_COLORS[3],
                                        },
                                    ].map((bar) => (
                                        <div
                                            key={bar.key}
                                            className="flex h-full w-5 items-end"
                                            title={`${row.subject} ${bar.label}: ${bar.value.toLocaleString()}`}
                                        >
                                            <div
                                                className="w-full rounded-t-sm transition-[height] duration-500"
                                                style={{
                                                    height: `${Math.max(
                                                        bar.value
                                                            ? (bar.value / max) *
                                                                  100
                                                            : 0,
                                                        bar.value ? 2 : 0,
                                                    )}%`,
                                                    background: bar.color,
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div />
                    <div className="flex gap-3 px-3 pt-2">
                        {data.map((row) => (
                            <div
                                key={row.subject}
                                className="min-w-[56px] flex-1 text-center"
                            >
                                <div
                                    className="truncate text-xs font-medium text-foreground"
                                    title={row.subject}
                                >
                                    {row.subject}
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                                    {row.reviewed.toLocaleString()} /{" "}
                                    {row.unreviewed.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
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

    const passSlices = useMemo<Slice[]>(
        () =>
            subjectStats
                .filter((row) => row.approved > 0)
                .map((row) => ({ subject: row.subject, value: row.approved, rate: row.passRate })),
        [subjectStats],
    );

    const unreviewedSlices = useMemo<Slice[]>(
        () =>
            subjectStats
                .filter((row) => row.unreviewed > 0)
                .map((row) => ({ subject: row.subject, value: row.unreviewed, rate: row.unreviewedRate })),
        [subjectStats],
    );

    const groupBarData = useMemo<GroupBar[]>(
        () =>
            subjectStats.map((row) => ({
                subject: row.subject,
                reviewed: row.approved + row.rejected,
                unreviewed: row.unreviewed,
                total: row.total,
            })),
        [subjectStats],
    );

    const tableSummary = useMemo(() => {
        const total = subjectStats.reduce((acc, row) => acc + row.total, 0);
        const approved = subjectStats.reduce((acc, row) => acc + row.approved, 0);
        const reviewed = subjectStats.reduce((acc, row) => acc + row.approved + row.rejected, 0);
        const passRate = reviewed > 0 ? (approved / reviewed) * 100 : 0;
        return { total, approved, passRate };
    }, [subjectStats]);

    const formatPassRate = (value: number) => `${value.toFixed(1)}%`;
    const passRateClass = (value: number) => {
        if (value >= 80) return "text-success";
        if (value >= 50) return "text-warning";
        return "text-destructive";
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
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
    const selectedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : null;
    const scopeLabel = selectedProject ? `${selectedProject.name} (${selectedProject.code})` : "全部项目";

    return (
        <section className="space-y-6">
            <Card>
                <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-base font-semibold tracking-tight">学科审核概览</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                选择项目查看该项目下各学科的审核分布；默认汇总所有项目。
                            </p>
                        </div>
                        <div className="min-w-[260px]">
                            <Select value={selectValue} onChange={handleChange}>
                                <option value={ALL_PROJECTS_VALUE}>全部项目</option>
                                {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.code})
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        当前范围：{scopeLabel}
                        {isPending ? "（加载中…）" : ""}
                    </p>
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardContent className="space-y-3">
                        <div>
                            <h3 className="text-base font-semibold tracking-tight">题目通过率</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                按学科展示已通过题目分布；扇区面积代表通过题目数。
                            </p>
                        </div>
                        <DonutChart slices={passSlices} />
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="space-y-3">
                        <div>
                            <h3 className="text-base font-semibold tracking-tight">未审核率</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                按学科展示尚未人工审核的题目分布；扇区面积代表未审核题目数。
                            </p>
                        </div>
                        <DonutChart slices={unreviewedSlices} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold tracking-tight">各学科审核数量</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            人工审核口径下，每个学科的已审核 / 未审核 / 总数对比。
                        </p>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                        <GroupedBarChart data={groupBarData} />
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>学科</TableHead>
                                    <TableHead className="text-right">总题目</TableHead>
                                    <TableHead className="text-right">通过题目</TableHead>
                                    <TableHead className="text-right">
                                        <span className="inline-flex items-center gap-1">
                                            通过率
                                            <Tooltip content="通过率 = 通过 / 已审核(通过 + 驳回)，不计入未审核题目。">
                                                <HelpCircle size={12} />
                                            </Tooltip>
                                        </span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {subjectStats.map((row) => (
                                    <TableRow key={row.subject}>
                                        <TableCell className="font-medium">{row.subject}</TableCell>
                                        <TableCell className="text-right font-mono">{row.total.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {row.approved.toLocaleString()}
                                        </TableCell>
                                        <TableCell className={`text-right font-mono ${passRateClass(row.passRate)}`}>
                                            {formatPassRate(row.passRate)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-muted/40 font-semibold">
                                    <TableCell>合计</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {tableSummary.total.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {tableSummary.approved.toLocaleString()}
                                    </TableCell>
                                    <TableCell className={`text-right font-mono ${passRateClass(tableSummary.passRate)}`}>
                                        {formatPassRate(tableSummary.passRate)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
