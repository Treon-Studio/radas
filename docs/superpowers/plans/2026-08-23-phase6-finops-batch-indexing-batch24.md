# Phase 6 Rightsizing Safety, Multi-Currency FinOps, Search Indexing & Batch Engine Implementation Plan (Batch 24)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pre-rightsizing automated snapshot triggers, cloud provider pricing table sync, multi-currency converter with exchange rates, resource-type cost breakdowns, search indexing engine, multi-run batch operations coordinator, template draft plan generator, and component visual state snapshot validator (UC556, UC558, UC559, UC562, UC565, UC568, UC569, UC576).

**Architecture:**
- `services/rightsizing_snapshot.py` & `services/pricing_table_updater.py`:
  - UC556: Automatically triggers a safety state snapshot before executing a rightsizing instance resizing action.
  - UC558: Fetches, normalizes, and caches updated cloud provider pricing catalogs (AWS/GCP/Azure).
- `services/currency_converter.py` & `services/resource_cost_breakdown.py`:
  - UC559: Currency converter supporting exchange rates (USD, EUR, IDR, JPY, GBP) and locale currency formatting.
  - UC562: Breaks down stack cloud expenses into categories: Compute (EC2/GCE), Storage (S3/EBS), Networking (NAT/ALB), and Database (RDS).
- `services/search_indexer.py` & `services/batch_operations.py`:
  - UC565: Inverted index tokenizer for fast multi-field search over stacks, runs, and catalog items.
  - UC568: Coordinates bulk operations across executions (e.g. bulk retry failed runs, bulk cancel queued runs).
- `services/plan_draft_summary.py` & `services/visual_snapshot.py`:
  - UC569: Synthesizes draft execution plans and change impact summaries directly from template JSON parameters.
  - UC576: Computes structural visual checksums / DOM snapshots for UI regression testing.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC556 & UC558 — Rightsizing Safety Snapshot & Pricing Table Updater

**Files:**
- Create: `apps/opensible-server/services/rightsizing_snapshot.py`
- Create: `apps/opensible-server/services/pricing_table_updater.py`
- Test: `apps/opensible-server/tests/test_finops_batch_indexing_batch24_fase6.py`

**Interfaces:**
- Produces: `execute_safe_rightsizing(project_id: str, stack: str, resource_id: str, target_instance_type: str) -> Dict[str, Any]`
- Produces: `update_provider_pricing_table(provider: str, rates: Dict[str, float]) -> Dict[str, Any]`
- Produces: `get_instance_price(provider: str, instance_type: str) -> float`

- [x] **Step 1: Write failing test in `test_finops_batch_indexing_batch24_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement rightsizing snapshot and pricing table updater**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC559 & UC562 — Multi-Currency Converter & Resource Cost Breakdown

**Files:**
- Create: `apps/opensible-server/services/currency_converter.py`
- Create: `apps/opensible-server/services/resource_cost_breakdown.py`
- Test: `apps/opensible-server/tests/test_finops_batch_indexing_batch24_fase6.py`

**Interfaces:**
- Produces: `convert_currency(amount: float, from_curr: str = "USD", to_curr: str = "IDR") -> Dict[str, Any]`
- Produces: `format_currency(amount: float, currency: str = "USD", locale_code: str = "en_US") -> str`
- Produces: `categorize_resource_costs(resources: List[Dict[str, Any]]) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_finops_batch_indexing_batch24_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement currency converter and resource cost breakdown**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC565 & UC568 — Search Inverted Indexer & Multi-Run Batch Operations

**Files:**
- Create: `apps/opensible-server/services/search_indexer.py`
- Create: `apps/opensible-server/services/batch_operations.py`
- Test: `apps/opensible-server/tests/test_finops_batch_indexing_batch24_fase6.py`

**Interfaces:**
- Produces: `index_document(doc_id: str, doc_type: str, text_content: str, metadata: Optional[Dict[str, Any]] = None) -> None`
- Produces: `search_indexed_documents(query: str, doc_type: Optional[str] = None) -> List[Dict[str, Any]]`
- Produces: `execute_batch_run_operation(execution_ids: List[str], action: str, actor: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_finops_batch_indexing_batch24_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement search indexer and batch operations coordinator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC569 & UC576 — Plan Draft Summarizer & Visual Snapshot Validator

**Files:**
- Create: `apps/opensible-server/services/plan_draft_summary.py`
- Create: `apps/opensible-server/services/visual_snapshot.py`
- Test: `apps/opensible-server/tests/test_finops_batch_indexing_batch24_fase6.py`

**Interfaces:**
- Produces: `generate_draft_plan_summary(template_data: Dict[str, Any], variables: Dict[str, Any]) -> Dict[str, Any]`
- Produces: `compare_visual_snapshots(reference_snapshot: Dict[str, Any], current_snapshot: Dict[str, Any]) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_finops_batch_indexing_batch24_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement plan draft summarizer and visual snapshot validator**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC556, UC558, UC559, UC562, UC565, UC568, UC569, UC576 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
