# Phase 6 UX, Accessibility, Command Palette, In-App Help & RTL Implementation Plan (Batch 30)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement navigation prefetch router, offline fallback badge, semantic CSS theme vars, accessibility & contrast validator, motion/reduced-motion styles, loading skeleton registry, status tooltips, command palette & keyboard shortcuts, undo action manager, in-app help drawer, product changelog, user feedback rater, and RTL layout readiness (UC580, UC582, UC585, UC588, UC589, UC590, UC591, UC592, UC593, UC594, UC595, UC597, UC599, UC600, UC603, UC606).

**Architecture:**
- `services/nav_prefetch.py` & `services/offline_fallback.py`:
  - UC580: Computes route prefetch priorities for hover navigation.
  - UC582: Emits network status envelopes and offline badge indicators for API outages.
- `services/theme_semantic_vars.py` & `services/a11y_validator.py` & `services/color_contrast.py`:
  - UC585: Maps design tokens into semantic CSS variables (`--color-success`, `--color-danger`, `--color-warning`).
  - UC588 & UC589: Validates focus ring styling and WCAG AAA color contrast ratios (>= 7:1 for normal text).
- `services/motion_styles.py` & `services/reduced_motion.py` & `services/skeleton_registry.py` & `services/status_tooltip.py`:
  - UC590 & UC591: Resolves CSS transition classes respecting `prefers-reduced-motion`.
  - UC592 & UC593: Standardizes loading skeleton layout structures and HTTP status code tooltips.
- `services/command_palette.py` & `services/undo_action_manager.py`:
  - UC594 & UC595: Index and search command palette actions with shortcut mappings (`/`, `Cmd+K`).
  - UC597: Manages time-windowed undo queues for non-destructive actions.
- `services/inapp_help_docs.py` & `services/product_changelog.py` & `services/user_feedback.py` & `services/rtl_layout_manager.py`:
  - UC599 & UC600: Serves context-sensitive in-app drawer documentation and product release notes.
  - UC603 & UC606: Captures user star ratings/feedback and configures bidirectional (LTR/RTL) layout direction.

**Tech Stack:** Python 3.14, Flask, PostgreSQL, Pytest.

---

### Task 1: UC580, UC582, UC585, UC588 & UC589 — Navigation, Offline, Theme & Accessibility

**Files:**
- Create: `apps/opensible-server/services/nav_prefetch.py`
- Create: `apps/opensible-server/services/offline_fallback.py`
- Create: `apps/opensible-server/services/theme_semantic_vars.py`
- Create: `apps/opensible-server/services/a11y_validator.py`
- Test: `apps/opensible-server/tests/test_ux_a11y_command_palette_batch30_fase6.py`

**Interfaces:**
- Produces: `get_prefetch_routes(current_path: str) -> List[str]`
- Produces: `get_offline_banner_state(is_connected: bool, pending_queue_size: int = 0) -> Dict[str, Any]`
- Produces: `get_semantic_theme_tokens(theme: str = "dark") -> Dict[str, str]`
- Produces: `calculate_contrast_ratio(foreground_hex: str, background_hex: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_ux_a11y_command_palette_batch30_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement nav prefetch, offline fallback, theme tokens, and a11y contrast**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: UC590, UC591, UC592 & UC593 — Motion, Skeletons & Status Tooltips

**Files:**
- Create: `apps/opensible-server/services/motion_styles.py`
- Create: `apps/opensible-server/services/skeleton_registry.py`
- Create: `apps/opensible-server/services/status_tooltip.py`
- Test: `apps/opensible-server/tests/test_ux_a11y_command_palette_batch30_fase6.py`

**Interfaces:**
- Produces: `get_transition_class(animation_type: str, prefers_reduced_motion: bool = False) -> str`
- Produces: `get_skeleton_schema(card_type: str) -> Dict[str, Any]`
- Produces: `format_status_tooltip(status_code: int, status_label: str) -> Dict[str, str]`

- [x] **Step 1: Write failing test in `test_ux_a11y_command_palette_batch30_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement motion styles, skeleton schemas, and status tooltips**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: UC594, UC595 & UC597 — Command Palette & Undo Action Manager

**Files:**
- Create: `apps/opensible-server/services/command_palette.py`
- Create: `apps/opensible-server/services/undo_action_manager.py`
- Test: `apps/opensible-server/tests/test_ux_a11y_command_palette_batch30_fase6.py`

**Interfaces:**
- Produces: `search_command_palette(query: str) -> List[Dict[str, Any]]`
- Produces: `register_undoable_action(user_id: str, action_type: str, revert_fn_data: Dict[str, Any], ttl_seconds: int = 10) -> Dict[str, Any]`
- Produces: `execute_undo_action(action_id: str) -> Dict[str, Any]`

- [x] **Step 1: Write failing test in `test_ux_a11y_command_palette_batch30_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement command palette search and undo action manager**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: UC599, UC600, UC603 & UC606 — In-App Help, Changelog, Feedback & RTL

**Files:**
- Create: `apps/opensible-server/services/inapp_help_docs.py`
- Create: `apps/opensible-server/services/product_changelog.py`
- Create: `apps/opensible-server/services/user_feedback.py`
- Create: `apps/opensible-server/services/rtl_layout_manager.py`
- Test: `apps/opensible-server/tests/test_ux_a11y_command_palette_batch30_fase6.py`

**Interfaces:**
- Produces: `get_help_doc_for_route(route_path: str) -> Dict[str, Any]`
- Produces: `get_product_changelog(limit: int = 10) -> List[Dict[str, Any]]`
- Produces: `submit_user_feedback(user_id: str, rating: int, comment: Optional[str] = None, page_url: Optional[str] = None) -> Dict[str, Any]`
- Produces: `resolve_layout_direction(locale: str) -> str`

- [x] **Step 1: Write failing test in `test_ux_a11y_command_palette_batch30_fase6.py`**
- [x] **Step 2: Run test to verify failure**
- [x] **Step 3: Implement help docs, changelog, user feedback, and RTL resolver**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: Roadmap Update & Final Full Verification

**Files:**
- Modify: `docs/ROADMAP.md` (mark UC580, UC582, UC585, UC588, UC589, UC590, UC591, UC592, UC593, UC594, UC595, UC597, UC599, UC600, UC603, UC606 as ✅)
- Run complete pytest test suite across server.

- [x] **Step 1: Update `docs/ROADMAP.md`**
- [x] **Step 2: Run pytest full suite**
- [x] **Step 3: Commit and finalize**
