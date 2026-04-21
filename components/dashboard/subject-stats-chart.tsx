"use client";

import type { SubjectStat } from "@/lib/dashboard/overview";

const BAR_HEIGHT = 20;
const BAR_GAP = 8;
const LABEL_WIDTH = 90;
const VALUE_WIDTH = 48;
const CHART_WIDTH = 320;

function BarRow({
    label,
    passRate,
    unreviewedRate,
}: {
    label: string;
    passRate: number;
    unreviewedRate: number;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: BAR_GAP }}>
            <div
                style={{
                    width: LABEL_WIDTH,
                    flexShrink: 0,
                    fontSize: 12,
                    color: "var(--color-text-secondary, #888)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                }}
                title={label}
            >
                {label}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                {/* Pass rate bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                        style={{
                            width: CHART_WIDTH,
                            height: BAR_HEIGHT,
                            background: "var(--color-border, #f0f0f0)",
                            borderRadius: 4,
                            overflow: "hidden",
                            position: "relative",
                        }}
                    >
                        <div
                            style={{
                                width: `${passRate}%`,
                                height: "100%",
                                background: "var(--color-success, #52c41a)",
                                borderRadius: 4,
                                transition: "width 0.4s ease",
                            }}
                        />
                    </div>
                    <span style={{ fontSize: 12, width: VALUE_WIDTH, flexShrink: 0, color: "var(--color-text-secondary, #888)" }}>
                        {passRate}%
                    </span>
                </div>
                {/* Unreviewed rate bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                        style={{
                            width: CHART_WIDTH,
                            height: BAR_HEIGHT,
                            background: "var(--color-border, #f0f0f0)",
                            borderRadius: 4,
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                width: `${unreviewedRate}%`,
                                height: "100%",
                                background: "var(--color-warning, #faad14)",
                                borderRadius: 4,
                                transition: "width 0.4s ease",
                            }}
                        />
                    </div>
                    <span style={{ fontSize: 12, width: VALUE_WIDTH, flexShrink: 0, color: "var(--color-text-secondary, #888)" }}>
                        {unreviewedRate}%
                    </span>
                </div>
            </div>
        </div>
    );
}

export function SubjectStatsChart({ stats }: { stats: SubjectStat[] }) {
    if (!stats.length) {
        return <div className="overview-empty-state">暂无学科数据。</div>;
    }

    return (
        <div style={{ overflowX: "auto" }}>
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--color-success, #52c41a)", borderRadius: 2 }} />
                    人工审核通过率
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ display: "inline-block", width: 12, height: 12, background: "var(--color-warning, #faad14)", borderRadius: 2 }} />
                    未审核率
                </span>
            </div>
            {stats.map((row) => (
                <BarRow
                    key={row.subject}
                    label={row.subject}
                    passRate={row.passRate}
                    unreviewedRate={row.unreviewedRate}
                />
            ))}
            {/* Axis labels */}
            <div style={{ display: "flex", marginLeft: LABEL_WIDTH + 8, marginTop: 4 }}>
                <div style={{ width: CHART_WIDTH, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                </div>
            </div>
        </div>
    );
}
