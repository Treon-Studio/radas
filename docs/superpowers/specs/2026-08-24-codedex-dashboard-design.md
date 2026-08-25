# Spec: Codédex-Inspired 2-Column Dashboard Layout

## Context & Overview
Redesign `/dashboard` in `@radas/console` to follow Codédex UI 2-column layout aesthetics instead of a plain project list.

## Proposed Layout Structure

### Left Column (Main Content - 70% width)
1. **Retro Pixel Banner & Greeting**:
   - Pixel computer icon with speech bubble ("Beep boop. Welcome back, {username}!").
   - Quick action prompt card for starting project or provisioning cloud stack.
2. **Projects Overview Grid**:
   - Cards for active projects (`Treon Infrastructure GitOps`, `Getting Started`, etc.) with pixel borders, active stack badge, and quick launch button.
   - "+ New Project" button card.
3. **Quick Actions Grid**:
   - Action buttons: *New Cloud Stack*, *Run Playbook*, *Import Infrastructure*, *Vault & Secrets*.
4. **Recent Activity Timeline**:
   - Log of recent playbook executions, stack updates, and infrastructure changes with status badges (*Succeeded*, *Running*, *Failed*).

### Right Column (Sidebar Widgets - 30% width)
1. **User Profile & Active Org Card**:
   - Pixel avatar, username, role badge (`Admin` / `Owner`).
   - Current active organization selector (`Treon Studio` / `Radas Workspace`) with direct org switcher.
   - "View Profile" button.
2. **System Health & Status Widget**:
   - Status indicators for OpenSible Worker nodes, Flask API status, PostgreSQL connection.
   - Quick metrics counter (Active Stacks, Provisioned VMs, Saved Vault Keys).
3. **Recent Navigation / Quick Links**:
   - Shortcuts to frequently accessed pages (`/cloud/stacks`, `/infrastructure/deployment`, `/system/settings`).

## Technical Implementation Notes
- Modify `apps/radas-console/src/routes/dashboard.tsx` to render the 2-column layout (`grid grid-cols-1 lg:grid-cols-12 gap-6`).
- Fetch real data from `/api/projects`, `/api/orgs`, `/api/auth/me`, and `/api/system/workers` (or fallback indicators).
- Use pixel styling (`pxl-card-shadow`, `pxl-corner-sm`, `font-mono`) matching RADAS Codédex aesthetic.
