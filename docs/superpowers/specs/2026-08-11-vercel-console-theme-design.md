# OpenSible Console — Vercel Design System Retheme

**Date:** 2026-08-11
**App:** `apps/opensible-console` (`@radas/opensible-console`)
**Approach:** B — primitives + shell restructure

## Goal

Restyle the OpenSible console to a Vercel-derived design system: paper-white canvas, monochrome obsidian type, hairline borders, 6px geometry, mono-stamped labels. One chromatic accent (brand yellow) plus terminal green reserved for confirmations. Move the chrome from a collapsible left sidebar to a 64px top nav bar.

## Decisions locked during brainstorming

- Scope: full console retheme (tokens + primitives + shell + inline sweep).
- Dark mode: light + dark themes remain togglable; dark becomes a flipped grayscale scale.
- Fonts: Geist Pixel stays for interface; JetBrains Mono -> Geist Mono (new dep).
- Accent: monochrome base; brand yellow `hsl(45 95% 50%)` is the single chromatic accent.
- Status colors: full monochrome states — status shown via glyph + type weight; no semantic fills. Terminal green `#297a3a` only for success confirmations.
- Chrome: 64px top nav bar with section dropdowns; sidebar and its collapse state deleted.

## Section 1 — Tokens & typography

### Surfaces (light theme)

| Surface | Value | Token |
|---|---|---|
| Page canvas | `#fafafa` | `--color-background` |
| Cards / inputs / popovers | `#ffffff` | `--color-card`, `--color-input` |
| Hairline borders | `#ebebeb` | `--color-border` |
| Hover fill | `#f4f4f4` | `--color-muted` |
| Inverted panels (log/CLI) | `#171717` | `--color-inverted` |

### Type colors (light)

- foreground `#171717` (obsidian) — headings, primary text
- charcoal `#4d4d4d` — body copy, secondary labels
- stone `#666666` — captions, help text
- smoke `#a8a8a8` — placeholder
- ash `#c9c9c9` — disabled
- carbon `#000000` — logo mark / graphic glyphs only

### Role separation

- `--color-primary` = obsidian `#171717` (filled buttons / primary CTAs). `--color-primary-foreground` = white.
- `--color-accent` = brand yellow `hsl(45 95% 50%)` — active nav item, selected state, focus rings, in-flight status dots. The only chromatic accent.
- `--color-terminal-green` `#297a3a` — confirmations only (`✓` in CLI panels / form success).

### Semantics collapse to monochrome

`success/warning/destructive` are retired as fills. Status is conveyed by glyph + type weight + optional yellow dot. Destructive CTAs remain filled obsidian buttons labelled with a `✕` glyph; weight carries meaning. No red anywhere.

### Dark theme

`[data-theme=dark]` flips the scale:

- canvas `#0a0a0a`, card `#0e0e0e`, border `#1f1f1f`, text `#ededed`
- primary = `#ededed` fill on `#0a0a0a` text (Vercel white-on-dark CTA)
- inverted panels become paper-white
- accent yellow `hsl(45 95% 55%)`

### Geometry

- radius `--radius: 0.375rem` (6px) for cards/buttons/inputs; nav 2px; pills `9999px` for compact badges
- card shadows removed -> hairline ring `0 0 0 1px rgba(0,0,0,0.08)`
- one exception: floating menus `0 2px 8px rgba(0,0,0,0.08)`

### Typography

- Interface: Geist Pixel (kept)
- Mono: Geist Mono (new `@fontsource/geist-mono` dep; JetBrains Mono removed)
- Mono owns labels: eyebrows 11px uppercase 0.071em tracking, table headers, status pills, section headers. Sans owns body/UI.
- Existing var names are preserved so route code changes minimally; only values remap.

## Section 2 — UI primitives

Rebuilt in `src/components/ui/`:

