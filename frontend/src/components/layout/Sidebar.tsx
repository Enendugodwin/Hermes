import clsx from "clsx";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { NavLink } from "react-router-dom";

import { HermesMark } from "@/components/brand/HermesMark";
import { StatusDot } from "@/components/ui/StatusDot";
import { NAV_SECTIONS } from "@/config/nav";
import { useSystemStatus } from "@/lib/queries";
import { useUiStore } from "@/store/ui";

function Wordmark({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-control border border-accent/25 bg-accent/[0.08]"
      >
        <HermesMark className="size-[20px] text-accent" />
      </span>
    );
  }

  return (
    <div className="flex items-center gap-[10px]">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-control border border-accent/25 bg-accent/[0.08]"
      >
        <HermesMark className="size-[21px] text-accent" />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block truncate font-display text-[17px] font-semibold tracking-[0.16em] text-ink">
          HERMES
        </span>
        <span className="mt-[5px] block truncate text-3xs uppercase tracking-[0.16em] text-faint">
          Fire Observation
        </span>
      </span>
    </div>
  );
}

export function Sidebar() {
  const drawerOpen = useUiStore((state) => state.sidebarOpen);
  const collapsedPref = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const { data: status } = useSystemStatus();

  const online = status?.database.connected ?? false;

  return (
    <>
      <div
        aria-hidden
        onClick={() => setSidebarOpen(false)}
        className={clsx(
          "fixed inset-0 z-40 bg-black/75 backdrop-blur-sm transition-opacity duration-150 lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={clsx(
          "glass fixed inset-y-0 left-0 z-50 flex w-[15.5rem] shrink-0 flex-col border-y-0 border-l-0 bg-canvas/70",
          "transition-transform duration-150 lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          collapsedPref ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]",
        )}
      >
        <div
          className={clsx(
            "flex items-center gap-2 px-[14px] pb-[13px] pt-[16px]",
            collapsedPref ? "justify-between lg:flex-col lg:justify-center" : "justify-between",
          )}
        >
          <div className={clsx("min-w-0", collapsedPref && "lg:hidden")}>
            <Wordmark compact={false} />
          </div>
          {collapsedPref ? (
            <div className="hidden lg:block">
              <Wordmark compact />
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
              className="rounded-control p-1.5 text-faint transition-colors duration-150 hover:bg-line/[0.06] hover:text-ink lg:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsedPref ? "Expand navigation" : "Collapse navigation"}
              title={collapsedPref ? "Expand navigation" : "Collapse navigation"}
              className="hidden rounded-control p-1.5 text-faint transition-colors duration-150 hover:bg-line/[0.06] hover:text-ink lg:block"
            >
              {collapsedPref ? (
                <ChevronsRight className="size-4" aria-hidden />
              ) : (
                <ChevronsLeft className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        <div className={clsx("mx-[14px] mb-[8px] h-px bg-line/[0.08]", collapsedPref && "lg:mx-2")} />

        <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto px-[8px] pb-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-[12px]">
              <div className={clsx("px-[10px] pb-[5px] pt-[5px]", collapsedPref && "lg:hidden")}>
                <span className="label text-[9px] tracking-[0.22em]">{section.title}</span>
              </div>
              <ul className="space-y-[1px]">
                {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <NavLink
                          to={item.to}
                          end={item.to === "/"}
                          onClick={() => setSidebarOpen(false)}
                          title={item.label}
                          className={({ isActive }) =>
                            clsx(
                              "nav-item",
                              isActive && "nav-item-active",
                              collapsedPref && "lg:justify-center lg:px-0",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <span className="relative shrink-0">
                                <Icon
                                  className={clsx(
                                    "nav-icon size-[15px]",
                                    isActive ? "text-accent" : "text-faint",
                                  )}
                                  aria-hidden
                                />
                              </span>
                              <span
                                className={clsx(
                                  "flex-1 truncate tracking-[0.01em]",
                                  collapsedPref && "lg:hidden",
                                )}
                              >
                                {item.label}
                              </span>
                            </>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className={clsx(
            "border-t border-line/[0.07] px-[16px] py-[13px]",
            collapsedPref && "lg:hidden",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="label text-[9px]">Mission status</span>
            <span className="inline-flex items-center gap-[5px] text-3xs font-medium tracking-[0.08em] text-muted">
              <StatusDot tone={online ? "ok" : "danger"} pulse={online} />
              {online ? "NOMINAL" : "OFFLINE"}
            </span>
          </div>
          <p className="mt-[8px] text-3xs font-light leading-relaxed text-faint">
            NASA FIRMS · MODIS / VIIRS. Detections are thermal anomalies, not confirmed wildfires.
          </p>
        </div>
      </aside>
    </>
  );
}
