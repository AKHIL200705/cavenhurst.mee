import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn’t load this view right now. Please try again.",
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border bg-card/50 px-6 py-16 text-center font-sans",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/70 text-silver">
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="font-heading text-xl sm:text-2xl font-bold uppercase tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-6 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
