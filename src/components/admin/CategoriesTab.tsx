import { useState } from "react";
import { Plus, Edit2, Trash2, RefreshCw, FolderTree, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAdminCategoryServerFn, deleteAdminCategoryServerFn } from "@/server/admin";

export interface AdminCategoryItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface CategoriesTabProps {
  categories: AdminCategoryItem[];
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function CategoriesTab({ categories, loading, onRefresh, authToken }: CategoriesTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ slug: "", name: "", description: "" });

  const resetForm = () => {
    setForm({ slug: "", name: "", description: "" });
    setEditingId(null);
    setShowModal(false);
  };

  const handleEdit = (cat: AdminCategoryItem) => {
    setForm({
      slug: cat.slug,
      name: cat.name,
      description: cat.description || "",
    });
    setEditingId(cat.id);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      await saveAdminCategoryServerFn({
        data: {
          authToken,
          id: editingId || undefined,
          slug: form.slug.toLowerCase().trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        },
      });
      toast.success(editingId ? "Category updated successfully" : "Category created successfully");
      resetForm();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;
    try {
      await deleteAdminCategoryServerFn({
        data: { authToken, id },
      });
      toast.success("Category deleted");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl italic">Product Categories</h2>
          <p className="text-xs text-muted-foreground">
            Manage storefront classification taxonomies, slugs, and navigation categories.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Category
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
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
            <tr>
              <th className="p-3.5">Category Name</th>
              <th className="p-3.5">Slug</th>
              <th className="p-3.5">Description</th>
              <th className="p-3.5 text-right">Created Date</th>
              <th className="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-silver">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                  Loading categories...
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                  No categories defined.
                </td>
              </tr>
            ) : (
              categories.map((c) => (
                <tr key={c.id} className="hover:bg-accent/20 transition">
                  <td className="p-3.5 font-semibold text-foreground flex items-center gap-2">
                    <FolderTree className="h-3.5 w-3.5 text-primary" /> {c.name}
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-muted-foreground">{c.slug}</td>
                  <td className="p-3.5 text-muted-foreground">{c.description || "—"}</td>
                  <td className="p-3.5 text-right text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(c)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-sale"
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

      {/* Category Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif text-lg italic">
                {editingId ? "Edit Category" : "Add New Category"}
              </h3>
              <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Category Name *</label>
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm({
                    ...form,
                    name,
                    slug: editingId ? form.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                  });
                }}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">URL Slug *</label>
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Description</label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
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
                {editingId ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
