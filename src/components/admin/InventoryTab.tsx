import { useMemo, useState } from "react";
import { SIZES } from "@/lib/products";
import { RefreshCw, History, X } from "lucide-react";
import { toast } from "sonner";
import { adjustAdminStockServerFn } from "@/server/admin";
import { TableSkeletonRows } from "@/components/ui/skeletons";
import { LoadingButton } from "@/components/ui/loading-button";

export interface AdminInventoryItem {
  id: string;
  slug: string;
  name: string;
  stock?: Record<string, number> | null | undefined;
  colors?: Array<{ name: string; hex: string }> | null | undefined;
}

export interface AdminInventoryVariantRow {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  color: string;
  color_hex: string | null;
  size: string;
  physical_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
}

export interface AdminInventoryMovement {
  id: string;
  product_id?: string | undefined;
  product_slug: string;
  size: string;
  color?: string | null | undefined;
  change_qty: number;
  new_stock: number;
  reason: string;
  reference_id?: string | null | undefined;
  created_at: string;
}

interface InventoryTabProps {
  inventory: AdminInventoryItem[];
  variantRows?: AdminInventoryVariantRow[] | undefined;
  movements: AdminInventoryMovement[];
  loading: boolean;
  authToken?: string | undefined;
  onRefresh: () => void;
}

