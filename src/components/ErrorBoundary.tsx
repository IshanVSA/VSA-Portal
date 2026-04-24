import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /**
   * Optional fallback renderer. If omitted, a default centered error card
   * with reload + "go home" actions is rendered.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Scope label for logs (e.g. "route:/social"). */
  scope?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches uncaught render/runtime errors anywhere in its subtree and shows
 * a recoverable fallback instead of letting the screen go blank.
 *
 * Also handles dynamic-import / chunk-load failures (common after a deploy)
 * by offering a one-click hard reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ""}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  hardReload = () => {
    try {
      // Bust cached chunks if this was a chunk load error
      window.location.reload();
    } catch {
      /* noop */
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const isChunkError =
      /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError/i.test(error.message);

    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Something went wrong</h2>
              <p className="text-xs text-muted-foreground">
                {isChunkError
                  ? "A new version may be available. Reload to continue."
                  : "An unexpected error occurred while rendering this view."}
              </p>
            </div>
          </div>
          <pre className="text-[11px] bg-muted/40 rounded-md p-2 max-h-32 overflow-auto mb-4 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
          <div className="flex gap-2 justify-end">
            {!isChunkError && (
              <Button variant="outline" size="sm" onClick={this.reset}>
                Try again
              </Button>
            )}
            <Button size="sm" onClick={this.hardReload} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
