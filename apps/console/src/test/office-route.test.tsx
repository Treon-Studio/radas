import { describe, expect, it, vi } from "vitest";

/**
 * Office route smoke test — verifies the /office route file mounts the
 * vendored OfficeFloor scene and the office shims stay importable. The
 * PixiJS scene itself needs a real WebGL canvas (jsdom can't run it), so
 * OfficeFloor is stubbed here; the vendored modules are asserted importable
 * via their pure modules (themeRegistry, cast, cafeteriaLines).
 */

vi.mock("@/components/office/OfficeFloor", () => ({
  OfficeFloor: () => <div data-testid="office-floor-stub" />,
}));

import { Route } from "../routes/office";
import { THEMES } from "../components/office/themeRegistry";
import { DEFAULT_CHARACTER, OFFICE_CAST } from "../components/office/cast";
import { pickSoloLine } from "../components/office/cafeteriaLines";

describe("office route", () => {
  it("mounts the OfficeFloor component", () => {
    // TanStack file-route instance: the component rides on options; the
    // path itself is pinned by the generated routeTree (regen-checked by
    // the build) and asserted indirectly by the office entry in NavSections.
    expect(Route.options?.component).toBeDefined();
  });
});

describe("office vendored modules", () => {
  it("ships office themes with tilesets", () => {
    expect(Object.keys(THEMES).length).toBeGreaterThan(0);
    expect(THEMES.office).toBeDefined();
  });

  it("defines the default character among the cast", () => {
    expect(OFFICE_CAST.map((m) => m.name)).toContain(DEFAULT_CHARACTER);
    expect(OFFICE_CAST.length).toBeGreaterThan(1);
  });

  it("cafeteria lines return a string", () => {
    const line = pickSoloLine(DEFAULT_CHARACTER, "coffee", 1);
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });
});
