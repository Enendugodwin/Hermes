import { useEffect, useState } from "react";

import { StatusDot } from "@/components/ui/StatusDot";
import { useSystemStatus } from "@/lib/queries";
import { formatUtcClock } from "@/lib/time";
import { useUiStore } from "@/store/ui";

const item = "inline-flex items-center gap-[6px]";

export function StatusBar() {
  const { data } = useSystemStatus();
  const dateRange = useUiStore((state) => state.dateRange);
  const [clock, setClock] = useState(() => formatUtcClock());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatUtcClock()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const online = Boolean(data?.database.connected);

  return (
    <footer
      className="relative z-20 shrink-0 border-t border-line/[0.08] bg-canvas/85 px-3 py-[6px] text-3xs font-light text-faint backdrop-blur-glass sm:px-[18px]"
      title="Thermal anomalies are detections, not confirmed wildfires."
    >
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1">
        <span className={item}>
          <StatusDot tone={online ? "ok" : "danger"} pulse={online} />
          <span className="font-mono uppercase tracking-[0.12em]">
            {online ? "Mission link nominal" : "Mission link down"}
          </span>
        </span>

        <span className={`${item} hidden sm:inline-flex`}>
          <span className="font-mono text-muted">
            {dateRange.start} → {dateRange.end}
          </span>
        </span>

        <span className={item}>
          <span className="font-mono text-muted">{clock}</span>
          <span className="hidden sm:inline">UTC</span>
        </span>

        <span className="ml-auto font-mono">API v{data?.app_version ?? "—"}</span>
      </div>
    </footer>
  );
}
