import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 border-b border-line/[0.07] pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <div className="label mb-2">{eyebrow}</div> : null}
          <h1 className="font-display text-[28px] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-[34px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-[13px] font-light leading-[1.65] text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
