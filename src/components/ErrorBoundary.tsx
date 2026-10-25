import { Component, type ReactNode } from 'react';

/**
 * Catches an error while a part of the page draws, so it shows `fallback` instead of React removing
 * the whole page. A new `resetKey` (another page, another texture) tries the part again.
 * Errors in click handlers and timers don't come here; those parts handle their own.
 */
export class ErrorBoundary extends Component<
  { resetKey: string; fallback: (reset: () => void, error: Error) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error('[unktilz] a part of the page failed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.reset, this.state.error) : this.props.children;
  }
}
