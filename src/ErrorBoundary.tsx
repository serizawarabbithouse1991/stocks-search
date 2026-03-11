import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          padding: "24px",
          maxWidth: "600px",
          margin: "40px auto",
          background: "#161b22",
          border: "1px solid #f85149",
          borderRadius: "8px",
          color: "#e1e4e8",
          fontFamily: "sans-serif",
        }}>
          <h2 style={{ color: "#f85149", marginBottom: "12px" }}>エラーが発生しました</h2>
          <p style={{ marginBottom: "12px", fontSize: "14px" }}>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 16px",
              background: "#238636",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
