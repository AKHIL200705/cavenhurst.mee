import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

import appCss from "../styles.css?url";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { AnnouncementBar, Header } from "@/components/site/Header";
import { BottomNav, Footer } from "@/components/site/Footer";
import { Toaster } from "@/components/ui/sonner";
import { IntroAnimation } from "@/components/site/IntroAnimation";
import { Button } from "@/components/ui/button";
import { accountDestination, gateNeedsRedirect } from "@/lib/welcome";

/** Set while the welcome screen is on screen, so the gate never skips it. */
let welcomeShown = false;
export function markWelcomeShown() {
  welcomeShown = true;
}
export function resetWelcomeShown() {
  welcomeShown = false;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("Route error:", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CAVENHURST — Premium apparel for everyday movement" },
      {
        name: "description",
        content: "Premium Indian clothing brand. Oversized tees, hoodies and fan edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&family=Parisienne&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [
      {
        src: "https://accounts.google.com/gsi/client",
        async: true,
        defer: true,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Runs before the page paints: hides the intro immediately for reduced-motion visitors. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var skip=function(){
    var i=document.querySelector('[data-intro]');
    if(i){ i.setAttribute('data-intro-skipped','true'); i.style.display='none'; }
  };
  try{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', skip);
      } else { skip(); }
    }
  }catch(_e){}
})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AuthProvider>
        <StoreProvider>
          <AuthGate />
          <Toaster position="top-center" />
          <IntroAnimation />
        </StoreProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const {
    user,
    ready,
    welcomeReady,
    welcomeSeen,
    welcomeError,
    retryWelcome,
    signOut,
    profileCompleted,
    profileChecking,
  } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const legal = path === "/terms" || path === "/privacy";
  const checked = ready && (!user || (welcomeReady && !profileChecking));
  const destination = accountDestination(Boolean(user), welcomeSeen, profileCompleted, path);
  // The welcome flag only describes a welcome screen that is on screen right now.
  if (path !== "/welcome" && welcomeShown) resetWelcomeShown();
  const redirectNeeded =
    !legal &&
    !welcomeError &&
    gateNeedsRedirect({
      user,
      ready,
      welcomeReady,
      welcomeSeen,
      path,
      welcomeShown,
      profileCompleted,
      profileChecking,
    });
  useEffect(() => {
    if (redirectNeeded) void navigate({ to: destination, replace: true });
  }, [redirectNeeded, destination, navigate]);
  if (!legal && (!checked || redirectNeeded)) return null;
  if (!legal && user && welcomeError)
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
        <p role="alert">We couldn’t open your account. Please try again.</p>
        <Button onClick={retryWelcome}>Try again</Button>
        <Button
          variant="ghost"
          onClick={() => {
            void signOut().catch(() => {});
          }}
        >
          Sign out
        </Button>
      </div>
    );
  if (path === "/welcome") return <Outlet />;
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main className="min-h-[60vh]">
        <div key={path} className="page-transition">
          <Outlet />
        </div>
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
