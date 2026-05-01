"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { logClientError } from "@/src/lib/client-error";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logClientError(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="workspace-shell">
          <section className="error-state">
            <div>
              <span className="eyebrow">Recoverable error</span>
              <h1>Stock Analyser hit a display error.</h1>
              <p>{this.state.error.message}</p>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => this.setState({ error: null })}>
                Try Again
              </button>
              <button type="button" className="secondary" onClick={() => window.location.assign("/")}>
                Home
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
