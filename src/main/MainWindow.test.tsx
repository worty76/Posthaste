import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppInfo } from "../lib/types";
import { api, emit, note, resetIpc, settingsState } from "../test/mockIpc";
import { media } from "../test/setup";
import { MainWindow } from "./MainWindow";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const info: AppInfo = {
  version: "0.1.0",
  os: "linux",
  session: "x11",
  tray_available: true,
  startup_error: null,
};

async function open(overrides: Partial<AppInfo> = {}) {
  render(<MainWindow info={{ ...info, ...overrides }} />);
  await waitFor(() => expect(api.notesList).toHaveBeenCalled());
  await act(async () => {});
  return userEvent.setup();
}

const lastQuery = () => api.notesList.mock.calls.at(-1)![0];
const DAY = 86_400_000;

beforeEach(() => {
  resetIpc();
  media.dark = false;
});

describe("inbox rendering", () => {
  it("lists notes grouped by day with their details", async () => {
    api.notesList.mockResolvedValue([
      note("Investigate PostgreSQL indexing strategy.", { category: "work", source: "Code" }),
      note("Call the dentist", { created_at: Date.now() - DAY }),
    ]);
    api.notesCounts.mockResolvedValue({ inbox: 2, today: 1, archive: 0 });
    await open();

    const today = await screen.findByRole("region", { name: "Today" });
    expect(
      within(today).getByText("Investigate PostgreSQL indexing strategy."),
    ).toBeInTheDocument();
    expect(within(today).getByText("work")).toBeInTheDocument();
    expect(within(today).getByText("from Code")).toBeInTheDocument();
    const yesterday = screen.getByRole("region", { name: "Yesterday" });
    expect(within(yesterday).getByText("Call the dentist")).toBeInTheDocument();

    expect(lastQuery()).toMatchObject({ statuses: ["inbox"] });
    expect(
      within(screen.getByRole("button", { name: /Inbox/ })).getByText("2"),
    ).toBeInTheDocument();
  });

  it("invites capture when the inbox is empty", async () => {
    await open();
    expect(await screen.findByText("Your inbox is clear")).toBeInTheDocument();
    expect(screen.getByText(/in any application to capture a thought/)).toBeInTheDocument();
  });

  it("refreshes when a note is captured from the other window", async () => {
    await open();
    api.notesList.mockResolvedValue([note("captured just now")]);
    act(() => emit("notes-changed"));
    expect(await screen.findByText("captured just now")).toBeInTheDocument();
  });

  it("truncates long notes and expands them on request", async () => {
    api.notesList.mockResolvedValue([
      note(Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n")),
    ]);
    const user = await open();
    const content = await screen.findByText(/line 0/);
    expect(content).toHaveAttribute("data-clamped", "true");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(content).toHaveAttribute("data-clamped", "false");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("switches sections, asking for each one's notes", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ statuses: ["completed", "archived"] }));
    expect(await screen.findByText("The archive is empty")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Today/ }));
    await waitFor(() => expect(lastQuery().created_from).toEqual(expect.any(Number)));
    expect(lastQuery().created_to - lastQuery().created_from).toBeGreaterThan(22 * 3_600_000);
  });

  it("opens the section the tray or shortcut asks for", async () => {
    await open();
    act(() => emit("navigate", "settings"));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("warns when the capture shortcut is not active", async () => {
    const state = settingsState();
    state.shortcuts.capture = {
      accelerator: "CmdOrCtrl+Shift+Space",
      registered: false,
      error: "Another application is probably using it.",
    };
    api.settingsGet.mockResolvedValue(state);
    await open();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The capture shortcut isn't active.");
    expect(alert).toHaveTextContent("Another application is probably using it.");
  });
});

