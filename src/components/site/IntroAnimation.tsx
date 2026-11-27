import { useEffect, useState } from "react";
import { WingMark } from "./Logo";

/** Brand intro shown on first load of a session. Skipped entirely for returning visits and reduced-motion users. */
export function IntroAnimation() {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return !sessionStorage.getItem("cavenhusrt_intro_shown");
    } catch {
      return true;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(false);
      return;
    }
    try {
      if (sessionStorage.getItem("cavenhusrt_intro_shown")) {
        setShow(false);
        return;
      }
      sessionStorage.setItem("cavenhusrt_intro_shown", "1");
    } catch {
      /* ignore */
    }

    // Already hidden by the pre-load reduced-motion handler: nothing left to animate.
    if (document.querySelector("[data-intro][data-intro-skipped]")) {
      setShow(false);
      return;
    }
    // Crisp brand reveal: leaves at 650ms, unmounts at 950ms so content is immediately interactive.
    const left = (ms: number) => Math.max(0, ms - performance.now());
    const t1 = setTimeout(() => setLeaving(true), left(650));
    const t2 = setTimeout(() => setShow(false), left(950));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      data-intro
      suppressHydrationWarning
      role="dialog"
      aria-label="CAVENHUSRT intro"
      className={`fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background px-4 transition-opacity duration-500 ease-out ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex max-w-full flex-col items-center gap-5 text-center">
        <div className="animate-in fade-in zoom-in-50 duration-700">
          <WingMark className="h-12 w-auto text-silver sm:h-14" />
        </div>
        <p className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both font-logo text-[clamp(1.6rem,6.5vw,3.75rem)] italic tracking-[clamp(0.1em,1.2vw,0.22em)] delay-300 duration-700">
          CAVENHUSRT
        </p>
        <p className="animate-in fade-in fill-mode-both text-[11px] uppercase tracking-[0.28em] text-silver delay-700 duration-700 sm:text-xs sm:tracking-[0.4em]">
          Urban Motion
        </p>
      </div>
    </div>
  );
}
