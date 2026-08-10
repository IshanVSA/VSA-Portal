import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize theme from localStorage — default to light for everyone
const theme = localStorage.getItem("theme");
if (theme === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
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

// Service worker: only on the real published site. In dev/preview sandboxes a
// stale SW can serve outdated HTML/chunks and blank the screen, so tear it down.
if ("serviceWorker" in navigator) {
  const host = window.location.hostname;
  const isPreview = host === "localhost" || host.endsWith("lovableproject.com") || host.includes("id-preview--");

  if (isPreview) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

