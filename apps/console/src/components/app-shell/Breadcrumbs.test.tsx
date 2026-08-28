import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Breadcrumbs contract: labels come from route metadata (ROUTE_CRUMBS or the
 * segment label map), nothing renders when no metadata resolves, and explicit
 * items always win over metadata.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/system/audit" }),
    Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  };
});

import { Breadcrumbs, crumbsForPath, ROUTE_CRUMBS } from "./Breadcrumbs";

describe("crumbsForPath", () => {
  it("returns the exact route metadata entry", () => {
    expect(crumbsForPath("/system/audit")).toEqual(ROUTE_CRUMBS["/system/audit"]);
    expect(crumbsForPath("/system/branch-mapping")).toEqual(ROUTE_CRUMBS["/system/branch-mapping"]);
  });

  it("ignores query strings and trailing slashes", () => {
    expect(crumbsForPath("/system/audit?limit=50")).toEqual(ROUTE_CRUMBS["/system/audit"]);
    expect(crumbsForPath("/system/automation/")).toEqual(ROUTE_CRUMBS["/system/automation"]);
  });

  it("falls back to known segment labels", () => {
    expect(crumbsForPath("/system/users")).toEqual([
      { label: "System", to: "/system" },
      { label: "users" },
    ]);
  });

  it("returns [] when no metadata matches", () => {
    expect(crumbsForPath("/totally-unknown")).toEqual([]);
    expect(crumbsForPath("/")).toEqual([]);
  });
});

describe("Breadcrumbs rendering", () => {
  it("renders labels from route metadata for the current router pathname", () => {
    const { container } = render(<Breadcrumbs />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Audit Log").closest("[aria-current='page']")).not.toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/system/settings");
  });

  it("renders from an explicit pathname override", () => {
    render(<Breadcrumbs pathname="/system/inbound-webhooks" />);
    expect(screen.getByText("Inbound Webhooks")).toBeInTheDocument();
  });

  it("renders nothing when no metadata resolves", () => {
    const { container } = render(<Breadcrumbs pathname="/totally-unknown" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty pathname", () => {
    const { container } = render(<Breadcrumbs pathname="/" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives explicit items precedence over route metadata", () => {
    render(<Breadcrumbs items={[{ label: "Infrastructure" }, { label: "Deployment" }]} />);
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Deployment")).toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });
});
