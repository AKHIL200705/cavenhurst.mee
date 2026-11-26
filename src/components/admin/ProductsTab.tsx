import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Plus, Edit, Trash2, Search, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ProductDialog } from "./ProductDialog";
import { deleteAdminProductServerFn, saveAdminProductServerFn } from "@/server/admin";

export interface AdminProductListItem {
  id?: string | undefined;
  slug: string;
  name: string;
  category_slug?: string | null | undefined;
  category?: string | null | undefined;
  price: number;
  mrp: number;
  stock?: Record<string, number> | null | undefined;
  images?: string[] | null | undefined;
  is_published?: boolean | null | undefined;
  is_new?: boolean | null | undefined;
  is_featured?: boolean | null | undefined;
  rank?: number | null | undefined;
  fabric?: string | null | undefined;
  fit?: string | null | undefined;
  description?: string | null | undefined;
  colors?: Array<{ name: string; hex: string }> | null | undefined;
}

interface ProductsTabProps {
  products: AdminProductListItem[];
  loading: boolean;
  authToken?: string | undefined;
  onRefresh: () => void;
}

export function ProductsTab({ products, loading, authToken, onRefresh }: ProductsTabProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingProduct, setEditingProduct] = useState<AdminProductListItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      categoryFilter === "all" ||
      p.category_slug === categoryFilter ||
      p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleDelete = async (p: AdminProductListItem) => {
    if (!p.id) {
      toast.error("Static products cannot be deleted from the database.");
      return;
    }

    const confirmMsg = `Are you sure you want to remove "${p.name}"? If it has historic orders, it will be safely archived (unpublished).`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await deleteAdminProductServerFn({
        data: {
          authToken,
          productId: p.id,
          hardDelete: true,
        },
      });

      if (res.archived) {
        toast.info(res.message || "Product safely archived to preserve customer order history.");
      } else {
        toast.success("Product permanently deleted.");
      }
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product");
    }
  };

  const handleTogglePublished = async (p: AdminProductListItem) => {
    try {
      await saveAdminProductServerFn({
        data: {
          authToken,
          product: {
            id: p.id,
            slug: p.slug,
            name: p.name,
            category_slug: p.category_slug || p.category || "t-shirts",
            price: p.price,
            mrp: p.mrp,
            fabric: p.fabric || undefined,
            fit: p.fit || undefined,
            description: p.description || undefined,
            colors: (p.colors as Array<{ name: string; hex: string }>) || [
              { name: "Midnight Navy", hex: "#0A1F3C" },
            ],
            stock: (p.stock as Record<string, number>) || {},
            images: (p.images as string[]) || [],
            is_new: p.is_new ?? false,
            is_published: !p.is_published,
            is_featured: p.is_featured ?? false,
            rank: p.rank ?? 100,
          },
        },
      });
      toast.success(p.is_published ? "Product unpublished." : "Product published live in store.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update publish state");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search garments by name or slug..."
              className="w-full rounded-md border border-input bg-card px-3 py-2 pr-9 text-xs outline-none focus:border-gold"
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-2 text-xs outline-none focus:border-gold"
          >
            <option value="all">All Categories</option>
            <option value="t-shirts">T-Shirts</option>
            <option value="hoodies">Hoodies</option>
            <option value="oversized">Oversized</option>
            <option value="graphic">Graphics</option>
            <option value="fan-edition">Fan Edition</option>
          </select>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition shadow"
        >
          <Plus className="h-4 w-4" /> Add New Garment
        </button>
      </div>

      {/* Products Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Garment</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Selling Price</th>
                <th className="p-3.5">MRP</th>
                <th className="p-3.5">Total Stock</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Loading catalog items...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                    No products found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const stockObj = (p.stock || {}) as Record<string, number>;
                  const totalUnits = Object.values(stockObj).reduce((a, b) => a + (b || 0), 0);
                  const thumb = Array.isArray(p.images) && p.images[0] ? p.images[0] : "";

                  return (
                    <tr key={p.id || p.slug} className="hover:bg-accent/20 transition">
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={p.name}
                              className="h-10 w-10 rounded-md object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted border border-border shrink-0" />
                          )}
                          <div>
                            <span className="font-semibold text-foreground block">{p.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground block">
                              {p.slug}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono uppercase text-silver">
                        {p.category_slug || p.category}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-emerald-400">
                        {formatINR(p.price)}
                      </td>
                      <td className="p-3.5 font-mono text-muted-foreground line-through">
                        {formatINR(p.mrp)}
                      </td>
                      <td className="p-3.5 font-mono">
                        <span
                          className={`font-bold ${
                            totalUnits === 0
                              ? "text-[#8fa3bd]"
                              : totalUnits <= 10
                                ? "text-[#cbd5e1]"
                                : "text-white"
                          }`}
                        >
                          {totalUnits} units
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleTogglePublished(p)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                            p.is_published
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {p.is_published ? (
                            <>
                              <Eye className="h-3 w-3" /> Live
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" /> Hidden
                            </>
                          )}
                        </button>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingProduct(p)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
                            title="Edit Garment"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-[#122741] hover:text-white transition"
                            title="Delete or Archive Garment"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      {(showAddModal || editingProduct) && (
        <ProductDialog
          product={editingProduct}
          authToken={authToken}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSaved={() => {
            setShowAddModal(false);
            setEditingProduct(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
