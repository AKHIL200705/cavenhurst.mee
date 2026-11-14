import { Link } from "@tanstack/react-router";
import { Heart, Home, Layers, LayoutGrid, User, Instagram, Youtube, Facebook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function Footer() {
  const [email, setEmail] = useState("");
  const { user } = useAuth();
  return (
    <footer className="border-t border-border bg-navy-deep pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Premium apparel for everyday movement. Modern, versatile and long-lasting wardrobe
            essentials, designed in India.
          </p>
          <form
            className="mt-6 flex w-full max-w-sm gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = email.trim().toLowerCase();
              if (!/^\S+@\S+\.\S+$/.test(v) || v.length > 255) {
                toast.error("Enter a valid email");
                return;
              }
              if (!user) {
                toast.error("Please sign in to subscribe");
                return;
              }
              const { error } = await supabase
                .from("newsletter_subscribers")
                .insert({ email: v, user_id: user.id });
              if (error && error.code !== "23505") {
                toast.error("Couldn't subscribe right now. Please try again.");
                return;
              }
              toast.success("Thanks! You're on the list.");
              setEmail("");
            }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-electric"
            />
            <button className="shrink-0 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">
              Subscribe
            </button>
          </form>
          <div className="mt-6 flex gap-4 text-silver">
            <Instagram className="h-5 w-5" />
            <Facebook className="h-5 w-5" />
            <Youtube className="h-5 w-5" />
          </div>
        </div>
        <FooterCol
          title="Shop"
          links={[
            ["/shop", "Shop All"],
            ["/collections/t-shirts", "T-Shirts"],
            ["/collections/hoodies", "Hoodies"],
            ["/collections/oversized", "Oversized"],
            ["/collections/graphic", "Graphic"],
            ["/collections/fan-edition", "Fan Edition"],
          ]}
        />
        <FooterCol
          title="Support"
          links={[
            ["/track-order", "Track Order"],
            ["/shipping-returns", "Shipping & Returns"],
            ["/faqs", "FAQs"],
            ["/contact", "Contact Us"],
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            ["/about", "About CAVENHURST"],
            ["/privacy", "Privacy Policy"],
            ["/terms", "Terms & Conditions"],
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} CAVENHURST. All rights reserved.</span>
          <span className="flex gap-2">
            {["UPI", "VISA", "Mastercard", "RuPay", "COD"].map((p) => (
              <span key={p} className="rounded border border-border px-2 py-1 font-semibold">
                {p}
              </span>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-silver">{title}</h4>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {links.map(([to, l]) => (
          <li key={to}>
            <a href={to} className="hover:text-foreground">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BottomNav() {
  const items = [
    { to: "/", label: "Home", Icon: Home },
    { to: "/shop", label: "Shop", Icon: LayoutGrid },
    { to: "/collections/oversized", label: "Collections", Icon: Layers },
    { to: "/wishlist", label: "Wishlist", Icon: Heart },
    { to: "/account", label: "Account", Icon: User },
  ] as const;
  return (
    <nav className="glass-navigation navigation-motion fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to as "/"}
          activeOptions={{ exact: true }}
          className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground data-[status=active]:font-bold data-[status=active]:text-foreground"
        >
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
