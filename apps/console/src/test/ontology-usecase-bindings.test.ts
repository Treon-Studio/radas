import { describe, expect, it } from "vitest";
import { CONCEPT_BINDINGS, ALERT_TITLES } from "../../../../apps/desktop-app/src/pet/useCaseAnnotations";

describe("pet use-case concept bindings", () => {
  it("binds at least one use case to every shipped alert rule", () => {
    for (const alertId of Object.keys(ALERT_TITLES)) {
      expect(CONCEPT_BINDINGS[alertId], `alert ${alertId} has no bound use cases`).toBeDefined();
      expect(CONCEPT_BINDINGS[alertId].length).toBeGreaterThan(0);
    }
  });

  it("only references alert ids that exist in the alert title map", () => {
    for (const alertId of Object.keys(CONCEPT_BINDINGS)) {
      expect(ALERT_TITLES[alertId], `binding references unknown alert ${alertId}`).toBeDefined();
    }
  });
});
