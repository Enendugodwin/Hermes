import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { useUiStore } from "@/store/ui";

/**
 * MapLibre needs WebGL, which jsdom does not provide. The map is exercised
 * through its pure layer helpers and a stubbed renderer; page contracts remain
 * testable without a GPU.
 */
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
      return { setData: () => undefined, setTiles: () => undefined };
    }
    setLayoutProperty() {
      return this;
    }
    getBounds() {
      return {
        getWest: () => -180,
        getSouth: () => -85,
        getEast: () => 180,
        getNorth: () => 85,
      };
    }
    getZoom() {
      return 2;
    }
    getCanvas() {
      return { style: { cursor: "" } };
    }
    flyTo() {
      return this;
    }
    easeTo() {
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

beforeEach(() => {
  // Deterministic period: fixtures live around 2026-10-29.
  useUiStore.setState({
    dateRange: { preset: "7d", start: "2026-10-29", end: "2026-11-04" },
  });
  // Page tests exercise the workspace, not the first-load sequence; boot tests
  // clear this flag to run the real staged screen.
  window.sessionStorage.setItem("hermes.boot.v1", "done");
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

// jsdom logs a "Not implemented" error for canvas contexts, which Vitest treats
// as an unhandled error. The app already degrades gracefully without 2D.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});
