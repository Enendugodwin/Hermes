import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderApp } from "@/test/render";
import { installFetchMock } from "@/test/fixtures";
import {
  AGGREGATE_ZOOM,
  cellsToFeatureCollection,
  frpColorExpression,
  provenanceRows,
  sensorTotals,
  useAggregate,
} from "@/components/map/fireLayers";
import type { FireCell } from "@/lib/mapApi";
import type { Observation } from "@/types/api";
import {
  DEFAULT_THEME,
  MAP_THEMES,
  THEME_ORDER,
  buildBasemapLayer,
  buildLabelsLayer,
  buildMapStyle,
} from "@/components/map/mapStyle";

// MapLibre needs WebGL; the layer/expression logic above is pure and the page is
// verified with a stub map so the UI contract can be tested without a GPU.
vi.mock("maplibre-gl", () => {
  class MapStub {
    on() {
      return this;
    }
    addControl() {
      return this;
    }
    addSource() {
      return this;
    }
    addLayer() {
      return this;
    }
    getLayer(id: string) {
      return { id };
    }
    setPaintProperty() {
      return this;
    }
    getSource() {
      return { setData: () => undefined };
    }
    setLayoutProperty() {
      return this;
    }
    getBounds() {
      return {
        getWest: () => -20,
        getSouth: () => -10,
        getEast: () => 30,
        getNorth: () => 25,
      };
    }
    getZoom() {
      return 3;
    }
    getCanvas() {
      return { style: { cursor: "" } };
    }
    flyTo() {
      return this;
    }
    remove() {
      return undefined;
    }
  }

  return {
    default: {
      Map: MapStub,
      NavigationControl: class {},
      ScaleControl: class {},
      GeoJSONSource: class {},
    },
  };
});

const CELLS: FireCell[] = [
  {
    longitude: 8.7,
    latitude: 9.1,
    count: 420,
    modis: 41,
    viirs: 379,
    max_frp_mw: 52.4,
    latest_acquired_at: "2026-10-30T19:49:00Z",
  },
];

const OBSERVATION: Observation = {
  id: "obs-1",
  source_code: "VIIRS_SNPP_NRT",
  source_record_id: "abc123",
  sensor: "VIIRS",
  satellite: "Suomi-NPP",
  latitude: 9.0612,
  longitude: 7.4951,
  acquired_at: "2026-10-30T12:41:00Z",
  confidence_raw: null,
  confidence_category: "nominal",
  brightness_temperature: 331.2,
  brightness_channel: "viirs_bright_ti4_4um",
  frp_mw: 8.42,
  scan_km: 0.375,
  track_km: 0.375,
  daynight: "D",
  processing_version: "2.0NRT",
  source_product: "VIIRS_SNPP_NRT",
  quality_flags: { normalizer: "normalize-v1", suspected_non_fire: false },
  is_synthetic: false,
};

beforeEach(() => {
  installFetchMock({
    map: {
      cells: {
        cells: CELLS,
        cell_degrees: 1.40625,
        zoom: 3,
        total_detections: 420,
        returned_cells: 1,
        truncated: false,
        bbox: [-20, -10, 30, 25],
      },
      observation: OBSERVATION,
    },
  });
});

