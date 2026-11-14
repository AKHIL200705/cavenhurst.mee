import { describe, expect, it, vi } from "vitest";
import {
  accountDestination,
  customerFirstName,
  gateNeedsRedirect,
  persistWelcome,
  type GateState,
} from "./welcome";

const gate = (over: Partial<GateState>) => ({
  user: null,
  ready: true,
  welcomeReady: true,
  welcomeSeen: false,
  path: "/",
  welcomeShown: false,
  ...over,
});

describe("Account welcome rules", () => {
  it("keeps the customer on the welcome screen until it has actually been shown", () => {
    // Not seen yet: the gate must wait for the screen to render, then hold them there.
    expect(
      gateNeedsRedirect(
        gate({ user: { id: "u1" }, path: "/welcome", welcomeSeen: false, welcomeShown: false }),
      ),
    ).toBe(false);
    expect(
      gateNeedsRedirect(
        gate({ user: { id: "u1" }, path: "/welcome", welcomeSeen: false, welcomeShown: true }),
      ),
    ).toBe(false);
    // Already seen: no welcome to show, so the gate moves them to the store.
    expect(
      gateNeedsRedirect(
        gate({ user: { id: "u1" }, path: "/welcome", welcomeSeen: true, welcomeShown: false }),
      ),
    ).toBe(true);
    // A guest on the welcome page waits for the screen, then goes to sign in.
    expect(
      gateNeedsRedirect(
        gate({ user: null, path: "/welcome", welcomeSeen: false, welcomeShown: false }),
      ),
    ).toBe(false);
    expect(
      gateNeedsRedirect(
        gate({ user: null, path: "/welcome", welcomeSeen: false, welcomeShown: true }),
      ),
    ).toBe(true);
  });
  it("uses Akhil's authenticated first name", () => {
    expect(customerFirstName({ full_name: "Akhil Kumar" })).toBe("Akhil");
  });
  it("personalizes other customers rather than hardcoding Akhil", () => {
    expect(customerFirstName({ given_name: "Meera" })).toBe("Meera");
  });
  it("falls back when no name exists", () => {
    expect(customerFirstName({})).toBeNull();
  });
  it("requires login before welcoming a customer", () => {
    expect(accountDestination(false, false)).toBe("/login");
  });
  it("welcomes an account without persisted completion", () => {
    expect(accountDestination(true, false)).toBe("/welcome");
  });
  it("skips welcome after persisted completion on refresh or subsequent login", () => {
    expect(accountDestination(true, true)).toBe("/");
  });
  it("does not mark complete or redirect when saving fails", async () => {
    const completed = vi.fn();
    await expect(
      persistWelcome(async () => {
        throw new Error("offline");
      }, completed),
    ).rejects.toThrow("offline");
    expect(completed).not.toHaveBeenCalled();
  });
  it("marks complete only after saving", async () => {
    const events: string[] = [];
    await persistWelcome(
      async () => {
        events.push("saved");
      },
      () => {
        events.push("completed");
      },
    );
    expect(events).toEqual(["saved", "completed"]);
  });
});
