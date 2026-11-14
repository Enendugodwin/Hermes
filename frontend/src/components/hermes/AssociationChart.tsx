import { MiniLineChart } from "@/components/hermes/MiniLineChart";
import type { MatchSeries } from "@/lib/intelligenceApi";
import { formatCount } from "@/lib/format";

/**
 * Cross-sensor association trend. The line is the daily count of VIIRS
 * detections that also have a probable or possible MODIS association; the
 * definition comes from the API, never from the browser.
 */
export function AssociationChart({
  series,
  loading,
}: {
  series: MatchSeries | undefined;
  loading?: boolean;
}) {
  const points = (series?.days ?? []).map((day) => ({
    date: day.date,
    value: day.matches,
  }));
  const total = series?.totals.matches ?? 0;
  const coverage = series?.coverage;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label text-[9px]">Cross-sensor associations</span>
        <span className="font-mono text-[11px] text-cyan">
          {loading ? "—" : formatCount(total)}
        </span>
      </div>

      {loading ? (
        <div className="mt-[6px] h-16 animate-pulse rounded-control bg-line/[0.04]" aria-hidden />
      ) : (
        <MiniLineChart
          points={points}
          label="Cross-sensor associations per day"
          color="#62D5DD"
          height={64}
        />
      )}

      <p className="mt-[3px] text-3xs font-light leading-relaxed text-faint">
        Probable + possible MODIS/VIIRS pairs per UTC day
        {coverage
          ? ` · ${formatCount(coverage.days_with_associations)} of ${formatCount(coverage.days)} days with associations`
          : ""}
      </p>
    </div>
  );
}
