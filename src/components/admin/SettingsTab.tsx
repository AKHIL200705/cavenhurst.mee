import { useState, useEffect, useCallback } from "react";
import { Save, RefreshCw, Mail, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  updateAdminSettingsServerFn,
  getAdminEmailDiagnosticsServerFn,
  testAdminEmailDeliveryServerFn,
} from "@/server/admin";

export interface AdminSettingsData {
  pickup_pincode?: string | null | undefined;
  pickup_address_name?: string | null | undefined;
  pickup_address_line1?: string | null | undefined;
  pickup_address_city?: string | null | undefined;
  pickup_address_state?: string | null | undefined;
  pickup_phone?: string | null | undefined;
  default_package_weight_grams?: number | null | undefined;
  package_type?: string | null | undefined;
  cod_enabled?: boolean | null | undefined;
}

interface SettingsTabProps {
  settings: AdminSettingsData | null | undefined;
  authToken?: string | undefined;
  onRefresh: () => void;
}

export function SettingsTab({ settings, authToken, onRefresh }: SettingsTabProps) {
  const [pickupPincode, setPickupPincode] = useState("521212");
  const [pickupAddressName, setPickupAddressName] = useState("CAVENHURST Dispatch Hub");
  const [pickupAddressLine1, setPickupAddressLine1] = useState("");
  const [pickupAddressCity, setPickupAddressCity] = useState("");
  const [pickupAddressState, setPickupAddressState] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [defaultWeight, setDefaultWeight] = useState("500");
  const [packageType, setPackageType] = useState("One packed T-shirt");
  const [codEnabled, setCodEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    httpStatus?: number | undefined;
    errorCategory?: string | undefined;
  } | null>(null);
  const [emailDiagnostics, setEmailDiagnostics] = useState<
    Array<{
      id: string;
      recipient_masked: string;
      purpose: string;
      emailjs_status: string | null;
      emailjs_http_status: number | null;
      error_category: string | null;
      diagnostic_message: string | null;
      created_at: string;
    }>
  >([]);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const loadEmailDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true);
    try {
      const rows = await getAdminEmailDiagnosticsServerFn({ data: { authToken } });
      setEmailDiagnostics(rows || []);
    } catch {
      /* ignore transient fetch failure */
    } finally {
      setLoadingDiagnostics(false);
    }
  }, [authToken]);

  useEffect(() => {
    void loadEmailDiagnostics();
  }, [loadEmailDiagnostics]);

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) {
      toast.error("Enter a test recipient email address.");
      return;
    }
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await testAdminEmailDeliveryServerFn({
        data: { authToken, testEmail: testEmail.trim() },
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      await loadEmailDiagnostics();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run EmailJS delivery test.";
      setTestResult({ success: false, message });
      toast.error(message);
    } finally {
      setTestingEmail(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setPickupPincode(settings.pickup_pincode || "521212");
      setPickupAddressName(settings.pickup_address_name || "CAVENHURST Dispatch Hub");
      setPickupAddressLine1(settings.pickup_address_line1 || "");
      setPickupAddressCity(settings.pickup_address_city || "");
      setPickupAddressState(settings.pickup_address_state || "");
      setPickupPhone(settings.pickup_phone || "");
      setDefaultWeight(String(settings.default_package_weight_grams || 500));
      setPackageType(settings.package_type || "One packed T-shirt");
      setCodEnabled(settings.cod_enabled ?? true);
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateAdminSettingsServerFn({
        data: {
          authToken,
          settings: {
            pickup_pincode: pickupPincode.trim(),
            pickup_address_name: pickupAddressName.trim(),
            pickup_address_line1: pickupAddressLine1.trim(),
            pickup_address_city: pickupAddressCity.trim(),
            pickup_address_state: pickupAddressState.trim(),
            pickup_phone: pickupPhone.trim(),
            default_package_weight_grams: Number(defaultWeight) || 500,
            package_type: packageType.trim(),
            cod_enabled: codEnabled,
          },
        },
      });

      toast.success("Shipping and dispatch configurations saved successfully.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
          Store Logistics & Dispatch Hub Settings
        </h2>
        <p className="text-xs text-muted-foreground font-sans">
          Origin coordinates used by ShipMaxx360 to compute live distance-based courier rates and
          schedule automated courier pickups.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm text-xs"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block font-semibold text-silver mb-1.5">Origin Pickup Pincode</label>
            <input
              type="text"
              required
              value={pickupPincode}
              onChange={(e) => setPickupPincode(e.target.value)}
              placeholder="521212"
              className="w-full rounded-md border border-input bg-background p-2 font-mono text-sm outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="block font-semibold text-silver mb-1.5">
              Dispatch Hub / Warehouse Name
            </label>
            <input
              type="text"
              required
              value={pickupAddressName}
              onChange={(e) => setPickupAddressName(e.target.value)}
              placeholder="CAVENHURST Dispatch Hub"
              className="w-full rounded-md border border-input bg-background p-2 outline-none focus:border-gold"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-silver mb-1.5">Hub Street Address Line</label>
          <input
            type="text"
            value={pickupAddressLine1}
            onChange={(e) => setPickupAddressLine1(e.target.value)}
            placeholder="Plot 4, Heritage Industrial Park, Textile Hub"
            className="w-full rounded-md border border-input bg-background p-2 outline-none focus:border-gold"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block font-semibold text-silver mb-1.5">City</label>
            <input
              type="text"
              value={pickupAddressCity}
              onChange={(e) => setPickupAddressCity(e.target.value)}
              placeholder="Vijayawada"
              className="w-full rounded-md border border-input bg-background p-2 outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-silver mb-1.5">State</label>
            <input
              type="text"
              value={pickupAddressState}
              onChange={(e) => setPickupAddressState(e.target.value)}
              placeholder="Andhra Pradesh"
              className="w-full rounded-md border border-input bg-background p-2 outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-silver mb-1.5">Dispatch Phone</label>
            <input
              type="text"
              value={pickupPhone}
              onChange={(e) => setPickupPhone(e.target.value)}
              placeholder="+91 9876543210"
              className="w-full rounded-md border border-input bg-background p-2 font-mono outline-none"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
          <div>
            <label className="block font-semibold text-silver mb-1.5">
              Default Garment Weight (grams)
            </label>
            <input
              type="number"
              min={100}
              step={50}
              required
              value={defaultWeight}
              onChange={(e) => setDefaultWeight(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 font-mono outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-silver mb-1.5">Package Packaging Type</label>
            <input
              type="text"
              required
              value={packageType}
              onChange={(e) => setPackageType(e.target.value)}
              placeholder="One packed T-shirt"
              className="w-full rounded-md border border-input bg-background p-2 outline-none"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer font-semibold">
            <input
              type="checkbox"
              checked={codEnabled}
              onChange={(e) => setCodEnabled(e.target.checked)}
              className="rounded border-input text-gold"
            />
            <span>Enable Cash on Delivery (COD) Checkout in Storefront</span>
          </label>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Configuration
          </button>
        </div>
      </form>

      {/* EmailJS OTP Delivery Test & Diagnostics */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-tight text-foreground">
              <Mail className="h-4 w-4 text-electric" /> EmailJS OTP Delivery Test & Diagnostics
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify live EmailJS API acceptance and inspect recent OTP dispatch results. If EmailJS
              returns HTTP 200 without appearing in your inbox, check Spam/Promotions, your
              connected Gmail Sent/Inbox for bounces, and EmailJS Dashboard History.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEmailDiagnostics()}
            disabled={loadingDiagnostics}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-accent"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDiagnostics ? "animate-spin" : ""}`} />{" "}
            Refresh Logs
          </button>
        </div>

        <form onSubmit={handleTestEmail} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:border-electric"
          />
          <button
            type="submit"
            disabled={testingEmail}
            className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-4 py-2 font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {testingEmail ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send Test OTP
          </button>
        </form>

        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 ${
              testResult.success
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{testResult.message}</p>
              {testResult.errorCategory && testResult.errorCategory !== "NONE" && (
                <p className="mt-0.5 font-mono text-[10px]">Category: {testResult.errorCategory}</p>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              <tr>
                <th className="p-2.5">Timestamp</th>
                <th className="p-2.5">Recipient</th>
                <th className="p-2.5">Purpose</th>
                <th className="p-2.5">HTTP / Status</th>
                <th className="p-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {emailDiagnostics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground italic">
                    No EmailJS delivery attempts recorded yet.
                  </td>
                </tr>
              ) : (
                emailDiagnostics.slice(0, 12).map((row) => (
                  <tr key={row.id} className="hover:bg-accent/20">
                    <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="p-2.5">{row.recipient_masked}</td>
                    <td className="p-2.5 uppercase">{row.purpose}</td>
                    <td className="p-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.emailjs_status === "SUCCESS"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {row.emailjs_http_status || "-"} {row.emailjs_status}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground max-w-xs truncate">
                      {row.diagnostic_message || row.error_category || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EmailJS OTP Delivery Test & Diagnostics */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-tight text-foreground">
              <Mail className="h-4 w-4 text-electric" /> EmailJS OTP Delivery Test & Diagnostics
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify live EmailJS API acceptance and inspect recent OTP dispatch results. If EmailJS
              returns HTTP 200 without appearing in your inbox, check Spam/Promotions, your
              connected Gmail Sent/Inbox for bounces, and EmailJS Dashboard History.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEmailDiagnostics()}
            disabled={loadingDiagnostics}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-accent"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDiagnostics ? "animate-spin" : ""}`} />{" "}
            Refresh Logs
          </button>
        </div>

        <form onSubmit={handleTestEmail} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:border-electric"
          />
          <button
            type="submit"
            disabled={testingEmail}
            className="flex items-center justify-center gap-1.5 rounded-md bg-secondary px-4 py-2 font-bold uppercase tracking-wider text-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {testingEmail ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send Test OTP
          </button>
        </form>

        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 ${
              testResult.success
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{testResult.message}</p>
              {testResult.errorCategory && testResult.errorCategory !== "NONE" && (
                <p className="mt-0.5 font-mono text-[10px]">Category: {testResult.errorCategory}</p>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-muted/40 font-mono text-[11px] text-muted-foreground">
              <tr>
                <th className="p-2.5">Timestamp</th>
                <th className="p-2.5">Recipient</th>
                <th className="p-2.5">Purpose</th>
                <th className="p-2.5">HTTP / Status</th>
                <th className="p-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {emailDiagnostics.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground italic">
                    No EmailJS delivery attempts recorded yet.
                  </td>
                </tr>
              ) : (
                emailDiagnostics.slice(0, 12).map((row) => (
                  <tr key={row.id} className="hover:bg-accent/20">
                    <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="p-2.5">{row.recipient_masked}</td>
                    <td className="p-2.5 uppercase">{row.purpose}</td>
                    <td className="p-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          row.emailjs_status === "SUCCESS"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {row.emailjs_http_status || "-"} {row.emailjs_status}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground max-w-xs truncate">
                      {row.diagnostic_message || row.error_category || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
