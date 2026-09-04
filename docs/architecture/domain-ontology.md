# Domain Ontology

`contracts/domain-ontology.json` is the platform's semantic contract: the
entities of the domain, their states and transitions, their relations and
events, and the alert rules evaluated against live status. It is versioned by
a top-level `ontology_version` integer and sits alongside the other
authoritative contract artifacts in `contracts/`.

## What it is — and what it is not

- **It is** a pragmatic, versioned JSON document, validated by
  `RadasOntologyParityTest` (apps/server_elixir/test). Each entity records its
  `states`, `final_states`, `transitions`, `relations`, `events`, and the
  `source` file:lines it was transcribed from. Entities with an empty state
  machine (`Project`, `Stack`, `ServiceDefinition`, `RuntimeProvider`) are
  declared to close the relation graph; their state machines are pending
  transcription.
- **It is not** OWL, RDF, or a reasoner. There is no inference, no class
  hierarchy, no general expression language. Alert rules use the tiny DSL
  below and nothing else.
- **It is descriptive first**: state names are recorded verbatim from server
  constants — lowercase for service operations/instances, UPPERCASE for
  legacy executions. The ontology does not normalize casing; it records
  reality.
- **It carries no secrets**: entity metadata and rules only — no tokens, no
  payloads.

Server code reads it through `RadasAI.Ontology` (apps/server_elixir/lib/radas_ai/ontology.ex)
(`load_ontology`, `states`, `transitions`, `alert_rules`), and two
authenticated read-only routes serve it under the platform envelope:
`GET /api/ontology` (the whole document) and `GET /api/ontology/alerts`
(`data.alerts` = the rule set).

## Alert DSL

Each rule's `when` expression is evaluated by
`apps/desktop-app/ontology/evaluate.js` (tokenizer + recursive-descent
parser; no `eval`, no `Function`; anything unrecognized throws).

```
expr       := comparison ( "&&" comparison )*
comparison := path ( "==" | "!=" | ">=" | "<=" | ">" | "<" ) operand
operand    := path | literal
path       := dotted identifier, resolved against the status payload
              (unknown paths throw)
literal    := integer | float | double-quoted string
```

- The **left side must be a path**. The right side may be a literal or
  another path — path-vs-path comparisons are supported, e.g.
  `budget.usage_pct >= budget.alert_at_pct`.
- `&&` is the only combinator: no `||`, no parentheses, no negation, no
  function calls.
- Paths resolve against the status payload the pet builds (`workers.total`,
  `workers.online`, `approvals.pending`, ...). Unknown paths throw at
  evaluation time; the contract-side schema test
  (`test_alert_when_uses_only_supported_syntax`) rejects unsupported syntax
  before it can ship.

Examples from the contract:

| id                      | when                                      | severity |
|-------------------------|-------------------------------------------|----------|
| `workers.all_offline`   | `workers.total > 0 && workers.online == 0` | critical |
| `workers.partial_offline` | `workers.online > 0 && workers.online < workers.total` | warning |
| `budget.unavailable`    | `budget.spend_status == "unavailable"`     | warning  |

## Parity philosophy

The ontology is **descriptive**: it records the state machines as they exist
in server code (`storage/executions_store.py`, `services/service_operations.py`,
`services/service_instances.py`). It is not a spec the code was generated
from, and the parity gate is not a snapshot to regenerate mechanically.

`RadasOntologyParityTest` compares the ontology against the
real server constants and pins the `/api/ontology` routes. When it fails,
server code and the contract have drifted: **update whichever side is wrong
and reconcile both in one commit whose message explains the change.** The
same discipline applies to the generated console types below.

## Adding an entity or alert rule

1. **Edit `contracts/domain-ontology.json`** — add the entity (states
   verbatim from the server constants; transitions exactly as the code
   allows) or the alert rule (`when` within the DSL, plus `severity`,
   `route`, `title`).
2. **Run the parity tests** (`RadasOntologyParityTest` in apps/server_elixir) —
   they name the drift between the contract and the code. If the server
   constants must change to match, change them; if the contract must change
   to match the server, change it back.
3. **Reconcile both sides in one commit.**
4. Rule-specific constraints:
   - Every counter/path an alert references must exist: the parity test
     checks that counters mentioned by rules are emitted by
     `storage/metrics_counters.py` / `services/metrics.py`, and the evaluator
     throws at runtime on unknown status paths.
   - If entity states or alert titles changed, **regenerate the console
     types** (below) in the same commit.

## How the pet consumes it

The desktop pet evaluates alerts in the **Electron main process**
(`apps/desktop-app/main.js`), where the token-carrying fetches already live:

1. Fetch `GET /api/ontology/alerts`, `/api/admin/workers`, and
   `/api/approvals?status=pending` with the existing Bearer token.
2. Build the status payload (`ontology/alerts.js: buildStatusPayload`) —
   only sections actually fetched are present.
3. Evaluate every rule (`evaluateAlerts`) with per-rule error isolation: a
   rule referencing status that was not fetched is skipped, never kills the
   batch.
4. Order firing alerts by severity (`orderAlerts`: critical → warning →
   info).

The renderer only sees the result: aggregate status counts plus
severity-sorted alert metadata (`id`, `severity`, `route`, `title`) — never
tokens, never raw rule expressions.

## Console types

`apps/console/src/lib/ontology.ts` is **generated** from the contract by:

```bash
node scripts/export-ontology-types.cjs
```

It emits `ENTITY_STATES`, `ENTITY_FINAL_STATES`, `isFinalState`, and
`alertRuleTitle`. The file is committed; never hand-edit it — re-run the
script after editing entity states or alert titles and commit both together.
The console gate tests (`apps/console/src/test/ontology-types.test.ts`) fail
when the generated file drifts from the contract.

## Known limitation

The `budget.threshold` and `budget.unavailable` rules cannot fire in the pet
today: the main process does not fetch budget telemetry because there is no
side-effect-free budget status endpoint to poll. `buildStatusPayload` omits
the `budget` section, so those rules resolve to an unknown path and are
skipped rather than erroring. They activate once such an endpoint exists and
the pet starts fetching it.
