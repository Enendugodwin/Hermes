import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCw, TriangleAlert } from "lucide-react";

import { HermesMark } from "@/components/brand/HermesMark";
import {
  BOOT_STAGES,
  fetchBootStage,
  type BootStageKey,
} from "@/lib/bootApi";

const SESSION_KEY = "hermes.boot.v1";
const MIN_STEP_MS = 240;

type Status = "queued" | "checking" | "ready" | "blocked";

interface Step {
  key: BootStageKey;
  label: string;
  blurb: string;
  status: Status;
  detail?: string;
  duration?: number;
}

function queuedSteps(): Step[] {
  return BOOT_STAGES.map((stage) => ({ ...stage, status: "queued" }));
}

const STATUS_LABEL: Record<Status, string> = {
  queued: "Queued",
  checking: "Checking",
  ready: "Ready",
  blocked: "Blocked",
};

function StageIcon({ status }: { status: Status }) {
  if (status === "ready") return <Check className="size-3.5 text-success" aria-hidden />;
  if (status === "blocked") return <TriangleAlert className="size-3.5 text-danger" aria-hidden />;
  if (status === "checking") {
    return (
      <Loader2
        className="size-3.5 animate-spin text-accent motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  return <span className="block size-1.5 rounded-full bg-line/30" aria-hidden />;
}

/**
 * First-load sequence.
 *
 * Every stage is a real request to `/api/v1/system/boot?stage=…`, which runs the
 * corresponding check against the live platform. The workspace is only revealed
 * once all four stages pass; a failure halts the sequence and offers a retry.
 *
 * The sequence runs once per browser session (`sessionStorage`); add `?boot=1`
 * to run it again.
 */
export function BootSequence({
  children,
  stepDelayMs = MIN_STEP_MS,
  holdMs = 460,
}: {
  children: React.ReactNode;
  stepDelayMs?: number;
  holdMs?: number;
}) {
  const forced =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("boot") === "1";
  const [finished, setFinished] = useState(
    () =>
      typeof window !== "undefined" &&
      !forced &&
      window.sessionStorage.getItem(SESSION_KEY) === "done",
  );
  const [steps, setSteps] = useState<Step[]>(queuedSteps);
  const [failure, setFailure] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const runId = useRef(0);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setSteps(queuedSteps());
    setFailure(null);
    setChecking(true);

    for (const [index, plan] of BOOT_STAGES.entries()) {
      setSteps((current) =>
        current.map((step, position) =>
          position === index ? { ...step, status: "checking" } : step,
        ),
      );

      let result;
      try {
        const report = await fetchBootStage(plan.key);
        result = report.stages[0];
      } catch (cause) {
        if (id !== runId.current) return;
        const message =
          cause instanceof Error ? cause.message : "The boot probe did not answer.";
        setSteps((current) =>
          current.map((step, position) =>
            position === index ? { ...step, status: "blocked", detail: message } : step,
          ),
        );
        setFailure(message);
        setChecking(false);
        return;
      }

      if (id !== runId.current) return;
      if (!result) {
        const message = `Stage “${plan.label}” returned no result.`;
        setSteps((current) =>
          current.map((step, position) =>
            position === index ? { ...step, status: "blocked", detail: message } : step,
          ),
        );
        setFailure(message);
        setChecking(false);
        return;
      }

      // Keep each stage legible without faking its duration: the badge always
      // shows the server-measured time, the wait only paces the reveal.
      const pause = Math.max(stepDelayMs, Math.min(result.duration_ms, 900));
      await new Promise((resolve) => window.setTimeout(resolve, pause));
      if (id !== runId.current) return;

      setSteps((current) =>
        current.map((step, position) =>
          position === index
            ? {
                ...step,
                status: result.ok ? "ready" : "blocked",
                detail: result.detail,
                duration: result.duration_ms,
              }
            : step,
        ),
      );

      if (!result.ok) {
        setFailure(result.detail);
        setChecking(false);
        return;
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, holdMs));
    if (id !== runId.current) return;
    window.sessionStorage.setItem(SESSION_KEY, "done");
    setChecking(false);
    setFinished(true);
  }, [holdMs, stepDelayMs]);

  useEffect(() => {
    if (finished) return;
    void run();
    return () => {
      runId.current += 1;
    };
    // The sequence must run exactly once per mount; `run` is stable per render
    // and re-running on every dependency change would restart the checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (finished) return <>{children}</>;

  const ready = steps.filter((step) => step.status === "ready").length;
  const percent = Math.round((ready / steps.length) * 100);
  const failedStep = steps.find((step) => step.status === "blocked");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-[62rem] flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <HermesMark className="size-8 text-ink" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted">
              Hermes
            </p>
            <p className="text-2xs font-light uppercase tracking-[0.2em] text-faint">
              Earth observation
            </p>
          </div>
        </div>

        <div className="rounded-card border border-line/[0.1] bg-panel/60 shadow-lift backdrop-blur-glass">
          <div className="border-b border-line/[0.08] px-6 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="font-serif text-xl font-light text-ink">
                Bringing the platform online
              </h1>
              <span className="font-mono text-2xs text-faint">
                {ready} / {steps.length}
              </span>
            </div>
            <p className="mt-1 text-2xs font-light text-muted">
              Each step queries the running backend. The workspace opens only when
              every check passes.
            </p>
          </div>

          <ol className="divide-y divide-line/[0.06]" aria-live="polite">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className="flex items-start gap-4 px-6 py-4"
                aria-current={step.status === "checking" ? "step" : undefined}
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  <StageIcon status={step.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-ink">
                      <span className="mr-2 font-mono text-3xs text-faint">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {step.label}
                    </p>
                    <span className="font-mono text-3xs uppercase tracking-[0.14em] text-faint">
                      {STATUS_LABEL[step.status]}
                      {step.duration !== undefined ? ` · ${Math.round(step.duration)} ms` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-2xs font-light leading-relaxed text-muted">
                    {step.detail ?? step.blurb}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="px-6 pb-5 pt-4">
            <div
              className="h-[3px] w-full overflow-hidden rounded-full bg-line/[0.12]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Boot progress"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>

            {failure ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/30 bg-danger/[0.06] px-3 py-2">
                <p className="text-2xs font-light text-danger">
                  Boot halted at “{failedStep?.label ?? "a check"}”. {failure}
                </p>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={checking}
                  className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line/20 px-3 text-2xs text-ink transition-colors hover:bg-line/[0.06] disabled:opacity-50"
                >
                  <RotateCw className="size-3" aria-hidden />
                  Retry checks
                </button>
              </div>
            ) : (
              <p className="mt-3 text-3xs font-light text-faint">
                Checks run against PostgreSQL, the FireSeal payload blocks, the archive
                manifests and the harmonization audit trail. Nothing on this screen is
                simulated.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
