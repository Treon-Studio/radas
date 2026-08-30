// GENERATED — do not edit; run `node scripts/export-ontology-types.cjs`.
// Source of truth: contracts/domain-ontology.json (ontology_version: 1).
//
// Entity state machines, verbatim from the domain contract (state-name casing
// is intentionally preserved: lowercase for service operations/instances,
// UPPERCASE for legacy executions). Console code imports these instead of
// hardcoding status lists in badge components.

export const ENTITY_STATES: Record<string, string[]> = {
  'Execution': ['QUEUED', 'RUNNING', 'CANCELING', 'SUCCESS', 'FAILED', 'CANCELED'],
  'ServiceOperation': ['pending', 'queued', 'running', 'succeeded', 'failed', 'canceled'],
  'ServiceInstance': ['draft', 'provisioning', 'running', 'degraded', 'stopped', 'updating', 'destroying', 'destroyed', 'failed'],
  'Worker': ['online', 'offline', 'draining'],
  'Approval': ['pending', 'approved', 'rejected', 'expired'],
  'Budget': ['ok', 'alerting', 'unavailable'],
  'Project': [],
  'Stack': [],
  'ServiceDefinition': [],
  'RuntimeProvider': [],
};

const ENTITY_FINAL_STATES: Record<string, string[]> = {
  'Execution': ['SUCCESS', 'FAILED', 'CANCELED'],
  'ServiceOperation': ['succeeded', 'failed', 'canceled'],
  'ServiceInstance': [],
  'Worker': [],
  'Approval': ['approved', 'rejected', 'expired'],
  'Budget': [],
  'Project': [],
  'Stack': [],
  'ServiceDefinition': [],
  'RuntimeProvider': [],
};

/** True when `state` is a terminal state of `entity` per the ontology. */
export function isFinalState(entity: string, state: string): boolean {
  return (ENTITY_FINAL_STATES[entity] ?? []).includes(state);
}
