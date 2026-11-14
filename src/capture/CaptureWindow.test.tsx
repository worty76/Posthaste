import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, emit, resetIpc, settingsState } from "../test/mockIpc";
import { CaptureWindow } from "./CaptureWindow";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

const input = () => screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;

async function open() {
  render(<CaptureWindow os="linux" />);
  await waitFor(() => expect(api.settingsGet).toHaveBeenCalled());
  await act(async () => {});
  return userEvent.setup();
}

beforeEach(resetIpc);

describe("capture input", () => {
  it("focuses the input without a click and shows the placeholder", async () => {
    await open();
    expect(input()).toHaveFocus();
    expect(input()).toHaveAttribute("placeholder", "What's on your mind?");
  });

  it("refocuses the input every time the window is shown", async () => {
    const user = await open();
    await user.click(screen.getByLabelText(/category/i));
    expect(input()).not.toHaveFocus();
    act(() => emit("capture-shown", { source: "Code" }));
    expect(input()).toHaveFocus();
    expect(screen.getByText("from Code")).toBeInTheDocument();
  });

  it("shows the registered shortcut as a hint", async () => {
    await open();
    await waitFor(() => expect(screen.getByText("Space")).toBeInTheDocument());
  });
});

describe("keyboard", () => {
  it("Enter saves, closes and clears the input", async () => {
    const user = await open();
    await user.type(input(), "Investigate PostgreSQL indexing strategy.");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(api.captureSave).toHaveBeenCalledWith(
        "Investigate PostgreSQL indexing strategy.",
        null,
        true,
      ),
    );
    await waitFor(() => expect(input()).toHaveValue(""));
  });

  it("Shift+Enter inserts a newline instead of saving", async () => {
    const user = await open();
    await user.type(input(), "one{Shift>}{Enter}{/Shift}two");
    expect(input()).toHaveValue("one\ntwo");
    expect(api.captureSave).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter saves and keeps the window open for another note", async () => {
    const user = await open();
    await user.type(input(), "first");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledWith("first", null, false));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  it("uses Cmd rather than Ctrl as the modifier on macOS", async () => {
    render(<CaptureWindow os="macos" />);
    await act(async () => {});
    const user = userEvent.setup();
    await user.type(input(), "mac");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledWith("mac", null, false));
  });

  it("Escape closes and keeps what was typed as a draft", async () => {
    const user = await open();
    await user.type(input(), "half a thought");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(api.captureDismiss).toHaveBeenCalled());
    expect(api.draftSet).toHaveBeenLastCalledWith("half a thought", null);
    expect(api.captureSave).not.toHaveBeenCalled();
    // The draft write finished before the window was told to hide.
    expect(api.draftSet.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      api.captureDismiss.mock.invocationCallOrder[0]!,
    );
  });

  it("does not save on the Enter that confirms an IME composition", async () => {
    await open();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true });
    act(() => void input().dispatchEvent(event));
    expect(api.captureSave).not.toHaveBeenCalled();
  });

  it("with 'Enter adds a line', Enter is a newline and Ctrl+Enter saves and closes", async () => {
    api.settingsGet.mockResolvedValue(settingsState({ enter_behavior: "newline" }));
    const user = await open();
    await user.type(input(), "a{Enter}b");
    expect(input()).toHaveValue("a\nb");
    expect(api.captureSave).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledWith("a\nb", null, true));
  });

  it("with 'Close after saving' off, Enter saves and stays open", async () => {
    api.settingsGet.mockResolvedValue(settingsState({ hide_after_save: false }));
    const user = await open();
    await user.type(input(), "stay{Enter}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledWith("stay", null, false));
  });
});

describe("empty input", () => {
  it.each(["", "   ", "{Shift>}{Enter}{/Shift}  "])("does not save %j", async (text) => {
    const user = await open();
    if (text) await user.type(input(), text);
    await user.keyboard("{Enter}");
    expect(api.captureSave).not.toHaveBeenCalled();
    expect(screen.getByText("Nothing to save yet")).toBeInTheDocument();
  });
});

describe("save states", () => {
  it("shows Saving while waiting and reports success only after the database confirms", async () => {
    let confirm!: () => void;
    api.captureSave.mockReturnValue(new Promise<void>((r) => (confirm = r)));
    const user = await open();
    await user.type(input(), "pending");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(await screen.findByText("Saving…")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(input()).toHaveValue("pending"); // not let go of yet

    await act(async () => confirm());
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(input()).toHaveValue("");
  });

  it("ignores a second Enter while a save is in flight", async () => {
    api.captureSave.mockReturnValue(new Promise(() => {}));
    const user = await open();
    await user.type(input(), "once{Enter}{Enter}{Enter}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledTimes(1));
  });

  it("passes the optional category along", async () => {
    const user = await open();
    await user.type(screen.getByLabelText(/category/i), "work{Enter}");
    expect(input()).toHaveFocus(); // Enter in the category returns to the note
    await user.type(input(), "tagged{Enter}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalledWith("tagged", "work", true));
  });
});

describe("error states", () => {
  it("keeps the text, explains the failure and re-drafts it when saving fails", async () => {
    api.captureSave.mockRejectedValue({ code: "disk_full", message: "The disk is full." });
    const user = await open();
    await user.type(input(), "do not lose me{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not saved: The disk is full.");
    expect(input()).toHaveValue("do not lose me");
    expect(api.captureDismiss).not.toHaveBeenCalled();

    // Retrying works once the problem is gone.
    api.captureSave.mockResolvedValue(undefined);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(input()).toHaveValue(""));
  });

  it("surfaces a draft that could not be written", async () => {
    api.draftSet.mockRejectedValue({ code: "db", message: "database is locked" });
    const user = await open();
    await user.type(input(), "x");
    expect(await screen.findByRole("alert", {}, { timeout: 2000 })).toHaveTextContent(
      "Draft not saved: database is locked",
    );
    expect(input()).toHaveValue("x");
  });
});

describe("drafts", () => {
  it("persists while typing, after a short pause", async () => {
    const user = await open();
    await user.type(input(), "thinking");
    await waitFor(() => expect(api.draftSet).toHaveBeenCalledWith("thinking", null));
    // Debounced: far fewer writes than keystrokes.
    expect(api.draftSet.mock.calls.length).toBeLessThan(8);
  });

  it("restores a draft left by a previous session and offers to discard it", async () => {
    api.draftGet.mockResolvedValue({
      content: "from before the crash",
      category: "ideas",
      updated_at: 1,
    });
    const user = await open();
    await waitFor(() => expect(input()).toHaveValue("from before the crash"));
    expect(screen.getByLabelText(/category/i)).toHaveValue("ideas");
    expect(screen.getByText("Draft restored")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(input()).toHaveValue("");
    expect(api.draftClear).toHaveBeenCalled();
  });

  it("never lets a late draft write land after the save", async () => {
    const user = await open();
    await user.type(input(), "race{Enter}");
    await waitFor(() => expect(api.captureSave).toHaveBeenCalled());
    const saveOrder = api.captureSave.mock.invocationCallOrder[0]!;
    await new Promise((r) => setTimeout(r, 400));
    for (const order of api.draftSet.mock.invocationCallOrder)
      expect(order).toBeLessThan(saveOrder);
  });

  it("writes the draft when the window is hidden by something else", async () => {
    const user = await open();
    await user.type(input(), "interrupted");
    api.draftSet.mockClear();
    act(() => emit("capture-hidden"));
    await waitFor(() => expect(api.draftSet).toHaveBeenCalledWith("interrupted", null));
  });
});
