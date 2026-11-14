import { useId } from "react";

import { formatCount } from "@/lib/format";

export interface LinePoint {
  date: string;
  value: number;
}

/**
 * Compact instrument line chart. Values are plotted against their own daily
 * maximum; no smoothing or interpolation is applied, so gaps and spikes remain
 * visible rather than being hidden by a fitted curve.
 */
export function MiniLineChart({
  points,
  label,
  color = "#62D5DD",
  height = 64,
}: {
  points: LinePoint[];
  label: string;
  color?: string;
  height?: number;
}) {
  const gradientId = `line-${useId().replace(/:/g, "")}`;
  const width = 320;
  const top = 5;
  const bottom = 8;
  const max = Math.max(1, ...points.map((point) => point.value));
  const usable = height - top - bottom;
  const coordinates = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = top + usable - (point.value / max) * usable;
    return { ...point, x, y };
  });
  const line = coordinates
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const empty = points.length === 0 || points.every((point) => point.value === 0);
  const last = coordinates[coordinates.length - 1];
  const peak = Math.max(...points.map((point) => point.value), 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="mt-[6px] w-full"
        style={{ height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={top + ratio * usable}
            y2={top + ratio * usable}
            stroke="rgba(232,237,242,0.07)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.length > 0 ? (
          <>
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {last && !empty ? (
              <circle cx={last.x} cy={last.y} r="2.4" fill={color} />
            ) : null}
          </>
        ) : null}
      </svg>

      <div className="mt-[2px] flex items-center justify-between font-mono text-3xs text-faint">
        <span>{points[0]?.date ?? "—"}</span>
        <span>
          {empty ? (
            "No associations in this period"
          ) : (
            <>peak {formatCount(peak)} / day</>
          )}
        </span>
        <span>{points[points.length - 1]?.date ?? "—"}</span>
      </div>
    </div>
  );
}
