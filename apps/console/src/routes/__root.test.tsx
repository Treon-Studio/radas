import { describe, expect, it } from "vitest";
import { isPublicPath, resolveRootRedirect } from "./__root";

/**
 * Routing contract for the root layout: auth gate and onboarding gate.
 * These pin resolveRootRedirect — the pure decision RootLayout's effect
 * applies — so redirect behaviour stays correct without mounting a router.
 */

describe("isPublicPath", () => {
  it("treats the landing page as public", () => {
    expect(isPublicPath("/")).toBe(true);
  });

  it("treats auth and onboarding prefixes as public", () => {
    for (const p of ["/login", "/forgot-password", "/reset-password", "/onboarding"]) {
      expect(isPublicPath(p)).toBe(true);
      expect(isPublicPath(`${p}?next=/dashboard`)).toBe(true);
      expect(isPublicPath(`${p}/nested`)).toBe(true);
    }
  });

  it("treats app routes as protected", () => {
    for (const p of ["/dashboard", "/cloud/stacks", "/projects/p1", "/system/api"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  // Pins existing startsWith behaviour: "/onboardingx" is public today.
  // Changing to an exact match would be a behaviour change, not a refactor.
  it("keeps the existing prefix quirk for /onboardingx public", () => {
    expect(isPublicPath("/onboardingx")).toBe(true);
  });
});

describe("resolveRootRedirect", () => {
  const DONE = { completed: true };
  const PENDING = { completed: false };

  it("redirects to /login when there is no token on a protected path", () => {
    expect(resolveRootRedirect({ path: "/dashboard", token: null, onboardingStatus: undefined })).toBe("/login");
    expect(resolveRootRedirect({ path: "/projects/p1/services", token: "", onboardingStatus: DONE })).toBe("/login");
  });

  it("keeps unauthenticated users on public paths", () => {
    for (const p of ["/", "/login", "/forgot-password", "/reset-password", "/onboarding"]) {
      expect(resolveRootRedirect({ path: p, token: null, onboardingStatus: undefined })).toBeNull();
    }
  });

  it("keeps authenticated users on public paths (no loop back to /login)", () => {
    expect(resolveRootRedirect({ path: "/login", token: "t", onboardingStatus: DONE })).toBeNull();
    expect(resolveRootRedirect({ path: "/onboarding", token: "t", onboardingStatus: undefined })).toBeNull();
  });

  it("redirects to /onboarding when onboarding is incomplete on a protected path", () => {
    expect(resolveRootRedirect({ path: "/dashboard", token: "t", onboardingStatus: PENDING })).toBe("/onboarding");
    expect(resolveRootRedirect({ path: "/cloud/stacks", token: "t", onboardingStatus: PENDING })).toBe("/onboarding");
  });

  it("does not redirect when already on /onboarding", () => {
    expect(resolveRootRedirect({ path: "/onboarding", token: "t", onboardingStatus: PENDING })).toBeNull();
  });

  it("does not redirect when onboarding is complete", () => {
    expect(resolveRootRedirect({ path: "/dashboard", token: "t", onboardingStatus: DONE })).toBeNull();
  });

  it("does not redirect while onboarding status is still loading (undefined)", () => {
    expect(resolveRootRedirect({ path: "/dashboard", token: "t", onboardingStatus: undefined })).toBeNull();
  });
});