- **Button**: `default` filled obsidian/white; `secondary` smoke-fill + hairline ring; `outline` transparent hairline + charcoal text; `ghost` transparent hover `#f4f4f4`; `destructive` obsidian + `✕` glyph. Sizes `sm` h-8, `default` h-9, `lg` h-10. New `pill` variant (`9999px`) for compact chrome actions. Focus ring = 2px yellow accent.
- **Badge**: monochrome status pill — hairline ring, mono 11px uppercase, state via glyph:
  - `succeeded | ok` -> `✓` terminal green glyph
  - `running | queued | pending` -> yellow accent dot
  - `failed | degraded | error` -> obsidian glyph, label weight 600
  - idle/unknown -> `—` no glyph, stone text
  - border never changes color.
- **Card**: white, 6px, double-ring border `0 0 0 1px rgba(0,0,0,0.08)`, no shadow. `CardTitle` 16px/500 tracking-tight; `CardDescription` stone 13px.
- **Input / Select**: white bg, 1px hairline border, 6px radius, focus ring 3px yellow at 30% alpha. `Input` h-9. `Select` triggers become 6px rectangles (only the compact `pill` chrome action stays `9999px`).
- **Eyebrow** (new): mono 11px uppercase 0.071em obsidian; section headings.
- **ConfirmDialog**: monochrome; obsidian filled confirm CTA; cancel ghost/hairline.
- **Tables**: mono 11px uppercase stone letterspaced headers, hairline row dividers, row hover `#f4f4f4`, no vertical borders.

No new deps beyond `@fontsource/geist-mono`; reuses `cva`/`cn`/tailwind-merge in app.

## Section 3 — Chrome restructure

`routes/__root.tsx`: replace `<Sidebar> + <Header>` flex row with a single 64px sticky top bar + main content on a full-width `#fafafa` canvas (content max-w ~1280px, px-6 py-6).

Top nav anatomy:

- **Left:** OpenSible mark (carbon) + wordmark, 14px/500.
- **Center-left:** four section dropdowns — Overview / Cloud / Infrastructure / System — mirroring current sidebar groups. Dropdown shows mono 11px uppercase eyebrow header + item list; current route highlighted with yellow accent; active label renders in 11px mono, inactive in 13-14px pixel.
- **Right cluster:** project switcher pill, locale `Select`, theme toggle, user avatar menu (obsidian initial avatar instead of yellow circle).

Deleted: `Sidebar.tsx`, `useSidebarCollapsed` state, dark sidebar token block. Mobile degrades to the four section dropdowns as primary navigation (no hamburger).

Inverted surface moves into content: log viewer / CLI panels (`LogViewer`, `RunLogDialog`) are `#171717` in light theme, paper-white in dark.

Login: current in-progress rework (form left, branding right) is absorbed; branding panel restyled to paper `#fafafa` + hairline divider instead of dark sidebar color.

## Section 4 — Sweep scope, verification & sequencing

### Swept

- Inline old-value classes: `rounded-full` avatar/popover radii, `rounded-xl` popovers, leftover yellow primary CTAs (mostly handled by token remap), old focus rings.
- Old `success/warning/destructive` badge fills -> monochrome status pills.
- `Select`/`DropdownMenu` trigger radii -> 6px.
- Card `shadow-sm` instances -> ring; `shadow-lg` popovers -> single low shadow.

### Not changed

Route structure, route tree, API/data layer (`lib/`), i18n keys, TanStack Router/Query wiring, dialog logic, table logic, Codemirror theme (YAML editor stays `one-dark`; it is a code surface, exempt like Vercel CLI panels).

The uncommitted login/i18n work in the working tree is kept and absorbed.

### Sequencing

1. `styles.css` token layer (light + dark) + `@fontsource/geist-mono` dep.
2. `ui/` primitives: Button, Badge, Card, Input, Select, dropdown, Eyebrow, ConfirmDialog.
3. Chrome: `__root.tsx` top nav, delete sidebar, retouch `Header.tsx`.
4. Inline sweep across routes + status-pill conversion.
5. Verification.

### Verification

- `pnpm --filter @radas/opensible-console typecheck` (tsc --noEmit)
- `pnpm --filter @radas/opensible-console build`
- `pnpm --filter @radas/opensible-console dev` -> eyeball dashboard, one cloud page, one infra page, login, dark mode toggle, both nav dropdowns
- No test suite exists for this app; typecheck + build + visual pass is the gate.