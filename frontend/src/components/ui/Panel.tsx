import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Card surface. Floating information panels use the same glass material as the
 * map overlays, with hairline separators instead of heavy borders.
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={clsx("glass-panel", className)}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-[10px] border-b border-line/[0.07] px-[18px] pb-[13px] pt-[16px]">
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-[13px] font-medium tracking-[0.01em] text-ink">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-[3px] text-2xs font-light leading-relaxed text-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={clsx("px-[18px] py-[16px]", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/**
 * A measurement. Values are monospaced and high-contrast so they read as
 * instrument numbers rather than dashboard furniture.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "warn" | "ok" | "info" | "fire";
}) {
  const valueTone =
    tone === "warn"
      ? "text-warn"
      : tone === "ok"
        ? "text-ok"
        : tone === "info"
          ? "text-azure"
          : tone === "fire"
            ? "text-fire-medium"
            : "text-ink";

  return (
    <div className="relative rounded-card border border-line/[0.07] bg-line/[0.02] px-[16px] py-[14px] transition-colors duration-150 hover:border-line/[0.14]">
      <div className="label">{label}</div>
      <div className={clsx("mt-[7px] font-mono text-[27px] leading-none tracking-[-0.03em]", valueTone)}>
        {value}
      </div>
      {hint ? <div className="mt-[8px] text-2xs font-light leading-snug text-faint">{hint}</div> : null}
    </div>
  );
}

/** Inline key/value row used inside panels. */
export function DataRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-3 border-b border-line/[0.06] py-[7px] last:border-0",
        className,
      )}
    >
      <span className="text-2xs font-light text-faint">{label}</span>
      <span className="text-right text-xs text-muted">{children}</span>
    </div>
  );
}
