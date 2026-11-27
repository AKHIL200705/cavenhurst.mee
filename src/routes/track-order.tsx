import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, MapPin, Package, Search, Truck } from "lucide-react";
import { InfoPage, meta } from "@/components/site/InfoPage";
import { trackOrderServerFn } from "@/server/orders";

export const Route = createFileRoute("/track-order")({
  validateSearch: (search: Record<string, unknown>): { order?: string | undefined } => ({
    order: typeof search["order"] === "string" ? search["order"] : undefined,
  }),
  head: () =>
    meta("Track Order", "Track your CAVENHUSRT shipment across India via ShipMaxx360.", {
      path: "/track-order",
    }),
  component: Track,
});

type TrackingEvent = {
  current_status: string;
  status_location: string | null;
  status_time: string | null;
  activity: string | null;
};

type ShipmentDetails = {
  id: string;
  order_id: string;
  order_number: string;
  awb_number: string | null;
  courier_partner: string | null;
  status: string;
  pickup_pincode: string;
  delivery_pincode: string;
  created_at: string;
};

function Track() {
  const search = Route.useSearch();
  const [id, setId] = useState(search.order || "");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<{
    found: boolean;
    shipment: ShipmentDetails | null;
    history: TrackingEvent[];
    providerStatus?: string;
  } | null>(null);

  const performTrack = useCallback(async (rawQuery: string, silentIfMissing = false) => {
    const query = rawQuery.trim();
    if (!query) {
      toast.error("Please enter an Order Number or AWB Number");
      return;
    }

    setBusy(true);
    setSearched(true);

    try {
      const res = await trackOrderServerFn({ data: { query } });
      setResult(res as typeof result);
      if (!res.found && !silentIfMissing) {
        toast.info("No shipment found for this reference. Please check and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error querying shipment status.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (search.order && search.order.trim()) {
      setId(search.order.trim());
      void performTrack(search.order.trim(), true);
    }
  }, [search.order, performTrack]);

  const onTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    await performTrack(id);
  };

  return (
    <InfoPage eyebrow="SUPPORT & LOGISTICS" title="Track your shipment">
      <p className="text-muted-foreground">
        Enter your CAVENHUSRT Order Number (e.g.{" "}
        <span className="font-mono text-foreground font-semibold">CVH-20261114-XXXX</span>) or
        ShipMaxx360 AWB Number to view real-time courier updates.
      </p>

      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={onTrack}>
        <div className="relative flex-1">
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Enter Order ID / AWB Number"
            className="w-full rounded-md border border-input bg-transparent px-4 py-3.5 pr-10 text-foreground outline-none transition focus:border-electric"
          />
          <Search className="absolute right-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-7 py-3.5 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Tracking...
            </>
          ) : (
            "Track Shipment"
          )}
        </button>
      </form>

      {/* Results View */}
      {searched && result && (
        <div className="mt-10 rounded-xl border border-border bg-card p-6">
          {!result.found ? (
            <div className="py-8 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 font-bold text-foreground">Shipment Not Found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We couldn’t find an order matching "{id}". If you placed your order recently, please
                allow up to 2 hours for courier manifest indexing.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between border-b border-border pb-4 gap-4">
                <div>
                  <span className="text-xs uppercase tracking-brand text-silver">ORDER</span>
                  <p className="font-mono text-lg font-bold text-foreground">
                    #{result.shipment?.order_number}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-brand text-silver">
                    SHIPMAXX360 AWB
                  </span>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {result.shipment?.awb_number || "Pending generation"}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-brand text-silver">
                    COURIER PARTNER
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {result.shipment?.courier_partner || "ShipMaxx360 Express"}
                  </p>
                </div>
                <div className="rounded-full bg-secondary px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-secondary-foreground">
                  {result.shipment?.status?.replace(/_/g, " ")}
                </div>
              </div>

              {/* Transit Route */}
              <div className="my-6 grid grid-cols-2 gap-4 rounded-lg bg-background p-4 text-xs sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-silver" />
                  <div>
                    <span className="text-muted-foreground">Dispatch Hub: </span>
                    <span className="font-bold text-foreground">
                      {result.shipment?.pickup_pincode || "521212"} (AP)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-silver" />
                  <div>
                    <span className="text-muted-foreground">Delivery Destination: </span>
                    <span className="font-bold text-foreground">
                      {result.shipment?.delivery_pincode}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tracking Event Timeline */}
              <h3 className="mb-4 text-xs font-bold uppercase tracking-brand text-silver">
                ACTIVITY TIMELINE
              </h3>
              {result.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Order confirmed and manifest registered. Courier pickup is currently being
                  scheduled.
                </p>
              ) : (
                <ol className="relative ml-2 space-y-6 border-l border-border pl-6">
                  {result.history.map((h, i) => (
                    <li key={`${h.current_status}-${i}`} className="relative">
                      <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                        {i === 0 ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-2.5 w-2.5" />
                        )}
                      </span>
                      <p className="text-sm font-bold text-foreground">{h.current_status}</p>
                      {h.activity && (
                        <p className="text-xs text-muted-foreground mt-0.5">{h.activity}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-silver">
                        {h.status_location && <span>{h.status_location}</span>}
                        {h.status_time && (
                          <span>
                            {new Date(h.status_time).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </InfoPage>
  );
}
