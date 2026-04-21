"use client";

import type { SubjectStat } from "@/lib/dashboard/overview";

const BAR_HEIGHT = 20;
const BAR_GAP = 8;
const LABEL_WIDTH = 90;
const VALUE_WIDTH = 48;
const CHART_WIDTH = 320;

function BarRow({
    label,
    value,
    barColor,
}: {
    label: string;
    value: number;
    barColor: string;
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
                            width: `${value}%`,
                            height: "100%",
                            background: barColor,
                            borderRadius: 4,
                            transition: "width 0.4s ease",
                        }}
                    />
                </div>
                <span style={{ fontSize: 12, width: VALUE_WIDTH, flexShrink: 0, color: "var(--color-text-secondary, #888)" }}>
                    {value}%
                </span>
            </div>
        </div>
    );
}

export function SubjectStatsChart({
    stats,
    metric,
    barColor,
}: {
    stats: SubjectStat[];
    metric: "passRate" | "unreviewedRate";
    barColor: string;
}) {
    if (!stats.length) {
        return <div className="overview-empty-state">暂无学科数据。</div>;
    }

    return (
        <div style={{ overflowX: "auto" }}>
            {stats.map((row) => (
                <BarRow
                    key={row.subject}
                    label={row.subject}
                    value={row[metric]}
                    barColor={barColor}
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
