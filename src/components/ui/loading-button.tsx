import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: React.ReactNode;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingText, children, disabled, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={Boolean(disabled || loading)}
        aria-busy={loading || undefined}
        className={cn(className)}
        {...props}
      >
        {loading ? (
          <>
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          children
        )}
      </Button>
    );
  },
);
LoadingButton.displayName = "LoadingButton";