describe("note actions", () => {
  it("completes a note and offers undo", async () => {
    const n = note("finish the report");
    api.notesList.mockResolvedValue([n]);
    const user = await open();
    await user.click(await screen.findByRole("checkbox", { name: "Mark as completed" }));
    expect(api.noteSetStatus).toHaveBeenCalledWith(n.id, "completed");

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(api.noteSetStatus).toHaveBeenLastCalledWith(n.id, "inbox");
  });

  it("deletes with an undo instead of a confirmation", async () => {
    const n = note("delete me");
    api.notesList.mockResolvedValue([n]);
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Delete/ }));
    expect(api.noteDelete).toHaveBeenCalledWith(n.id);
    expect(await screen.findByText("Note deleted")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(api.noteUndelete).toHaveBeenCalledWith(n.id);
  });

  it("edits a note in place", async () => {
    const n = note("typo hree");
    api.notesList.mockResolvedValue([n]);
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Edit/ }));
    const editor = screen.getByRole("textbox", { name: "Edit note" });
    expect(editor).toHaveFocus();
    await user.clear(editor);
    await user.type(editor, "typo here{Enter}");
    await waitFor(() => expect(api.noteUpdate).toHaveBeenCalledWith(n.id, "typo here", null));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Edit note" })).toBeNull());
  });

  it("keeps the editor open with the text when saving an edit fails", async () => {
    api.notesList.mockResolvedValue([note("original")]);
    api.noteUpdate.mockRejectedValue({ code: "disk_full", message: "The disk is full." });
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Edit/ }));
    await user.type(screen.getByRole("textbox", { name: "Edit note" }), " plus more{Enter}");
    expect(await screen.findByText("The disk is full.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Edit note" })).toHaveValue("original plus more");
  });

  it("won't save an edit that empties the note", async () => {
    api.notesList.mockResolvedValue([note("x")]);
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Edit/ }));
    await user.clear(screen.getByRole("textbox", { name: "Edit note" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(api.noteUpdate).not.toHaveBeenCalled();
  });

  it("archives from the inbox and restores from the archive", async () => {
    const n = note("reference");
    api.notesList.mockResolvedValue([n]);
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Archive \(/ }));
    expect(api.noteSetStatus).toHaveBeenCalledWith(n.id, "archived");

    api.notesList.mockResolvedValue([{ ...n, status: "archived" }]);
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(await screen.findByRole("button", { name: /Move back to Inbox/ }));
    expect(api.noteSetStatus).toHaveBeenLastCalledWith(n.id, "inbox");
  });

  it("copies note content", async () => {
    api.notesList.mockResolvedValue([note("copy this")]);
    const user = await open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole("button", { name: /^Copy/ }));
    expect(writeText).toHaveBeenCalledWith("copy this");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("reports a failed action instead of pretending it worked", async () => {
    api.notesList.mockResolvedValue([note("stubborn")]);
    api.noteDelete.mockRejectedValue({ code: "db", message: "Database error: locked" });
    const user = await open();
    await user.click(await screen.findByRole("button", { name: /^Delete/ }));
    expect(await screen.findByText("Database error: locked")).toBeInTheDocument();
    expect(screen.queryByText("Note deleted")).toBeNull();
  });
});

