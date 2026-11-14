import type { Note } from "./types";

const DAY_MS = 86_400_000;

/** Start of the local calendar day containing `t`, as UTC ms. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** `[from, to)` bounds of the local day containing `t`. Handles DST days. */
export function dayRange(t: number): { from: number; to: number } {
  const from = startOfDay(t);
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  return { from, to: next.getTime() };
}

/** Bounds for a `YYYY-MM-DD` value from a date input, or null if invalid. */
export function dayRangeFromInput(value: string): { from: number; to: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : dayRange(d.getTime());
}

export function dayLabel(t: number, now: number, locale?: string): string {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(t);
}

export function timeLabel(t: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(t);
}

export interface DayGroup {
  key: number;
  label: string;
  notes: Note[];
}

/** Groups notes (already newest first) by the local day they were captured. */
export function groupByDay(notes: Note[], now: number, locale?: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const note of notes) {
    const key = startOfDay(note.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.notes.push(note);
    else groups.push({ key, label: dayLabel(key, now, locale), notes: [note] });
  }
  return groups;
}
