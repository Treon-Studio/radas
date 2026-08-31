import { describe, expect, it } from "vitest";
import ontology from "../../../../contracts/domain-ontology.json";
import { ENTITY_STATES, alertRuleTitle, isFinalState } from "../lib/ontology";

/**
 * Gate for the generated console ontology types (apps/console/src/lib/ontology.ts,
 * produced by scripts/export-ontology-types.cjs from contracts/domain-ontology.json).
 * The generated file is committed; these tests fail when it drifts from the
 * contract — the fix is to re-run the generator, never to hand-edit.
 */

const entities = ontology.entities as Record<
  string,
  { states: string[]; final_states: string[] }
>;

describe("generated ontology types", () => {
  it("covers every entity in the contract", () => {
    for (const name of Object.keys(entities)) {
      expect(ENTITY_STATES[name], `entity ${name} missing from generated types`).toBeDefined();
    }
  });

  it("state lists match the contract exactly", () => {
    for (const [name, def] of Object.entries(entities)) {
      expect(ENTITY_STATES[name], `entity ${name} state list drifted`).toEqual(def.states);
    }
  });

  it("final states match the contract", () => {
    expect(isFinalState("Execution", "SUCCESS")).toBe(true);
    expect(isFinalState("Execution", "RUNNING")).toBe(false);
    expect(isFinalState("ServiceOperation", "canceled")).toBe(true);
  });

  it("exposes alert rule titles from the contract", () => {
    expect(alertRuleTitle("workers.all_offline")).toBe("All workers offline!");
  });

  it("non-final and unknown states are never final", () => {
    // ServiceInstance records no final states today — nothing of it may resolve final.
    expect(isFinalState("ServiceInstance", "running")).toBe(false);
    expect(isFinalState("ServiceInstance", "destroyed")).toBe(false);
    // Unknown entities / states resolve false instead of throwing.
    expect(isFinalState("Nonexistent", "failed")).toBe(false);
    expect(isFinalState("Execution", "nonsense")).toBe(false);
  });
});
