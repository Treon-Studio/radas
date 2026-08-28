import { Link, useLocation } from "@tanstack/react-router";
import { RiArrowRightSLine as ChevronRight } from "@remixicon/react";
import type { ReactNode } from "react";

export type Crumb = { label: string; to?: string; icon?: ReactNode };

/**
 * Route metadata: full-path entries win over segment parsing.
 * Pages that pass explicit `items` bypass this map entirely.
 */
export const ROUTE_CRUMBS: Record<string, Crumb[]> = {
  "/system/automation": [{ label: "System", to: "/system/settings" }, { label: "Automation Rules" }],
  "/system/audit": [{ label: "System", to: "/system/settings" }, { label: "Audit Log" }],
  "/system/retry-policy": [{ label: "System", to: "/system/settings" }, { label: "Retry Policy" }],
  "/system/inbound-webhooks": [{ label: "System", to: "/system/settings" }, { label: "Inbound Webhooks" }],
  "/system/branch-mapping": [{ label: "System", to: "/system/settings" }, { label: "Branch Mapping" }],
};

/** Fallback labels for pathname segments not covered by ROUTE_CRUMBS. */
export const SEGMENT_LABELS: Record<string, string> = {
  cloud: "Cloud",
  dashboard: "Dashboard",
  infrastructure: "Infrastructure",
  projects: "Projects",
  settings: "Settings",
  system: "System",
};

/**
 * Resolve crumbs for a pathname: exact ROUTE_CRUMBS match first, then a
 * label-map walk over the segments. Returns [] when nothing is known so
 * pages without metadata render no breadcrumbs.
 */
export function crumbsForPath(pathname: string): Crumb[] {
  const clean = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  const exact = ROUTE_CRUMBS[clean];
  if (exact) return exact;
  const segments = clean.split("/").filter(Boolean);
  if (!segments.some((segment) => SEGMENT_LABELS[segment])) return [];
  return segments.map((segment, index) => {
    const label = SEGMENT_LABELS[segment] ?? decodeURIComponent(segment);
    const to = index < segments.length - 1
      ? `/${segments.slice(0, index + 1).join("/")}`
      : undefined;
    return { label, to };
  });
}

type BreadcrumbsProps = {
  /** Explicit crumbs (legacy per-page call style). Wins over route metadata. */
  items?: Crumb[];
  /** Overrides the router pathname (used by tests and non-router callers). */
  pathname?: string;
};

/**
 * Breadcrumbs driven by route metadata. Renders nothing when neither
 * explicit items nor metadata resolve for the current pathname.
 */
export function Breadcrumbs({ items, pathname }: BreadcrumbsProps) {
  // Existing call sites pass `items` and may render outside a router context;
  // only the metadata-driven path needs the router hook.
  if (items !== undefined) return <BreadcrumbList items={items} />;
  if (pathname !== undefined) return <BreadcrumbList items={crumbsForPath(pathname)} />;
  return <RouterBreadcrumbs />;
}

function RouterBreadcrumbs() {
  const { pathname } = useLocation();
  return <BreadcrumbList items={crumbsForPath(pathname)} />;
}

function BreadcrumbList({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          const content = (
            <>
              {crumb.icon}
              <span>{crumb.label}</span>
            </>
          );
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="flex items-center gap-1 transition-colors hover:text-[var(--color-foreground)]"
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="flex items-center gap-1">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
