import { describe, expect, it, vi } from "vitest";
import { dayLabel, dayRange, dayRangeFromInput, groupByDay } from "./dates";
import { DraftSync } from "./draftSync";
import { buildQuery, isSearching, NO_FILTERS } from "./query";
import { acceleratorFromEvent, formatAccelerator } from "./shortcut";
import { resolveTheme } from "../hooks/useTheme";
import type { Note } from "./types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const n = (content: string, created_at: number) => ({ content, created_at }) as Note;

describe("dates", () => {
  it("bounds a local calendar day, start inclusive and end exclusive", () => {
    const { from, to } = dayRange(at(2026, 11, 13, 21));
    expect(new Date(from)).toEqual(new Date(2026, 10, 13, 0, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 10, 14, 0, 0, 0, 0));
  });

  it("reads a date input value as that local day", () => {
    expect(dayRangeFromInput("2026-11-13")).toEqual(dayRange(at(2026, 11, 13)));
    expect(dayRangeFromInput("")).toBeNull();
    expect(dayRangeFromInput("13/11/2026")).toBeNull();
  });

  it("labels days relative to now", () => {
    const now = at(2026, 11, 13, 9);
    expect(dayLabel(at(2026, 11, 13, 1), now)).toBe("Today");
    // Late yesterday is "Yesterday" even though it is under 24 hours ago.
    expect(dayLabel(at(2026, 11, 12, 23), now)).toBe("Yesterday");
    expect(dayLabel(at(2026, 11, 9), now, "en-US")).toBe("Monday, November 9");
    expect(dayLabel(at(2025, 12, 31), now, "en-US")).toBe("Wednesday, December 31, 2025");
  });

  it("groups notes by capture day, keeping order", () => {
    const now = at(2026, 11, 13, 20);
    const groups = groupByDay(
      [n("c", at(2026, 11, 13, 19)), n("b", at(2026, 11, 13, 8)), n("a", at(2026, 11, 12, 23))],
      now,
    );
    expect(groups.map((g) => [g.label, g.notes.map((x) => x.content)])).toEqual([
      ["Today", ["c", "b"]],
      ["Yesterday", ["a"]],
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("query", () => {
  const now = at(2026, 11, 13);

  it("scopes each view when not searching", () => {
    expect(buildQuery("inbox", NO_FILTERS, now)).toEqual({ statuses: ["inbox"] });
    expect(buildQuery("archive", NO_FILTERS, now)).toEqual({ statuses: ["completed", "archived"] });
    const { from, to } = dayRange(now);
    expect(buildQuery("today", NO_FILTERS, now)).toEqual({ created_from: from, created_to: to });
  });

  it("searches every note, including the archive, whatever the view", () => {
    const q = buildQuery("inbox", { ...NO_FILTERS, text: "  index " }, now);
    expect(q).toMatchObject({ text: "index", statuses: [] });
  });

  it("applies the status and date filters to a search", () => {
    const q = buildQuery("inbox", { text: "x", status: "open", date: "2026-11-01" }, now);
    expect(q.statuses).toEqual(["inbox"]);
    expect(q.created_from).toBe(dayRange(at(2026, 11, 1)).from);
    expect(buildQuery("inbox", { text: "x", status: "completed", date: "" }, now).statuses).toEqual(
      ["completed"],
    );
  });

  it("treats a date alone as a search, and whitespace as none", () => {
    expect(isSearching({ ...NO_FILTERS, date: "2026-11-01" })).toBe(true);
    expect(isSearching({ ...NO_FILTERS, text: "   " })).toBe(false);
  });
});

describe("shortcut", () => {
  const key = (code: string, mods: Partial<KeyboardEvent> = {}) => ({
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  it("builds an accelerator from a key press", () => {
    expect(acceleratorFromEvent(key("Space", { ctrlKey: true, shiftKey: true }), "linux")).toBe(
      "Ctrl+Shift+Space",
    );
    expect(acceleratorFromEvent(key("KeyN", { metaKey: true, ctrlKey: true }), "macos")).toBe(
      "Cmd+Ctrl+N",
    );
    expect(acceleratorFromEvent(key("Digit1", { altKey: true }), "windows")).toBe("Alt+1");
    expect(acceleratorFromEvent(key("F9"), "windows")).toBe("F9");
  });

  it("waits while only modifiers are held and rejects unusable combinations", () => {
    expect(acceleratorFromEvent(key("ShiftLeft", { shiftKey: true }), "linux")).toBeNull();
    expect(acceleratorFromEvent(key("KeyA"), "linux")).toBeNull();
    expect(acceleratorFromEvent(key("KeyA", { shiftKey: true }), "linux")).toBeNull();
    expect(acceleratorFromEvent(key("Unidentified", { ctrlKey: true }), "linux")).toBeNull();
  });

  it("shows key caps in the platform's own notation", () => {
    expect(formatAccelerator("CmdOrCtrl+Shift+Space", "macos")).toEqual(["⌘", "⇧", "Space"]);
    expect(formatAccelerator("CmdOrCtrl+Shift+Space", "windows")).toEqual([
      "Ctrl",
      "Shift",
      "Space",
    ]);
    expect(formatAccelerator("Cmd+Ctrl+N", "macos")).toEqual(["⌘", "⌃", "N"]);
    expect(formatAccelerator("Super+Alt+ArrowUp", "windows")).toEqual(["Win", "Alt", "↑"]);
  });
});

describe("theme", () => {
  it("follows the system only when asked to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("DraftSync", () => {
  it("writes only the latest text after the pause", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue(undefined);
    const sync = new DraftSync(write, vi.fn(), 250);
    sync.schedule("h", null);
    sync.schedule("he", null);
    sync.schedule("hello", "ideas");
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("hello", "ideas");
    vi.useRealTimers();
  });

  it("flush writes immediately", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const sync = new DraftSync(write, vi.fn(), 10_000);
    sync.schedule("urgent", null);
    await sync.flush();
    expect(write).toHaveBeenCalledWith("urgent", null);
  });

  it("cancel drops pending text but waits for a write already in flight", async () => {
    let finish!: () => void;
    const write = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const sync = new DraftSync(write, vi.fn(), 10_000);
    sync.schedule("first", null);
    void sync.flush();
    await Promise.resolve();
    sync.schedule("second", null);

    let cancelled = false;
    const done = sync.cancel().then(() => (cancelled = true));
    await Promise.resolve();
    expect(cancelled).toBe(false); // still waiting on "first"
    finish();
    await done;
    expect(write).toHaveBeenCalledTimes(1); // "second" was never written
  });

  it("reports a failed write and keeps working", async () => {
    const onError = vi.fn();
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const sync = new DraftSync(write, onError, 10_000);
    sync.schedule("a", null);
    await sync.flush();
    expect(onError).toHaveBeenCalledTimes(1);
    sync.schedule("b", null);
    await sync.flush();
    expect(write).toHaveBeenLastCalledWith("b", null);
  });
});
