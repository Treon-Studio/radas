// Pet alert binding: ontology rules -> status payload -> severity-ordered
// firing alerts. Consumes the evaluator (./evaluate) and the rule set served
// by GET /api/ontology/alerts.
//
// Fault tolerance: the status payload only contains sections the desktop app
// actually fetched (workers, approvals). Rules referencing sections that were
// not fetched (e.g. budget telemetry) throw "unknown status path" inside the
// evaluator; evaluateAlerts treats a per-rule evaluation error as "did not
// fire" so one unresolvable rule can never take down the whole alert batch.

const { evaluateAlert, evaluateAll } = require("./evaluate");

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function buildStatusPayload({ workers, approvals, budget } = {}) {
  const payload = {
    workers: workers || { total: 0, online: 0 },
    approvals: approvals || { pending: 0 },
  };
  if (budget) payload.budget = budget;
  return payload;
}

function evaluateAlerts(rules, statusPayload) {
  // evaluateAll is all-or-nothing (any rule error throws), so evaluate
  // per-rule with error isolation: a rule referencing status that was not
  // fetched (e.g. budget telemetry) is skipped instead of killing the batch.
  const results = {};
  for (const [id, rule] of Object.entries(rules)) {
    try {
      results[id] = evaluateAlert(rule, statusPayload);
    } catch {
      // Rule references unavailable status (or is malformed): skip it.
    }
  }
  const firing = {};
  for (const [id, fires] of Object.entries(results)) {
    if (fires === true) firing[id] = rules[id];
  }
  return firing;
}

function orderAlerts(firingRules) {
  return Object.entries(firingRules).sort(
    (a, b) =>
      (SEVERITY_ORDER[a[1].severity] ?? Number.MAX_SAFE_INTEGER) -
      (SEVERITY_ORDER[b[1].severity] ?? Number.MAX_SAFE_INTEGER)
  );
}

module.exports = { buildStatusPayload, evaluateAlerts, orderAlerts };
