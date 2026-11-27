import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
  /** Changing this key triggers a smooth entry reveal without remounting outer shells. */
  transitionKey?: string;
  className?: string;
}

export function PageTransition({ children, transitionKey, className }: PageTransitionProps) {
  return (
    <div key={transitionKey} className={cn("page-transition", className)}>
      {children}
    </div>
  );
}
