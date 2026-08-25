import { Link } from "@tanstack/react-router";
import { RiHomeLine as Home, RiGlobalLine as Globe, RiArrowRightSLine as ChevronRight } from "@remixicon/react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

export type Crumb = { label: string; to?: string; icon?: ReactNode };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return null;
}

