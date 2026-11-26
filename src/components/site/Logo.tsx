import wolfLogo from "@/assets/wolf-logo.png";

export function WingMark({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <img
      src={wolfLogo}
      alt=""
      aria-hidden
      decoding="async"
      className={`${className} object-contain`}
    />
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-foreground sm:gap-3">
      <WingMark className="h-7 w-auto shrink-0 sm:h-9" />
      {!compact && (
        <span className="whitespace-nowrap font-logo text-sm font-medium tracking-[0.12em] sm:text-xl sm:tracking-brand">
          CAVENHUSRT
        </span>
      )}
    </span>
  );
}
