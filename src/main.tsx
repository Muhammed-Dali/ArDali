import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

function renderBootError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Bilinmeyen hata");
  document.body.innerHTML = `
    <div style="min-height:100vh;background:#030607;color:#e7fbff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:32px;">
      <div style="max-width:760px;border:1px solid rgba(0,220,255,.35);background:#071012;border-radius:8px;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.45);">
        <h1 style="margin:0 0 10px;font-size:22px;">Arayuz baslatilamadi</h1>
        <p style="margin:0;color:#9fb5bd;">Frontend render sirasinda hata olustu:</p>
        <pre style="white-space:pre-wrap;color:#33e4ff;background:#020506;border-radius:6px;padding:14px;margin:14px 0 0;">${message}</pre>
      </div>
    </div>
  `;
}

class BootErrorBoundary extends React.Component<React.PropsWithChildren, { error: unknown }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("ArDali render error", error);
  }

  render() {
    if (this.state.error) {
      renderBootError(this.state.error);
      return null;
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("ArDali boot error", event.error || event.message);
  renderBootError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("ArDali boot rejection", event.reason);
  renderBootError(event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </React.StrictMode>,
);
