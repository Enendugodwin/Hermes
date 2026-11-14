import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  PanelRightOpen,
  Radio,
  Satellite,
  ShieldCheck,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ActivityTimeline } from "@/components/hermes/ActivityTimeline";
import { AssociationChart } from "@/components/hermes/AssociationChart";
import { GlassPanel } from "@/components/hermes/GlassPanel";
import {
  DEFAULT_OVERVIEW_FILTERS,
  MapToolbar,
  type OverviewMapFilters,
} from "@/components/hermes/MapToolbar";
import { HotspotPanel } from "@/components/map/HotspotPanel";
import { MapSearch } from "@/components/map/MapSearch";
import {
  AGGREGATE_ZOOM,
  POINT_LIMIT,
  emptyFeatures,
} from "@/components/map/fireLayers";
import type { FireMapHandle } from "@/components/map/FireMapCanvas";
import { DEFAULT_THEME, MAP_THEMES } from "@/components/map/mapStyle";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { SyntheticBanner } from "@/components/ui/SyntheticBanner";
import { fetchAnalytics } from "@/lib/analyticsApi";
import { formatCount, formatFrp } from "@/lib/format";
import {
  fetchAggregate,
  fetchFireFeatures,
  fetchObservation,
  type Bounds,
  type FireCell,
  type FireFeatureCollection,
  type FireQuery,
  type GeoPlace,
} from "@/lib/mapApi";
import { useDashboardOverview, useMatchSeries, useSystemStatus } from "@/lib/queries";
import { formatDateTimeUtc } from "@/lib/time";
import { useUiStore } from "@/store/ui";

const FireMapCanvas = lazy(() =>
  import("@/components/map/FireMapCanvas").then((module) => ({
    default: module.FireMapCanvas,
  })),
);

const WORLD: Bounds = [-180, -85, 180, 85];

interface Meta {
  aggregated: boolean;
  shown: number;
  total: number;
  cellDegrees: number | null;
  matched: number;
  truncated: boolean;
}

const EMPTY_META: Meta = {
  aggregated: true,
  shown: 0,
  total: 0,
  cellDegrees: null,
  matched: 0,
  truncated: false,
};

function DataLine({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "muted" | "ok" | "warn" | "danger" | "ink";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : tone === "ink"
            ? "text-ink"
            : "text-muted";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/[0.06] py-[6px] last:border-0">
      <span className="text-2xs font-light text-faint">{label}</span>
      <span className={`text-right font-mono text-3xs ${toneClass}`}>{value}</span>
    </div>
  );
}

