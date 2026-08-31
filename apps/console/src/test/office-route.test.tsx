import { describe, expect, it, vi } from "vitest";

/**
 * /office route smoke test — verifies the route mounts the vendored
 * munder-difflin App (mocked here: the full panel tree drags in
 * monaco-editor, which jsdom cannot resolve) and that the pure vendored
 * modules (themes, cast, cafeteria lines) import cleanly.
 */

vi.mock("@office/App", () => ({
  App: () => <div data-testid="office-app-stub" />,
}));

import { Route } from "../routes/office";
import { THEMES } from "@office/scene/office/themeRegistry";
import { DEFAULT_CHARACTER, OFFICE_CAST } from "@office/scene/office/cast";
import { pickSoloLine } from "@office/scene/office/cafeteriaLines";

describe("office route", () => {
  it("mounts the office App component", () => {
    expect(Route.options?.component).toBeDefined();
  });
});

describe("office vendored modules", () => {
  it("ships themes with maps/tilesets", () => {
    expect(Object.keys(THEMES).length).toBeGreaterThan(0);
    expect(THEMES.office).toBeDefined();
    expect(THEMES.brooklyn99).toBeDefined();
  });

  it("defines the cast with the default character", () => {
    expect(OFFICE_CAST.map((m: { name: string }) => m.name)).toContain(DEFAULT_CHARACTER);
    expect(OFFICE_CAST.length).toBeGreaterThan(1);
  });

  it("cafeteria lines return a string", () => {
    const line = pickSoloLine(DEFAULT_CHARACTER, "coffee", 1);
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });
});
