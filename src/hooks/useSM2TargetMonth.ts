import { useCallback, useEffect, useState } from "react";

/**
 * Shared "target month" for the Social Media department.
 * Preferences (Monthly Signals) and the Pre-Generation dialog must agree on the
 * month, otherwise signals saved for e.g. September look "missing" when the
 * pre-generation screen is still pointing at August.
 */
function storageKey(clinicId?: string) {
  return `sm2-target-month:${clinicId || "none"}`;
}

export function buildUpcomingMonths(count = 12) {
  const d = new Date();
  return Array.from({ length: count }, (_, i) => {
    const n = new Date(d.getFullYear(), d.getMonth() + i, 1);
    return {
      value: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`,
      label: n.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  });
}

export function useSM2TargetMonth(clinicId: string | undefined) {
  const options = buildUpcomingMonths(12);
  const fallback = options[1]?.value || options[0].value;

  const read = useCallback(() => {
    if (typeof window === "undefined") return fallback;
    const stored = window.localStorage.getItem(storageKey(clinicId));
    return stored && options.some((o) => o.value === stored) ? stored : fallback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const [targetMonth, setTargetMonthState] = useState<string>(read);

  useEffect(() => {
    setTargetMonthState(read());
  }, [read]);

  const setTargetMonth = useCallback(
    (value: string) => {
      setTargetMonthState(value);
      try {
        window.localStorage.setItem(storageKey(clinicId), value);
        window.dispatchEvent(new CustomEvent("sm2-target-month", { detail: { clinicId, value } }));
      } catch {
        /* ignore */
      }
    },
    [clinicId]
  );

  // Keep every mounted consumer in sync within the same tab.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.clinicId === clinicId && typeof detail.value === "string") {
        setTargetMonthState(detail.value);
      }
    };
    window.addEventListener("sm2-target-month", handler);
    return () => window.removeEventListener("sm2-target-month", handler);
  }, [clinicId]);

  return { targetMonth, setTargetMonth, monthOptions: options };
}