function SensorRow({
  name,
  colour,
  count,
  total,
}: {
  name: string;
  colour: string;
  count: number;
  total: number;
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="py-[7px]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-2xs text-muted">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
          {name}
        </span>
        <span className="font-mono text-[11px] text-ink">{formatCount(count)}</span>
      </div>
      <div className="mt-[6px] h-[3px] overflow-hidden rounded-full bg-line/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${share}%`, backgroundColor: colour, opacity: 0.85 }}
        />
      </div>
      <div className="mt-[4px] flex justify-between font-mono text-3xs text-faint">
        <span>{count > 0 ? "reporting" : "no detections"}</span>
        <span>{share}%</span>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const dateRange = useUiStore((state) => state.dateRange);
  const setPreset = useUiStore((state) => state.setPreset);
  const { data: status, isError: statusError } = useSystemStatus();
  const overview = useDashboardOverview(dateRange.start, dateRange.end);
  const storedObservations = status?.data.observations_stored ?? 0;
  const syntheticStored = status?.data.synthetic_observations ?? 0;
  const allSynthetic = syntheticStored > 0 && syntheticStored === storedObservations;
  const matchSeries = useMatchSeries(dateRange.start, dateRange.end);

  const analytics = useQuery({
    queryKey: ["overview-analytics", dateRange.start, dateRange.end, allSynthetic],
    queryFn: ({ signal }) =>
      fetchAnalytics(
        dateRange.start,
        dateRange.end,
        signal,
        allSynthetic ? null : false,
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const [filters, setFilters] = useState<OverviewMapFilters>(DEFAULT_OVERVIEW_FILTERS);
  const [view, setView] = useState<{ bbox: Bounds; zoom: number }>({ bbox: WORLD, zoom: 2 });
  const [points, setPoints] = useState<FireFeatureCollection>(emptyFeatures());
  const [cells, setCells] = useState<FireCell[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [is3d, setIs3d] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobilePanelsOpen, setMobilePanelsOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<FireMapHandle | null>(null);

  const sensor = useMemo(() => {
    if (filters.modis && filters.viirs) return undefined;
    if (filters.modis) return "MODIS" as const;
    if (filters.viirs) return "VIIRS" as const;
    return null;
  }, [filters.modis, filters.viirs]);

  const query: FireQuery | null = useMemo(() => {
    if (sensor === null) return null;
    return {
      bbox: view.bbox,
      sensor,
      minConfidence: "low",
      synthetic: allSynthetic ? undefined : false,
      harmonized: filters.harmonized,
      startDate: dateRange.start,
      endDate: dateRange.end,
    };
  }, [view.bbox, sensor, filters.harmonized, dateRange.start, dateRange.end, allSynthetic]);

  useEffect(() => {
    if (!query) {
      setPoints(emptyFeatures());
      setCells([]);
      setMeta(EMPTY_META);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const aggregated = view.zoom < AGGREGATE_ZOOM;

      const request = aggregated
        ? fetchAggregate(query, view.zoom, controller.signal).then((payload) => {
            setCells(payload.cells);
            setPoints(emptyFeatures());
            setMeta({
              aggregated: true,
              shown: payload.returned_cells,
              total: payload.total_detections,
              cellDegrees: payload.cell_degrees,
              matched: payload.matched_viirs ?? 0,
              truncated: payload.truncated,
            });
          })
        : fetchFireFeatures(query, POINT_LIMIT, controller.signal).then((payload) => {
            setPoints(payload);
            setCells([]);
            setMeta({
              aggregated: false,
              shown: payload.features.length,
              total: payload.properties.total,
              cellDegrees: null,
              matched: 0,
              truncated: payload.properties.truncated,
            });
          });

      request
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : "Map request failed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, view.zoom]);

  const detail = useQuery({
    queryKey: ["observation", selectedId],
    queryFn: () => fetchObservation(selectedId as string),
    enabled: Boolean(selectedId),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void shellRef.current?.requestFullscreen?.();
    }
  }

  function toggle3d() {
    const next = !is3d;
    setIs3d(next);
    mapRef.current?.setPitch(next ? 48 : 0);
  }

  function flyTo(place: GeoPlace) {
    mapRef.current?.flyTo(place.longitude, place.latitude, place.zoom);
  }

  const data = overview.data;
  const total = data?.detections.total ?? 0;
  const modis = data?.detections.modis ?? 0;
  const viirs = data?.detections.viirs ?? 0;
  const synthetic = data?.data.synthetic_observations ?? 0;
  const hasData = total > 0;
  const online = Boolean(status?.database.connected);
  const theme = MAP_THEMES[filters.theme] ?? MAP_THEMES[DEFAULT_THEME];
  const series = analytics.data?.series ?? [];
  const activeDays = analytics.data?.totals.active_days;
  const peak = analytics.data?.peaks.detections;

  const mapStatus = query
    ? meta.aggregated
      ? `${formatCount(meta.total)} detections · ${formatCount(meta.shown)} cells`
      : `${formatCount(meta.total)} detections · points`
    : "No sensor selected";

  return (
    <div ref={shellRef} className="relative h-full min-h-[480px] w-full overflow-hidden bg-canvas">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-canvas">
            <span className="inline-flex items-center gap-2 text-xs font-light text-faint">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Initialising fire observation field…
            </span>
          </div>
        }
      >
        <FireMapCanvas
          onReady={(handle) => {
            mapRef.current = handle;
            setMapReady(true);
          }}
          points={points}
          cells={cells}
          heat={filters.heat}
          basemap={filters.basemap}
          theme={filters.theme}
          harmonized={filters.harmonized}
          onMoveEnd={setView}
          onSelectPoint={setSelectedId}
          onSelectCell={(cell) =>
            mapRef.current?.flyTo(
              cell.longitude,
              cell.latitude,
              Math.max(AGGREGATE_ZOOM, view.zoom + 1.8),
            )
          }
        />
      </Suspense>

      {/* Cinematic vignette: keeps white panel text legible over bright imagery. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 35%, rgba(8,12,17,0.35) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-28 bg-gradient-to-b from-canvas/75 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-40 bg-gradient-to-t from-canvas/85 to-transparent"
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Mission strip */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-control border border-line/[0.1] bg-canvas/55 px-[10px] py-[6px] backdrop-blur-glass">
            <StatusDot tone={online ? "ok" : "danger"} pulse={online} />
            <span className="truncate font-mono text-3xs uppercase tracking-[0.16em] text-muted">
              Global view
            </span>
            <span className="hidden text-line/25 sm:inline">/</span>
            <span className="hidden truncate font-mono text-3xs uppercase tracking-[0.16em] text-faint sm:inline">
              {theme.label} imagery
            </span>
            <span className="hidden text-line/25 md:inline">/</span>
            <span className="hidden font-mono text-3xs text-faint md:inline">{mapStatus}</span>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="hidden md:block">
              <MapSearch onSelect={flyTo} label="Search the overview map" />
            </div>
            <MapToolbar
              filters={filters}
              onChange={setFilters}
              is3d={is3d}
              onToggle3d={toggle3d}
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
              onReset={() => setFilters({ ...DEFAULT_OVERVIEW_FILTERS })}
            />
          </div>
        </div>

        {loading || !mapReady ? (
          <div className="absolute left-1/2 top-[3.4rem] -translate-x-1/2">
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-control border border-line/15 bg-panel/90 px-3 py-[6px] text-2xs font-light text-muted backdrop-blur-glass"
            >
              <Loader2 className="size-3.5 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
              {!mapReady ? "Initialising map renderer…" : "Loading fire activity…"}
            </div>
          </div>
        ) : null}

        {/* Left: global activity */}
        <div className="absolute left-3 top-[3.4rem] hidden w-[276px] flex-col gap-2 lg:flex">
          <GlassPanel
            title="Global activity"
            eyebrow="Stored detections"
            actions={<Badge tone={hasData ? "ok" : "warn"}>{hasData ? "data present" : "empty"}</Badge>}
          >
            <SyntheticBanner count={synthetic} total={total} />
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="label text-[9px]">Detections in period</div>
                <div className="metric-value mt-[5px]">{formatCount(total)}</div>
                <div className="mt-[4px] font-mono text-3xs text-faint">
                  {formatCount(modis)} MODIS · {formatCount(viirs)} VIIRS
                </div>
              </div>
              <Link
                to="/map"
                className="inline-flex items-center gap-1 text-3xs uppercase tracking-[0.1em] text-accent transition-colors hover:text-ink"
              >
                Map
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </div>

            <div className="mt-[12px] grid grid-cols-2 gap-x-4 gap-y-[10px] border-t border-line/[0.07] pt-[10px]">
              <div>
                <div className="label text-[9px]">Match pairs</div>
                <div className="mt-[3px] font-mono text-[15px] text-ink">
                  {formatCount(data?.matches.total)}
                </div>
              </div>
              <div>
                <div className="label text-[9px]">Events</div>
                <div className="mt-[3px] font-mono text-[15px] text-ink">
                  {formatCount(data?.events)}
                </div>
              </div>
              <div>
                <div className="label text-[9px]">FRP sum</div>
                <div className="mt-[3px] font-mono text-[15px] text-ink">
                  {hasData ? formatFrp(data?.detections.frp_mw) : "—"}
                </div>
              </div>
              <div>
                <div className="label text-[9px]">Active days</div>
                <div className="mt-[3px] font-mono text-[15px] text-ink">
                  {analytics.isLoading ? "—" : formatCount(activeDays ?? 0)}
                </div>
              </div>
            </div>

            <div className="mt-[10px] border-t border-line/[0.07] pt-[9px]">
              <AssociationChart series={matchSeries.data} loading={matchSeries.isLoading} />
            </div>

            <p className="mt-[8px] border-t border-line/[0.07] pt-[8px] text-3xs font-light leading-relaxed text-faint">
              {data?.note ??
                "Counts are satellite thermal detections, not fires. FRP sums are reported in MW."}
            </p>
          </GlassPanel>
        </div>

        {/* Right: sensor network and data quality */}
        <div className="absolute right-3 top-[3.4rem] hidden w-[286px] flex-col gap-2 lg:flex">
          <GlassPanel
            title="Sensor network"
            eyebrow="MODIS · VIIRS"
            actions={
              <span className="inline-flex items-center gap-1.5 font-mono text-3xs uppercase tracking-[0.1em] text-muted">
                <StatusDot tone={online ? "ok" : "danger"} />
                {online ? "linked" : "down"}
              </span>
            }
          >
            <SensorRow
              name="MODIS"
              colour={theme.sensor.MODIS}
              count={modis}
              total={total}
            />
            <div className="h-px bg-line/[0.07]" />
            <SensorRow
              name="VIIRS"
              colour={theme.sensor.VIIRS}
              count={viirs}
              total={total}
            />

            <div className="mt-[8px] border-t border-line/[0.07] pt-[8px]">
              <DataLine
                label="Freshness"
                value={(status?.data.freshness ?? "unknown").replace("_", " ")}
                tone={
                  status?.data.freshness === "current"
                    ? "ok"
                    : status?.data.freshness === "stale"
                      ? "danger"
                      : "warn"
                }
              />
              <DataLine label="Last observation" value={formatDateTimeUtc(status?.data.last_observation_at ?? null)} />
              <DataLine
                label="Missing dates"
                value={formatCount(status?.data.missing_dates)}
                tone={(status?.data.missing_dates ?? 0) > 0 ? "warn" : "muted"}
              />
              <DataLine
                label="Store"
                value={status?.database.dialect ?? "—"}
                tone={online ? "ok" : "danger"}
              />
            </div>

            <p className="mt-[8px] text-3xs font-light leading-relaxed text-faint">
              {status?.data.freshness_reason ?? "Freshness is unknown until the API responds."}
            </p>
          </GlassPanel>

          {selectedId ? (
            <HotspotPanel
              observation={detail.data ?? null}
              loading={detail.isLoading}
              error={detail.isError ? "Could not load this detection." : null}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </div>

        {/* Bottom centre: temporal explorer */}
        <div className="absolute bottom-3 left-1/2 hidden w-[min(580px,calc(100%-32px))] -translate-x-1/2 lg:block">
          <GlassPanel
            title="Temporal activity"
            eyebrow="Selected period · UTC"
            actions={
              <Badge tone="neutral">
                {series.length > 0 ? `${series.length} days` : "no series"}
              </Badge>
            }
          >
            <ActivityTimeline
              series={series}
              start={dateRange.start}
              end={dateRange.end}
              preset={dateRange.preset}
              onPreset={setPreset}
              activeDays={activeDays}
              peak={peak}
              loading={analytics.isLoading}
            />
          </GlassPanel>
        </div>

        {/* Bottom left: coverage / link */}
        <div className="absolute bottom-3 left-3 hidden items-center gap-2 rounded-control border border-line/[0.1] bg-canvas/55 px-[9px] py-[5px] font-mono text-3xs uppercase tracking-[0.1em] text-faint backdrop-blur-glass xl:flex">
          <Radio className="size-3 text-accent" aria-hidden />
          {formatCount(status?.data.sources_registered)} sources ·{" "}
          {formatCount(status?.data.observations_stored)} stored
        </div>

        {/* Mobile summary and panel sheet */}
        <div className="absolute inset-x-3 bottom-3 lg:hidden">
          <div className="glass-panel grid grid-cols-3 gap-2 px-3 py-2">
            <div>
              <div className="label text-[9px]">Detections</div>
              <div className="mt-[2px] font-mono text-[15px] text-ink">{formatCount(total)}</div>
            </div>
            <div>
              <div className="label text-[9px]">Events</div>
              <div className="mt-[2px] font-mono text-[15px] text-ink">{formatCount(data?.events)}</div>
            </div>
            <div>
              <div className="label text-[9px]">FRP</div>
              <div className="mt-[2px] font-mono text-[15px] text-ink">
                {hasData ? formatFrp(data?.detections.frp_mw) : "—"}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobilePanelsOpen(true)}
          aria-expanded={mobilePanelsOpen}
          className="pointer-events-auto absolute bottom-[86px] right-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-control border border-line/15 bg-panel/90 px-2.5 text-2xs font-medium text-muted backdrop-blur-glass lg:hidden"
        >
          <PanelRightOpen className="size-3.5 text-accent" aria-hidden />
          Panels
        </button>

        {mobilePanelsOpen ? (
          <div className="pointer-events-auto absolute inset-0 z-40 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePanelsOpen(false)}
              aria-label="Close mission panels"
              className="absolute inset-0 bg-black/70"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto border-t border-line/[0.1] bg-canvas/95 px-3 pb-4 pt-2 backdrop-blur-glass">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Mission panels</span>
                <button
                  type="button"
                  onClick={() => setMobilePanelsOpen(false)}
                  aria-label="Close mission panels"
                  className="rounded-control p-1.5 text-faint hover:bg-line/[0.06] hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div className="space-y-2">
                <GlassPanel title="Global activity" eyebrow="Stored detections">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-[8px]">
                    <div>
                      <div className="label text-[9px]">Detections</div>
                      <div className="mt-[2px] font-mono text-[17px] text-ink">
                        {formatCount(total)}
                      </div>
                    </div>
                    <div>
                      <div className="label text-[9px]">Match pairs</div>
                      <div className="mt-[2px] font-mono text-[17px] text-ink">
                        {formatCount(data?.matches.total)}
                      </div>
                    </div>
                    <div>
                      <div className="label text-[9px]">Events</div>
                      <div className="mt-[2px] font-mono text-[17px] text-ink">
                        {formatCount(data?.events)}
                      </div>
                    </div>
                    <div>
                      <div className="label text-[9px]">FRP sum</div>
                      <div className="mt-[2px] font-mono text-[17px] text-ink">
                        {hasData ? formatFrp(data?.detections.frp_mw) : "—"}
                      </div>
                    </div>
                  </div>
                </GlassPanel>

                <GlassPanel
                  title="Cross-sensor associations"
                  eyebrow="VIIRS matched to MODIS"
                >
                  <AssociationChart series={matchSeries.data} loading={matchSeries.isLoading} />
                </GlassPanel>

                <GlassPanel title="Sensor network" eyebrow="MODIS · VIIRS">
                  <SensorRow name="MODIS" colour={theme.sensor.MODIS} count={modis} total={total} />
                  <div className="h-px bg-line/[0.07]" />
                  <SensorRow name="VIIRS" colour={theme.sensor.VIIRS} count={viirs} total={total} />
                  <div className="mt-[6px] border-t border-line/[0.07] pt-[6px]">
                    <DataLine
                      label="Freshness"
                      value={(status?.data.freshness ?? "unknown").replace("_", " ")}
                      tone={status?.data.freshness === "current" ? "ok" : "warn"}
                    />
                    <DataLine
                      label="Last observation"
                      value={formatDateTimeUtc(status?.data.last_observation_at ?? null)}
                    />
                  </div>
                </GlassPanel>

                <GlassPanel title="Temporal activity" eyebrow="Selected period · UTC">
                  <ActivityTimeline
                    series={series}
                    start={dateRange.start}
                    end={dateRange.end}
                    preset={dateRange.preset}
                    onPreset={setPreset}
                    activeDays={activeDays}
                    peak={peak}
                    loading={analytics.isLoading}
                  />
                </GlassPanel>
              </div>
            </div>
          </div>
        ) : null}

        {error || statusError || overview.isError ? (
          <div className="absolute left-1/2 top-[5.6rem] w-[min(440px,calc(100%-24px))] -translate-x-1/2">
            <div className="flex items-start gap-2 rounded-control border border-danger/30 bg-panel/95 px-3 py-2 text-2xs font-light text-danger backdrop-blur-glass">
              <AlertTriangle className="mt-[1px] size-3.5 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">The API is not reachable.</p>
                <p className="mt-[1px] text-danger/80">
                  Every figure on this page is withheld rather than guessed.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {!overview.isLoading && !hasData && !overview.isError ? (
          <div className="absolute left-1/2 top-1/2 w-[min(360px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2">
            <div className="glass-panel px-4 py-4 text-center">
              <Satellite className="mx-auto size-5 text-faint" aria-hidden />
              <p className="mt-2 text-xs font-medium text-ink">No fire activity to display</p>
              <p className="mt-1 text-2xs font-light leading-relaxed text-muted">
                The pipeline is empty for this period. Hermes reports the empty state instead of
                inventing a map.
              </p>
              <Link
                to="/settings"
                className="mt-3 inline-flex items-center gap-1 text-3xs uppercase tracking-[0.1em] text-accent hover:text-ink"
              >
                Inspect sources
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* Attribution and the honesty contract, kept in the reading order. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden justify-center pb-[2px] lg:flex">
        <p className="pointer-events-auto rounded-tag bg-canvas/60 px-2 py-[2px] font-mono text-3xs text-faint">
          {theme.attribution} · Detections © NASA FIRMS · thermal anomalies, not confirmed
          fires
        </p>
      </div>

      <span className="sr-only">
        <ShieldCheck aria-hidden /> Hermes fire observation intelligence overview
      </span>
    </div>
  );
}
