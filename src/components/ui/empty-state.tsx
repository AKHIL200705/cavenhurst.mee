import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card/40 px-6 py-16 text-center font-sans",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60 text-silver">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <h2 className="font-heading text-xl sm:text-2xl font-bold uppercase tracking-tight text-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
