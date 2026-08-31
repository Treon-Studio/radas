const test = require("node:test");
const assert = require("node:assert");
const { evaluateAlert, evaluateAll } = require("./evaluate");

const status = {
  workers: { total: 3, online: 1 },
  approvals: { pending: 2 },
  budget: { usage_pct: 90, alert_at_pct: 80, spend_status: "ok" },
};

test("workers.all_offline is false when some online", () => {
  const rule = { when: "workers.total > 0 && workers.online == 0" };
  assert.equal(evaluateAlert(rule, status), false);
});

test("workers.all_offline is true when total>0 and online==0", () => {
  const rule = { when: "workers.total > 0 && workers.online == 0" };
  assert.equal(evaluateAlert(rule, { ...status, workers: { total: 3, online: 0 } }), true);
});

test("approvals.pending fires for pending>0", () => {
  const rule = { when: "approvals.pending > 0" };
  assert.equal(evaluateAlert(rule, status), true);
});

test("budget string comparison", () => {
  const rule = { when: 'budget.spend_status == "unavailable"' };
  assert.equal(evaluateAlert(rule, status), false);
  assert.equal(evaluateAlert(rule, { ...status, budget: { spend_status: "unavailable" } }), true);
});

test("evaluateAll returns per-rule booleans", () => {
  const rules = {
    a: { when: "approvals.pending > 0" },
    b: { when: "workers.online == 0" },
  };
  const result = evaluateAll(rules, status);
  assert.deepEqual(result, { a: true, b: false });
});

test("malformed expression throws (no eval)", () => {
  const rule = { when: "process.exit(1)" };
  assert.throws(() => evaluateAlert(rule, status));
});

// The contract (contracts/domain-ontology.json) uses path-vs-path
// comparisons; both sides resolve against the status payload.
test("path-vs-path comparison (budget.threshold)", () => {
  const rule = { when: "budget.usage_pct >= budget.alert_at_pct" };
  assert.equal(evaluateAlert(rule, status), true);
  assert.equal(evaluateAlert(rule, { ...status, budget: { usage_pct: 50, alert_at_pct: 80 } }), false);
});

test("path-vs-path with && (workers.partial_offline)", () => {
  const rule = { when: "workers.online > 0 && workers.online < workers.total" };
  assert.equal(evaluateAlert(rule, status), true);
  assert.equal(evaluateAlert(rule, { ...status, workers: { total: 3, online: 3 } }), false);
});

test("unknown status path throws", () => {
  const rule = { when: "nosuch.path > 0" };
  assert.throws(() => evaluateAlert(rule, status));
});

test("injection-style expressions throw", () => {
  assert.throws(() => evaluateAlert({ when: "workers.total; process.exit(1)" }, status));
  assert.throws(() => evaluateAlert({ when: "workers.total > 0 || fetch('http://x')" }, status));
});
