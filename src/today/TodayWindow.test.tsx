import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayRange } from "../lib/dates";
import type { Glance } from "../lib/types";
import { api, emit, note, resetIpc } from "../test/mockIpc";
import { TodayWindow } from "./TodayWindow";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const DAY = 86_400_000;
// Fixed local noon, so day bounds are deterministic in any timezone.
const NOON = new Date(2026, 10, 15, 12, 0, 0).getTime();

function glance(patch: Partial<Glance> = {}): Glance {
  return { carried: [], today: [], done: 0, total: 0, ...patch };
}

let dateNow: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetIpc();
  dateNow = vi.spyOn(Date, "now").mockReturnValue(NOON);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function open() {
  render(<TodayWindow os="linux" />);
  await waitFor(() => expect(api.glanceGet).toHaveBeenCalled());
  await act(async () => {});
  return userEvent.setup();
}

const progressBar = () => screen.getByLabelText("Notes done") as HTMLProgressElement;
const rows = () => screen.getAllByRole("listitem");
const selectedRow = () => rows().find((r) => r.getAttribute("aria-current") === "true");
const key = (key: string, init: Record<string, unknown> = {}) =>
  fireEvent.keyDown(document.querySelector(".today")!, { key, ...init });

describe("today window", () => {
  it("renders carried-over and today groups, the count and the progress", async () => {
    api.glanceGet.mockResolvedValue(
      glance({
        carried: [note("carry over from yesterday")],
        today: [note("made this morning"), note("finished at lunch", { status: "completed" })],
        done: 2,
        total: 5,
      }),
    );
    await open();

    const carried = screen.getByText("carry over from yesterday");
    const today = screen.getByText("made this morning");
    expect(screen.getByText("Carried over")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    // Carried over comes first.
    expect(carried.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("2 of 5 done")).toBeInTheDocument();
    expect(progressBar().value).toBe(2);
    expect(progressBar().max).toBe(5);
  });

  it("recomputes the day bounds when shown again on a later day", async () => {
    await open();
    const first = dayRange(NOON);
    expect(api.glanceGet).toHaveBeenNthCalledWith(1, first.from, first.to);

    dateNow.mockReturnValue(NOON + 2 * DAY);
    act(() => emit("today-shown"));

    const second = dayRange(NOON + 2 * DAY);
    expect(second.from).not.toBe(first.from);
    await waitFor(() => expect(api.glanceGet).toHaveBeenNthCalledWith(2, second.from, second.to));
  });

  it("toggles done with X on the selected carried-over note", async () => {
    const carried = note("carry over from yesterday");
    api.glanceGet.mockResolvedValue(glance({ carried: [carried], done: 0, total: 1 }));
    await open();
    key("x");
    await waitFor(() => expect(api.noteSetStatus).toHaveBeenCalledWith(carried.id, "completed"));
  });

  it("marks a completed note not done with X", async () => {
    const done = note("finished at lunch", { status: "completed" });
    api.glanceGet.mockResolvedValue(glance({ today: [done], done: 1, total: 1 }));
    await open();
    key("x");
    await waitFor(() => expect(api.noteSetStatus).toHaveBeenCalledWith(done.id, "inbox"));
  });

  it("moves the selection with arrows and J/K", async () => {
    api.glanceGet.mockResolvedValue(
      glance({
        carried: [note("carried")],
        today: [note("first today"), note("second today")],
        done: 0,
        total: 3,
      }),
    );
    await open();
    expect(selectedRow()).toHaveTextContent("carried");

    key("ArrowDown");
    expect(selectedRow()).toHaveTextContent("first today");
    key("j");
    expect(selectedRow()).toHaveTextContent("second today");
    key("ArrowUp");
    expect(selectedRow()).toHaveTextContent("first today");
    key("k");
    expect(selectedRow()).toHaveTextContent("carried");
  });

  it("resets the selection to the first row when shown again", async () => {
    api.glanceGet.mockResolvedValue(
      glance({ carried: [note("carried")], today: [note("made today")], done: 0, total: 2 }),
    );
    await open();
    key("ArrowDown");
    expect(selectedRow()).toHaveTextContent("made today");

    act(() => emit("today-shown"));
    // The reset lands when the fresh list arrives.
    await waitFor(() => expect(selectedRow()).toHaveTextContent("carried"));
  });

  it("keeps the selection on the same note across a notes-changed refetch", async () => {
    const kept = note("made today");
    api.glanceGet.mockResolvedValue(
      glance({ carried: [note("carried")], today: [kept], done: 0, total: 2 }),
    );
    await open();
    key("ArrowDown");
    expect(selectedRow()).toHaveTextContent("made today");

    act(() => emit("notes-changed"));
    await waitFor(() => expect(api.glanceGet).toHaveBeenCalledTimes(2));
    expect(selectedRow()).toHaveTextContent("made today");
  });

  it("closes with Escape but not while an IME composition is active", async () => {
    await open();
    key("Escape");
    await waitFor(() => expect(api.todayDismiss).toHaveBeenCalledTimes(1));

    key("Escape", { isComposing: true });
    expect(api.todayDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows an empty glance with the capture shortcut", async () => {
    await open();
    expect(screen.getByText("Nothing for today")).toBeInTheDocument();
    expect(screen.getByRole("progressbar").getAttribute("max")).toBe("0");
  });

  it("says all done when every note for today is done", async () => {
    api.glanceGet.mockResolvedValue(
      glance({
        today: [note("one", { status: "completed" }), note("two", { status: "completed" })],
        done: 2,
        total: 2,
      }),
    );
    await open();
    expect(screen.getByText("All done")).toBeInTheDocument();
    expect(screen.queryByText(/of .* done/)).toBeNull();
  });

  it("points to the inbox when a group was capped", async () => {
    api.glanceGet.mockResolvedValue(
      glance({
        carried: Array.from({ length: 50 }, (_, i) => note(`carried ${i}`)),
        done: 10,
        total: 60,
      }),
    );
    await open();
    expect(rows()).toHaveLength(50);
    expect(screen.getByText("and 10 more in the inbox")).toBeInTheDocument();
  });

  it("shows a database failure as an alert, never a blank window", async () => {
    api.glanceGet.mockRejectedValue({
      code: "db_open",
      message: "The database is not available.",
    });
    render(<TodayWindow os="linux" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The database is not available.");
    expect(screen.queryByText("Carried over")).toBeNull();
  });
});
