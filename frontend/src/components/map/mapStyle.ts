import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Self-contained styles. The fire layers live in their own zero-dependency base
 * style; the imagery basemap is attached afterwards so a slow, rate-limited or
 * blocked tile server can never stop the data from loading.
 */

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const GIBS_TILES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/500m/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

export const BASEMAP_SOURCE = "basemap";
export const BASEMAP_LAYER = "basemap";

export type MapThemeId = "satellite" | "terrain" | "orbital" | "paper" | "daylight";

export interface MapTheme {
  id: MapThemeId;
  /** Label shown in the layer panel. */
  label: string;
  /** One-line description used as the option hint. */
  hint: string;
  /** Fallback fill when the basemap is off or its tiles fail. */
  background: string;
  /** Raster tiles for this context layer. */
  tiles: string[];
  attribution: string;
  maxzoom: number;
  basemap: {
    opacity: number;
    saturation: number;
    contrast: number;
    brightnessMin: number;
    brightnessMax: number;
    hueRotate: number;
  };
  /** Detection colours, stepped by FRP (points) and by density (cells). */
  fire: { low: string; medium: string; high: string };
  /** Sensor outline colours, tuned for the theme's contrast. */
  sensor: { MODIS: string; VIIRS: string };
  stroke: string;
  strokeWidth: number;
  cellOpacity: number;
  heat: {
    low: string;
    mid: string;
    high: string;
    top: string;
    opacity: number;
    intensity: number;
  };
  /** Two stops used to preview the theme in the picker. */
  swatch: [string, string];
}

const FIRE = { low: "#FFB45C", medium: "#F28A43", high: "#E65C50" };
const SENSOR = { MODIS: "#6FA8FF", VIIRS: "#C58CFF" };
const HEAT = {
  low: "rgba(255,180,92,0.32)",
  mid: "rgba(242,138,67,0.66)",
  high: "rgba(230,92,80,0.88)",
  top: "rgba(255,236,218,0.95)",
  opacity: 0.62,
  intensity: 2.1,
};

/**
 * Satellite is the default: NASA GIBS Blue Marble gives Hermes an authentic
 * Earth-observation field without an API key. The lighter themes remain for
 * daylight and print work.
 */
