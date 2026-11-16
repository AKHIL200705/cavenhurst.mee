import { useState } from "react";
import { Star, CheckCircle2, XCircle, Trash2, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { updateAdminReviewStatusServerFn, deleteAdminReviewServerFn } from "@/server/admin";

export interface AdminReviewItem {
  id: string;
  product_id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  review_text: string;
  is_verified_purchase: boolean;
  status: string;
  created_at: string;
  products?: { name: string; slug: string } | null;
}

interface ReviewsTabProps {
  reviews: AdminReviewItem[];
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function ReviewsTab({ reviews, loading, onRefresh, authToken }: ReviewsTabProps) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = reviews.filter((r) => {
    if (filter === "approved") return r.status === "approved";
    if (filter === "pending") return r.status === "pending";
    if (filter === "rejected") return r.status === "rejected";
    return true;
  });

  const handleStatusChange = async (reviewId: string, status: "approved" | "pending" | "rejected") => {
    try {
      await updateAdminReviewStatusServerFn({
        data: { authToken, reviewId, status },
      });
      toast.success(`Review marked as ${status}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update review status");
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to permanently delete this customer review?")) return;
    try {
      await deleteAdminReviewServerFn({
        data: { authToken, reviewId },
      });
      toast.success("Review deleted");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete review");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl italic">Product Reviews & Ratings Moderation</h2>
          <p className="text-xs text-muted-foreground">
            Moderate verified customer testimonials, star ratings, and community feedback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-xs outline-none"
          >
            <option value="all">All Statuses ({reviews.length})</option>
            <option value="pending">Pending Moderation</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
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
              <th className="p-3.5">Product</th>
              <th className="p-3.5">Customer</th>
              <th className="p-3.5 text-center">Rating</th>
              <th className="p-3.5">Review Title & Body</th>
              <th className="p-3.5 text-center">Status</th>
              <th className="p-3.5 text-right">Date</th>
              <th className="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-silver">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                  Loading customer reviews...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                  No product reviews found matching filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/20 transition">
                  <td className="p-3.5 font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    {r.products?.name || "Product"}
                  </td>
                  <td className="p-3.5">
                    <p className="font-semibold text-foreground">{r.customer_name}</p>
                    {r.is_verified_purchase && (
                      <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verified Buyer
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-center font-bold">
                    <div className="flex items-center justify-center gap-0.5 text-gold">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-gold" />
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 max-w-sm">
                    {r.title && <p className="font-bold text-foreground mb-0.5">{r.title}</p>}
                    <p className="text-muted-foreground line-clamp-2">{r.review_text}</p>
                  </td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        r.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : r.status === "rejected"
                          ? "bg-sale/20 text-sale"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {r.status !== "approved" && (
                        <button
                          title="Approve Review"
                          onClick={() => handleStatusChange(r.id, "approved")}
                          className="rounded p-1 text-emerald-500 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {r.status !== "rejected" && (
                        <button
                          title="Reject Review"
                          onClick={() => handleStatusChange(r.id, "rejected")}
                          className="rounded p-1 text-sale hover:bg-sale/10"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        title="Delete Review"
                        onClick={() => handleDelete(r.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-sale"
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}
