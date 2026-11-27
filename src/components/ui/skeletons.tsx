import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("luxury-skeleton rounded-lg border border-border/40", className)}
    />
  );
}

export function ProductCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card/50",
        layout === "list" && "flex",
      )}
    >
      <Shimmer
        className={cn(
          "rounded-none border-0",
          layout === "list" ? "aspect-[4/5] w-40 shrink-0 sm:w-56" : "aspect-[4/5] w-full",
        )}
      />
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        <Shimmer className="h-4 w-3/4 rounded" />
        <div className="flex items-center gap-2">
          <Shimmer className="h-5 w-16 rounded" />
          <Shimmer className="h-3.5 w-12 rounded" />
        </div>
        <div className="mt-1 flex items-center justify-between pt-1">
          <div className="flex gap-1.5">
            <Shimmer className="h-5 w-5 rounded-full" />
            <Shimmer className="h-5 w-5 rounded-full" />
            <Shimmer className="h-5 w-5 rounded-full" />
          </div>
          <Shimmer className="h-9 w-9 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export type RouteSkeletonVariant =
  "home" | "collection" | "product" | "search" | "cart" | "wishlist" | "account" | "generic";

export function RouteLoadingSkeleton({ variant = "generic" }: { variant?: RouteSkeletonVariant }) {
  if (variant === "home") {
    return (
      <div role="status" aria-label="Loading storefront" className="space-y-14 pb-16">
        <span className="sr-only">Loading homepage...</span>
        <div className="relative h-[78vh] min-h-[560px] max-h-[760px] w-full overflow-hidden border-b border-border bg-navy-deep">
          <div className="mx-auto flex h-full max-w-7xl flex-col justify-center gap-5 px-4">
            <Shimmer className="h-3 w-28 rounded" />
            <Shimmer className="h-14 w-64 sm:h-24 sm:w-96 rounded-xl" />
            <Shimmer className="h-1 w-16 rounded" />
            <Shimmer className="h-5 w-72 rounded" />
            <Shimmer className="mt-2 h-12 w-48 rounded-md" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-8 flex justify-center">
            <Shimmer className="h-7 w-56 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Shimmer key={n} className="aspect-[4/3] rounded-xl lg:aspect-[3/4]" />
            ))}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4">
          <Shimmer className="mb-6 h-8 w-44 rounded" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <ProductCardSkeleton key={n} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "collection") {
    return (
      <div role="status" aria-label="Loading collection">
        <span className="sr-only">Loading products...</span>
        <div className="border-b border-border bg-navy-deep px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl space-y-4">
            <Shimmer className="h-3 w-24 rounded" />
            <Shimmer className="h-12 w-64 sm:h-16 sm:w-96 rounded-xl" />
            <Shimmer className="h-5 w-72 rounded" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          <Shimmer className="h-11 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "product") {
    return (
      <div role="status" aria-label="Loading product" className="mx-auto max-w-7xl px-4 py-6">
        <span className="sr-only">Loading product details...</span>
        <Shimmer className="mb-6 h-4 w-48 rounded" />
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <Shimmer className="aspect-[4/5] w-full rounded-2xl" />
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <Shimmer key={n} className="aspect-square rounded-xl" />
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <Shimmer className="h-3 w-28 rounded" />
            <Shimmer className="h-12 w-4/5 rounded-xl" />
            <Shimmer className="h-8 w-36 rounded" />
            <Shimmer className="h-20 w-full rounded-xl" />
            <div className="flex gap-2 pt-2">
              {[1, 2, 3].map((n) => (
                <Shimmer key={n} className="h-9 w-9 rounded-full" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Shimmer key={n} className="h-10 rounded-md" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Shimmer className="h-12 rounded-md" />
              <Shimmer className="h-12 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "search" || variant === "wishlist") {
    return (
      <div
        role="status"
        aria-label={`Loading ${variant}`}
        className="mx-auto max-w-7xl space-y-8 px-4 py-12"
      >
        <span className="sr-only">Loading items...</span>
        <Shimmer className="h-12 w-52 rounded-xl" />
        {variant === "search" && <Shimmer className="h-14 w-full rounded-xl" />}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <ProductCardSkeleton key={n} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "cart") {
    return (
      <div role="status" aria-label="Loading shopping bag" className="mx-auto max-w-7xl px-4 py-12">
        <span className="sr-only">Loading shopping bag...</span>
        <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <Shimmer className="h-12 w-56 rounded-xl" />
            {[1, 2].map((n) => (
              <div key={n} className="flex gap-4 border-b border-border pb-5">
                <Shimmer className="h-32 w-24 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-3">
                  <Shimmer className="h-5 w-48 rounded" />
                  <Shimmer className="h-4 w-32 rounded" />
                  <Shimmer className="h-8 w-28 rounded" />
                </div>
              </div>
            ))}
          </div>
          <Shimmer className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (variant === "account") {
    return (
      <div
        role="status"
        aria-label="Loading account"
        className="mx-auto max-w-5xl space-y-10 px-4 py-16"
      >
        <span className="sr-only">Loading account...</span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Shimmer className="h-12 w-52 rounded-xl" />
            <Shimmer className="h-4 w-44 rounded" />
          </div>
          <Shimmer className="h-9 w-28 rounded-md" />
        </div>
        <Shimmer className="h-44 w-full rounded-2xl" />
        <div className="space-y-3">
          <Shimmer className="h-6 w-36 rounded" />
          {[1, 2].map((n) => (
            <Shimmer key={n} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-label="Loading page" className="mx-auto max-w-7xl space-y-6 px-4 py-12">
      <span className="sr-only">Loading page...</span>
      <Shimmer className="h-10 w-64 rounded-xl" />
      <Shimmer className="h-48 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Shimmer className="h-32 rounded-xl" />
        <Shimmer className="h-32 rounded-xl" />
        <Shimmer className="h-32 rounded-xl" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard metrics" className="space-y-6">
      <span className="sr-only">Loading dashboard overview...</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-44 animate-pulse rounded-lg bg-[#0d223a]" />
          <div className="h-4 w-60 animate-pulse rounded bg-[#0a1b2f]" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c]" />
      </div>

      {/* 4 KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((k) => (
          <div
            key={k}
            className="h-32 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c] p-5"
          >
            <div className="h-4 w-24 rounded bg-[#0e243e]" />
            <div className="mt-4 h-7 w-20 rounded bg-[#122b49]" />
          </div>
        ))}
      </div>

      {/* Overview & Stock Status */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="h-72 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c] p-5 lg:col-span-6" />
        <div className="h-72 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c] p-5 lg:col-span-6" />
      </div>

      {/* Analytics & Low Stock */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="h-80 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c] p-5 lg:col-span-7" />
        <div className="h-80 animate-pulse rounded-xl border border-[#1d344e] bg-[#06182c] p-5 lg:col-span-5" />
      </div>
    </div>
  );
}

export function TableSkeletonRows({ cols = 6, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} aria-hidden="true">
          {Array.from({ length: cols }).map((__, colIdx) => (
            <td key={colIdx} className="p-3.5">
              <div
                className={cn(
                  "h-4 animate-pulse rounded bg-[#0d223a] motion-reduce:animate-none",
                  colIdx === 0 ? "w-28" : colIdx === cols - 1 ? "ml-auto w-14" : "w-20",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TableSkeleton({ cols = 6, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading table data"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <span className="sr-only">Loading table rows...</span>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-border">
            <TableSkeletonRows cols={cols} rows={rows} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
