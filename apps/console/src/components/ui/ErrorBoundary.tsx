import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Global error boundary (UC 108) — catches render errors, offers reload. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Radas] unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-background)] text-[var(--color-foreground)]">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-3 text-center">
            <div className="text-2xl font-semibold">Something went wrong</div>
            <p className="text-sm text-[var(--color-muted-foreground)] break-all font-mono">
              {this.state.error.message || String(this.state.error)}
            </p>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
