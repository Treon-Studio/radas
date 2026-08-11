# OpenSible Console Vercel Retheme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `apps/opensible-console` to a Vercel-derived design system — paper-white canvas, monochrome obsidian type, hairline borders, 6px geometry, mono-stamped labels — and move the chrome from a left sidebar to a 64px top nav bar.

**Architecture:** Token remap in `styles.css` (keeps existing `--color-*` var names so route code barely changes), then rebuild the shared `ui/` primitives, then restructure the shell (`__root.tsx` + new `NavSections` + slimmed `Header`), then a targeted inline sweep. No changes to route structure, APIs, i18n keys, or data layer.

**Tech Stack:** Vite 6, React 19, Tailwind CSS v4 (`@theme`), TanStack Router/Start, Radix primitives, class-variance-authority, @remixicon/react, @fontsource (Geist Pixel, Geist Mono).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-11-vercel-console-theme-design.md`
- **Design lock:** monochrome base; `--color-primary` = obsidian `#171717` (light); brand yellow `hsl(45 95% 50%)` is the ONLY chromatic accent (active nav / selected / focus rings / in-flight dot); terminal green `#297a3a` only for `✓` confirmations. No red, no emerald, no amber fills — status is glyph + weight.
- **Dark theme stays:** `[data-theme=dark]` flips the grayscale; primary becomes `#ededed` fill on `#0a0a0a` text; inverted surfaces become paper-white.
- **Typefaces:** Geist Pixel stays for interface; mono switches to **Geist Mono** (add `@fontsource/geist-mono`). Mono owns labels/eyebrows/table headers/status pills (11px, uppercase, `0.071em` tracking).
- **Radius:** 6px (`rounded-md`) on cards/buttons/inputs; pills `rounded-full` only for compact badge/chrome actions; nav items 6px.
- **Shadows:** card elevation = hairline ring `0 0 0 1px rgba(0,0,0,0.08)`; floating menus keep one low shadow (`0 2px 8px rgba(0,0,0,0.08)`).
- **Var alias rule:** keep `--color-destructive`/`--color-success`/`--color-warning` defined (now obsidian / terminal green / yellow) so existing error-copy and icon call sites resolve without edits; their FILL usage is retired from primitives.
- **Verification protocol (no unit-test suite exists in this app):** every task gates on `pnpm --filter @radas/opensible-console typecheck` passing with 0 errors, then `pnpm --filter @radas/opensible-console build`; the final task adds a manual visual checklist. Commands run from repo root.
- **Working tree:** `apps/opensible-console/src/routes/login.tsx` and `src/lib/i18n/{en,km,ko}/common.ts` have uncommitted changes — preserve them; Task 4 absorbs and restyles the login page.

---

### Task 1: Token layer + Geist Mono

**Files:**
- Modify: `apps/opensible-console/package.json`
- Modify: `apps/opensible-console/src/styles.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the complete light/dark token scale (incl. aliases `--color-destructive` = obsidian, `--color-warning` = yellow accent, `--color-success` = terminal green), `--color-*` scale (`charcoal/stone/smoke/ash/carbon`), `--color-inverted*` surfaces, Geist Mono font, and the global mono table-header rule (`thead th`).

- [ ] **Step 1: Add the Geist Mono font dependency**

In `apps/opensible-console/package.json`, add to the `dependencies` object:

```json
"@fontsource/geist-mono": "^5.3.0",
```

(place it adjacent to the existing `@fontsource/geist-pixel` entry, keeping alphabetical order before `@radix-ui/...`).

- [ ] **Step 2: Install the dependency**

Run: `pnpm install --filter @radas/opensible-console`
Expected: lockfile updates; no errors.

- [ ] **Step 3: Replace the token layer**

Replace the entire contents of `apps/opensible-console/src/styles.css` with:

```css
@import "tailwindcss";
@import "@fontsource/geist-pixel";
@import "@fontsource/geist-mono";

