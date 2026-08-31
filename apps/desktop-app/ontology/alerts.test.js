const test = require("node:test");
const assert = require("node:assert");
const { buildStatusPayload, evaluateAlerts, orderAlerts } = require("./alerts");

test("buildStatusPayload maps API results to the ontology field paths", () => {
  const payload = buildStatusPayload({
    workers: { total: 3, online: 1 },
    approvals: { pending: 2 },
    budget: { usage_pct: 50, alert_at_pct: 80, spend_status: "ok" },
  });
  assert.deepEqual(payload.workers, { total: 3, online: 1 });
  assert.deepEqual(payload.approvals, { pending: 2 });
});

test("orderAlerts sorts critical before warning before info", () => {
  const ordered = orderAlerts({
    a: { severity: "info" },
    b: { severity: "critical" },
    c: { severity: "warning" },
  });
  assert.deepEqual(ordered.map(([, rule]) => rule.severity), ["critical", "warning", "info"]);
});

test("evaluateAlerts returns only firing rules", () => {
  const rules = {
    allOff: { when: "workers.total > 0 && workers.online == 0" },
    pending: { when: "approvals.pending > 0" },
  };
  const firing = evaluateAlerts(rules, {
    workers: { total: 2, online: 0 },
    approvals: { pending: 0 },
  });
  assert.deepEqual(Object.keys(firing), ["allOff"]);
  assert.equal(firing.allOff, rules.allOff);
});

test("evaluateAlerts skips rules whose status paths are absent (no budget fetch)", () => {
  const ontology = require("../../../contracts/domain-ontology.json");
  const firing = evaluateAlerts(ontology.alerts, {
    workers: { total: 3, online: 0 },
    approvals: { pending: 2 },
  });
  // Budget rules cannot resolve without budget telemetry; the workers and
  // approval rules must still evaluate rather than the whole batch throwing.
  assert.deepEqual(Object.keys(firing).sort(), ["approvals.pending", "workers.all_offline"]);
  assert.equal(firing["workers.all_offline"].severity, "critical");
});

test("orderAlerts places unknown severities last", () => {
  const ordered = orderAlerts({
    a: { severity: "mystery" },
    b: { severity: "warning" },
  });
  assert.deepEqual(ordered.map(([id]) => id), ["b", "a"]);
});
