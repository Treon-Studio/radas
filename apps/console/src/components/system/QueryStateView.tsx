import { isForbidden, apiErrorTitle } from "@/lib/api";
import { StateView } from "@/components/ui/StateView";

type Props = {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  onRetry?: () => void;
  loadingTitle?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Extra hint for permission failures (403). */
  forbiddenMessage?: string;
};

/**
 * Standard query states for system pages: loading, unauthorized (403),
 * validation/conflict/server errors, and empty — built on StateView.
 * Returns null when data is available (callers render content instead).
 */
export function QueryStateView({
  loading,
  error,
  empty,
  onRetry,
  loadingTitle,
  emptyTitle,
  emptyMessage,
  forbiddenMessage,
}: Props) {
  if (loading) return <StateView state="loading" title={loadingTitle} />;
  if (error) {
    const forbidden = isForbidden(error);
    return (
      <StateView
        state="error"
        title={forbidden ? "Access denied (403)" : apiErrorTitle(error)}
        message={forbidden
          ? (forbiddenMessage ?? "Your role does not have permission to view this resource.")
          : (error instanceof Error && error.message ? error.message : undefined)}
        onRetry={onRetry}
      />
    );
  }
  if (empty) return <StateView state="empty" title={emptyTitle} message={emptyMessage} />;
  return null;
}
