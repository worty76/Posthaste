import { dayRange, dayRangeFromInput } from "./dates";
import type { NoteQuery, View } from "./types";

export type StatusFilter = "all" | "open" | "completed" | "archived";

export interface Filters {
  text: string;
  status: StatusFilter;
  /** `YYYY-MM-DD` or empty. */
  date: string;
}

export const NO_FILTERS: Filters = { text: "", status: "all", date: "" };

export function isSearching(f: Filters): boolean {
  return f.text.trim() !== "" || f.date !== "";
}

/**
 * What to ask the database for. Outside search each view has a fixed scope;
 * a search looks across every note, narrowed by the filter controls.
 */
export function buildQuery(view: View, filters: Filters, now: number): NoteQuery {
  if (isSearching(filters)) {
    const range = filters.date ? dayRangeFromInput(filters.date) : null;
    return {
      text: filters.text.trim(),
      statuses:
        filters.status === "all" ? [] : [filters.status === "open" ? "inbox" : filters.status],
      created_from: range?.from ?? null,
      created_to: range?.to ?? null,
    };
  }
  switch (view) {
    case "today": {
      const { from, to } = dayRange(now);
      return { created_from: from, created_to: to };
    }
    case "archive":
      return { statuses: ["completed", "archived"] };
    default:
      return { statuses: ["inbox"] };
  }
}
