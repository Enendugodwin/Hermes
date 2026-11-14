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

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
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
        group: "Global mission picture",
      },
      {
        key: "fire-map",
        label: "Intelligence Map",
        to: "/map",
        icon: MapIcon,
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
        group: "Historical activity",
      },
      {
        key: "analytics",
        label: "Analytics",
        to: "/analytics",
        icon: LineChart,
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
        group: "MODIS / VIIRS fusion",
      },
      {
        key: "anomalies",
        label: "Anomaly Intelligence",
        to: "/anomalies",
        icon: Radar,
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
        group: "Filter stored detections",
      },
      {
        key: "regions",
        label: "Regional Explorer",
        to: "/regions",
        icon: Globe2,
        group: "Regional profiles",
      },
      {
        key: "exposure",
        label: "Exposure Analysis",
        to: "/exposure",
        icon: ShieldAlert,
        group: "Geographic screening",
      },
      {
        key: "reports",
        label: "Reports & Exports",
        to: "/reports",
        icon: FileText,
        group: "Exports and briefings",
      },
      {
        key: "assistant",
        label: "Hermes Intelligence",
        to: "/assistant",
        icon: Sparkles,
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
        group: "Storage, datasets and sync",
      },
      {
        key: "settings",
        label: "Settings",
        to: "/settings",
        icon: Settings2,
        group: "Status and administration",
      },
      {
        key: "admin",
        label: "Admin Portal",
        to: "/admin",
        icon: Archive,
        group: "FIRMS key and raw archive",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findNavItemByKey(key: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.key === key);
}
