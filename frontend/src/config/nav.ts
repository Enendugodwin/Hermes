import type { LucideIcon } from "lucide-react";
import {
  Archive,
  CalendarDays,
  Cloud,
  FileText,
  Globe2,
  LayoutDashboard,
  Layers,
  LineChart,
  Map as MapIcon,
  Radar,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import type { ModuleStatus } from "@/types/api";

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Delivery phase from the implementation plan. */
  phase: string;
  /** Short label used in the collapsed rail and command palette. */
  group: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Hermes workspaces. Keys and routes are unchanged from the platform build so
 * existing deep links, tests and API contracts keep working; only the mission
 * language is updated.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Observe",
    items: [
      {
        key: "overview",
        label: "Overview",
        to: "/",
        icon: LayoutDashboard,
        phase: "Phase 4",
        group: "Global mission picture",
      },
      {
        key: "fire-map",
        label: "Intelligence Map",
        to: "/map",
        icon: MapIcon,
        phase: "Phase 4",
        group: "Geospatial workspace",
      },
    ],
  },
  {
    title: "Analyse",
    items: [
      {
        key: "calendar",
        label: "Burning Calendar",
        to: "/calendar",
        icon: CalendarDays,
        phase: "Phase 5",
        group: "Historical activity",
      },
      {
        key: "analytics",
        label: "Analytics",
        to: "/analytics",
        icon: LineChart,
        phase: "Phase 6",
        group: "Trends and rankings",
      },
    ],
  },
  {
    title: "Science",
    items: [
      {
        key: "harmonization",
        label: "Harmonisation Centre",
        to: "/harmonization",
        icon: Layers,
        phase: "Phase 3",
        group: "MODIS / VIIRS fusion",
      },
      {
        key: "anomalies",
        label: "Anomaly Intelligence",
        to: "/anomalies",
        icon: Radar,
        phase: "Phase 6",
        group: "Statistical baselines",
      },
    ],
  },
  {
    title: "Explore",
    items: [
      {
        key: "query",
        label: "Data Query",
        to: "/query",
        icon: Search,
        phase: "Phase 5",
        group: "Filter stored detections",
      },
      {
        key: "regions",
        label: "Regional Explorer",
        to: "/regions",
        icon: Globe2,
        phase: "Phase 6",
        group: "Regional profiles",
      },
      {
        key: "exposure",
        label: "Exposure Analysis",
        to: "/exposure",
        icon: ShieldAlert,
        phase: "Phase 6",
        group: "Geographic screening",
      },
      {
        key: "reports",
        label: "Reports & Exports",
        to: "/reports",
        icon: FileText,
        phase: "Phase 7",
        group: "Exports and briefings",
      },
      {
        key: "assistant",
        label: "Hermes Intelligence",
        to: "/assistant",
        icon: Sparkles,
        phase: "Phase 7",
        group: "Investigate with tools",
      },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        key: "cloud-readiness",
        label: "Infrastructure",
        to: "/infrastructure",
        icon: Cloud,
        phase: "Phase 9",
        group: "Storage, datasets and sync",
      },
      {
        key: "settings",
        label: "Settings",
        to: "/settings",
        icon: Settings2,
        phase: "Phase 1",
        group: "Status and administration",
      },
      {
        key: "admin",
        label: "Admin Portal",
        to: "/admin",
        icon: Archive,
        phase: "Phase 9",
        group: "FIRMS key and raw archive",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findNavItemByKey(key: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.key === key);
}

/** Static fallback status used before the API responds. */
export const DEFAULT_STATUS: Record<string, ModuleStatus> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.key, item.key === "settings" ? "in_progress" : "scaffolded"]),
);
