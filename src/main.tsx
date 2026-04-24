import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize theme from localStorage
const theme = localStorage.getItem("theme");
if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);

// Recover from stale chunk loads after a deploy: do exactly one auto-reload,
// then surface the error to the ErrorBoundary if reloading didn't help.
const CHUNK_RELOAD_KEY = "__chunk_reloaded_at";
const isChunkError = (msg?: string) =>
  !!msg && /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError|Importing a module script failed/i.test(msg);

const tryChunkRecovery = (msg?: string) => {
  if (!isChunkError(msg)) return;
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  window.location.reload();
};

window.addEventListener("error", (e) => tryChunkRecovery(e.message));
window.addEventListener("unhandledrejection", (e) =>
  tryChunkRecovery(String((e.reason as { message?: string })?.message || e.reason))
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