@theme {
  --font-sans: "Geist Pixel", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Vercel system — light */
  --color-background: #fafafa;
  --color-foreground: #171717;
  --color-card: #ffffff;
  --color-card-foreground: #171717;
  --color-muted: #f4f4f4;
  --color-muted-foreground: #666666;
  --color-border: #ebebeb;
  --color-input: #ebebeb;
  --color-primary: #171717;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f4f4f4;
  --color-secondary-foreground: #4d4d4d;
  --color-accent: hsl(45 95% 50%);
  --color-accent-foreground: #171717;
  --color-charcoal: #4d4d4d;
  --color-stone: #666666;
  --color-smoke: #a8a8a8;
  --color-ash: #c9c9c9;
  --color-carbon: #000000;
  --color-destructive: #171717;
  --color-destructive-foreground: #ffffff;
  --color-success: #297a3a;
  --color-warning: hsl(45 95% 50%);
  --color-ring: hsl(45 95% 50%);

  /* Inverted surfaces (CLI / log panels) */
  --color-inverted: #171717;
  --color-inverted-foreground: #e8e8e8;
  --color-inverted-muted: #8f8f8f;

  --radius: 0.375rem;
  --shadow-card: 0 0 0 1px rgba(0, 0, 0, 0.08);
  --shadow-popover: 0 2px 8px rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] {
  --color-background: #0a0a0a;
  --color-foreground: #ededed;
  --color-card: #0e0e0e;
  --color-card-foreground: #ededed;
  --color-muted: #161616;
  --color-muted-foreground: #8f8f8f;
  --color-border: #1f1f1f;
  --color-input: #1f1f1f;
  --color-primary: #ededed;
  --color-primary-foreground: #0a0a0a;
  --color-secondary: #161616;
  --color-secondary-foreground: #ededed;
  --color-accent: hsl(45 95% 55%);
  --color-accent-foreground: #0a0a0a;
  --color-charcoal: #c9c9c9;
  --color-stone: #8f8f8f;
  --color-smoke: #6b6b6b;
  --color-ash: #4f4f4f;
  --color-carbon: #000000;
  --color-destructive: #ededed;
  --color-destructive-foreground: #0a0a0a;
  --color-success: #45d165;
  --color-warning: hsl(45 95% 55%);
  --color-ring: hsl(45 95% 55%);

  --color-inverted: #ffffff;
  --color-inverted-foreground: #171717;
  --color-inverted-muted: #4d4d4d;

  --shadow-card: 0 0 0 1px rgba(255, 255, 255, 0.08);
  --shadow-popover: 0 2px 8px rgba(0, 0, 0, 0.5);
}

html, body, #root { height: 100%; }
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Interactive elements show pointer cursor instead of default arrow */
button:not(:disabled),
a[href],
[role="button"]:not([aria-disabled="true"]),
[role="menuitem"],
[role="option"],
[role="tab"],
[role="switch"],
[role="checkbox"],
[role="radio"],
[role="combobox"],
summary,
label[for],
select:not(:disabled) {
  cursor: pointer;
}

/* Thin custom scrollbar */
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--color-smoke) transparent;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-smoke);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--color-stone);
}

button:disabled,
[aria-disabled="true"],
[data-disabled="true"] {
  cursor: not-allowed;
}

/* Global native <select> styling — matches the custom Select trigger look */
select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-color: var(--color-card);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  padding: 0.375rem 2rem 0.375rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 1rem 1rem;
  transition: border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
}
select:hover:not(:disabled) {
  background-color: color-mix(in oklab, var(--color-muted) 40%, var(--color-card));
}
select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent) 30%, transparent);
}
select:disabled {
  opacity: 0.6;
}
select option {
  background-color: var(--color-card);
  color: var(--color-foreground);
}
select option:checked {
  background-color: color-mix(in oklab, var(--color-accent) 15%, var(--color-card));
  color: var(--color-accent);
  font-weight: 600;
}

