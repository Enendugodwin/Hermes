import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Floating glass panel used over map imagery. Panels are collapsible so the map
 * can reclaim the full workspace; the header stays visible as a handle.
 */
export function GlassPanel({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  defaultOpen = true,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={clsx("glass-panel pointer-events-auto", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-line/[0.07] px-[14px] py-[11px]">
        <div className="min-w-0">
          {eyebrow ? <div className="label text-[9px] tracking-[0.22em]">{eyebrow}</div> : null}
          <h2 className="mt-[3px] truncate text-[12px] font-medium tracking-[0.02em] text-ink">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${String(title)}` : `Expand ${String(title)}`}
            className="rounded-control p-1 text-faint transition-colors duration-150 hover:bg-line/[0.06] hover:text-ink"
          >
            {open ? (
              <ChevronUp className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
          </button>
        </div>
      </header>
      {open ? <div className={clsx("px-[14px] py-[12px]", bodyClassName)}>{children}</div> : null}
    </section>
  );
}
