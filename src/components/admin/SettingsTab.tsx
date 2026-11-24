import { useState, useEffect } from "react";
import { Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { updateAdminSettingsServerFn } from "@/server/admin";

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
        <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">Store Logistics & Dispatch Hub Settings</h2>
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
    </div>
  );
}
