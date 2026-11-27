import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { InfoPage, meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { submitContactMessageServerFn } from "@/server/customers";

export const Route = createFileRoute("/contact")({
  head: () =>
    meta(
      "Contact Us",
      "Get in touch with CAVENHUSRT customer care for orders, sizing, shipping, and support.",
      { path: "/contact" },
    ),
  component: Contact,
});

function Contact() {
  const { user, sessionToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const name = String(d.get("name") || "").trim(),
      email = String(d.get("email") || "").trim(),
      message = String(d.get("message") || "").trim();
    if (!user) {
      toast.error("Please sign in to send a message");
      return;
    }
    setBusy(true);
    try {
      await submitContactMessageServerFn({
        data: { authToken: sessionToken ?? undefined, name, email, message },
      });
      toast.success("Thanks — we'll get back to you within 24 hours.");
      form.reset();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't send your message. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const field =
    "rounded-md border border-input bg-transparent px-4 py-3 text-foreground outline-none";
  return (
    <InfoPage eyebrow="SUPPORT" title="Contact us">
      <p>Email: support@cavenhusrt.in · Mon–Sat, 10am–7pm IST</p>
      <form className="grid gap-3" onSubmit={submit}>
        <input name="name" required maxLength={100} placeholder="Name" className={field} />
        <input
          name="email"
          required
          type="email"
          maxLength={255}
          placeholder="Email"
          className={field}
        />
        <textarea
          name="message"
          required
          maxLength={2000}
          rows={5}
          placeholder="How can we help?"
          className={field}
        />
        <button
          disabled={busy}
          className="w-fit rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </InfoPage>
  );
}
