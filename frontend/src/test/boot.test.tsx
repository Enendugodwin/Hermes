import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BootSequence } from "@/components/boot/BootSequence";
import { BOOT_REPORT, installFetchMock } from "@/test/fixtures";
import type { BootReport } from "@/lib/bootApi";

const WORKSPACE = <p>workspace ready</p>;

function renderBoot(report?: BootReport) {
  installFetchMock(report ? { boot: report } : {});
  return render(
    <BootSequence stepDelayMs={1} holdMs={1}>
      {WORKSPACE}
    </BootSequence>,
  );
}

beforeEach(() => {
  // The global setup marks the sequence as done for page tests; this file
  // exercises the real first-load path.
  window.sessionStorage.clear();
});

describe("boot sequence", () => {
  it("runs the four real stages and reveals the workspace only when all pass", async () => {
    renderBoot();

    expect(await screen.findByText("Activating Hermes")).toBeInTheDocument();
    expect(screen.getByText("Sealing FireSeal")).toBeInTheDocument();
    expect(screen.getByText("Harmonising sensors")).toBeInTheDocument();
    expect(screen.getByText("Initiating console")).toBeInTheDocument();

    expect(await screen.findByText("workspace ready")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("hermes.boot.v1")).toBe("done");

    // Staged rows show the values the backend actually returned.
    expect(screen.queryByText(/99 payload blocks/i)).not.toBeInTheDocument();
  });

  it("shows each stage's server-measured detail and duration", async () => {
    const fetchMock = installFetchMock({ boot: BOOT_REPORT });
    render(
      <BootSequence stepDelayMs={1} holdMs={1}>
        {WORKSPACE}
      </BootSequence>,
    );

    await screen.findByText("workspace ready");

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/api/v1/system/boot?stage=platform"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/system/boot?stage=fireseal"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/system/boot?stage=harmonization"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/system/boot?stage=data"))).toBe(true);
  });

  it("halts on a failing stage and never reveals the workspace", async () => {
    const failing: BootReport = {
      ...BOOT_REPORT,
      ok: false,
      stages: BOOT_REPORT.stages.map((stage) =>
        stage.key === "fireseal"
          ? { ...stage, ok: false, detail: "payload block 8f1c failed its checksum" }
          : stage,
      ),
    };
    renderBoot(failing);

    expect(await screen.findByText(/boot halted/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/payload block 8f1c failed its checksum/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("workspace ready")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("hermes.boot.v1")).not.toBe("done");
    expect(screen.getByRole("button", { name: /retry checks/i })).toBeInTheDocument();
  });

  it("skips the sequence when the session already booted", () => {
    window.sessionStorage.setItem("hermes.boot.v1", "done");
    const fetchMock = installFetchMock();

    render(
      <BootSequence stepDelayMs={1} holdMs={1}>
        {WORKSPACE}
      </BootSequence>,
    );

    expect(screen.getByText("workspace ready")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/api/v1/system/boot"))).toBe(false);
  });

  it("reports an unreachable API instead of pretending to boot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    render(
      <BootSequence stepDelayMs={1} holdMs={1}>
        {WORKSPACE}
      </BootSequence>,
    );

    expect(await screen.findByText(/boot halted/i)).toBeInTheDocument();
    expect(screen.queryByText("workspace ready")).not.toBeInTheDocument();
  });
});
