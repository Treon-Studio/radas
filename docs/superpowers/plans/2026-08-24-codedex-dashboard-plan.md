# Implementation Plan: Codédex-Inspired 2-Column Dashboard

Redesign the `/dashboard` route in `@radas/console` into a rich, 2-column Codédex-inspired dashboard featuring project cards, quick actions, recent activity timeline, profile & org widget, and system status metrics.

## Proposed Changes

### Dashboard Component

#### [MODIFY] [dashboard.tsx](file:///Users/ridho/Documents/go/github.com/raizora/radas/apps/radas-console/src/routes/dashboard.tsx)
- Restructure page layout into 2 columns:
  - **Left (col-span-8)**:
    - Retro speech bubble banner (`Beep boop! We missed you, {username}`).
    - **Your Projects Grid**: Filtered active projects with pixel card styling, stack counts, and launch buttons.
    - **Quick Actions Grid**: Buttons for *New Stack*, *Run Playbook*, *Import Hosts*, *Manage Secrets*.
    - **Recent Activity Feed**: Timeline of recent executions and stack updates.
  - **Right (col-span-4)**:
    - **Profile Card**: Avatar, username, role, active org switcher dropdown, and profile button.
    - **System Metrics Widget**: Active workers count, total stacks count, and health status indicators.
    - **Quick Shortcuts Widget**: Direct links to Cloud Stacks, Playbooks, Vaults, and System Settings.

## Verification Plan

### Manual & Automated Verification
1. Run `npx tsc --noEmit` from `apps/radas-console` to verify 0 TypeScript errors.
2. Verify live UI rendered on `http://localhost:8080/dashboard`.
