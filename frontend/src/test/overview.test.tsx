import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderApp } from "@/test/render";
import { installFetchMock, makeStatus } from "@/test/fixtures";
import type { AnalyticsResponse } from "@/lib/analyticsApi";
import type { DashboardOverview } from "@/types/api";

const DASHBOARD: DashboardOverview = {
  period: { start_date: "2026-10-29", end_date: "2026-11-04" },
  detections: { total: 9, modis: 5, viirs: 4, frp_mw: 105.3 },
  matches: { total: 5, probable: 1, possible: 2 },
  events: 2,
  scope: { bbox: [2.5, 4, 14.7, 13.9], start_date: "2026-10-29", end_date: "2026-10-30" },
  data: makeStatus({ observations_stored: 9, synthetic_observations: 9 }).data,
  note: "Counts are satellite thermal detections, not the number of fires.",
};

const ANALYTICS: AnalyticsResponse = {
  start_date: "2026-10-29",
  end_date: "2026-11-04",
  totals: {
    detections: 9,
    modis: 5,
    viirs: 4,
    frp_sum_mw: 105.3,
    frp_max_mw: 42.1,
    high_confidence: 3,
    active_days: 3,
    days: 7,
    mean_daily_detections: 1.3,
  },
  series: [
    { date: "2026-10-29", detections: 4, modis: 2, viirs: 2, frp_sum_mw: 40 },
    { date: "2026-10-30", detections: 3, modis: 2, viirs: 1, frp_sum_mw: 35 },
    { date: "2026-10-31", detections: 2, modis: 1, viirs: 1, frp_sum_mw: 30 },
  ],
  top_cells: [],
  cell_degrees: 2,
  peaks: { detections: { date: "2026-10-29", detections: 4 }, frp: { date: "2026-10-29", frp_mw: 42.1 } },
  confidence: { high: 3, nominal: 4, low: 2, unknown: 0 },
  daynight: { D: 6, N: 3, unknown: 0 },
  satellites: [],
  products: [],
  synthetic_detections: 9,
  notes: ["Counts are thermal detections, not fires."],
};

let fetchMock: ReturnType<typeof installFetchMock>;

beforeEach(() => {
  fetchMock = installFetchMock({
    dashboard: DASHBOARD,
    analytics: ANALYTICS,
    status: makeStatus({
      observations_stored: 9,
      synthetic_observations: 9,
      last_observation_at: "2026-10-30T12:41:00Z",
    }),
  });
});

describe("hermes overview", () => {
  it("renders the map-first mission workspace with real aggregates", async () => {
    renderApp("/");

    expect(await screen.findByText(/global activity/i)).toBeInTheDocument();
    expect(screen.getByText(/sensor network/i)).toBeInTheDocument();
    expect(screen.getByText(/temporal activity/i)).toBeInTheDocument();
    expect(await screen.findByText("5 MODIS · 4 VIIRS")).toBeInTheDocument();
    expect(await screen.findByText(/demo data only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/search the overview map/i)).toBeInTheDocument();
  });

  it("shows the daily series and active-day count from the analytics API", async () => {
    renderApp("/");

    expect((await screen.findAllByText(/active days/i)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByLabelText(/daily detections in the selected period/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/2026-10-29/i).length).toBeGreaterThan(0);
  });

  it("toggles the 2D/3D camera without leaving the workspace", async () => {
    renderApp("/");

    const toggle = await screen.findByRole("button", { name: /^3d$/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the layer controls and switches imagery", async () => {
    renderApp("/");

    fireEvent.click(await screen.findByRole("button", { name: /layers and filters/i }));
    const orbital = await screen.findByRole("button", { name: /orbital/i });
    fireEvent.click(orbital);
    expect(orbital).toHaveAttribute("aria-pressed", "true");
  });

  it("re-queries the dashboard when the shared period changes", async () => {
    renderApp("/");

    await screen.findByText(/global activity/i);
    const before = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/v1/dashboard"),
    ).length;

    fireEvent.click(await screen.findByRole("button", { name: /^30d$/i }));

    await waitFor(() => {
      const after = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/api/v1/dashboard"),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
