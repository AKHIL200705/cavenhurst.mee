import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { customerFirstName } from "@/lib/welcome";
import { markWelcomeShown, resetWelcomeShown } from "@/routes/__root";

export const Route = createFileRoute("/welcome")({
  head: () =>
    meta(
      "Welcome to CAVENHURST",
      "Where timeless style meets modern elegance. Your personal welcome to CAVENHURST.",
    ),
  component: Welcome,
});

/** Tells the root gate this screen is on screen, and for how long it stays there. */
function useWelcomeOnScreen() {
  useEffect(() => {
    markWelcomeShown();
    return () => {
      resetWelcomeShown();
    };
  }, []);
}

function Welcome() {
  const { user, completeWelcome } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstName = customerFirstName(user?.user_metadata ?? {});
  useWelcomeOnScreen();

  return (
    <section className="flex min-h-svh w-full items-center justify-center bg-welcome px-6 py-16 text-welcome-foreground">
      <div className="welcome-reveal flex w-full max-w-4xl flex-col items-center text-center">
        <WingMark className="mb-12 h-16 w-auto sm:h-20" />
        <h1 className="max-w-full break-words font-welcome text-4xl font-normal leading-tight sm:text-6xl lg:text-7xl">
          {firstName ? `WELCOME, ${firstName.toLocaleUpperCase()}` : "WELCOME"}
        </h1>
        <p className="mt-4 font-welcome-body text-2xl font-medium sm:text-4xl">TO CAVENHURST</p>
        <p className="mt-8 max-w-sm font-welcome-body text-sm leading-relaxed text-welcome-muted sm:text-base">
          Where timeless style meets modern elegance.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await completeWelcome();
              await navigate({ to: "/", replace: true });
            } catch {
              setError("We couldn’t save your welcome. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-12 h-auto min-h-12 w-full max-w-xs whitespace-normal rounded-none border border-welcome-foreground bg-welcome-foreground px-5 py-4 font-welcome-body text-xs font-bold text-welcome hover:bg-welcome-foreground/90"
        >
          {busy ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" /> Please wait…
            </>
          ) : (
            <>
              EXPLORE CAVENHURST <ArrowRight />
            </>
          )}
        </Button>
        {error && (
          <p role="alert" className="mt-4 max-w-xs font-welcome-body text-sm text-welcome-muted">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
