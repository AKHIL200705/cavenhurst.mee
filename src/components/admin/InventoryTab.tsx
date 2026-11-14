import { useState } from "react";
import { SIZES } from "@/lib/products";
import { RefreshCw, History, X } from "lucide-react";
import { toast } from "sonner";
import { adjustAdminStockServerFn } from "@/server/admin";

export interface AdminInventoryItem {
  id: string;
  slug: string;
  name: string;
  stock?: Record<string, number> | null | undefined;
  colors?: Array<{ name: string; hex: string }> | null | undefined;
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
  movements: AdminInventoryMovement[];
  loading: boolean;
  authToken?: string | undefined;
  onRefresh: () => void;
}

export function InventoryTab({
  inventory,
  movements,
  loading,
  authToken,
  onRefresh,
}: InventoryTabProps) {
  const [selectedProduct, setSelectedProduct] = useState<AdminInventoryItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("M");
  const [newStockVal, setNewStockVal] = useState<number>(0);
  const [reason, setReason] = useState("admin_adjustment");
  const [submitting, setSubmitting] = useState(false);

  const openAdjustModal = (product: AdminInventoryItem, size: string, currentStock: number) => {
    setSelectedProduct(product);
    setSelectedSize(size);
    setNewStockVal(currentStock);
    setReason("Warehouse restock");
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setSubmitting(true);
    try {
      await adjustAdminStockServerFn({
        data: {
          authToken,
          productId: selectedProduct.id,
          size: selectedSize,
          newStock: Number(newStockVal) || 0,
          reason,
        },
      });

      toast.success(
        `Stock updated for ${selectedProduct.name} (${selectedSize}) -> ${newStockVal}`,
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
      {/* Stock Matrix Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl italic">Live Warehouse Stock Matrix</h2>
            <p className="text-xs text-muted-foreground">
              Click any size figure to adjust stock levels with mandatory inventory movement
              tracking.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Inventory
          </button>
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
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-silver">
                      <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                      Loading inventory levels...
                    </td>
                  </tr>
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
                                onClick={() => openAdjustModal(item, s, count)}
                                className={`inline-block w-12 rounded py-1 font-mono font-bold transition ${
                                  count === 0
                                    ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                    : count <= 3
                                      ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                                      : "bg-background/60 hover:bg-background text-foreground"
                                }`}
                                title="Click to adjust stock"
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
                <span className="font-mono text-xs uppercase tracking-brand text-silver">
                  INVENTORY ADJUSTMENT
                </span>
                <h3 className="font-serif text-xl italic">{selectedProduct.name}</h3>
                <p className="text-xs text-muted-foreground">Adjusting Size {selectedSize}</p>
              </div>
              <button
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
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary px-5 py-2 font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                >
                  {submitting ? "Updating..." : "Commit Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement Log */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-silver" />
          <h3 className="font-serif text-lg italic">Recent Inventory Movements</h3>
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
                          m.change_qty > 0 ? "text-emerald-400" : "text-rose-400"
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
