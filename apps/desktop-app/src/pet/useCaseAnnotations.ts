// Concept bindings: which pet use cases may speak about which ontology alert.
// Alert ids and titles are recorded verbatim from contracts/domain-ontology.json
// (the "alerts" map); do not invent ids here — add them to the ontology first.
//
// Use-case ids are 0-based indices into PET_500_USE_CASES (see pet500UseCases.ts;
// entry ids are 1-based, so index = id - 1). Each binding lists the index and the
// exact use-case text so the editorial choice is auditable. The corpus is
// positive-status prose, so bindings are thematic: the closest on-topic texts for
// the condition, contradictions minimized.

export const ALERT_TITLES: Record<string, string> = {
  "workers.all_offline": "All workers offline!",
  "workers.partial_offline": "Some workers offline",
  "approvals.pending": "Approvals waiting",
  "budget.threshold": "Budget threshold reached",
  "budget.unavailable": "Cost store unavailable",
};

export const CONCEPT_BINDINGS: Record<string, number[]> = {
  // Worker/node gone-down themes (Kubernetes & Cloud, CI/CD Pipeline):
  // [298] "Node Drainage Finished" (idle) — node drained away
  // [223] "Old Pods Drained Clean" (idle) — pods drained off a node
  // [232] "Ephemeral Runner Drained" (idle) — a runner (worker) drained and gone
  "workers.all_offline": [298, 223, 232],

  // Partial capacity-loss themes (Kubernetes & Cloud, FinOps & Cloud Cost):
  // [249] "Autoscaler Scaled Down" (idle) — fleet shrank, some workers gone
  // [426] "Spot Graceful Drain OK" (idle) — spot worker reclaimed, partial loss
  // [297] "PodDisruptionBudget Safe" (happy) — disruption budget governing partial outage
  "workers.partial_offline": [249, 426, 297],

  // Waiting/queue themes (Kubernetes & Cloud, FinOps & Cloud Cost):
  // [456] "Batch Queue Scheduled" (idle) — items queued, waiting to run
  // [290] "CronJob Triggered 00:00" (thinking) — scheduled work awaiting execution
  // [453] "Smart Scheduling Active" (idle) — scheduled pending work
  "approvals.pending": [456, 290, 453],

  // Cost/spend themes (FinOps & Cloud Cost):
  // [461] "Budget Alert Threshold 50%" (idle) — exact budget-threshold text
  // [421] "Current Spend -24% Target" (happy) — spend vs target text
  // [448] "Cloud Invoice Projected OK" (happy) — spend projection text
  "budget.threshold": [461, 421, 448],

  // Cost-data visibility themes (FinOps & Cloud Cost) — the corpus's canonical
  // cost-store texts (spend_status "unavailable" means the cost store cannot be read):
  // [444] "Kubecost Metrics Accurate" (idle) — cost metrics store
  // [445] "Per-Namespace Cost Known" (idle) — cost data visibility
  // [467] "Cloud Billing Synced" (idle) — billing data feed
  "budget.unavailable": [444, 445, 467],
};
