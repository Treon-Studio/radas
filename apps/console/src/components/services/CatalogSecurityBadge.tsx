import { Badge } from "@/components/ui/badge";
export function CatalogSecurityBadge({ deprecated, securityReview }: { deprecated?: boolean; securityReview?: Record<string, unknown> }) {
  if (deprecated) return <Badge variant="warning">Deprecated</Badge>;
  const status = String(securityReview?.status || "").toLowerCase();
  if (status === "passed" || status === "approved") return <Badge variant="success">Security reviewed</Badge>;
  if (status) return <Badge variant="warning">Security review: {status}</Badge>;
  return null;
}
