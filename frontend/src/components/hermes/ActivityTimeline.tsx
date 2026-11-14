import clsx from "clsx";

import type { DailyPoint } from "@/lib/analyticsApi";
import { formatCount } from "@/lib/format";
import { RANGE_PRESETS, type RangePreset } from "@/store/ui";

function sparkline(series: DailyPoint[]) {
  const width = 560;
  const height = 92;
  const top = 6;
  const bottom = 10;
  const max = Math.max(1, ...series.map((point) => point.detections));
  const usable = height - top - bottom;
  const points = series.map((point, index) => {
    const x = series.length <= 1 ? width / 2 : (index / (series.length - 1)) * width;
    const y = top + usable - (point.detections / max) * usable;
    return { x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return { width, height, line, area };
}

export function ActivityTimeline({
  series,
  start,
  end,
  preset,
  onPreset,
  activeDays,
  peak,
  loading,
}: {
  series: DailyPoint[];
  start: string;
  end: string;
  preset: RangePreset;
  onPreset: (preset: RangePreset) => void;
  activeDays?: number;
  peak?: { date: string | null; detections: number };
  loading?: boolean;
}) {
  const shape = series.length > 0 ? sparkline(series) : null;
  const empty = series.length > 0 && series.every((point) => point.detections === 0);
  const presets = RANGE_PRESETS.filter((item) => item.value !== "custom");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="label text-[9px]">Active days</div>
            <div className="mt-[3px] font-mono text-[20px] leading-none text-ink">
              {formatCount(activeDays ?? 0)}
            </div>
          </div>
          <div>
            <div className="label text-[9px]">Peak day</div>
            <div className="mt-[3px] font-mono text-[12px] leading-none text-muted">
              {peak?.date ? `${peak.date} · ${formatCount(peak.detections)}` : "—"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onPreset(item.value)}
              aria-pressed={preset === item.value}
              className={clsx(
                "rounded-control border px-[7px] py-[3px] font-mono text-3xs uppercase tracking-[0.08em] transition-colors",
                preset === item.value
                  ? "border-accent/40 bg-accent/[0.08] text-accent"
                  : "border-line/10 text-faint hover:border-line/20 hover:text-muted",
              )}
            >
              {item.value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-[10px]">
        {loading ? (
          <div className="h-[92px] animate-pulse rounded-control bg-line/[0.04]" aria-hidden />
        ) : shape ? (
          <svg
            viewBox={`0 0 ${shape.width} ${shape.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Daily detections in the selected period"
            className="h-[92px] w-full"
          >
            <defs>
              <linearGradient id="hermes-activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F28A43" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#F28A43" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                x2={shape.width}
                y1={6 + ratio * 76}
                y2={6 + ratio * 76}
                stroke="rgba(232,237,242,0.07)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={shape.area} fill="url(#hermes-activity-fill)" />
            <polyline
              points={shape.line}
              fill="none"
              stroke="#FFB45C"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div className="flex h-[92px] items-center justify-center rounded-control border border-dashed border-line/[0.1]">
            <p className="text-2xs font-light text-faint">
              No daily series in this period. Nothing is drawn rather than invented.
            </p>
          </div>
        )}
      </div>

      <div className="mt-[6px] flex items-center justify-between font-mono text-3xs text-faint">
        <span>{start}</span>
        {empty ? <span className="text-warn">No detections recorded in this period</span> : null}
        <span className="text-line/25">→</span>
        <span>{end}</span>
      </div>
    </div>
  );
}
