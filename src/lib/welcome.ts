export function customerFirstName(metadata: Record<string, unknown>): string | null {
  for (const key of ["first_name", "given_name", "full_name", "name"]) {
    const value = metadata[key];
    if (typeof value !== "string") continue;
    const first = value.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return null;
}

export function accountDestination(
  signedIn: boolean,
  completed: boolean,
): "/login" | "/welcome" | "/" {
  if (!signedIn) return "/login";
  return completed ? "/" : "/welcome";
}

export type GateState = {
  user: unknown;
  ready: boolean;
  welcomeReady: boolean;
  welcomeSeen: boolean;
  path: string;
  welcomeShown: boolean;
};

const OPEN_PATHS = ["/login", "/terms", "/privacy"];

/** Whether the root screen must move the visitor elsewhere. */
export function gateNeedsRedirect({
  user,
  ready,
  welcomeReady,
  welcomeSeen,
  path,
  welcomeShown,
}: GateState) {
  const signedIn = Boolean(user);
  if (path === "/terms" || path === "/privacy") return false;
  if (!ready || (signedIn && !welcomeReady)) return false;
  // A welcome the customer has not yet seen must actually be rendered before it is left.
  if (path === "/welcome" && !welcomeSeen && !welcomeShown) return false;
  if (!signedIn) return !OPEN_PATHS.includes(path);
  if (!welcomeSeen) return path !== "/welcome";
  return path === "/login" || path === "/welcome";
}

export async function persistWelcome(write: () => Promise<void>, onCompleted: () => void) {
  await write();
  onCompleted();
}
