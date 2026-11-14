import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LookDoc, LookSummary, ResolvedLook } from "../lib/types";
import { api, resetIpc } from "../test/mockIpc";
import { LookEditor } from "./LookEditor";

vi.mock("../lib/ipc", async () => (await import("../test/mockIpc")).ipcMock);

function doc(patch: Partial<LookDoc> = {}): LookDoc {
  return {
    format: "posthaste-look",
    version: 1,
    name: "Strawberry Milk",
    author: "Posthaste",
    base: "light",
    colors: {
      bg: "#fff5f7",
      surface: "#ffffff",
      text: "#4a2c3a",
      accent: "#ff8fb1",
    },
    shape: "round",
    font: "rounded",
    ...patch,
  };
}

const resolved: ResolvedLook = {
  id: "preview",
  name: "Strawberry Milk",
  author: "Posthaste",
  base: "light",
  shape: "round",
  font: "rounded",
  tokens: { "--bg": "#fff5f7" },
};

const saved: LookSummary = {
  id: "user:new",
  name: "Strawberry Milk",
  author: "Posthaste",
  builtin: false,
  base: "light",
  preview: { bg: "#fff5f7", surface: "#ffffff", text: "#4a2c3a", accent: "#ff8fb1" },
};

function renderEditor(overrides: { initial?: LookDoc; editingId?: string | null } = {}) {
  const onPreview = vi.fn();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <LookEditor
      open
      initial={overrides.initial ?? doc()}
      editingId={overrides.editingId ?? null}
      onPreview={onPreview}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { onPreview, onClose, onSaved };
}

/** Simulates typing a whole value into a field: several change events land
    inside one debounce window, like a fast typist. */
function type(field: string, value: string) {
  const input = screen.getByLabelText(field);
  const steps = [value.slice(0, 2), value.slice(0, 5), value];
  for (const v of steps) {
    fireEvent.change(input, { target: { value: v } });
  }
}

/** Runs the debounced preview and lets its promise settle. */
async function settlePreview() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120);
  });
}

beforeEach(() => {
  resetIpc();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the look editor", () => {
  it("shows the starting name and the four colours", () => {
    renderEditor();
    expect(screen.getByLabelText("Name")).toHaveValue("Strawberry Milk");
    expect(screen.getByLabelText("Background")).toHaveValue("#fff5f7");
    expect(screen.getByLabelText("Surface")).toHaveValue("#ffffff");
    expect(screen.getByLabelText("Text")).toHaveValue("#4a2c3a");
    expect(screen.getByLabelText("Accent")).toHaveValue("#ff8fb1");
  });

  it("previews once after typing stops, with the edited document", async () => {
    api.lookPreview.mockResolvedValue(resolved);
    const { onPreview } = renderEditor();
    type("Accent", "#ff0000");
    await settlePreview();
    expect(api.lookPreview).toHaveBeenCalledTimes(1);
    expect(api.lookPreview).toHaveBeenCalledWith(
      expect.objectContaining({ colors: expect.objectContaining({ accent: "#ff0000" }) }),
    );
    expect(onPreview).toHaveBeenCalledWith(resolved);
  });

  it("shows the validator's message and disables Save until it is fixed", async () => {
    api.lookPreview
      .mockRejectedValueOnce({
        code: "look_invalid",
        message: "Text and background are too similar to read comfortably (1.0:1, needs 4.5:1).",
      })
      .mockResolvedValue(resolved);
    renderEditor();
    type("Text", "#fff5f7");
    await settlePreview();
    expect(screen.getByRole("alert")).toHaveTextContent("too similar to read");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    type("Text", "#1a1a2e");
    await settlePreview();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Looks good");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps the hex field and the colour picker in sync, both ways", () => {
    api.lookPreview.mockResolvedValue(resolved);
    renderEditor();
    const hex = screen.getByLabelText("Accent");
    const picker = screen.getByLabelText("Accent picker");
    fireEvent.change(hex, { target: { value: "#123456" } });
    expect(picker).toHaveValue("#123456");
    fireEvent.change(picker, { target: { value: "#abcdef" } });
    expect(hex).toHaveValue("#abcdef");
  });

  it("saves a new look without an id, then closes", async () => {
    api.lookPreview.mockResolvedValue(resolved);
    api.lookSave.mockResolvedValue(saved);
    const { onPreview, onClose, onSaved } = renderEditor();
    await settlePreview();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    type("Name", "Strawberry Milk Edited");
    await settlePreview();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.lookSave).toHaveBeenCalledTimes(1);
    expect(api.lookSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Strawberry Milk Edited",
        colors: expect.objectContaining({ accent: "#ff8fb1" }),
      }),
      null,
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it("saves an edit against the look's own id", async () => {
    api.lookPreview.mockResolvedValue(resolved);
    api.lookSave.mockResolvedValue(saved);
    const { onSaved } = renderEditor({ editingId: "user:abc" });
    await settlePreview();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(api.lookSave).toHaveBeenCalledWith(expect.anything(), "user:abc");
  });

  it("cancel and Escape clear the preview and close without saving", async () => {
    api.lookPreview.mockResolvedValue(resolved);
    const { onClose, onPreview } = renderEditor();
    await settlePreview();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(api.lookSave).not.toHaveBeenCalled();

    // Escape closes the native dialog, which runs the same path.
    fireEvent(document.querySelector("dialog")!, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(api.lookSave).not.toHaveBeenCalled();
  });

  it("will not save a look without a name", async () => {
    api.lookPreview.mockResolvedValue(resolved);
    renderEditor();
    await settlePreview();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    await settlePreview();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.lookSave).not.toHaveBeenCalled();
  });
});