export function InventoryTab({
  inventory,
  variantRows = [],
  movements,
  loading,
  authToken,
  onRefresh,
}: InventoryTabProps) {
  const [selectedProduct, setSelectedProduct] = useState<AdminInventoryItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("M");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [newStockVal, setNewStockVal] = useState<number>(0);
  const [reason, setReason] = useState("Warehouse restock");
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "out_of_stock" | "low_stock" | "in_stock"
  >("all");

  const filteredVariants = useMemo(() => {
    if (statusFilter === "all") return variantRows;
    return variantRows.filter((v) => v.stock_status === statusFilter);
  }, [variantRows, statusFilter]);

  const outCount = useMemo(
    () => variantRows.filter((v) => v.stock_status === "out_of_stock").length,
    [variantRows],
  );
  const lowCount = useMemo(
    () => variantRows.filter((v) => v.stock_status === "low_stock").length,
    [variantRows],
  );
  const inCount = useMemo(
    () => variantRows.filter((v) => v.stock_status === "in_stock").length,
    [variantRows],
  );

  const openAdjustModal = (
    product: AdminInventoryItem,
    size: string,
    currentStock: number,
    color = "",
  ) => {
    setSelectedProduct(product);
    setSelectedSize(size);
    setSelectedColor(color);
    setNewStockVal(currentStock);
    setReason("Warehouse restock");
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || submitting) return;

    setSubmitting(true);
    try {
      await adjustAdminStockServerFn({
        data: {
          authToken,
          productId: selectedProduct.id,
          size: selectedSize,
          color: selectedColor || undefined,
          newStock: Number(newStockVal) || 0,
          reason,
        },
      });

      const variantLabel = selectedColor ? `${selectedColor} · ${selectedSize}` : selectedSize;
      toast.success(
        `Stock updated for ${selectedProduct.name} (${variantLabel}) -> ${newStockVal}`,
      );
      setSelectedProduct(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Variant-Level Stock & Reservation Breakdown */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
              Inventory Breakdown by Variant
            </h2>
            <p className="text-xs text-muted-foreground font-sans">
              Real-time available quantity, reserved order holds, and variant stock status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border bg-card p-0.5 text-[11px] font-medium">
              {(
                [
                  { id: "all", label: `All (${variantRows.length})` },
                  { id: "in_stock", label: `In Stock (${inCount})` },
                  { id: "low_stock", label: `Low Stock (${lowCount})` },
                  { id: "out_of_stock", label: `Out of Stock (${outCount})` },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    statusFilter === pill.id
                      ? "bg-[#122741] font-semibold text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Inventory
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-mono text-muted-foreground">
                <tr>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5">Color</th>
                  <th className="p-3.5">Size</th>
                  <th className="p-3.5 text-right">Available Quantity</th>
                  <th className="p-3.5 text-right">Reserved Quantity</th>
                  <th className="p-3.5 text-center">Stock Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <TableSkeletonRows cols={7} rows={5} />
                ) : filteredVariants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                      No variant inventory rows match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredVariants.map((row) => {
                    const isOut = row.stock_status === "out_of_stock";
                    const productItem = inventory.find((item) => item.id === row.product_id) ?? {
                      id: row.product_id,
                      slug: row.product_slug,
                      name: row.product_name,
                    };

                    return (
                      <tr key={row.id} className="hover:bg-accent/20 transition">
                        <td className="p-3.5 font-medium text-foreground">
                          {row.product_name}
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {row.product_slug}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-2 text-foreground">
                            {row.color_hex && (
                              <span
                                className="h-3 w-3 rounded-full border border-border"
                                style={{ backgroundColor: row.color_hex }}
                                aria-hidden="true"
                              />
                            )}
                            {row.color}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-semibold text-foreground">
                          {row.size}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-foreground">
                          {row.available_quantity}
                        </td>
                        <td className="p-3.5 text-right font-mono text-silver">
                          {row.reserved_quantity}
                        </td>
                        <td className="p-3.5 text-center">
                          {isOut ? (
                            <span className="inline-flex rounded-full border border-red-500/80 bg-red-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-400">
                              OUT OF STOCK
                            </span>
                          ) : row.stock_status === "low_stock" ? (
                            <span className="inline-flex rounded-full border border-[#2b4564] bg-[#0d243f] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-silver">
                              LOW STOCK
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-[#223954] bg-[#071a30] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
                              IN STOCK
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              openAdjustModal(
                                productItem,
                                row.size,
                                row.physical_quantity,
                                row.color,
                              )
                            }
                            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                              isOut
                                ? "border border-red-500/80 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                                : "border border-border bg-background/60 text-foreground hover:bg-accent"
                            }`}
                          >
                            {isOut ? "OUT OF STOCK" : "Adjust"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Stock Matrix Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
              Live Warehouse Stock Matrix
            </h2>
            <p className="text-xs text-muted-foreground font-sans">
              Click any size figure to adjust stock levels with mandatory inventory movement
              tracking.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3.5">Garment Name</th>
                  {SIZES.map((s) => (
                    <th key={s} className="p-3.5 text-center font-mono">
                      {s}
                    </th>
                  ))}
                  <th className="p-3.5 text-right">Total Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <TableSkeletonRows cols={8} rows={5} />
                ) : inventory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                      No inventory records found.
                    </td>
                  </tr>
                ) : (
                  inventory.map((item) => {
                    const stockObj = (item.stock || {}) as Record<string, number>;
                    const total = Object.values(stockObj).reduce((a, b) => a + (b || 0), 0);

                    return (
                      <tr key={item.id || item.slug} className="hover:bg-accent/20 transition">
                        <td className="p-3.5 font-medium text-foreground">
                          {item.name}
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {item.slug}
                          </span>
                        </td>
                        {SIZES.map((s) => {
                          const count = stockObj[s] ?? 0;
                          return (
                            <td key={s} className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => openAdjustModal(item, s, count)}
                                className={`inline-block w-12 rounded py-1 font-mono font-bold transition ${
                                  count === 0
                                    ? "border border-red-500/80 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                                    : count <= 3
                                      ? "border border-[#2b4564] bg-[#0d243f] text-white hover:bg-[#143052]"
                                      : "bg-background/60 hover:bg-background text-foreground"
                                }`}
                                title={
                                  count === 0
                                    ? "Out of stock — click to restock"
                                    : "Click to adjust stock"
                                }
                              >
                                {count}
                              </button>
                            </td>
                          );
                        })}
                        <td className="p-3.5 text-right font-mono font-bold text-foreground">
                          {total}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <span className="font-heading text-xs uppercase tracking-wider text-silver">
                  INVENTORY ADJUSTMENT
                </span>
                <h3 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
                  {selectedProduct.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Adjusting {selectedColor ? `${selectedColor} · ` : ""}Size {selectedSize}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-silver mb-1">New Physical Stock</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newStockVal}
                  onChange={(e) => setNewStockVal(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background p-2 font-mono text-sm outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block font-semibold text-silver mb-1">Adjustment Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2 outline-none focus:border-gold"
                >
                  <option value="Warehouse restock">Warehouse Restock / Replenishment</option>
                  <option value="Physical count correction">Physical Count Correction</option>
                  <option value="Damaged / Write-off">Damaged / Defect Write-off</option>
                  <option value="Customer return restocked">Customer Return Restocked</option>
                  <option value="Manual admin override">Manual Admin Override</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="rounded-md border border-border px-4 py-2 font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  loading={submitting}
                  loadingText="Updating..."
                  className="rounded-md bg-primary px-5 py-2 text-xs font-bold text-primary-foreground"
                >
                  Commit Stock
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement Log */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-silver" />
          <h3 className="font-heading text-base sm:text-lg font-bold uppercase tracking-tight text-foreground">
            Recent Inventory Movements
          </h3>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Garment</th>
                  <th className="p-3">Size</th>
                  <th className="p-3 text-center">Change</th>
                  <th className="p-3 text-center">New Balance</th>
                  <th className="p-3">Reason / Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center italic text-muted-foreground">
                      No recorded inventory movements yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-accent/20">
                      <td className="p-3 text-muted-foreground font-mono text-[11px]">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 font-medium text-foreground">{m.product_slug}</td>
                      <td className="p-3 font-mono">{m.size}</td>
                      <td
                        className={`p-3 text-center font-mono font-bold ${
                          m.change_qty > 0 ? "text-white" : "text-[#8fa3bd]"
                        }`}
                      >
                        {m.change_qty > 0 ? `+${m.change_qty}` : m.change_qty}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">{m.new_stock}</td>
                      <td className="p-3 text-muted-foreground">
                        {m.reason}
                        {m.reference_id && (
                          <span className="ml-1 text-silver font-mono">({m.reference_id})</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
