import { useId, useState } from "react";

import type { HarmonizedSeries } from "@/lib/intelligenceApi";
import { formatCount } from "@/lib/format";

type StatusKey = "matches_probable" | "matches_possible" | "matches_rejected";

const STATUS_SERIES: Array<{
  key: StatusKey;
  label: string;
  color: string;
  dashed?: boolean;
}> = [
  { key: "matches_probable", label: "Probable", color: "#FFB45C" },
  { key: "matches_possible", label: "Possible", color: "#62D5DD" },
  { key: "matches_rejected", label: "Rejected", color: "#8C9099", dashed: true },
];

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

/**
 * Cross-sensor outcomes over time. Three separate lines are drawn from the
 * harmonisation API: probable, possible and rejected pairs. Only probable and
 * possible are used by the harmonised total; rejected pairs are shown for audit.
 */
export function CrossSensorLineChart({
  series,
  loading,
}: {
  series: HarmonizedSeries | undefined;
  loading?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = `outcome-${useId().replace(/:/g, "")}`;

  if (loading) {
    return <div className="h-[220px] animate-pulse rounded-control bg-line/[0.04]" aria-hidden />;
  }

  const days = series?.days ?? [];
  if (days.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-control border border-dashed border-line/[0.1]">
        <p className="text-2xs font-light text-faint">
          No association days in this period. Nothing is drawn rather than invented.
        </p>
      </div>
    );
  }

  const width = 760;
  const height = 228;
  const pad = { left: 46, right: 14, top: 14, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(
    Math.max(
      ...days.flatMap((day) => [
        day.matches_probable,
        day.matches_possible,
        day.matches_rejected,
      ]),
      1,
    ),
  );
  const xFor = (index: number) =>
    days.length <= 1 ? pad.left + plotW / 2 : pad.left + (index / (days.length - 1)) * plotW;
  const yFor = (value: number) => pad.top + plotH - (value / max) * plotH;

  const lines = STATUS_SERIES.map((status) => {
    const values = days.map((day) => day[status.key]);
    return {
      ...status,
      values,
      path: values
        .map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`)
        .join(" "),
    };
  });
  const probable = lines[0];
  const probableArea = probable
    ? `${pad.left},${pad.top + plotH} ${probable.path} ${pad.left + plotW},${pad.top + plotH}`
    : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: max * ratio,
    y: pad.top + plotH - ratio * plotH,
  }));
  const xTickCount = Math.min(5, days.length);
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const pointIndex =
      xTickCount === 1 ? 0 : Math.round((index / (xTickCount - 1)) * (days.length - 1));
    return { index: pointIndex, x: xFor(pointIndex), label: days[pointIndex]?.date.slice(5) ?? "" };
  });

  const hovered = hover === null ? null : days[hover];
  const total = series?.totals.matches ?? 0;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (x - pad.left) / plotW));
    setHover(Math.round(ratio * (days.length - 1)));
  }

  return (
    <div className="relative">
      <div className="mb-[4px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label text-[9px]">Cross-sensor outcomes / UTC day</div>
          <div className="mt-[3px] font-mono text-[19px] leading-none text-ink">
            {formatCount(total)}
            <span className="ml-1 text-3xs text-faint">associations</span>
          </div>
          <div className="mt-[4px] font-mono text-3xs text-faint">
            {formatCount(series?.totals.matches_probable ?? 0)} probable ·{" "}
            {formatCount(series?.totals.matches_possible ?? 0)} possible ·{" "}
            {formatCount(series?.totals.matches_rejected ?? 0)} rejected
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          {STATUS_SERIES.map((status) => (
            <span
              key={status.key}
              className="inline-flex items-center gap-1.5 font-mono text-3xs text-muted"
            >
              <span
                className="inline-block h-[2px] w-4 rounded-full"
                style={{
                  backgroundColor: status.color,
                  opacity: status.dashed ? 0.8 : 1,
                }}
                aria-hidden
              />
              {status.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label="Cross-sensor associations per day by outcome"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFB45C" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#FFB45C" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={pad.left}
                x2={pad.left + plotW}
                y1={tick.y}
                y2={tick.y}
                stroke="rgba(232,237,242,0.07)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={pad.left - 8}
                y={tick.y + 3}
                textAnchor="end"
                fill="#70808F"
                fontSize="9"
                fontFamily="IBM Plex Mono, monospace"
              >
                {compact(tick.value)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text
              key={`${tick.index}-${tick.label}`}
              x={tick.x}
              y={height - 8}
              textAnchor={
                tick.index === 0 ? "start" : tick.index === days.length - 1 ? "end" : "middle"
              }
              fill="#70808F"
              fontSize="9"
              fontFamily="IBM Plex Mono, monospace"
            >
              {tick.label}
            </text>
          ))}

          {probableArea ? <polygon points={probableArea} fill={`url(#${gradientId})`} /> : null}

          {lines.map((line) => (
            <g key={line.key}>
              <polyline
                points={line.path}
                fill="none"
                stroke={line.color}
                strokeWidth={line.key === "matches_rejected" ? 1.3 : 1.8}
                strokeDasharray={line.dashed ? "4 4" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {days.length <= 60
                ? line.values.map((value, index) =>
                    value > 0 ? (
                      <circle
                        key={`${line.key}-${days[index]?.date}`}
                        cx={xFor(index)}
                        cy={yFor(value)}
                        r={days.length > 30 ? 1.5 : 2.2}
                        fill={line.color}
                      />
                    ) : null,
                  )
                : null}
            </g>
          ))}

          {hovered && hover !== null ? (
            <g>
              <line
                x1={xFor(hover)}
                x2={xFor(hover)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="rgba(232,237,242,0.28)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              {lines.map((line) => (
                <circle
                  key={line.key}
                  cx={xFor(hover)}
                  cy={yFor(hovered[line.key])}
                  r="3"
                  fill="#080C11"
                  stroke={line.color}
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ) : null}
        </svg>

        {hovered && hover !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[132px] -translate-x-1/2 rounded-control border border-line/15 bg-canvas/95 px-2 py-[5px] font-mono text-3xs shadow-lift backdrop-blur-glass"
            style={{
              left: `${Math.min(88, Math.max(12, (xFor(hover) / width) * 100))}%`,
            }}
          >
            <div className="mb-[2px] text-faint">{hovered.date}</div>
            {lines.map((line) => (
              <div key={line.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5" style={{ color: line.color }}>
                  <span
                    className="inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: line.color }}
                    aria-hidden
                  />
                  {line.label}
                </span>
                <span className="text-ink">{formatCount(hovered[line.key])}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-[2px] text-3xs font-light leading-relaxed text-faint">
        Probable and possible pairs are the associations used by the harmonised total. Rejected
        pairs failed the association threshold and are shown for audit only; they are never
        subtracted. The series excludes labelled synthetic fixture pairs.
      </p>
    </div>
  );
}
