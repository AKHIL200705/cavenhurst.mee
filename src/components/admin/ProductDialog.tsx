import { useState } from "react";
import { X, Upload, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveAdminProductServerFn } from "@/server/admin";
import { SIZES } from "@/lib/products";

export interface AdminProductFormItem {
  id?: string | undefined;
  slug?: string | undefined;
  name?: string | undefined;
  category_slug?: string | null | undefined;
  category?: string | null | undefined;
  price?: number | undefined;
  mrp?: number | undefined;
  fabric?: string | null | undefined;
  fit?: string | null | undefined;
  description?: string | null | undefined;
  is_published?: boolean | null | undefined;
  is_new?: boolean | null | undefined;
  is_featured?: boolean | null | undefined;
  rank?: number | null | undefined;
  stock?: Record<string, number> | null | undefined;
  colors?: Array<{ name: string; hex: string }> | null | undefined;
  images?: string[] | null | undefined;
}

export interface ProductDialogProps {
  product?: AdminProductFormItem | null | undefined;
  authToken?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductDialog({ product, authToken, onClose, onSaved }: ProductDialogProps) {
  const [loading, setLoading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  // Form State
  const [name, setName] = useState(product?.name || "");
  const [slug, setSlug] = useState(product?.slug || "");
  const [categorySlug, setCategorySlug] = useState(
    product?.category_slug || product?.category || "t-shirts",
  );
  const [price, setPrice] = useState(String(product?.price || 999));
  const [mrp, setMrp] = useState(String(product?.mrp || 1299));
  const [fabric, setFabric] = useState(product?.fabric || "100% combed cotton, 240 GSM");
  const [fit, setFit] = useState(product?.fit || "Oversized");
  const [description, setDescription] = useState(product?.description || "");
  const [isPublished, setIsPublished] = useState(product?.is_published ?? true);
  const [isNew, setIsNew] = useState(product?.is_new ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? false);
  const [rank, setRank] = useState(String(product?.rank || 100));

  // Images state
  const [images, setImages] = useState<string[]>(
    product?.images && product.images.length > 0 ? product.images : ["/src/assets/tee-navy.jpg"],
  );
  const [newImageUrl, setNewImageUrl] = useState("");

  // Stock per size state
  const initialStock = (product?.stock || {}) as Record<string, number>;
  const [stock, setStock] = useState<Record<string, number>>({
    XS: initialStock["XS"] ?? 10,
    S: initialStock["S"] ?? 20,
    M: initialStock["M"] ?? 25,
    L: initialStock["L"] ?? 20,
    XL: initialStock["XL"] ?? 15,
    XXL: initialStock["XXL"] ?? 5,
  });

  // Colors state
  const [colors, setColors] = useState<Array<{ name: string; hex: string }>>(
    product?.colors && Array.isArray(product.colors)
      ? product.colors
      : [{ name: "Midnight Navy", hex: "#0A1F3C" }],
  );
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#0A1F3C");

  const handleSlugAutoFill = (val: string) => {
    setName(val);
    if (!product?.id) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, ""),
      );
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImg(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${slug || "garment"}-${Date.now()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        setImages([...images, publicUrlData.publicUrl]);
        toast.success("Image uploaded to Supabase Storage.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingImg(false);
    }
  };

  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    setColors([...colors, { name: newColorName.trim(), hex: newColorHex }]);
    setNewColorName("");
  };

  const handleRemoveColor = (idx: number) => {
    setColors(colors.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error("Name and Slug are required.");
      return;
    }

    setLoading(true);
    try {
      await saveAdminProductServerFn({
        data: {
          authToken,
          product: {
            id: product?.id,
            slug: slug.trim(),
            name: name.trim(),
            category_slug: categorySlug,
            price: Number(price) || 0,
            mrp: Number(mrp) || 0,
            fabric,
            fit,
            description,
            colors,
            stock,
            images,
            is_new: isNew,
            is_published: isPublished,
            is_featured: isFeatured,
            rank: Number(rank) || 100,
          },
        },
      });

      toast.success(
        product?.id ? "Product updated successfully." : "Product created successfully.",
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-brand text-silver">
              CATALOG MANAGEMENT
            </span>
            <h2 className="font-serif text-2xl italic">
              {product?.id ? "Edit Product" : "Add New Garment to Catalog"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* Basic Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-silver mb-1">Product Title</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleSlugAutoFill(e.target.value)}
                placeholder="e.g. Signature Oversized Tee"
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block font-semibold text-silver mb-1">URL Identifier (Slug)</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="signature-oversized-tee"
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:border-gold"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block font-semibold text-silver mb-1">Category</label>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              >
                <option value="t-shirts">T-Shirts</option>
                <option value="hoodies">Hoodies</option>
                <option value="oversized">Oversized</option>
                <option value="graphic">Graphics</option>
                <option value="fan-edition">Fan Edition</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-silver mb-1">Selling Price (₹)</label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block font-semibold text-silver mb-1">MRP (₹)</label>
              <input
                type="number"
                required
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:border-gold"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-silver mb-1">Fabric Specification</label>
              <input
                type="text"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                placeholder="100% combed cotton, 240 GSM"
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-silver mb-1">Silhouette & Fit</label>
              <input
                type="text"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
                placeholder="Oversized / Boxy / Relaxed"
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-silver mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Garment details, silhouette notes, and styling instructions..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none"
            />
          </div>

          {/* Stock Matrix */}
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
            <span className="font-bold uppercase tracking-brand text-silver block">
              Inventory per Size
            </span>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {SIZES.map((s) => (
                <div key={s}>
                  <label className="block text-center font-mono font-bold mb-1">{s}</label>
                  <input
                    type="number"
                    min={0}
                    value={stock[s] ?? 0}
                    onChange={(e) =>
                      setStock({ ...stock, [s]: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                    className="w-full rounded-md border border-input bg-background p-1.5 text-center font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Colours */}
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
            <span className="font-bold uppercase tracking-brand text-silver block">
              Garment Colourways
            </span>
            <div className="flex flex-wrap gap-2">
              {colors.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-white/20"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(i)}
                    className="text-muted-foreground hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Colour name (e.g. Midnight Navy)"
                value={newColorName}
                onChange={(e) => setNewColorName(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none"
              />
              <input
                type="color"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              />
              <button
                type="button"
                onClick={handleAddColor}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                Add Colour
              </button>
            </div>
          </div>

          {/* Product Images */}
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-brand text-silver">
                Product Photography
              </span>
              <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold cursor-pointer hover:bg-accent">
                {uploadingImg ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload Image (Supabase)
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImg}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="relative group rounded-lg overflow-hidden border border-border h-20 w-20"
                >
                  <img src={img} alt="Garment" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Or paste image URL (/src/assets/... or https://...)"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (newImageUrl.trim()) {
                    setImages([...images, newImageUrl.trim()]);
                    setNewImageUrl("");
                  }
                }}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                Add URL
              </button>
            </div>
          </div>

          {/* Toggles & Display Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="rounded border-input text-gold"
                />
                <span>Published in Storefront</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={isNew}
                  onChange={(e) => setIsNew(e.target.checked)}
                  className="rounded border-input text-gold"
                />
                <span>New Arrival Badge</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="rounded border-input text-gold"
                />
                <span>Featured Showcase</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-primary px-5 py-2 font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Saving Garment..." : "Save Product"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
