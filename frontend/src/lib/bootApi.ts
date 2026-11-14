import { apiFetch } from "@/lib/api";

/** Boot stages, in the order the console sequences them. */
export type BootStageKey = "platform" | "fireseal" | "harmonization" | "data";

export interface BootStage {
  key: BootStageKey;
  label: string;
  ok: boolean;
  detail: string;
  metrics: Record<string, unknown>;
  duration_ms: number;
}

export interface BootReport {
  ok: boolean;
  generated_at: string;
  duration_ms: number;
  stages: BootStage[];
}

export interface BootStagePlan {
  key: BootStageKey;
  label: string;
  blurb: string;
}

export const BOOT_STAGES: BootStagePlan[] = [
  {
    key: "platform",
    label: "Activating Hermes",
    blurb: "API process, PostgreSQL and the module registry",
  },
  {
    key: "fireseal",
    label: "Sealing FireSeal",
    blurb: "Compressed payload blocks and archive receipts",
  },
  {
    key: "harmonization",
    label: "Harmonising sensors",
    blurb: "Cross-sensor associations and the event audit trail",
  },
  {
    key: "data",
    label: "Initiating console",
    blurb: "Coverage, freshness and the rollup tables",
  },
];

/**
 * Run one real boot stage on the server.
 *
 * Each call executes the check for that stage only, so the sequenced screen is
 * showing genuine results rather than a staged animation.
 */
export function fetchBootStage(key: BootStageKey, signal?: AbortSignal) {
  return apiFetch<BootReport>(`/api/v1/system/boot?stage=${key}`, { signal });
}
