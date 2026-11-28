export function customerFirstName(metadata: Record<string, unknown>): string | null {
  for (const key of ["first_name", "given_name", "full_name", "name"]) {
    const value = metadata[key];
    if (typeof value !== "string") continue;
    const first = value.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return null;
}

export const ACCOUNT_GATED_ROUTES = ["/account", "/checkout"];

export function isAccountGatedRoute(path: string): boolean {
  const pathname = (path.split("?")[0] || path).split("#")[0] || path;
  return ACCOUNT_GATED_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function accountDestination(
  signedIn: boolean,
  welcomeSeen: boolean,
  profileCompleted: boolean = true,
  path: string = "/",
): string {
  if (!signedIn) {
    return isAccountGatedRoute(path) ? `/login?returnTo=${encodeURIComponent(path)}` : "/login";
  }
  if (!welcomeSeen) return "/welcome";
  if (!profileCompleted) {
    return isAccountGatedRoute(path)
      ? `/complete-profile?returnTo=${encodeURIComponent(path)}`
      : "/complete-profile";
  }
  const cleanPath = (path.split("?")[0] || path).split("#")[0] || path;
  return cleanPath === "/login" || cleanPath === "/welcome" || cleanPath === "/complete-profile"
    ? "/"
    : path;
}

export type GateState = {
  user: unknown;
  ready: boolean;
  welcomeReady: boolean;
  welcomeSeen: boolean;
  path: string;
  welcomeShown: boolean;
  profileCompleted?: boolean;
  profileChecking?: boolean;
};

/**
 * Evaluates whether the root screen must move the visitor elsewhere.
 * - Anonymous visitors: public browsing is completely open; account/checkout routes redirect to login.
 * - Signed-in users: must see /welcome on first sign-in.
 * - Incomplete profiles: can browse public pages, but account/checkout routes redirect to /complete-profile.
 */
export function gateNeedsRedirect({
  user,
  ready,
  welcomeReady,
  welcomeSeen,
  path,
  welcomeShown,
  profileCompleted = true,
  profileChecking = false,
}: GateState): boolean {
  const signedIn = Boolean(user);
  if (path === "/terms" || path === "/privacy") return false;
  if (path === "/admin" || path.startsWith("/admin/")) return false;
  if (!ready || (signedIn && !welcomeReady)) return false;

  // A welcome the customer has not yet seen must actually be rendered before it is left.
  if (path === "/welcome" && !welcomeSeen && !welcomeShown) return false;

  // Anonymous visitor
  if (!signedIn) {
    return isAccountGatedRoute(path) || path === "/welcome";
  }

  // Signed in: first-time welcome screen
  if (!welcomeSeen) {
    return path !== "/welcome";
  }

  // Welcome seen, but still on /welcome screen
  if (path === "/welcome") {
    return true;
  }

  // Signed-in user on login page
  if (path === "/login") {
    return true;
  }

  // Profile completion check for authenticated users
  if (!profileChecking) {
    if (!profileCompleted) {
      // Incomplete profile cannot access account-dependent routes
      if (isAccountGatedRoute(path)) return true;
      // Stays on complete-profile page
      if (path === "/complete-profile") return false;
    } else {
      // Completed profile shouldn't hang on complete-profile page
      if (path === "/complete-profile") return true;
    }
  }

  return false;
}

export async function persistWelcome(write: () => Promise<void>, onCompleted: () => void) {
  await write();
  onCompleted();
}
