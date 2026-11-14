import clsx from "clsx";
import {
  Box,
  Layers3,
  Maximize2,
  Minimize2,
  RotateCcw,
  ScanLine,
} from "lucide-react";

import { Popover } from "@/components/ui/Popover";
import {
  DEFAULT_THEME,
  MAP_THEMES,
  THEME_ORDER,
  type MapThemeId,
} from "@/components/map/mapStyle";

export interface OverviewMapFilters {
  theme: MapThemeId;
  modis: boolean;
  viirs: boolean;
  heat: boolean;
  basemap: boolean;
  harmonized: boolean;
}

export const DEFAULT_OVERVIEW_FILTERS: OverviewMapFilters = {
  theme: DEFAULT_THEME,
  modis: true,
  viirs: true,
  heat: true,
  basemap: true,
  harmonized: false,
};

const toolButton =
  "inline-flex size-8 items-center justify-center rounded-control border border-line/10 bg-panel/80 text-muted transition-colors duration-150 hover:border-line/20 hover:text-ink";
const toolActive =
  "border-accent/40 bg-accent/10 text-accent";

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-control px-1 py-[5px] text-2xs font-light text-muted transition-colors hover:bg-line/[0.04]">
      {children}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 rounded border-line/40 bg-transparent accent-[#F28A43]"
      />
    </label>
  );
}

export function MapToolbar({
  filters,
  onChange,
  is3d,
  onToggle3d,
  fullscreen,
  onToggleFullscreen,
  onReset,
}: {
  filters: OverviewMapFilters;
  onChange: (next: OverviewMapFilters) => void;
  is3d: boolean;
  onToggle3d: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onReset: () => void;
}) {
  function patch(next: Partial<OverviewMapFilters>) {
    onChange({ ...filters, ...next });
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-control border border-line/[0.1] bg-canvas/55 p-1 backdrop-blur-glass">
      <button
        type="button"
        onClick={onToggle3d}
        aria-pressed={is3d}
        title={is3d ? "Switch to 2D view" : "Switch to 3D view"}
        className={clsx(toolButton, is3d && toolActive)}
      >
        <Box className="size-[15px]" aria-hidden />
        <span className="sr-only">3D</span>
      </button>

      <Popover
        label="Map layers and filters"
        widthClass="w-[17rem]"
        trigger={({ open, toggle, id }) => (
          <button
            type="button"
            id={id}
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="dialog"
            title="Layers and filters"
            className={clsx(toolButton, open && "border-line/25 text-ink")}
          >
            <Layers3 className="size-[15px]" aria-hidden />
            <span className="sr-only">Layers and filters</span>
          </button>
        )}
      >
        {() => (
          <div className="p-[12px]">
            <div className="mb-[8px] flex items-center justify-between">
              <span className="label">Imagery</span>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1 text-3xs uppercase tracking-[0.1em] text-faint hover:text-muted"
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-[5px]">
              {THEME_ORDER.map((id) => {
                const theme = MAP_THEMES[id];
                const active = filters.theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    title={theme.hint}
                    onClick={() => patch({ theme: id })}
                    className={clsx(
                      "flex items-center gap-[6px] rounded-control border px-[6px] py-[5px] text-3xs transition-colors",
                      active
                        ? "border-accent/40 bg-accent/[0.08] text-ink"
                        : "border-line/10 text-muted hover:border-line/20 hover:text-ink",
                    )}
                  >
                    <span
                      className="size-3 shrink-0 rounded-[2px] border border-line/20"
                      style={{
                        background: `linear-gradient(135deg, ${theme.swatch[0]} 0%, ${theme.swatch[1]} 100%)`,
                      }}
                      aria-hidden
                    />
                    {theme.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-[10px] border-t border-line/[0.07] pt-[6px]">
              <span className="label">Sensors</span>
              <Toggle checked={filters.modis} onChange={(modis) => patch({ modis })}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: MAP_THEMES[filters.theme].sensor.MODIS }}
                  />
                  MODIS
                </span>
              </Toggle>
              <Toggle checked={filters.viirs} onChange={(viirs) => patch({ viirs })}>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: MAP_THEMES[filters.theme].sensor.VIIRS }}
                  />
                  VIIRS
                </span>
              </Toggle>
            </div>

            <div className="mt-[6px] border-t border-line/[0.07] pt-[6px]">
              <Toggle checked={filters.heat} onChange={(heat) => patch({ heat })}>
                Density heatmap
              </Toggle>
              <Toggle checked={filters.basemap} onChange={(basemap) => patch({ basemap })}>
                Imagery basemap
              </Toggle>
              <Toggle
                checked={filters.harmonized}
                onChange={(harmonized) => patch({ harmonized })}
              >
                Harmonised view
              </Toggle>
            </div>

            <p className="mt-[8px] border-t border-line/[0.07] pt-[8px] text-3xs font-light leading-relaxed text-faint">
              Harmonised removes VIIRS detections already associated with MODIS. The map never
              presents a detection as a confirmed fire.
            </p>
          </div>
        )}
      </Popover>

      <button
        type="button"
        onClick={() => patch({ harmonized: !filters.harmonized })}
        aria-pressed={filters.harmonized}
        title="Show the harmonised view"
        className={clsx(toolButton, "w-auto gap-1.5 px-2", filters.harmonized && toolActive)}
      >
        <ScanLine className="size-[15px]" aria-hidden />
        <span className="hidden font-mono text-3xs uppercase tracking-[0.1em] sm:inline">Harmonised</span>
      </button>

      <button
        type="button"
        onClick={onToggleFullscreen}
        title={fullscreen ? "Exit full screen" : "Full screen map"}
        className={toolButton}
      >
        {fullscreen ? (
          <Minimize2 className="size-[15px]" aria-hidden />
        ) : (
          <Maximize2 className="size-[15px]" aria-hidden />
        )}
        <span className="sr-only">{fullscreen ? "Exit full screen" : "Full screen map"}</span>
      </button>
    </div>
  );
}