describe("map layer helpers", () => {
  it("switches to aggregation below the zoom threshold", () => {
    expect(useAggregate(0)).toBe(true);
    expect(useAggregate(AGGREGATE_ZOOM - 1)).toBe(true);
    expect(useAggregate(AGGREGATE_ZOOM)).toBe(false);
  });

  it("converts cells into map features without losing counts", () => {
    const collection = cellsToFeatureCollection(CELLS);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]!.properties).toMatchObject({
      count: 420,
      modis: 41,
      viirs: 379,
    });
    expect(collection.features[0]!.geometry.coordinates).toEqual([8.7, 9.1]);
  });

  it("uses the fire severity palette for FRP", () => {
    const expression = JSON.stringify(frpColorExpression());
    expect(expression).toContain("#FFB45C");
    expect(expression).toContain("#F28A43");
    expect(expression).toContain("#E65C50");
  });

  it("recolours detections for brighter themes", () => {
    const light = JSON.stringify(frpColorExpression(MAP_THEMES.daylight.fire));
    const dark = JSON.stringify(frpColorExpression(MAP_THEMES.orbital.fire));

    expect(light).toContain("#B91C1C");
    expect(light).not.toContain("#FFB45C");
    expect(dark).toContain("#FFB45C");
  });

  it("defaults to detailed satellite imagery with place labels", () => {
    expect(DEFAULT_THEME).toBe("satellite");
    expect(THEME_ORDER).toContain("orbital");
    expect(THEME_ORDER).toContain("bluemarble");

    const satelliteBasemap = buildBasemapLayer(MAP_THEMES.satellite).paint as Record<string, unknown>;
    const lightBasemap = buildBasemapLayer(MAP_THEMES.daylight).paint as Record<string, unknown>;
    const darkBasemap = buildBasemapLayer(MAP_THEMES.orbital).paint as Record<string, unknown>;
    const labels = buildLabelsLayer(MAP_THEMES.satellite).paint as Record<string, unknown>;

    expect(MAP_THEMES.satellite.tiles[0]).toContain("arcgisonline.com");
    expect(MAP_THEMES.bluemarble.tiles[0]).toContain("gibs.earthdata.nasa.gov");
    expect(MAP_THEMES.satellite.labels?.tiles[0]).toContain(
      "World_Boundaries_and_Places",
    );
    expect(MAP_THEMES.satellite.maxzoom).toBeGreaterThanOrEqual(18);
    expect(labels["raster-opacity"]).toBeGreaterThan(0.5);
    expect(satelliteBasemap["raster-opacity"]).toBe(1);
    expect(lightBasemap["raster-opacity"]).toBe(1);
    expect(lightBasemap["raster-brightness-max"]).toBe(1);
    expect(darkBasemap["raster-brightness-max"]).toBeLessThan(0.5);
    expect(buildMapStyle(MAP_THEMES.satellite).layers[0]).toMatchObject({
      id: "background",
      paint: { "background-color": MAP_THEMES.satellite.background },
    });
  });

  it("counts sensors in the current feature set", () => {
    const totals = sensorTotals([
      {
        type: "Feature",
        id: "a",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          id: "a",
          sensor: "MODIS",
          satellite: "Terra",
          acquired_at: "2026-10-30T00:00:00Z",
          confidence: "high",
          frp_mw: 4,
          daynight: "D",
          source: "MODIS_NRT",
          synthetic: false,
        },
      },
      {
        type: "Feature",
        id: "b",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          id: "b",
          sensor: "VIIRS",
          satellite: "Suomi-NPP",
          acquired_at: "2026-10-30T00:00:00Z",
          confidence: "nominal",
          frp_mw: 2,
          daynight: "N",
          source: "VIIRS_SNPP_NRT",
          synthetic: false,
        },
      },
    ]);

    expect(totals).toEqual({ modis: 1, viirs: 1 });
  });

  it("exposes full provenance for a detection", () => {
    const rows = provenanceRows(OBSERVATION);
    const labels = rows.map((row) => row.label);

    expect(labels).toContain("Coordinates");
    expect(labels).toContain("Acquired (UTC)");
    expect(labels).toContain("Brightness");
    expect(labels).toContain("Record id");
    expect(rows.find((row) => row.label === "Record id")?.value).toBe("abc123");
    // The panel must never call a detection a fire.
    expect(JSON.stringify(rows).toLowerCase()).not.toContain("confirmed fire");
  });
});

describe("fire map page", () => {
  it("renders filters, legend and an aggregated status line", async () => {
    renderApp("/map");

    expect(await screen.findByText(/layers & filters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/search the map/i)).toBeInTheDocument();
    // NASA satellite imagery is the default; the dark theme remains one click away.
    expect(screen.getByRole("button", { name: /satellite/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /orbital/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await waitFor(() => {
      expect(screen.getByText(/420 detections/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/aggregated/i).length).toBeGreaterThan(0);
  });

  it("switches map themes from the layer panel", async () => {
    renderApp("/map");

    const orbital = await screen.findByRole("button", { name: /orbital/i });
    fireEvent.click(orbital);

    expect(orbital).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /satellite/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("searches the gazetteer and jumps to the best match", async () => {
    const fetchMock = installFetchMock();
    renderApp("/map");

    const input = await screen.findByLabelText(/search the map/i);
    fireEvent.change(input, { target: { value: "Nigeria" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("/api/v1/geo/search"))).toBe(true);
    });
  });

  it("states that cells are detections, not fires", async () => {
    renderApp("/map");

    expect(
      (await screen.findAllByText(/detections are thermal anomalies, not fires/i)).length,
    ).toBeGreaterThan(0);
  });

  it("toggles the harmonized map view", async () => {
    const fetchMock = installFetchMock();
    renderApp("/map");

    const toggle = await screen.findByRole("button", { name: /^harmonized$/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls.some((url) => url.includes("harmonized=true"))).toBe(true);
    });
  });
});