describe("keyboard", () => {
  it("moves through notes and acts on the selected one without the mouse", async () => {
    const [a, b] = [note("first"), note("second")];
    api.notesList.mockResolvedValue([a, b]);
    const user = await open();
    await screen.findByText("first");

    await user.keyboard("jj");
    expect(screen.getByText("second").closest("li")).toHaveAttribute("data-selected", "true");
    await user.keyboard("x");
    expect(api.noteSetStatus).toHaveBeenCalledWith(b.id, "completed");

    await user.keyboard("{ArrowUp}a");
    expect(api.noteSetStatus).toHaveBeenCalledWith(a.id, "archived");
  });

  it("focuses search with / and clears it with Escape", async () => {
    const user = await open();
    await user.keyboard("/");
    const search = screen.getByRole("textbox", { name: "Search all notes" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard("index");
    expect(search).toHaveValue("index");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
  });

  it("does not treat typing in the search box as shortcuts", async () => {
    api.notesList.mockResolvedValue([note("target")]);
    const user = await open();
    await user.click(screen.getByRole("textbox", { name: "Search all notes" }));
    await user.keyboard("xa3");
    expect(api.noteSetStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Search");
  });

  it("switches sections with number keys and opens capture with N", async () => {
    const user = await open();
    await user.keyboard("3");
    expect(await screen.findByRole("heading", { name: "Archive" })).toBeInTheDocument();
    await user.keyboard("n");
    expect(api.captureOpen).toHaveBeenCalled();
  });
});

describe("search", () => {
  it("searches every note as the user types", async () => {
    const user = await open();
    await user.type(screen.getByRole("textbox", { name: "Search all notes" }), "postgres");
    await waitFor(() => expect(lastQuery()).toMatchObject({ text: "postgres", statuses: [] }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Search");
  });

  it("narrows by status and by date", async () => {
    const user = await open();
    await user.type(screen.getByRole("textbox", { name: "Search all notes" }), "x");
    await user.click(await screen.findByRole("radio", { name: "Completed" }));
    await waitFor(() => expect(lastQuery().statuses).toEqual(["completed"]));

    await user.type(screen.getByLabelText("Captured on date"), "2026-11-01");
    await waitFor(() => expect(lastQuery().created_from).toBe(new Date(2026, 10, 1).getTime()));
  });

  it("explains an empty result and says the archive was searched too", async () => {
    const user = await open();
    await user.type(screen.getByRole("textbox", { name: "Search all notes" }), "zzz");
    expect(await screen.findByText("No notes match")).toBeInTheDocument();
    expect(screen.getByText(/Nothing contains “zzz”.*including the archive/)).toBeInTheDocument();
  });

  it("ignores results that arrive after a newer query", async () => {
    const user = await open();
    let resolveSlow!: (v: unknown) => void;
    api.notesList.mockImplementation((q: { text?: string }) =>
      q.text === "a"
        ? new Promise((r) => (resolveSlow = r))
        : Promise.resolve(q.text === "ab" ? [note("fresh result")] : []),
    );
    const search = screen.getByRole("textbox", { name: "Search all notes" });
    await user.type(search, "a");
    await waitFor(() => expect(resolveSlow).toBeDefined());
    await user.type(search, "b");
    expect(await screen.findByText("fresh result")).toBeInTheDocument();
    await act(async () => resolveSlow([note("stale result")]));
    expect(screen.queryByText("stale result")).toBeNull();
  });
});

describe("theme", () => {
  it("follows the operating system by default and reacts when it changes", async () => {
    await open();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    media.dark = true;
    act(() => media.listeners.forEach((fn) => fn()));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies an explicit choice immediately, regardless of the system", async () => {
    media.dark = true;
    const user = await open();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("radio", { name: "Light" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(api.settingsUpdate).toHaveBeenCalledWith(expect.objectContaining({ theme: "light" }));
  });

  it("updates when the theme is changed from another window", async () => {
    await open();
    api.settingsGet.mockResolvedValue(settingsState({ theme: "dark" }));
    act(() => emit("settings-changed", settingsState({ theme: "dark" }).settings));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  });
});

describe("settings", () => {
  async function openSettings(overrides: Partial<AppInfo> = {}) {
    const user = await open(overrides);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Keyboard" });
    return user;
  }

  it("shows where the database lives and that the shortcut is registered", async () => {
    await openSettings();
    expect(await screen.findByText("/data/posthaste.db")).toBeInTheDocument();
    expect(screen.getAllByText("Registered and active.")).toHaveLength(2);
  });

  it("records a new shortcut from a key press", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Capture shortcut: change" }));
    await user.keyboard("{Alt>}{Shift>}n{/Shift}{/Alt}");
    await waitFor(() =>
      expect(api.settingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ capture_shortcut: "Alt+Shift+N" }),
      ),
    );
  });

  it("keeps the old shortcut and explains when the new one is taken", async () => {
    api.settingsUpdate.mockRejectedValue({
      code: "shortcut_unavailable",
      message: "Alt+Shift+N could not be registered. Another application is probably using it.",
    });
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Capture shortcut: change" }));
    await user.keyboard("{Alt>}{Shift>}n{/Shift}{/Alt}");
    expect(await screen.findByText(/Alt\+Shift\+N could not be registered/)).toBeInTheDocument();
    expect(screen.getAllByText("Registered and active.")).toHaveLength(2);
  });

  it("restores the default shortcut", async () => {
    api.settingsGet.mockResolvedValue(settingsState({ capture_shortcut: "Alt+Shift+N" }));
    const user = await openSettings();
    await user.click(screen.getAllByRole("button", { name: "Restore default" })[0]!);
    await waitFor(() =>
      expect(api.settingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ capture_shortcut: "CmdOrCtrl+Shift+Space" }),
      ),
    );
  });

  it("is honest about Wayland's shortcut limitation", async () => {
    const state = settingsState();
    state.shortcuts.limitation = "This is a Wayland session.";
    api.settingsGet.mockResolvedValue(state);
    await openSettings({ session: "wayland" });
    expect(
      screen.getAllByText(/Registered, with a limitation. This is a Wayland session./),
    ).toHaveLength(2);
    expect(screen.getByText(/the compositor decides where windows appear/)).toBeInTheDocument();
  });

  it("only clears data after DELETE is typed", async () => {
    api.dataClear.mockResolvedValue(settingsState());
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Clear data…" }));
    const confirm = screen.getByRole("button", { name: "Delete everything" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText("Type DELETE to confirm"));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(confirm);
    await waitFor(() => expect(api.dataClear).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("All data cleared")).toBeInTheDocument();
  });

  it("warns that clearing data also removes looks", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Clear data…" }));
    expect(screen.getByRole("dialog", { name: "Delete all notes?" })).toHaveTextContent(
      /your looks/,
    );
  });

  it("sets up AI polish from the settings section", async () => {
    const user = await openSettings();
    await user.click(screen.getByRole("radio", { name: "Claude" }));
    await waitFor(() =>
      expect(api.settingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ ai_provider: "anthropic" }),
      ),
    );
    await user.type(screen.getByLabelText("AI API key"), "sk-test");
    await waitFor(() =>
      expect(api.settingsUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ ai_api_key: "sk-test" }),
      ),
    );
  });

  it("keeps the selected look when another setting changes", async () => {
    api.lookActive.mockResolvedValue(null);
    api.lookList.mockResolvedValue([]);
    api.settingsGet.mockResolvedValue(settingsState({ look_id: "builtin:ink" }));
    const user = await openSettings();
    await user.click(screen.getByRole("switch", { name: "Close after saving" }));
    await waitFor(() =>
      expect(api.settingsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ look_id: "builtin:ink", hide_after_save: false }),
      ),
    );
  });

  it("reports export results and stays quiet when the dialog is cancelled", async () => {
    api.dataExport.mockResolvedValueOnce(null).mockResolvedValueOnce(12);
    const user = await openSettings();
    await user.click(screen.getByRole("button", { name: "Export…" }));
    await waitFor(() => expect(api.dataExport).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Exported/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Export…" }));
    expect(await screen.findByText("Exported 12 notes")).toBeInTheDocument();
  });
});
