#!/usr/bin/env node
"use strict";

/**
 * Codegen: contracts/domain-ontology.json -> apps/console/src/lib/ontology.ts
 *
 * Run:  node scripts/export-ontology-types.cjs
 *
 * Plain CommonJS, no dependencies, no TS toolchain — paths resolve relative to
 * this script, so it works from any working directory. The generated file is
 * COMMITTED; re-run this script after editing the ontology contract and commit
 * both together. Never hand-edit apps/console/src/lib/ontology.ts — the gate
 * tests in apps/console/src/test/ontology-types.test.ts fail when it drifts.
 *
 * Emits:
 *   - ENTITY_STATES: Record<string, string[]>        (entity name -> all states)
 *   - ENTITY_FINAL_STATES: Record<string, string[]>  (module-private)
 *   - isFinalState(entity, state): boolean
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "contracts", "domain-ontology.json");
const outPath = path.join(root, "apps", "console", "src", "lib", "ontology.ts");

const ontology = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const entities = ontology.entities ?? {};
const names = Object.keys(entities);

if (names.length === 0) {
  throw new Error(`no entities found in ${path.relative(root, contractPath)}`);
}
if (typeof ontology.ontology_version !== "number") {
  throw new Error("ontology contract is missing the top-level ontology_version integer");
}

/** Emit a TS string literal in repo biome style (single quotes, escaped). */
const q = (value) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
/** Emit a TS string array literal on one line. */
const list = (values) => `[${(values ?? []).map(q).join(", ")}]`;

const states = names.map((name) => `  ${q(name)}: ${list(entities[name].states)},`);
const finalStates = names.map((name) => `  ${q(name)}: ${list(entities[name].final_states)},`);

const out = `// GENERATED — do not edit; run \`node scripts/export-ontology-types.cjs\`.
// Source of truth: contracts/domain-ontology.json (ontology_version: ${ontology.ontology_version}).
//
// Entity state machines, verbatim from the domain contract (state-name casing
// is intentionally preserved: lowercase for service operations/instances,
// UPPERCASE for legacy executions). Console code imports these instead of
// hardcoding status lists in badge components.

export const ENTITY_STATES: Record<string, string[]> = {
${states.join("\n")}
};

const ENTITY_FINAL_STATES: Record<string, string[]> = {
${finalStates.join("\n")}
};

/** True when \`state\` is a terminal state of \`entity\` per the ontology. */
export function isFinalState(entity: string, state: string): boolean {
  return (ENTITY_FINAL_STATES[entity] ?? []).includes(state);
}
`;

fs.writeFileSync(outPath, out);
console.log(
  `wrote ${path.relative(root, outPath)} ` +
    `(ontology_version ${ontology.ontology_version}, ${names.length} entities)`,
);