export const MAP_THEMES: Record<MapThemeId, MapTheme> = {
  satellite: {
    id: "satellite",
    label: "Satellite",
    hint: "NASA Blue Marble imagery, dark mission field",
    background: "#080C11",
    tiles: [GIBS_TILES],
    attribution: "Imagery \u00a9 NASA EOSDIS GIBS",
    maxzoom: 8,
    basemap: {
      opacity: 0.92,
      saturation: 0.7,
      contrast: 0.06,
      brightnessMin: 0.02,
      brightnessMax: 0.86,
      hueRotate: 0,
    },
    fire: FIRE,
    sensor: SENSOR,
    stroke: "rgba(232,237,242,0.55)",
    strokeWidth: 1.1,
    cellOpacity: 0.68,
    heat: HEAT,
    swatch: ["#0B1118", "#2B4A5E"],
  },
  terrain: {
    id: "terrain",
    label: "Terrain",
    hint: "Warm, sepia-toned land",
    background: "#D8CFB8",
    tiles: [OSM_TILES],
    attribution: "\u00a9 OpenStreetMap contributors",
    maxzoom: 19,
    basemap: {
      opacity: 1,
      saturation: 0.25,
      contrast: 0.02,
      brightnessMin: 0,
      brightnessMax: 1,
      hueRotate: 20,
    },
    fire: { low: "#92400E", medium: "#C2410C", high: "#7F1D1D" },
    sensor: { MODIS: "#1E3A8A", VIIRS: "#A21CAF" },
    stroke: "rgba(255,255,255,0.96)",
    strokeWidth: 1.7,
    cellOpacity: 0.6,
    heat: {
      low: "rgba(253,224,71,0.4)",
      mid: "rgba(194,65,12,0.65)",
      high: "rgba(127,29,29,0.85)",
      top: "rgba(90,20,20,0.92)",
      opacity: 0.6,
      intensity: 1.7,
    },
    swatch: ["#E3EBD8", "#8FA877"],
  },
  orbital: {
    id: "orbital",
    label: "Orbital",
    hint: "Dark field for night operations",
    background: "#05080D",
    tiles: [OSM_TILES],
    attribution: "\u00a9 OpenStreetMap contributors",
    maxzoom: 19,
    basemap: {
      opacity: 0.35,
      saturation: -1,
      contrast: 0.05,
      brightnessMin: 0.02,
      brightnessMax: 0.14,
      hueRotate: 0,
    },
    fire: FIRE,
    sensor: SENSOR,
    stroke: "rgba(232,237,242,0.5)",
    strokeWidth: 1,
    cellOpacity: 0.6,
    heat: HEAT,
    swatch: ["#05080D", "#1B2631"],
  },
  paper: {
    id: "paper",
    label: "Paper",
    hint: "Near-white, for screenshots and print",
    background: "#F2F0EA",
    tiles: [OSM_TILES],
    attribution: "\u00a9 OpenStreetMap contributors",
    maxzoom: 19,
    basemap: {
      opacity: 1,
      saturation: -0.85,
      contrast: 0,
      brightnessMin: 0,
      brightnessMax: 1,
      hueRotate: 0,
    },
    fire: { low: "#A16207", medium: "#C2410C", high: "#991B1B" },
    sensor: { MODIS: "#1E40AF", VIIRS: "#A21CAF" },
    stroke: "rgba(17,24,39,0.6)",
    strokeWidth: 1.1,
    cellOpacity: 0.6,
    heat: {
      low: "rgba(202,138,4,0.3)",
      mid: "rgba(194,65,12,0.55)",
      high: "rgba(153,27,27,0.75)",
      top: "rgba(120,20,20,0.85)",
      opacity: 0.5,
      intensity: 1.5,
    },
    swatch: ["#FBFAF6", "#C9C4B6"],
  },
  daylight: {
    id: "daylight",
    label: "Daylight",
    hint: "Bright earth, deep detection colours",
    background: "#A9C3D4",
    tiles: [OSM_TILES],
    attribution: "\u00a9 OpenStreetMap contributors",
    maxzoom: 19,
    basemap: {
      opacity: 1,
      saturation: 0.35,
      contrast: 0.02,
      brightnessMin: 0,
      brightnessMax: 1,
      hueRotate: 0,
    },
    fire: { low: "#B45309", medium: "#EA580C", high: "#B91C1C" },
    sensor: { MODIS: "#1D4ED8", VIIRS: "#A21CAF" },
    stroke: "rgba(255,255,255,0.95)",
    strokeWidth: 1.6,
    cellOpacity: 0.55,
    heat: {
      low: "rgba(250,204,21,0.35)",
      mid: "rgba(234,88,12,0.6)",
      high: "rgba(153,27,27,0.8)",
      top: "rgba(120,20,20,0.9)",
      opacity: 0.55,
      intensity: 1.6,
    },
    swatch: ["#DCE8F0", "#7FA3BC"],
  },
};

export const DEFAULT_THEME: MapThemeId = "satellite";

export const THEME_ORDER: MapThemeId[] = [
  "satellite",
  "terrain",
  "orbital",
  "paper",
  "daylight",
];

export function buildMapStyle(theme: MapTheme = MAP_THEMES[DEFAULT_THEME]): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": theme.background },
      },
    ],
  };
}

export function buildBasemapSource(theme: MapTheme = MAP_THEMES[DEFAULT_THEME]) {
  return {
    type: "raster" as const,
    tiles: theme.tiles,
    tileSize: 256,
    maxzoom: theme.maxzoom,
    attribution: theme.attribution,
  };
}

/** Context imagery; the paint is re-applied whenever the theme changes. */
export function buildBasemapLayer(theme: MapTheme): LayerSpecification {
  return {
    id: BASEMAP_LAYER,
    type: "raster",
    source: BASEMAP_SOURCE,
    paint: {
      "raster-opacity": theme.basemap.opacity,
      "raster-saturation": theme.basemap.saturation,
      "raster-contrast": theme.basemap.contrast,
      "raster-brightness-min": theme.basemap.brightnessMin,
      "raster-brightness-max": theme.basemap.brightnessMax,
      "raster-hue-rotate": theme.basemap.hueRotate,
    },
  };
}

export const EMPTY_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [],
};
