import { useState } from "react";
import { ShieldCheck, Plus, Edit2, CheckCircle2, XCircle, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAdminUserServerFn, toggleAdminUserStatusServerFn } from "@/server/admin";

export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

interface AdminUsersTabProps {
  adminUsers: AdminUserRecord[];
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function AdminUsersTab({ adminUsers, loading, onRefresh, authToken }: AdminUsersTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "admin",
    isActive: true,
  });

  const resetForm = () => {
    setForm({ email: "", fullName: "", role: "admin", isActive: true });
    setEditingId(null);
    setShowModal(false);
  };

  const handleEdit = (u: AdminUserRecord) => {
    setForm({
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      isActive: u.is_active,
    });
    setEditingId(u.id);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.fullName.trim()) {
      toast.error("Email and full name are required");
      return;
    }

    setSaving(true);
    try {
      await saveAdminUserServerFn({
        data: {
          authToken,
          id: editingId || undefined,
          email: form.email.toLowerCase().trim(),
          fullName: form.fullName.trim(),
          role: form.role,
          isActive: form.isActive,
        },
      });
      toast.success(editingId ? "Admin user updated" : "Admin user authorized");
      resetForm();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save admin user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean, email: string) => {
    const nextStatus = !currentStatus;
    if (!confirm(`Are you sure you want to ${nextStatus ? "activate" : "deactivate"} admin access for ${email}?`)) {
      return;
    }

    try {
      await toggleAdminUserStatusServerFn({
        data: { authToken, id, isActive: nextStatus },
      });
      toast.success(`Admin access ${nextStatus ? "activated" : "deactivated"}`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">Administrative Users & Access Control</h2>
          <p className="text-xs text-muted-foreground font-sans">
            Manage authenticated administrators, access roles, active privileges, and security whitelists.
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
            <Plus className="h-3.5 w-3.5" /> Authorize Admin
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
              <th className="p-3.5">Administrator</th>
              <th className="p-3.5">Email Address</th>
              <th className="p-3.5 text-center">Assigned Role</th>
              <th className="p-3.5 text-center">Status</th>
              <th className="p-3.5 text-right">Last Login</th>
              <th className="p-3.5 text-right">Authorized Date</th>
              <th className="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-silver">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                  Loading administrative users...
                </td>
              </tr>
            ) : adminUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground italic">
                  No administrators defined.
                </td>
              </tr>
            ) : (
              adminUsers.map((u) => (
                <tr key={u.id} className="hover:bg-accent/20 transition">
                  <td className="p-3.5 font-semibold text-foreground flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-electric" /> {u.full_name}
                  </td>
                  <td className="p-3.5 text-muted-foreground font-mono">{u.email}</td>
                  <td className="p-3.5 text-center">
                    <span className="rounded bg-electric/10 text-electric border border-electric/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        u.is_active ? "bg-emerald-500/10 text-emerald-500" : "bg-sale/20 text-sale"
                      }`}
                    >
                      {u.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-muted-foreground">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString("en-IN") : "Never"}
                  </td>
                  <td className="p-3.5 text-right text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="p-3.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        title="Edit Admin"
                        onClick={() => handleEdit(u)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title={u.is_active ? "Suspend Access" : "Activate Access"}
                        onClick={() => handleToggleStatus(u.id, u.is_active, u.email)}
                        className={`rounded p-1 ${
                          u.is_active ? "text-sale hover:bg-sale/10" : "text-emerald-500 hover:bg-emerald-500/10"
                        }`}
                      >
                        {u.is_active ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Admin User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-base sm:text-lg font-bold uppercase tracking-tight text-foreground">
                {editingId ? "Edit Administrator" : "Authorize New Administrator"}
              </h3>
              <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Full Name *</label>
              <input
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Email Address *</label>
              <input
                required
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Administrative Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold"
              >
                <option value="superadmin">Super Administrator (Full Privileges)</option>
                <option value="admin">Administrator (Orders, Catalog, Logistics)</option>
                <option value="manager">Operations Manager (Orders & Shipments Only)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isAdminActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isAdminActive" className="text-xs font-semibold cursor-pointer">
                Account Active & Authorized
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
                {editingId ? "Save Changes" : "Authorize Administrator"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