/* Table headers — mono stamp (Vercel system) */
thead th {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0.071em;
  color: var(--color-stone);
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/opensible-console/package.json pnpm-lock.yaml apps/opensible-console/src/styles.css
git commit -m "feat(console): Vercel token layer + Geist Mono"
```

(pnpm-lock.yaml lives at repo root — `git add` paths above are relative to repo root. The `@fontsource/geist-mono` entry will appear in the root `pnpm-lock.yaml` diff.)

---

### Task 2: Button, Badge, Eyebrow

**Files:**
- Modify: `apps/opensible-console/src/components/ui/button.tsx`
- Modify: `apps/opensible-console/src/components/ui/badge.tsx`
- Create: `apps/opensible-console/src/components/ui/eyebrow.tsx`

**Interfaces:**
- Consumes: `--color-*` tokens from Task 1; `cn` from `@/lib/utils`.
- Produces: `Button` (variants `default/secondary/outline/ghost/destructive`, size `pill`), `Badge` (variants `default/primary/success/warning/destructive` with automatic state glyphs), `statusToVariant`, `Eyebrow`.

- [ ] **Step 1: Rewrite Button**

Replace the entire contents of `apps/opensible-console/src/components/ui/button.tsx` with:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        secondary: "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:opacity-90",
        outline: "border border-[var(--color-border)] bg-transparent text-[var(--color-charcoal)] hover:bg-[var(--color-muted)]",
        ghost: "hover:bg-[var(--color-muted)]",
        destructive: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
        pill: "h-8 rounded-full px-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";
export { buttonVariants };
```

Note: the `success` variant is removed (no callers use it); `destructive`, `default` and `outline` are now monochrome. Any destructive call must render its own `✕` glyph in children (existing callers already attach icons via children, e.g. `<Trash2/>`).

- [ ] **Step 2: Rewrite Badge**

Replace the entire contents of `apps/opensible-console/src/components/ui/badge.tsx` with:

```tsx
import { type HTMLAttributes, type ReactNode } from "react";
import { RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";

const styles = {
  default: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-stone)]",
  primary: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] font-semibold",
  success: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
  warning: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
  destructive: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] font-semibold",
} as const;

const glyphs: Record<string, ReactNode> = {
  success: <Check className="h-3 w-3 shrink-0 text-[var(--color-success)]" />,
  warning: <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />,
  destructive: <X className="h-3 w-3 shrink-0" />,
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.071em]", styles[variant], className)}
      {...props}
    >
      {glyphs[variant]}
      {props.children}
    </span>
  );
}

export function statusToVariant(status?: string): keyof typeof styles {
  switch ((status || "").toLowerCase()) {
    case "succeeded":
    case "success":
    case "ok":
      return "success";
    case "failed":
    case "error":
      return "destructive";
    case "running":
    case "queued":
    case "pending":
      return "warning";
    default:
      return "default";
  }
}
```

- [ ] **Step 3: Create Eyebrow**

Create `apps/opensible-console/src/components/ui/eyebrow.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-[11px] uppercase tracking-[0.071em] text-[var(--color-foreground)]", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/opensible-console/src/components/ui/button.tsx apps/opensible-console/src/components/ui/badge.tsx apps/opensible-console/src/components/ui/eyebrow.tsx
git commit -m "feat(console): monochrome Button, glyph Badge, Eyebrow"
```

---

### Task 3: Card, Input, Select, DropdownMenu, ConfirmDialog

**Files:**
- Modify: `apps/opensible-console/src/components/ui/card.tsx`
- Modify: `apps/opensible-console/src/components/ui/input.tsx`
- Modify: `apps/opensible-console/src/components/ui/select.tsx`
- Modify: `apps/opensible-console/src/components/ui/dropdown-menu.tsx`
- Modify: `apps/opensible-console/src/components/ui/confirm-dialog.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: hairline-ring `Card`, focus-yellow `Input`, rectangle hairline `Select` triggers with `--shadow-popover` panels, monochrome `DropdownMenu` with mono-uppercase `DropdownMenuLabel`, monochrome `ConfirmDialog`.

- [ ] **Step 1: Rewrite Card**

Replace the entire contents of `apps/opensible-console/src/components/ui/card.tsx` with:

```tsx
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-[var(--shadow-card)]", className)} {...p} />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...p} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...p }, ref) => (
  <h3 ref={ref} className={cn("text-base font-medium leading-none tracking-tight", className)} {...p} />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...p }, ref) => (
  <p ref={ref} className={cn("text-[13px] text-[var(--color-stone)]", className)} {...p} />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...p} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...p} />
));
CardFooter.displayName = "CardFooter";
```

- [ ] **Step 2: Rewrite Input**

Replace the entire contents of `apps/opensible-console/src/components/ui/input.tsx` with:

```tsx
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 py-1 text-sm text-[var(--color-foreground)] transition-colors placeholder:text-[var(--color-smoke)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:border-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
```

- [ ] **Step 3: Update Select**

In `apps/opensible-console/src/components/ui/select.tsx`:

Edit the trigger class block (lines ~80-87) to:

```tsx
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md",
          "bg-[var(--color-card)] border border-[var(--color-border)] text-sm text-[var(--color-foreground)]",
          "transition-colors hover:bg-[var(--color-muted)]/40",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30 focus:border-[var(--color-ring)]",
          disabled && "opacity-60 cursor-not-allowed",
          triggerClassName,
        )}
