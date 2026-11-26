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
    <span className="flex items-center gap-3 text-foreground">
      <WingMark className="h-9 w-auto" />
      {!compact && (
        <span className="font-logo text-lg font-medium tracking-brand sm:text-xl">CAVENHUSRT</span>
      )}
    </span>
  );
}
