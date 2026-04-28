// Tracks which sm2_posts client_feedback updates the current user has already
// viewed. Stored in localStorage as a map of postId -> last seen updated_at ISO string.
// Used to render a "New" badge on staff-facing post cards / calendar cells.

const STORAGE_KEY = "sm2-seen-client-notes-v1";

type SeenMap = Record<string, string>;

function load(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

function save(map: SeenMap) {
  try {
    // Cap the map at the most recent 500 entries to avoid unbounded growth
    const entries = Object.entries(map);
    if (entries.length > 500) {
      entries.sort((a, b) => (a[1] < b[1] ? 1 : -1));
      const trimmed = Object.fromEntries(entries.slice(0, 500));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    /* ignore quota errors */
  }
}

export function isClientNoteUnseen(postId: string, updatedAt: string | null | undefined, hasNote: boolean): boolean {
  if (!hasNote || !updatedAt) return false;
  const map = load();
  const seen = map[postId];
  return !seen || seen < updatedAt;
}

export function markClientNoteSeen(postId: string, updatedAt: string | null | undefined) {
  if (!updatedAt) return;
  const map = load();
  if (map[postId] && map[postId] >= updatedAt) return;
  map[postId] = updatedAt;
  save(map);
}
