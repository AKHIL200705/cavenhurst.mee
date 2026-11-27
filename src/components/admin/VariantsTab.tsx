import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Plus, Edit2, Trash2, RefreshCw, Layers, X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { TableSkeletonRows } from "@/components/ui/skeletons";
import { saveAdminVariantServerFn, deleteAdminVariantServerFn } from "@/server/admin";

export interface AdminVariantItem {
  id: string;
  product_id: string;
  sku: string | null;
  size: string;
  color: string;
  color_hex: string | null;
  stock_quantity: number;
  additional_price: number;
  is_available: boolean;
  products?: { name: string; slug: string } | null;
}

interface VariantsTabProps {
  variants: AdminVariantItem[];
  products: Array<{ id: string; name: string }>;
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function VariantsTab({
  variants,
  products,
  loading,
  onRefresh,
  authToken,
}: VariantsTabProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    sku: "",
    size: "M",
    color: "Midnight Navy",
    colorHex: "#1B2A4A",
    stockQuantity: 10,
    additionalPrice: 0,
    isAvailable: true,
  });

  const filtered = variants.filter((v) => {
    if (selectedProduct !== "all" && v.product_id !== selectedProduct) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchSku = v.sku?.toLowerCase().includes(q);
      const matchSize = v.size.toLowerCase().includes(q);
      const matchColor = v.color.toLowerCase().includes(q);
      const matchProd = v.products?.name.toLowerCase().includes(q);
      return matchSku || matchSize || matchColor || matchProd;
    }
    return true;
  });

  const resetForm = () => {
    setForm({
      productId: products[0]?.id || "",
      sku: "",
      size: "M",
      color: "Midnight Navy",
      colorHex: "#1B2A4A",
      stockQuantity: 10,
      additionalPrice: 0,
      isAvailable: true,
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleEdit = (v: AdminVariantItem) => {
    setForm({
      productId: v.product_id,
      sku: v.sku || "",
      size: v.size,
      color: v.color,
      colorHex: v.color_hex || "",
      stockQuantity: v.stock_quantity,
      additionalPrice: v.additional_price || 0,
      isAvailable: v.is_available,
    });
    setEditingId(v.id);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId || !form.size.trim() || !form.color.trim()) {
      toast.error("Product, size, and color are required");
      return;
    }

    setSaving(true);
    try {
      await saveAdminVariantServerFn({
        data: {
          authToken,
          id: editingId || undefined,
          productId: form.productId,
          sku: form.sku.trim() || `SKU-${Date.now()}`,
          size: form.size.trim(),
          color: form.color.trim(),
          colorHex: form.colorHex.trim() || undefined,
          stockQuantity: Number(form.stockQuantity) || 0,
          additionalPrice: Number(form.additionalPrice) || 0,
          isAvailable: form.isAvailable,
        },
      });
      toast.success(editingId ? "Variant updated successfully" : "Variant added successfully");
      resetForm();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save variant");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this variant?")) return;
    try {
      await deleteAdminVariantServerFn({
        data: { authToken, id },
      });
      toast.success("Variant removed");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete variant");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Product Variants (Sizes & Colors)
          </h2>
          <p className="text-xs text-muted-foreground">
            Manage SKU allocations, dimensional sizing, fabric color options, and real-time
            inventory counts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-48">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, size, color..."
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 pr-8 text-xs outline-none focus:border-gold"
            />
            <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-xs outline-none"
          >
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Variant
          </button>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">SKU</th>
                <th className="p-3.5 text-center">Size</th>
                <th className="p-3.5">Color</th>
                <th className="p-3.5 text-center">Stock Quantity</th>
                <th className="p-3.5 text-right">Price Offset</th>
                <th className="p-3.5 text-center">Availability</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <TableSkeletonRows cols={8} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                    No variants found.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5 font-semibold text-foreground flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-primary" />{" "}
                      {v.products?.name || "Apparel Item"}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                      {v.sku || "—"}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold">{v.size}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5">
                        {v.color_hex && (
                          <span
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: v.color_hex }}
                          />
                        )}
                        {v.color}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          v.stock_quantity <= 3
                            ? "border border-[#233b56] bg-[#08192e] text-[#cbd5e1]"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {v.stock_quantity}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono">
                      {v.additional_price > 0 ? `+${formatINR(v.additional_price)}` : "—"}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          v.is_available && v.stock_quantity > 0
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {v.is_available && v.stock_quantity > 0 ? "Available" : "Out of Stock"}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(v)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variant Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-base sm:text-lg font-bold uppercase tracking-tight text-foreground">
                {editingId ? "Edit Product Variant" : "Add New Variant"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Product *</label>
              <select
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">SKU *</label>
                <input
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Size *</label>
                <select
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-bold"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                >
                  {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Color Name *</label>
                <input
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Color Hex</label>
                <input
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                  placeholder="#1B2A4A"
                  value={form.colorHex}
                  onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Stock Quantity *
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={form.stockQuantity}
                  onChange={(e) =>
                    setForm({ ...form, stockQuantity: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Extra Price (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                  value={form.additionalPrice}
                  onChange={(e) =>
                    setForm({ ...form, additionalPrice: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isAvailable"
                checked={form.isAvailable}
                onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isAvailable" className="text-xs font-semibold cursor-pointer">
                Available for sale on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingId ? "Save Changes" : "Create Variant"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
