import clsx from "clsx";

/**
 * Hermes mission mark: a satellite in a polar orbit around an Earth horizon.
 * Drawn as line work so it inherits the current text colour and stays crisp at
 * every size.
 */
export function HermesMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={clsx("size-6", className)}
    >
      <circle cx="16" cy="17" r="7.2" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <path
        d="M8.8 17c0-4 3.2-7.2 7.2-7.2s7.2 3.2 7.2 7.2"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.9"
      />
      <path
        d="M5.2 19.5c2.4 3.3 6.3 5.3 10.8 5.3s8.4-2 10.8-5.3"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.45"
      />
      <ellipse
        cx="16"
        cy="17"
        rx="15"
        ry="5.6"
        transform="rotate(-24 16 17)"
        stroke="currentColor"
        strokeWidth="0.9"
        opacity="0.4"
      />
      <circle cx="26.4" cy="9.4" r="1.8" fill="currentColor" />
      <circle cx="16" cy="17" r="1.2" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
