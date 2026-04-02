import type { HookStyle, TopicVariant } from './types';

/**
 * Quarterly hook style rotation matrix.
 * Each quarter, each variant position (A–D) gets a different hook style.
 * This ensures no two clinics in the same cluster share a hook style,
 * and styles rotate across quarters to prevent repetition.
 */
export const HOOK_ROTATION: Record<string, Record<TopicVariant, HookStyle>> = {
  Q1: { A: 'STAT', B: 'QUESTION', C: 'URGENCY', D: 'MYTH-BUST' },
  Q2: { A: 'QUESTION', B: 'URGENCY', C: 'MYTH-BUST', D: 'STAT' },
  Q3: { A: 'URGENCY', B: 'MYTH-BUST', C: 'STAT', D: 'QUESTION' },
  Q4: { A: 'MYTH-BUST', B: 'STAT', C: 'QUESTION', D: 'URGENCY' },
};

/** Get the quarter key (Q1–Q4) for a given month (1–12). */
export function getQuarter(month: number): string {
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

/** Get the hook style for a given month and cluster position. */
export function getHookStyleForPosition(month: number, position: TopicVariant): HookStyle {
  const quarter = getQuarter(month);
  return HOOK_ROTATION[quarter][position];
}

/** Month names for display. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
