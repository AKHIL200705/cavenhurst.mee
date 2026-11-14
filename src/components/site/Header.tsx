import { Link } from "@tanstack/react-router";
import { Heart, Lock, Menu, RefreshCw, Search, ShoppingBag, Truck, User } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { useStore } from "@/lib/store";
import { COLLECTIONS } from "@/lib/products";

export function AnnouncementBar() {
  return (
    <div className="border-b border-border bg-navy-deep text-xs font-semibold text-silver">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-4 px-4 py-2 sm:gap-6">
        <span className="flex items-center gap-2">
          <Truck className="h-3.5 w-3.5" /> Free shipping above ₹1,999
        </span>
        <span className="hidden sm:flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Easy returns (7 days)
        </span>
        <span className="hidden md:flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" /> Secure payments
        </span>
      </div>
    </div>
  );
}

const nav = [
  { to: "/shop", label: "Shop All" },
  ...Object.entries(COLLECTIONS).map(([slug, c]) => ({ slug, label: c.title })),
];

export function Header() {
  const { count, wishlist } = useStore();
  return (
    <header className="glass-navigation navigation-motion sticky top-0 z-40 border-b border-border">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4">
        <div className="flex items-center gap-6">
          <Sheet>
            <SheetTrigger aria-label="Open menu" className="p-1">
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="left" className="glass-panel navigation-motion w-80">
              <SheetTitle className="mb-8">
                <Logo />
              </SheetTitle>
              <nav className="flex flex-col gap-1">
                {nav.map((n) =>
                  "slug" in n ? (
                    <Link
                      key={n.slug}
                      to="/collections/$slug"
                      params={{ slug: n.slug }}
                      className="rounded-md px-3 py-3 text-2xl font-semibold hover:bg-secondary"
                    >
                      {n.label}
                    </Link>
                  ) : (
                    <Link
                      key={n.to}
                      to="/shop"
                      className="rounded-md px-3 py-3 text-2xl font-semibold hover:bg-secondary"
                    >
                      {n.label}
                    </Link>
                  ),
                )}
                <div className="my-4 h-px bg-border" />
                {[
                  ["/about", "About"],
                  ["/track-order", "Track Order"],
                  ["/contact", "Contact"],
                  ["/faqs", "FAQs"],
                ].map(([to, l]) => (
                  <Link
                    key={to}
                    to={to as "/about"}
                    className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {l}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <nav className="hidden lg:flex gap-6 text-xs font-semibold uppercase tracking-[0.2em] text-silver">
            <Link to="/shop" className="hover:text-foreground">
              Shop
            </Link>
            <Link
              to="/collections/$slug"
              params={{ slug: "t-shirts" }}
              className="hover:text-foreground"
            >
              Tees
            </Link>
            <Link
              to="/collections/$slug"
              params={{ slug: "hoodies" }}
              className="hover:text-foreground"
            >
              Hoodies
            </Link>
          </nav>
        </div>
        <Link to="/" aria-label="CAVENHURST home">
          <Logo />
        </Link>
        <div className="flex items-center justify-end gap-3 sm:gap-5">
          <Link to="/search" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>
          <Link to="/account" aria-label="Account" className="hidden sm:block">
            <User className="h-5 w-5" />
          </Link>
          <Link to="/wishlist" aria-label="Wishlist" className="relative hidden sm:block">
            <Heart className="h-5 w-5" />
            {wishlist.length > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-electric px-1 text-[10px] font-bold">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link to="/cart" aria-label="Shopping bag" className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span
              key={count}
              className="absolute -right-2 -top-2 grid h-4 min-w-4 animate-in zoom-in place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
            >
              {count}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