```

Edit the panel class block (lines ~101-107) to:

```tsx
        <div
          role="listbox"
          className={cn(
            "absolute z-50 min-w-full max-h-72 overflow-auto rounded-md",
            "bg-[var(--color-card)] border border-[var(--color-border)] shadow-[var(--shadow-popover)] p-1.5",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
```

Edit the selected-option classes (line ~126) from:

```tsx
                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
                    : "hover:bg-[var(--color-muted)] text-[var(--color-foreground)]",
```

to:

```tsx
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                    : "hover:bg-[var(--color-muted)] text-[var(--color-foreground)]",
```

- [ ] **Step 4: Update DropdownMenu**

In `apps/opensible-console/src/components/ui/dropdown-menu.tsx`:

Replace `shadow-lg` with `shadow-[var(--shadow-popover)]` in the `DropdownMenuSubContent` class string (line ~40).

Replace `shadow-md` with `shadow-[var(--shadow-popover)]` in the `DropdownMenuContent` class string (line ~57).

Replace the `DropdownMenuLabel` render (lines ~131-136) with:

```tsx
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.071em] text-[var(--color-stone)]", inset && "pl-8", className)}
    {...props}
  />
```

- [ ] **Step 5: Update ConfirmDialog**

In `apps/opensible-console/src/components/ui/confirm-dialog.tsx`:

Replace the icon circle block (lines ~32-46) with:

```tsx
          <div className="h-10 w-10 rounded-full bg-[var(--color-muted)] flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-[var(--color-foreground)]" />
          </div>
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/opensible-console/src/components/ui/card.tsx apps/opensible-console/src/components/ui/input.tsx apps/opensible-console/src/components/ui/select.tsx apps/opensible-console/src/components/ui/dropdown-menu.tsx apps/opensible-console/src/components/ui/confirm-dialog.tsx
git commit -m "feat(console): hairline Card, focus-yellow Input, monochrome menus/dialogs"
```

---

### Task 4: Top-nav chrome

**Files:**
- Create: `apps/opensible-console/src/components/app-shell/NavSections.tsx`
- Modify: `apps/opensible-console/src/components/app-shell/Header.tsx`
- Modify: `apps/opensible-console/src/routes/__root.tsx`
- Modify: `apps/opensible-console/src/routes/login.tsx`
- Delete: `apps/opensible-console/src/components/app-shell/Sidebar.tsx`
- Delete: `apps/opensible-console/src/lib/sidebar-state.ts`

**Interfaces:**
- Consumes: `DropdownMenu*` from Task 3, `Button`/`Select`/`Badge` from Tasks 2-3, `useT`/`useTheme`/`useProjects`/`useLocale`, `getStoredUser`.
- Produces: `NavSections` (four section dropdowns), a 64px `AppHeader` with brand + sections + right cluster, single-column `RootLayout`. Deletes the sidebar entire. Login branding panel no longer references `--color-sidebar*` tokens.

- [ ] **Step 1: Create NavSections**

Create `apps/opensible-console/src/components/app-shell/NavSections.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import {
  RiHomeLine as Home, RiPieChartLine as PieChart, RiStackLine as Layers,
  RiAddLine as Plus, RiCalculatorLine as Calculator, RiSettings2Line as Settings2,
  RiRocketLine as Rocket, RiLibraryLine as Library, RiNodeTree as Network,
  RiBookOpenLine as BookOpen, RiShieldCheckLine as ShieldCheck, RiUsersLine as Users,
  RiCpuLine as Cpu, RiPlugLine as Plug, RiArrowDownSLine as ChevronDown,
} from "@remixicon/react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: typeof Home };

const SECTIONS = (t: ReturnType<typeof useT>) => [
  {
    title: t("nav.overview"),
    items: [
      { to: "/dashboard", label: t("nav.homeDashboard"), icon: Home },
    ] as Item[],
  },
  {
    title: t("nav.cloud"),
    items: [
      { to: "/cloud/summary", label: t("nav.summary"), icon: PieChart },
      { to: "/cloud/stacks", label: t("nav.stacks"), icon: Layers },
      { to: "/cloud/stacks/new", label: t("nav.newStack"), icon: Plus },
      { to: "/cloud/cost", label: t("nav.costAnalysis"), icon: Calculator },
      { to: "/cloud/settings", label: t("nav.projectSettings"), icon: Settings2 },
    ] as Item[],
  },
  {
    title: t("nav.infrastructure"),
    items: [
      { to: "/infrastructure/deployment", label: t("nav.deployment"), icon: Rocket },
      { to: "/infrastructure/templates", label: t("nav.jobsTemplates"), icon: Library },
      { to: "/infrastructure/hosts", label: t("nav.hosts"), icon: Network },
      { to: "/infrastructure/playbooks-roles", label: t("nav.playbooksRoles"), icon: BookOpen },
      { to: "/infrastructure/vaults-secrets", label: t("nav.vaultsSecrets"), icon: ShieldCheck },
      { to: "/settings", label: t("nav.projectSettings"), icon: Settings2 },
    ] as Item[],
  },
  {
    title: t("nav.system"),
    items: [
      { to: "/system/settings", label: t("nav.settings"), icon: Settings2 },
      { to: "/system/users", label: t("nav.usersManagement"), icon: Users },
      { to: "/system/workers", label: t("nav.workers"), icon: Cpu },
      { to: "/system/secrets", label: t("nav.secretsManagement"), icon: ShieldCheck },
      { to: "/system/api", label: t("nav.api"), icon: Plug },
    ] as Item[],
  },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export function NavSections() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-1">
      {SECTIONS(t).map((section) => {
        const sectionActive = section.items.some((it) => isActive(pathname, it.to));
        return (
          <DropdownMenu key={section.title}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1 px-3 h-8 rounded-md text-sm transition-colors",
                  sectionActive
                    ? "font-mono text-[11px] uppercase tracking-[0.071em] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                )}
              >
                {section.title}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {section.items.map((it) => {
                  const active = isActive(pathname, it.to);
                  const Icon = it.icon;
                  return (
                    <DropdownMenuItem key={it.to} asChild>
                      <Link to={it.to} className={cn("gap-2", active && "text-[var(--color-accent)] font-medium")}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {it.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite Header as the 64px top nav**

Replace the entire contents of `apps/opensible-console/src/components/app-shell/Header.tsx` with:

```tsx
import { RiMoonLine as Moon, RiSunLine as Sun, RiTranslate as Languages, RiLogoutBoxRLine as LogOut, RiAddLine as Plus, RiUserSettingsLine as UserCog, RiArrowDownSLine as ChevronDown, RiStackLine as StackLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import logoSvg from "@/assets/opensible-logo.png";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { NavSections } from "@/components/app-shell/NavSections";
import { useTheme } from "@/lib/theme";
import { useLocale, useT, LOCALES, type Locale } from "@/lib/i18n";
import { useProjects } from "@/lib/project";
import { logout } from "@/lib/auth";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { getStoredUser } from "@/lib/api";

type StoredUser = { username?: string; email?: string; roles?: string[]; role_details?: { name: string }[] };

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { projects, currentId, setCurrent, loading } = useProjects();
  const navigate = useNavigate();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const user = getStoredUser<StoredUser>() || {};
  const displayName = user.username || t("common.admin");
  const initial = (displayName.charAt(0) || "A").toUpperCase();
  const primaryRole =
    (user.role_details && user.role_details[0]?.name) ||
    (user.roles && user.roles[0]) ||
    t("common.admin");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function onLogout() {
    setMenuOpen(false);
    await logout();
    navigate({ to: "/login", replace: true });
  }

  function onProfile() {
    setMenuOpen(false);
    navigate({ to: "/profile" });
  }

  return (
    <header className="h-16 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-between px-6 gap-4">
      <div className="flex items-center gap-6 min-w-0">
        <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
          <img src={logoSvg} className="h-8 w-8" alt="OpenSible" />
          <span className="hidden md:inline text-sm font-medium tracking-tight">{t("app.name")}</span>
        </Link>
        <NavSections />
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden xl:block w-[200px]">
          <Select
            value={currentId ?? ""}
            onChange={(v) => setCurrent(v || null)}
            disabled={loading}
            placeholder={loading ? t("common.loading") : t("common.noProjects")}
            prefix={<StackLine className="h-3.5 w-3.5 text-[var(--color-foreground)] shrink-0" />}
            options={projects.map(p => ({ value: p.id, label: p.name, description: p.description }))}
            triggerClassName="h-8 rounded-full"
            align="start"
          />
        </div>

        <Button variant="outline" size="pill" onClick={() => setNewProjectOpen(true)} title={t("common.createNewProject")}>
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">{t("common.newProject")}</span>
        </Button>

        <div className="w-[150px]">
          <Select
            value={locale}
            onChange={(v) => setLocale(v as Locale)}
            options={LOCALES.map((l) => ({
              value: l.code,
              label: `${l.flag}  ${l.nativeLabel}`,
              description: l.label !== l.nativeLabel ? l.label : undefined,
            }))}
            prefix={<Languages className="h-3.5 w-3.5 text-[var(--color-foreground)] shrink-0" />}
            align="end"
          />
        </div>

        <Button variant="ghost" size="icon" onClick={toggle} title={t("common.theme")} className="rounded-full">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 pl-1 pr-2 h-8 rounded-full hover:bg-[var(--color-muted)] transition-colors"
            title={displayName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="h-8 w-8 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] flex items-center justify-center text-sm font-medium">{initial}</div>
            <div className="hidden sm:flex flex-col items-start leading-tight max-w-[140px]">
              <span className="text-sm font-medium truncate max-w-[140px]">{displayName}</span>
              <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-muted-foreground)] truncate max-w-[140px]">{primaryRole}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] ml-0.5" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-popover)] z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--color-border)]">
                <div className="text-sm font-semibold truncate">{displayName}</div>
                {user.email && <div className="text-xs text-[var(--color-muted-foreground)] truncate">{user.email}</div>}
                <div className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-muted-foreground)] mt-1">{primaryRole}</div>
              </div>
              <button
                role="menuitem"
                onClick={onProfile}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] text-left"
              >
                <UserCog className="h-4 w-4" /> Profile Settings
              </button>
              <button
                role="menuitem"
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] text-left border-t border-[var(--color-border)]"
              >
                <LogOut className="h-4 w-4" /> {t("common.logOut")}
              </button>
            </div>
          )}
        </div>
      </div>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </header>
  );
}
```

(The `StackLine` icon, `t("app.name")`, and navigation helpers are all imported at the top of the file; `useProjects`/`getStoredUser` logic is unchanged from the original `Header.tsx`.)

- [ ] **Step 3: Rewrite RootLayout**

Replace the entire contents of `apps/opensible-console/src/routes/__root.tsx` with:

```tsx
import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-shell/Header";
import { getToken } from "@/lib/api";

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{error.message}</p>
      </div>
    </div>
  ),
});

function RootLayout() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token && !location.pathname.startsWith("/login")) {
      navigate({ to: "/login", replace: true });
    } else {
      setReady(true);
    }
  }, [location.pathname, navigate]);

  if (location.pathname.startsWith("/login")) {
    return <Outlet />;
  }

  if (!ready) return null;

  return (
    <div className="flex h-screen w-full flex-col">
      <AppHeader />
      <main className="flex-1 overflow-auto bg-[var(--color-background)]">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Restyle the login branding panel**

In `apps/opensible-console/src/routes/login.tsx`, replace the branding panel wrapper (line ~101) from:

```tsx
      <div className="relative hidden lg:flex flex-col justify-between bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] p-12">
```

to:

```tsx
      <div className="relative hidden lg:flex flex-col justify-between bg-[var(--color-card)] text-[var(--color-foreground)] border-l border-[var(--color-border)] p-12">
```

Replace the tagline block (lines ~109-117) from:

```tsx
        <div className="space-y-6">
          <h1 className="text-3xl font-bold leading-tight">
            {t("auth.login.tagline")}
          </h1>
          <p className="text-lg text-[var(--color-sidebar-muted)]">
            {t("auth.login.subtitle")}
          </p>

        </div>

        <div className="text-xs text-[var(--color-sidebar-muted)]">
          <span>© {new Date().getFullYear()} {t("app.name")}. {t("auth.login.rightsReserved")}</span>
        </div>
```

to:

```tsx
        <div className="space-y-6">
          <h1 className="text-3xl font-medium tracking-tight leading-tight">
            {t("auth.login.tagline")}
          </h1>
          <p className="text-lg text-[var(--color-charcoal)]">
            {t("auth.login.subtitle")}
          </p>
        </div>

        <div className="text-xs font-mono text-[var(--color-stone)]">
          <span>© {new Date().getFullYear()} {t("app.name")}. {t("auth.login.rightsReserved")}</span>
        </div>
```

- [ ] **Step 5: Delete the sidebar**

Run:

```bash
git rm apps/opensible-console/src/components/app-shell/Sidebar.tsx apps/opensible-console/src/lib/sidebar-state.ts
```

Expected: both files staged as deleted; no remaining imports of `Sidebar.tsx` or `sidebar-state.ts` (verify with `rg "Sidebar|sidebar-state" apps/opensible-console/src` — only the i18n key `nav.*` terms and login's removed classes may remain).

- [ ] **Step 6: Verify**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 7: Smoke-test navigation**

Run: `pnpm --filter @radas/opensible-console dev`
Expected: app opens on `http://localhost:8080`. Check: header shows brand + 4 section dropdowns; each dropdown opens and its Link navigates; the active section renders as mono-uppercase yellow; project switcher/locale/theme/avatar functional; dark toggle flips colors.

- [ ] **Step 8: Commit**

```bash
git add -A apps/opensible-console
git commit -m "feat(console): 64px top nav, remove sidebar, restyle login"
```

---

### Task 5: Inline sweep

**Files:** modify only these (all resolve via existing token aliases otherwise):
- `apps/opensible-console/src/routes/infrastructure/hosts.tsx`
- `apps/opensible-console/src/components/infrastructure/StackBlueprintsPanel.tsx`
- `apps/opensible-console/src/components/cloud/LogViewer.tsx`
- `apps/opensible-console/src/components/cloud/PlanDiff.tsx`
- `apps/opensible-console/src/components/cloud/CustomPolicyRules.tsx`
- `apps/opensible-console/src/components/cloud/PolicyGateCard.tsx`
- `apps/opensible-console/src/components/cloud/VmInventoryDialog.tsx`
- `apps/opensible-console/src/components/cloud/WizardStepper.tsx`
- `apps/opensible-console/src/routes/system/secrets.tsx`
- `apps/opensible-console/src/routes/cloud/cost.tsx`

**Interfaces:**
- Consumes: tokens, `Badge` glyph system from Tasks 1-2.
- Produces: no chromatically-colored status chips or `rounded-xl` surfaces remaining; `LogViewer` uses `--color-inverted`; destructive icons resolve to obsidian.

- [ ] **Step 1: Monochrome the hosts status pills**

In `apps/opensible-console/src/routes/infrastructure/hosts.tsx`, replace the `map` (lines ~128-136) with:

```tsx
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    ok:       { label: "Online",   icon: <CheckCircle2 className="h-3 w-3 text-[var(--color-success)]" />, cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)]" },
    online:   { label: "Online",   icon: <CheckCircle2 className="h-3 w-3 text-[var(--color-success)]" />, cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)]" },
    failed:   { label: "Failed",   icon: <XCircle className="h-3 w-3" />,                                 cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] font-semibold" },
    error:    { label: "Failed",   icon: <XCircle className="h-3 w-3" />,                                 cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] font-semibold" },
    offline:  { label: "Offline",  icon: <XCircle className="h-3 w-3" />,                                 cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] font-semibold" },
    checking: { label: "Checking", icon: <Activity className="h-3 w-3 animate-pulse text-[var(--color-warning)]" />, cls: "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)]" },
    unknown:  { label: "Unknown",  icon: <CircleDashed className="h-3 w-3 text-[var(--color-stone)]" />, cls: "border-[var(--color-border)] bg-transparent text-[var(--color-stone)]" },
  };
```

Also in `hosts.tsx` line ~511 replace the amber inline chip class:

```tsx
className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
```

with:

```tsx
className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-foreground)] font-mono uppercase tracking-wide"
```

- [ ] **Step 2: Invert LogViewer**

In `apps/opensible-console/src/components/cloud/LogViewer.tsx`, change the container class (line ~44) from:

```tsx
        "rounded-md bg-zinc-950 text-zinc-100 font-mono text-xs leading-[18px] overflow-auto max-h-[600px]",
```

to:

```tsx
        "rounded-md bg-[var(--color-inverted)] text-[var(--color-inverted-foreground)] font-mono text-xs leading-[18px] overflow-auto max-h-[600px]",
```

This also rethems `RunLogDialog` (which embeds `LogViewer`).

- [ ] **Step 3: Destructive icons → obsidian**

Wherever the literal `text-red-500` appears on icon/button-spans (`src/routes/infrastructure/vaults-secrets.tsx` lines 215/240/431, `src/routes/cloud/cost.tsx` line 556, and any other occurrences found via `rg "text-red-\\w+" apps/opensible-console/src`), replace `text-red-500` with `text-[var(--color-destructive)]` at every match. Do the same for any `text-red-600`/`border-red-*`/`bg-red-*` matches.

- [ ] **Step 4: Strip card hover shadows + fix radii**

In `apps/opensible-console/src/components/infrastructure/StackBlueprintsPanel.tsx` line ~146, change the card tile class from:

```tsx
                    className="group relative overflow-hidden border-[var(--color-border)] bg-[var(--color-card)] transition-all duration-300 hover:shadow-lg hover:border-[var(--color-primary)]"
```

to:

```tsx
                    className="group relative overflow-hidden border-[var(--color-border)] bg-[var(--color-card)] transition-colors duration-300 hover:border-[var(--color-foreground)]"
```

In the following files, replace every `rounded-xl` with `rounded-md` (they are container/dialog surfaces, not pills): `src/components/cloud/CustomPolicyRules.tsx`, `src/components/cloud/PolicyGateCard.tsx`, `src/components/cloud/VmInventoryDialog.tsx`, `src/components/cloud/PlanDiff.tsx`, `src/components/cloud/WizardStepper.tsx` (keep the numbered `rounded-full` step circles as pills), and `src/routes/system/secrets.tsx` (card select rows, lines ~261/270/274 — keep `rounded-full` radio circles).

Do NOT touch `rounded-full` (pills remain). Verify afterwards with:

```bash
rg -n "rounded-xl|shadow-lg|shadow-md" apps/opensible-console/src
```

Expected: zero matches for `rounded-xl` and `shadow-lg`/`shadow-md` outside `dist/`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A apps/opensible-console/src
git commit -m "feat(console): monochrome status sweep, inverted log panels"
```

---

### Task 6: Final verification

**Files:** none (verification + straggler fixes only).

- [ ] **Step 1: Typecheck + build**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 2: Visual smoke test**

Run: `pnpm --filter @radas/opensible-console dev` and eyeball, confirming:

1. Login page: paper-white form pane left, hairline-divided branding pane right; focus ring on inputs is yellow; the password eye toggle works.
2. Dashboard: stat cards are white/hairline-ring with mono counts; stack/project rows show glyph badges; nav "Overview" dropdown is active (mono yellow).
3. Cloud > Summary, Cloud > Stacks, Infrastructure > Hosts: run status badges render their glyph (✓ / dot / ✕) in a monochrome pill; table headers render as mono 11px uppercase stone stamps; tables split by hairline; row pills not colored.
4. Top nav: brand left, Overview/Cloud/Infrastructure/System dropdowns center-left; project switcher + locale + theme + avatar right; each dropdown navigates; active section is mono yellow.
5. Dark mode toggle: flips to `#0a0a0a` canvas; log viewer becomes paper-white; primary CTAs are `#ededed`.
6. Open a RunLogDialog: dialog surface is paper/card; log area is the inverted surface.
7. A confirm dialog (e.g. delete stack): monochrome icon circle, obsidian CTA.
8. No `text-red-*`, `text-emerald-*`, `text-amber-*` (outside terminal green / yellow accent / code editor), no `rounded-xl`, no `shadow-lg` in the rendered app.

- [ ] **Step 3: Check for stragglers**

```bash
rg -n "text-red-|text-emerald-|text-amber-|rounded-xl|shadow-lg|shadow-md|--color-sidebar" apps/opensible-console/src
```

Expected: no matches (or only intended terminal-green/`--color-stop`-adjacent uses). If matches appear, fix them exactly like Task 5 and re-run Step 1.

- [ ] **Step 4: Final commit**

```bash
git add -A apps/opensible-console
git commit -m "chore(console): final Vercel retheme sweep"
```

(If nothing changed, skip the commit.)